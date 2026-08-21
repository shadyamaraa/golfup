// src/tournament-sheet.js
// Google Sheets → tournament leaderboard.
//
// The sheet stays the source of truth: the app reads its published CSV
// directly in the browser, which Google serves with permissive CORS for as
// long as the document is link-shared ("anyone with the link can view"). No
// server, no API key, no scheduled sync — if sharing is ever revoked, the
// fetch fails and the caller falls back to the stored snapshot.
//
// Nothing here touches the DOM or Firebase; app.js owns both.

// ---- URL handling ----

// Pull the file id (and the tab's gid, when the URL carries one) out of any
// Google Sheets link the admin might paste.
export function parseSheetUrl(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const id = s.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]{20,})/)?.[1]
    // A bare id pasted on its own.
    || (/^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null);
  if (!id) return null;
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1] || null;
  return { id, gid };
}

// gviz is the endpoint that answers with CORS headers and lets a tab be
// addressed by name as well as by gid. Left without a `headers` parameter on
// purpose: its own header detection merges a spreadsheet's title row into the
// column labels, which is what makes columns like "Day 1" resolvable at all.
export function sheetCsvUrl(id, { gid, sheet } = {}) {
  const q = ['tqx=out:csv'];
  if (sheet) q.push(`sheet=${encodeURIComponent(sheet)}`);
  else if (gid) q.push(`gid=${encodeURIComponent(gid)}`);
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${q.join('&')}`;
}

// ---- CSV ----

// RFC-4180 enough: quoted fields, doubled quotes, newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (s[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

// ---- Score parsing ----

const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// Statuses that take a player out of the standings entirely.
const RETIRED = /^(wd|dq|dns|dnf|nc|rtd|mdf)$/i;
// How the note rows a scoring sheet ends with tend to open.
const NOTE_PREFIX = /^(workflow|note|important|instruction|тайлбар|анхаар|заавар)\b/i;

// Scores relative to par arrive as "+2", "−6", "E", "" or a bare number.
// Returns null for anything that isn't a score (blank, "WD", "-").
export function parseToPar(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^(e|е|ev|even)$/i.test(s)) return 0;
  const n = Number(s.replace(/[−–—]/g, '-').replace(/^\+/, ''));
  return isNaN(n) ? null : n;
}

// Withdrawn/disqualified players keep their strokes but hold no position.
export function isRetired(status) {
  return RETIRED.test(String(status || '').trim());
}

export function parseIntOrNull(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = parseInt(s.replace(/[^\d-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

// `\b` is defined over ASCII word characters, so it never fires beside a
// Cyrillic letter — "тойрог" would silently never match. These helpers use
// Unicode letter/number boundaries instead, so Mongolian and English headers
// are recognized on the same footing.
const EDGE = '(?:[^\\p{L}\\p{N}]|^)';
const EDGE_END = '(?:[^\\p{L}\\p{N}]|$)';
const hasWord = (h, ...terms) =>
  terms.some(term => new RegExp(`${EDGE}${term}${EDGE_END}`, 'u').test(h));
const matchNum = (h, terms) =>
  h.match(new RegExp(`${EDGE}(?:${terms})\\s?(\\d{1,2})${EDGE_END}`, 'u'))?.[1];

// Classify one header cell. Order matters: hole and round columns are matched
// before the generic ones, so "D1 To Par" never reads as the overall "To Par".
function classify(header) {
  const h = norm(header);
  if (!h) return { kind: 'none' };
  if (hasWord(h, 'sortkey', 'rankbase', 'sort key', 'rank base')) return { kind: 'ignore' };

  const roundNo = matchNum(h, 'd|r|day|round|тойрог');
  const holeNo = matchNum(h, 'h|hole|нүх');

  if (holeNo) return { kind: 'hole', round: Number(roundNo || 1), hole: Number(holeNo) };
  if (roundNo) {
    return /to ?par/.test(h)
      ? { kind: 'roundToPar', round: Number(roundNo) }
      : { kind: 'roundGross', round: Number(roundNo) };
  }
  if (/to ?par/.test(h) || hasWord(h, 'topar')) return { kind: 'toPar' };
  if (hasWord(h, 'thru', 'явц')) return { kind: 'thru' };
  if (hasWord(h, 'position', 'pos', 'байр')) return { kind: 'position' };
  if (hasWord(h, 'status', 'төлөв')) return { kind: 'status' };
  if (hasWord(h, 'total', 'нийт', 'дүн')) return { kind: 'gross' };
  if (hasWord(h, 'player', 'name', 'нэр', 'тоглогч', 'оролцогч')) return { kind: 'name' };
  return { kind: 'none' };
}

function mapColumns(header) {
  const cols = {
    name: -1, gross: -1, toPar: -1, thru: -1, position: -1, status: -1,
    roundGross: new Map(), roundToPar: new Map(), holes: new Map()
  };
  header.forEach((cell, i) => {
    const c = classify(cell);
    switch (c.kind) {
      case 'name': if (cols.name < 0) cols.name = i; break;
      case 'gross': if (cols.gross < 0) cols.gross = i; break;
      case 'toPar': if (cols.toPar < 0) cols.toPar = i; break;
      case 'thru': if (cols.thru < 0) cols.thru = i; break;
      case 'position': if (cols.position < 0) cols.position = i; break;
      case 'status': if (cols.status < 0) cols.status = i; break;
      case 'roundGross': if (!cols.roundGross.has(c.round)) cols.roundGross.set(c.round, i); break;
      case 'roundToPar': if (!cols.roundToPar.has(c.round)) cols.roundToPar.set(c.round, i); break;
      case 'hole': {
        if (!cols.holes.has(c.round)) cols.holes.set(c.round, []);
        cols.holes.get(c.round).push(i);
        break;
      }
    }
  });
  return cols;
}

// An 18-hole gross round sits far above anything a to-par figure reaches, so
// the magnitude of the values settles which one a column holds.
const GROSS_FLOOR = 50;

// A round or total column can carry gross strokes (74) or a score relative to
// par (−2), and headers almost never say which. Decide per column from the
// median of its values rather than per cell, so one outlier cannot flip it.
// Returns null when the column has no numbers to judge by.
function looksGross(rows, from, colIndex) {
  const vals = [];
  for (let r = from; r < rows.length; r++) {
    const n = parseIntOrNull(rows[r]?.[colIndex]);
    if (n !== null) vals.push(Math.abs(n));
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)] >= GROSS_FLOOR;
}

// A spreadsheet built for broadcast graphics rarely starts with its header on
// row 1, so try the first few rows and keep the one that resolves the most.
function findHeader(rows) {
  let best = null;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const cols = mapColumns(rows[i]);
    if (cols.name < 0) continue;
    const score = [cols.toPar, cols.gross, cols.thru, cols.position, cols.status]
      .filter(v => v >= 0).length + cols.roundGross.size + cols.roundToPar.size + cols.holes.size;
    if (!best || score > best.score) best = { index: i, cols, score };
  }
  return best;
}

/**
 * Turn raw CSV rows into leaderboard entries plus a description of what was
 * recognized, so the admin screen can show what it understood before saving.
 *
 * @param {string[][]} rows
 * @param {{par?: number}} [opts] course par, used only to derive to-par when
 *        the sheet carries gross strokes and no to-par column.
 */
export function analyzeSheet(rows, { par } = {}) {
  const found = findHeader(rows || []);
  if (!found) {
    return { ok: false, entries: [], rounds: 0, warnings: ['no-player-column'], columns: null };
  }
  const { index, cols } = found;
  const warnings = [];

  // Re-read columns whose header says "round" but whose values are to-par.
  for (const [n, i] of [...cols.roundGross]) {
    if (looksGross(rows, index + 1, i) === false && !cols.roundToPar.has(n)) {
      cols.roundToPar.set(n, i);
      cols.roundGross.delete(n);
    }
  }
  if (cols.gross >= 0 && cols.toPar < 0 && looksGross(rows, index + 1, cols.gross) === false) {
    cols.toPar = cols.gross;
    cols.gross = -1;
  }

  const roundNumbers = new Set([
    ...cols.roundGross.keys(), ...cols.roundToPar.keys(), ...cols.holes.keys()
  ]);
  const rounds = roundNumbers.size ? Math.max(...roundNumbers) : 1;

  const holeSum = (row, round) => {
    const idx = cols.holes.get(round) || [];
    let sum = 0, played = 0;
    idx.forEach(i => {
      const n = parseIntOrNull(row[i]);
      if (n !== null) { sum += n; played++; }
    });
    return { sum, played, holes: idx.length };
  };

  const entries = [];
  for (let r = index + 1; r < rows.length; r++) {
    const row = rows[r];
    const name = (row[cols.name] || '').trim();
    if (!name) continue;
    // Live-scoring sheets end with a note row that sits in the name column.
    // Match it by length and by the way notes open — never by punctuation,
    // since "Б. Ганбат" is a perfectly ordinary name.
    if (name.length > 60 || NOTE_PREFIX.test(name)) continue;

    const status = cols.status >= 0 ? (row[cols.status] || '').trim().toUpperCase() : '';
    const retired = RETIRED.test(status);
    const perRound = [];
    let thruPlayed = 0, thruHoles = 0;

    for (let n = 1; n <= rounds; n++) {
      const gi = cols.roundGross.get(n);
      const ti = cols.roundToPar.get(n);
      const hs = cols.holes.has(n) ? holeSum(row, n) : null;
      let gross = gi >= 0 ? parseIntOrNull(row[gi]) : null;
      if (gross === null && hs && hs.played === hs.holes && hs.holes > 0) gross = hs.sum;
      let toPar = ti >= 0 ? parseToPar(row[ti]) : null;
      if (toPar === null && gross !== null && par) toPar = gross - par;
      if (hs && hs.played > 0 && hs.played < hs.holes) { thruPlayed = hs.played; thruHoles = hs.holes; }
      perRound.push({ gross, toPar });
    }

    const grossTotal = cols.gross >= 0 ? parseIntOrNull(row[cols.gross]) : null;
    let total = cols.toPar >= 0 ? parseToPar(row[cols.toPar]) : null;
    if (total === null) {
      const parts = perRound.map(p => p.toPar).filter(v => v !== null);
      if (parts.length) total = parts.reduce((a, b) => a + b, 0);
      else if (grossTotal !== null && par) {
        const played = perRound.filter(p => p.gross !== null).length || 1;
        total = grossTotal - par * played;
      }
    }

    let thru = cols.thru >= 0 ? (row[cols.thru] || '').trim() : '';
    if (!thru && thruPlayed) thru = String(thruPlayed);
    if (!thru && perRound.some(p => p.gross !== null)) thru = 'F';

    entries.push({
      name,
      // A withdrawal keeps its strokes but carries no standing: sheets blank
      // the to-par cell on purpose, so deriving one from gross would invent a
      // position the scorer deliberately removed.
      total: retired ? null : total,
      gross: grossTotal,
      thru: thru || (retired ? status : ''),
      status,
      sheetPos: cols.position >= 0 ? (row[cols.position] || '').trim() : '',
      rounds: retired ? perRound.map(() => null) : perRound.map(p => p.toPar),
      grossRounds: perRound.map(p => p.gross)
    });
  }

  if (cols.toPar < 0 && !cols.roundToPar.size && !par) warnings.push('no-to-par-column');
  if (!entries.length) warnings.push('no-rows');

  return {
    ok: entries.length > 0,
    entries,
    rounds,
    warnings,
    columns: {
      headerRow: index + 1,
      name: cols.name >= 0,
      gross: cols.gross >= 0,
      toPar: cols.toPar >= 0,
      thru: cols.thru >= 0,
      position: cols.position >= 0,
      status: cols.status >= 0,
      roundGross: [...cols.roundGross.keys()].sort((a, b) => a - b),
      roundToPar: [...cols.roundToPar.keys()].sort((a, b) => a - b),
      holeRounds: [...cols.holes.keys()].sort((a, b) => a - b)
    }
  };
}

// Tab names worth probing when the pasted link points at the wrong sheet — a
// live-scoring workbook usually opens on its setup tab.
const TAB_CANDIDATES = ['Scoring', 'Leaderboard', 'Live', 'Results', 'Хүснэгт', 'Оноо', 'Дүн'];

async function fetchCsv(url, signal) {
  const res = await fetch(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`sheet ${res.status}`);
  return res.text();
}

/**
 * Fetch and analyze a sheet. When `sheet` is not given, the tab from the URL is
 * tried first and the usual live-scoring tab names after it, so pasting the
 * link a scorer happens to have open still finds the scores.
 *
 * @returns {Promise<{ok, entries, rounds, warnings, columns, sheet, url}>}
 */
export async function fetchSheet(url, { sheet, par, signal } = {}) {
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new Error('bad-url');

  // A named tab goes first, but a wrong or renamed name must not be the end of
  // it — everything else is still probed, so a typo costs nothing.
  const seen = new Set();
  const attempts = [];
  const add = (a) => {
    const key = a.sheet || a.gid || 'default';
    if (!seen.has(key)) { seen.add(key); attempts.push(a); }
  };
  if (sheet) add({ sheet });
  if (parsed.gid) add({ gid: parsed.gid });
  TAB_CANDIDATES.forEach(s => add({ sheet: s }));
  add({});

  let lastErr = null;
  const tried = [];
  for (const attempt of attempts) {
    const target = sheetCsvUrl(parsed.id, attempt);
    let result;
    try {
      result = analyzeSheet(parseCsv(await fetchCsv(target, signal)), { par });
    } catch (err) {
      // A missing tab name answers 400; keep probing the rest.
      lastErr = err;
      continue;
    }
    tried.push(attempt.sheet || attempt.gid || 'default');
    if (result.ok) {
      return { ...result, sheet: attempt.sheet || null, gid: attempt.gid || null, url: target, tried };
    }
  }
  if (lastErr && !tried.length) throw lastErr;
  return { ok: false, entries: [], rounds: 0, warnings: ['no-scores-found'], columns: null, tried };
}

// ---- Matching a leaderboard name to an app member ----
// A scoring sheet writes "Given Surname" while the app stores "Surname Given",
// so comparing strings never matches — the sorted token set does. Names go
// through the same normalization on both sides (case, dots, hyphens, accents).
export function nameKey(name) {
  const tokens = String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.,'’`\-]/g, ' ')
    .split(/\s+/).filter(Boolean);
  // A single token is too weak to identify anyone.
  return tokens.length >= 2 ? tokens.sort().join(' ') : '';
}

// Every spelling the app holds for a user; any of them may be the one the
// scorer typed.
export function userNameKeys(user) {
  if (!user) return [];
  const spellings = [
    [user.lastName, user.firstName].filter(Boolean).join(' '),
    user.fullName,
    user.name
  ].filter(Boolean);
  return [...new Set(spellings.map(nameKey).filter(Boolean))];
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Exact token set, or the same tokens with exactly ONE of them off by a single
// character (Biligsaikhan / Bilegsaikhan). Allowing more than one slip would
// start handing a member somebody else's score, which is worse than showing
// them nothing.
export function nameMatches(key, candidateKeys) {
  if (!key || !candidateKeys.length) return false;
  if (candidateKeys.includes(key)) return true;
  const a = key.split(' ');
  return candidateKeys.some(other => {
    const b = other.split(' ');
    if (b.length !== a.length) return false;
    let slips = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (++slips > 1 || editDistance(a[i], b[i]) > 1) return false;
    }
    return slips === 1;
  });
}

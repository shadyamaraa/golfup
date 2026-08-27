// src/matchplay.js
// Match play (M Cup) scoring engine — pure functions only.
//
// Nothing here touches the DOM or Firebase; app.js owns both, the same
// division of labor as tournament-sheet.js. Everything the UI shows — match
// status, final results, team totals — is DERIVED from the stored hole
// results, never stored itself, so a correction to any hole re-settles the
// whole tournament on its own.
//
// Data model, stored under tournaments/{id} when format === 'match':
//
//   mp: {
//     teams: { a: { name, short, color, logo }, b: { ... } },
//     roster: { [playerId]: { teamId: 'a'|'b', name, userId? } },
//     sessions: { [sessionId]: {
//       id, day, number, format: 'FOURSOMES'|'FOURBALL'|'SINGLES',
//       startTime, status
//     } },
//     matches: { [matchId]: {
//       id, sessionId, number, teeTime, totalHoles?,
//       players: { a: [playerId, ...], b: [playerId, ...] },
//       scorerIds: { [userId]: true },
//       stateOverride?: 'SUSPENDED',
//       holes: { [holeNumber]: 'a'|'b'|'h' }
//     } },
//     audit: { [pushId]: { at, by, matchId, hole, value, prev } }
//   }
//
// A hole's winner is the team KEY ('a' or 'b'); 'h' is a halved hole. The
// spec suggested null-for-halved, but RTDB deletes null values, so halved
// needs a real sentinel to be storable at all.

export const TEAM_KEYS = ['a', 'b'];
export const HALVED = 'h';
export const DEFAULT_HOLES = 18;

export const FORMATS = ['FOURSOMES', 'FOURBALL', 'SINGLES'];
// How many players one team fields in one match of each format.
export const FORMAT_TEAM_SIZE = { FOURSOMES: 2, FOURBALL: 2, SINGLES: 1 };

// How many unique players each team must field per session (spec §26).
export const SESSION_PLAYERS_REQUIRED = 12;
// Full roster size per team (spec §2).
export const ROSTER_SIZE = 14;

const other = (k) => (k === 'a' ? 'b' : 'a');

// ---- Match scoring ----

/**
 * Settle one match from its hole results.
 *
 * Holes are replayed strictly in order 1..totalHoles and the walk STOPS the
 * moment the match is decided (margin > holes remaining), so a stray entry
 * recorded past the close-out can never change the result — and an undo of
 * an earlier hole automatically brings later entries back into play.
 *
 * @param {{[hole]: 'a'|'b'|'h'}} holes
 * @param {number} [totalHoles]
 * @returns {{
 *   thru: number,              // holes actually counted
 *   wins: {a: number, b: number}, halved: number,
 *   leader: 'a'|'b'|null,      // null = all square
 *   margin: number,            // holes up, 0 when all square
 *   holesRemaining: number,    // after the last counted hole
 *   dormie: boolean,           // margin === remaining, still alive
 *   finished: boolean,
 *   closedOut: boolean,        // decided before the last hole
 *   winner: 'a'|'b'|null,      // null = halved or not finished
 *   result: string|null        // '4 & 3' | '2 UP' | 'AS' — finished only
 * }}
 */
export function settleMatch(holes, totalHoles = DEFAULT_HOLES) {
  const wins = { a: 0, b: 0 };
  let halved = 0;
  let thru = 0;

  for (let hole = 1; hole <= totalHoles; hole++) {
    const v = holes?.[hole];
    // A gap in the sequence ends the replay: results are entered live in
    // order, so anything after a missing hole is a stray write.
    if (v !== 'a' && v !== 'b' && v !== HALVED) break;
    if (v === HALVED) halved++;
    else wins[v]++;
    thru = hole;
    const margin = Math.abs(wins.a - wins.b);
    if (margin > totalHoles - hole) break; // closed out
  }

  const margin = Math.abs(wins.a - wins.b);
  const leader = margin === 0 ? null : (wins.a > wins.b ? 'a' : 'b');
  const holesRemaining = totalHoles - thru;
  // A win decided on the last green is '1 UP', not a close-out.
  const closedOut = holesRemaining > 0 && margin > holesRemaining;
  const finished = closedOut || (thru === totalHoles);
  const winner = finished && leader ? leader : null;

  let result = null;
  if (finished) {
    if (!leader) result = 'AS';
    else if (closedOut) result = `${margin} & ${holesRemaining}`;
    else result = `${margin} UP`;
  }

  return {
    thru, wins, halved, leader, margin, holesRemaining,
    dormie: !finished && margin > 0 && margin === holesRemaining,
    finished, closedOut, winner, result
  };
}

// The status line a live card shows: 'AS', '2 UP', and once finished the
// final form ('4 & 3', '1 UP', 'HALVED'). Match play notation is universal,
// so these strings are not translated.
export function statusText(settled) {
  if (!settled) return '';
  if (settled.finished) {
    return settled.winner ? settled.result : 'HALVED';
  }
  return settled.leader ? `${settled.margin} UP` : 'AS';
}

// UPCOMING | LIVE | COMPLETED | SUSPENDED, derived from the hole results —
// nobody has to flip a state by hand. An explicit override (suspension is a
// human decision) wins over everything.
export function matchState(match) {
  if (match?.stateOverride === 'SUSPENDED') return 'SUSPENDED';
  const settled = settleMatch(match?.holes, match?.totalHoles || DEFAULT_HOLES);
  if (settled.finished) return 'COMPLETED';
  return settled.thru > 0 ? 'LIVE' : 'UPCOMING';
}

// ---- Points ----

// Win 1, halve ½ each, unfinished nothing (spec §7).
export function matchPoints(match) {
  if (matchState(match) !== 'COMPLETED') return { a: 0, b: 0 };
  const settled = settleMatch(match.holes, match.totalHoles || DEFAULT_HOLES);
  if (!settled.winner) return { a: 0.5, b: 0.5 };
  return { a: settled.winner === 'a' ? 1 : 0, b: settled.winner === 'b' ? 1 : 0 };
}

const matchList = (matches) =>
  (Array.isArray(matches) ? matches : Object.values(matches || {})).filter(Boolean);

// Aggregate team score over any set of matches (whole tournament or one
// session) — spec §7/§24. Never stored, always derived.
export function teamTotals(matches) {
  const total = { a: 0, b: 0 };
  matchList(matches).forEach(m => {
    const p = matchPoints(m);
    total.a += p.a;
    total.b += p.b;
  });
  return total;
}

// Per-session breakdown for the summary page (spec §24).
export function sessionTotals(matches) {
  const out = {};
  matchList(matches).forEach(m => {
    const sid = m.sessionId || '';
    if (!out[sid]) out[sid] = { a: 0, b: 0 };
    const p = matchPoints(m);
    out[sid].a += p.a;
    out[sid].b += p.b;
  });
  return out;
}

// ---- Detail view ----

// One row per hole for the detail table (spec §11): the result entered and
// the status line as it stood after that hole. Holes past a close-out or a
// gap carry result null, exactly as the settled match ignores them.
export function holeTimeline(match) {
  const totalHoles = match?.totalHoles || DEFAULT_HOLES;
  const settled = settleMatch(match?.holes, totalHoles);
  const rows = [];
  const partial = {};
  for (let hole = 1; hole <= totalHoles; hole++) {
    if (hole <= settled.thru) {
      partial[hole] = match.holes[hole];
      rows.push({ hole, result: match.holes[hole], status: statusText(settleMatch(partial, totalHoles)) });
    } else {
      rows.push({ hole, result: null, status: '' });
    }
  }
  return rows;
}

// ---- Ordering ----

// LIVE first, then UPCOMING by tee time, COMPLETED last (spec §10/§22) —
// within a state the match number keeps the printed draw's order.
const STATE_ORDER = { LIVE: 0, SUSPENDED: 1, UPCOMING: 2, COMPLETED: 3 };

export function sortMatchesForDisplay(matches) {
  return matchList(matches)
    .map(m => ({ match: m, state: matchState(m) }))
    .sort((x, y) => (STATE_ORDER[x.state] - STATE_ORDER[y.state])
      || String(x.match.teeTime || '').localeCompare(String(y.match.teeTime || ''))
      || (Number(x.match.number) || 0) - (Number(y.match.number) || 0));
}

// ---- Validation (spec §26) ----

const rosterTeam = (roster, pid) => roster?.[pid]?.teamId || null;

/**
 * Check one session's lineup. Returns a list of issues; empty = valid.
 * Issue shapes:
 *   { kind: 'duplicate-player', playerId, matches: [matchId, ...] }
 *   { kind: 'wrong-team', playerId, matchId }       // not on that side's roster
 *   { kind: 'unknown-player', playerId, matchId }
 *   { kind: 'player-count', teamId, count, required }
 *   { kind: 'match-size', matchId, teamId, count, required }
 */
export function lineupIssues(sessionMatches, roster, { required = SESSION_PLAYERS_REQUIRED } = {}) {
  const issues = [];
  const seen = new Map(); // playerId -> [matchId]
  const counts = { a: 0, b: 0 };

  matchList(sessionMatches).forEach(m => {
    const size = FORMAT_TEAM_SIZE[m.format] || null;
    TEAM_KEYS.forEach(teamId => {
      const ids = (m.players?.[teamId] || []).filter(Boolean);
      if (size !== null && ids.length !== size) {
        issues.push({ kind: 'match-size', matchId: m.id, teamId, count: ids.length, required: size });
      }
      ids.forEach(pid => {
        const team = rosterTeam(roster, pid);
        if (!team) issues.push({ kind: 'unknown-player', playerId: pid, matchId: m.id });
        else if (team !== teamId) issues.push({ kind: 'wrong-team', playerId: pid, matchId: m.id });
        if (!seen.has(pid)) { seen.set(pid, []); counts[teamId]++; }
        seen.get(pid).push(m.id);
      });
    });
  });

  seen.forEach((ids, pid) => {
    if (ids.length > 1) issues.push({ kind: 'duplicate-player', playerId: pid, matches: ids });
  });
  if (required) {
    TEAM_KEYS.forEach(teamId => {
      if (counts[teamId] !== required) {
        issues.push({ kind: 'player-count', teamId, count: counts[teamId], required });
      }
    });
  }
  return issues;
}

// "Every roster player plays at least once" — the participation indicator
// for the admin dashboard (spec §26).
export function participation(roster, matches) {
  const played = new Set();
  matchList(matches).forEach(m =>
    TEAM_KEYS.forEach(k => (m.players?.[k] || []).forEach(pid => pid && played.add(pid))));
  const out = { a: { used: 0, total: 0, unused: [] }, b: { used: 0, total: 0, unused: [] } };
  Object.entries(roster || {}).forEach(([pid, p]) => {
    const side = out[p?.teamId];
    if (!side) return;
    side.total++;
    if (played.has(pid)) side.used++;
    else side.unused.push(pid);
  });
  return out;
}

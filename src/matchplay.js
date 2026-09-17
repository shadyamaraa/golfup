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
//       holes: { [holeNumber]: 'a'|'b'|'h' },
//       holeMeta: { [holeNumber]: { by: userId } },   // who entered it
//       pending: { [holeNumber]: { value: 'a'|'b'|'h'|'clear', by, byName, at } }
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

// ---- Playoff ----
// When every match is decided and the two teams are level, the cup is played
// off: three holes, two players a side, one ball (foursomes). Halved again
// and it goes to sudden death over the same three holes, round and round,
// until one of them is won. The playoff decides the cup ONLY — the tied score
// stands, so a playoff match carries no point (see matchPoints).
export const PLAYOFF_HOLES = [1, 8, 9];

export const isPlayoff = (match) => !!match?.playoff;

// The course holes a match is played on, when they are not simply 1..n.
// Stored on the match as holeList; RTDB can hand it back as an array or as
// an object keyed by index, so both are normalized here.
function holeListOf(match) {
  const raw = match?.holeList;
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  return list.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0);
}

/**
 * The course hole a match's hole INDEX is played on. A playoff over 1, 8, 9
 * cycles: index 4 is hole 1 again, 5 is 8, 6 is 9 — which is what sudden
 * death means on the ground. Every ordinary match maps index to itself.
 */
export function matchHoleNo(match, hole) {
  const list = holeListOf(match);
  const i = Math.max(1, Number(hole) || 1);
  return list.length ? list[(i - 1) % list.length] : i;
}

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
 *   result: string|null,       // '4 & 3' | '2 UP' | 'AS' — finished only
 *   extraHoles: number,        // sudden-death holes played past totalHoles
 *   suddenDeath: boolean       // won on an extra hole
 * }}
 *
 * With { suddenDeath: true } the match cannot be halved: level after the last
 * hole, it plays on one hole at a time and the first hole won ends it.
 */
export function settleMatch(holes, total = DEFAULT_HOLES, { suddenDeath = false } = {}) {
  // Coerced because it can arrive from storage: a "18" would compare unequal
  // to thru forever and the match would never finish.
  const totalHoles = Number(total) || DEFAULT_HOLES;
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

  // Sudden death: all square with the regular holes played is not a halved
  // match, it is one that goes on. Extra holes are indexed straight on
  // (4, 5, 6 …) and each is settled on its own — the first one won ends it.
  let extraHoles = 0;
  let sdWinner = null;
  if (suddenDeath && thru === totalHoles && wins.a === wins.b) {
    for (let hole = totalHoles + 1; ; hole++) {
      const v = holes?.[hole];
      if (v !== 'a' && v !== 'b' && v !== HALVED) break;
      extraHoles++;
      thru = hole;
      if (v === HALVED) { halved++; continue; }
      wins[v]++;
      sdWinner = v;
      break;
    }
  }

  const margin = Math.abs(wins.a - wins.b);
  const leader = margin === 0 ? null : (wins.a > wins.b ? 'a' : 'b');
  const holesRemaining = Math.max(0, totalHoles - thru);
  // A win decided on the last green is '1 UP', not a close-out.
  const closedOut = holesRemaining > 0 && margin > holesRemaining;
  const finished = closedOut || (thru >= totalHoles && !(suddenDeath && !leader));
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
    finished, closedOut, winner, result,
    extraHoles, suddenDeath: !!sdWinner
  };
}

// Settle a match by its own rules — its hole count, and sudden death when it
// is the playoff. Every caller that has the match itself should use this
// rather than repeating `m.totalHoles || DEFAULT_HOLES`.
export function settleMatchOf(match) {
  return settleMatch(match?.holes, match?.totalHoles || DEFAULT_HOLES,
    { suddenDeath: isPlayoff(match) });
}

/**
 * How many hole cells a match shows. Fixed at totalHoles for an ordinary
 * match; a playoff in sudden death grows by one unplayed hole at a time, so
 * the scorer always has the next hole to enter and the strip shows how far
 * the extra holes have run.
 */
export function matchHoleCount(match, settled) {
  const totalHoles = Number(match?.totalHoles) || DEFAULT_HOLES;
  if (!isPlayoff(match)) return totalHoles;
  const s = settled || settleMatchOf(match);
  return Math.max(totalHoles, s.thru + (s.finished ? 0 : 1));
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
  const settled = settleMatchOf(match);
  // A decided match is over whatever any flag says. Checking the flag first
  // would let a suspension nobody cleared — play resumes, the scorer keeps
  // tapping and never presses Resume — hold a finished match out of
  // COMPLETED, and matchPoints() only pays completed matches, so the point
  // would quietly never reach the scoreboard.
  if (settled.finished) return 'COMPLETED';
  if (match?.stateOverride === 'SUSPENDED') return 'SUSPENDED';
  return settled.thru > 0 ? 'LIVE' : 'UPCOMING';
}

// ---- Points ----

// Win 1, halve ½ each, unfinished nothing (spec §7).
export function matchPoints(match) {
  // The playoff settles the cup, not the scoreboard: a tie stays a tie and
  // the extra match pays nothing, so every total derived from here — the
  // overall, the session rows, a player's record — keeps reading 12 – 12.
  if (isPlayoff(match)) return { a: 0, b: 0 };
  if (matchState(match) !== 'COMPLETED') return { a: 0, b: 0 };
  const settled = settleMatchOf(match);
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

// Per-session breakdown for the summary page (spec §24). A match with no
// session is bucketed under UNGROUPED rather than dropped, so the rows always
// add up to the overall score even if setup left one behind.
export const UNGROUPED = '__ungrouped';

export function sessionTotals(matches) {
  const out = {};
  matchList(matches).forEach(m => {
    const sid = m.sessionId || UNGROUPED;
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
  const totalHoles = Number(match?.totalHoles) || DEFAULT_HOLES;
  const playoff = isPlayoff(match);
  const opts = { suddenDeath: playoff };
  const settled = settleMatch(match?.holes, totalHoles, opts);
  const count = matchHoleCount(match, settled);
  const rows = [];
  const partial = {};
  for (let hole = 1; hole <= count; hole++) {
    // `hole` stays the index the result is stored under; `no` is the course
    // hole it is played on, which is all that differs for a playoff.
    const at = { hole, no: matchHoleNo(match, hole), extra: hole > totalHoles };
    if (hole <= settled.thru) {
      partial[hole] = match.holes[hole];
      rows.push({ ...at, result: match.holes[hole], status: statusText(settleMatch(partial, totalHoles, opts)) });
    } else {
      rows.push({ ...at, result: null, status: '' });
    }
  }
  return rows;
}

// ---- Ordering ----

// The clock order of a draw: matches with a tee time by the clock, then the
// ones without one by number — a match nobody has timed yet belongs after
// the timed ones, not between them.
const byClock = (a, b) => {
  const ta = String(a.teeTime || ''), tb = String(b.teeTime || '');
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (!!ta !== !!tb) return ta ? -1 : 1;
  return (Number(a.number) || 0) - (Number(b.number) || 0);
};

// LIVE first, then UPCOMING by tee time, COMPLETED last (spec §10/§22).
// Within a state the sessions keep their day and number — two days' draws
// never interleave by the clock — then the clock order of the draw
// (byClock). Without sessions it is the plain clock order.
const STATE_ORDER = { LIVE: 0, SUSPENDED: 1, UPCOMING: 2, COMPLETED: 3 };

export function sortMatchesForDisplay(matches, sessions = {}) {
  const sess = (m) => (m.sessionId && sessions?.[m.sessionId]) || null;
  return matchList(matches)
    .map(m => ({ match: m, state: matchState(m) }))
    .sort((x, y) => (STATE_ORDER[x.state] - STATE_ORDER[y.state])
      || (Number(sess(x.match)?.day) || 0) - (Number(sess(y.match)?.day) || 0)
      || (Number(sess(x.match)?.number) || 0) - (Number(sess(y.match)?.number) || 0)
      || byClock(x.match, y.match));
}

// ---- Tee times ----

// "09:40" + 10 → "09:50"; wraps midnight ("23:55" + 10 → "00:05").
// Anything that is not HH:MM comes back as ''.
export function addMinutesHHMM(hhmm, mins) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const total = ((Number(m[1]) * 60 + Number(m[2]) + Number(mins || 0)) % 1440 + 1440) % 1440;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/**
 * The admin gives the first match its tee time by hand; the rest of the
 * draw follows at a fixed interval. Walks the matches AFTER `fromId` (in
 * match-number order) keeping a running clock from that match's time, and
 * returns [{id, teeTime}] assignments for the ones whose time is empty.
 * A hand-set time is never overwritten — it becomes the new base the chain
 * continues from. Pure: the input list is not touched.
 */
export function cascadeTeeTimes(matches, fromId, stepMin = 10) {
  const sorted = matchList(matches)
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  const at = sorted.findIndex(m => m.id === fromId);
  if (at < 0) return [];
  let clock = sorted[at].teeTime;
  if (!/^\d{1,2}:\d{2}$/.test(String(clock || ''))) return [];
  const changes = [];
  for (let i = at + 1; i < sorted.length; i++) {
    const m = sorted[i];
    if (m.teeTime) { clock = m.teeTime; continue; }
    clock = addMinutesHHMM(clock, stepMin);
    changes.push({ id: m.id, teeTime: clock });
  }
  return changes;
}

// ---- Schedule ----

// The draw as the members read it: sessions in day/number order, each with
// its matches in clock order (byClock) — the marshal table's order, shared
// with the Хуваарь tab so paper and phone can never disagree. Matches with
// no session come last under a null session; with no sessions at all every
// match sits in that one block. Each block says whether every match in it
// is decided; with `doneLast` those blocks move to the end, in their own
// order — the screen keeps what is on the course and what is to come on
// top, the paper keeps the draw's order.
export function mpSchedule(mp, { doneLast = false } = {}) {
  const sessions = Object.values(mp?.sessions || {}).filter(Boolean)
    .sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0)
      || (Number(a.number) || 0) - (Number(b.number) || 0));
  const all = matchList(mp?.matches);
  const of = (sid) => all.filter(m => (m.sessionId || null) === sid).sort(byClock);
  const block = (session, matches) => ({
    session, matches,
    finished: matches.length > 0 && matches.every(m => matchState(m) === 'COMPLETED')
  });
  const blocks = sessions.map(s => block(s, of(s.id)));
  const loose = sessions.length ? of(null) : all.slice().sort(byClock);
  if (loose.length) blocks.push(block(null, loose));
  return doneLast ? [...blocks.filter(b => !b.finished), ...blocks.filter(b => b.finished)] : blocks;
}

// A session's calendar date: day 1 is the tournament's start date, day 2
// the next, and so on. '' when either side is missing.
export function sessionDate(startDate, day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ''));
  const d = Number(day);
  if (!m || !Number.isFinite(d) || d < 1) return '';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + d - 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// The roster entry that is this member: modern entries are keyed by the
// member's userId, older ones carry it in the record.
export function rosterPid(roster, userId) {
  if (!userId || !roster) return null;
  if (roster[userId]) return userId;
  return Object.keys(roster).find(pid => roster[pid]?.userId === userId) || null;
}

// The member's next match: the earliest they are fielded in that has not
// finished — one under way counts, the way a round you have teed off in
// stays the home card. Carries the session, the calendar date, the tee time
// (the match's own, else the session's start), which side they are on and
// a sortable ms (Infinity without a date and time, so dated matches win).
export function mpNextMatch(mp, userId, { startDate } = {}) {
  const pid = rosterPid(mp?.roster, userId);
  if (!pid) return null;
  const sessions = mp?.sessions || {};
  const out = [];
  for (const m of matchList(mp?.matches)) {
    const side = ['a', 'b'].find(k => (m.players?.[k] || []).includes(pid));
    if (!side || matchState(m) === 'COMPLETED') continue;
    const session = (m.sessionId && sessions[m.sessionId]) || null;
    const date = sessionDate(startDate, session?.day || 1);
    const time = m.teeTime || session?.startTime || '';
    const ms = date && time ? new Date(`${date}T${time}`).getTime() : NaN;
    out.push({ match: m, session, pid, side, date, time, ms: Number.isFinite(ms) ? ms : Infinity });
  }
  if (!out.length) return null;
  out.sort((x, y) => (x.ms - y.ms)
    || (Number(x.session?.day) || 0) - (Number(y.session?.day) || 0)
    || (Number(x.session?.number) || 0) - (Number(y.session?.number) || 0)
    || (Number(x.match.number) || 0) - (Number(y.match.number) || 0));
  return out[0];
}

// When a match may be scored: its own tee time, else its session's start,
// on the session's calendar day. null when there is nothing honest to wait
// for — no start date, no time — so an undated draw is never held.
export function matchOpensAt(tn, match) {
  const mp = tn?.mp || {};
  const session = (match?.sessionId && mp.sessions?.[match.sessionId]) || null;
  const date = sessionDate(tn?.startDate, session?.day || 1);
  const raw = String(match?.teeTime || session?.startTime || '');
  if (!date || !/^\d{1,2}:\d{2}$/.test(raw)) return null;
  const time = raw.padStart(5, '0');
  const ms = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(ms) ? { ms, date, time } : null;
}

// The wait before a match's tee time — {ms, date, time} while it is still
// ahead, null once it has passed or when there is none. Players and their
// designated scorers wait with the group; an admin or marshal is never held,
// since a marshal moving a group up is exactly who has to score early.
export function matchLocked(tn, match, user, now = Date.now()) {
  if (user?.role === 'admin' || user?.role === 'marshal') return null;
  const opens = matchOpensAt(tn, match);
  return opens && opens.ms > now ? opens : null;
}

// ---- Team colours ----

// The colours a cup's two teams wear on every screen when the organiser
// has not picked their own: Altai's blue and Wellcom's burnt orange, read
// off the club's two crests (kept away from the app's gold). A stored
// six-digit hex wins over the default.
export const TEAM_COLORS = { a: '#3D5A99', b: '#B45A1B' };

export function teamColorOf(mp, k) {
  const c = mp?.teams?.[k]?.color;
  return /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : (TEAM_COLORS[k] || TEAM_COLORS.a);
}

// ---- Validation (spec §26) ----

const rosterTeam = (roster, pid) => roster?.[pid]?.teamId || null;

/**
 * Check one session's lineup. Returns a list of issues; empty = valid.
 * Issue shapes:
 *   { kind: 'duplicate-player', playerId, matches: [matchId, ...] }
 *   { kind: 'duplicate-in-match', playerId, matches: [matchId] }  // both slots
 *   { kind: 'wrong-team', playerId, matchId }       // not on that side's roster
 *   { kind: 'unknown-player', playerId, matchId }
 *   { kind: 'player-count', teamId, count, required }
 *   { kind: 'match-size', matchId, teamId, count, required }
 */
export function lineupIssues(sessionMatches, roster, { required = SESSION_PLAYERS_REQUIRED } = {}) {
  const issues = [];
  const seen = new Map(); // playerId -> [matchId]
  // Unique players fielded per side. A player who (wrongly) appears twice
  // still occupies one place, so the set is what the twelve-per-team rule
  // counts — the duplicate is reported separately.
  const fielded = { a: new Set(), b: new Set() };

  matchList(sessionMatches).forEach(m => {
    // A match with no format still has to field the same number on each side,
    // so an unrecognized one is checked for symmetry rather than waved
    // through — skipping the rule returned a false all-clear on an obvious
    // one-against-two.
    const known = FORMAT_TEAM_SIZE[m.format];
    const size = known || Math.max(
      (m.players?.a || []).filter(Boolean).length,
      (m.players?.b || []).filter(Boolean).length
    );
    TEAM_KEYS.forEach(teamId => {
      const ids = (m.players?.[teamId] || []).filter(Boolean);
      if (size && ids.length !== size) {
        issues.push({ kind: 'match-size', matchId: m.id, teamId, count: ids.length, required: size });
      }
      ids.forEach(pid => {
        const team = rosterTeam(roster, pid);
        if (!team) issues.push({ kind: 'unknown-player', playerId: pid, matchId: m.id });
        else if (team !== teamId) issues.push({ kind: 'wrong-team', playerId: pid, matchId: m.id });
        // Counted against the side they were FIELDED on, not the side their
        // roster entry says: a player put out for the wrong team still
        // occupies one of that team's twelve places, and reporting otherwise
        // produced a phantom shortfall next to the real wrong-team warning.
        if (!seen.has(pid)) seen.set(pid, []);
        seen.get(pid).push(m.id);
        fielded[teamId].add(pid);
      });
    });
  });

  seen.forEach((ids, pid) => {
    // Twice in the SAME match is a different mistake from twice in the
    // session, and saying "plays twice in one session" about it misdescribes
    // what the admin is looking at.
    if (ids.length > 1) {
      const sameMatch = ids.every(id => id === ids[0]);
      issues.push({
        kind: sameMatch ? 'duplicate-in-match' : 'duplicate-player',
        playerId: pid,
        matches: sameMatch ? [ids[0]] : ids
      });
    }
  });
  if (required) {
    TEAM_KEYS.forEach(teamId => {
      const count = fielded[teamId].size;
      if (count !== required) issues.push({ kind: 'player-count', teamId, count, required });
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

// ---- Player statistics (spec §25) ----

// Per-player record over COMPLETED matches only: played, W/L/H, and points —
// each player carries their side's match points (1 / ½ / 0), which is how
// Ryder Cup individual tallies are read. Live and upcoming matches count for
// nothing yet, so the table can render mid-tournament without lying.
export function playerStats(mp) {
  const out = {};
  const row = (pid) => (out[pid] = out[pid] || { played: 0, w: 0, l: 0, h: 0, points: 0 });
  matchList(mp?.matches).forEach(m => {
    if (matchState(m) !== 'COMPLETED') return;
    const settled = settleMatchOf(m);
    const points = matchPoints(m);
    TEAM_KEYS.forEach(teamId => {
      (m.players?.[teamId] || []).filter(Boolean).forEach(pid => {
        const r = row(pid);
        r.played++;
        r.points += points[teamId];
        if (!settled.winner) r.h++;
        else if (settled.winner === teamId) r.w++;
        else r.l++;
      });
    });
  });
  return out;
}

// Pair records (spec §25): how each two-player side has fared together, keyed
// by the sorted pair of player ids joined with '+'. Singles contribute
// nothing here.
export function pairStats(mp) {
  const out = {};
  matchList(mp?.matches).forEach(m => {
    if (matchState(m) !== 'COMPLETED') return;
    const settled = settleMatchOf(m);
    TEAM_KEYS.forEach(teamId => {
      const ids = (m.players?.[teamId] || []).filter(Boolean);
      if (ids.length !== 2) return;
      const key = [...ids].sort().join('+');
      const r = (out[key] = out[key] || { teamId, players: [...ids].sort(), played: 0, w: 0, l: 0, h: 0 });
      r.played++;
      if (!settled.winner) r.h++;
      else if (settled.winner === teamId) r.w++;
      else r.l++;
    });
  });
  return out;
}

// True once every match in the tournament is decided — what "the M Cup is
// over" means; there is at least one match, or an empty setup would read as
// finished.
export function tournamentComplete(mp) {
  const list = matchList(mp?.matches);
  return list.length > 0 && list.every(m => matchState(m) === 'COMPLETED');
}

/**
 * Who has won the cup, and whether a playoff is owed — the one rule every
 * screen should ask rather than comparing points itself.
 *
 * @returns {{
 *   totals: {a, b},            // the scoreboard; a playoff never moves it
 *   complete: boolean,         // every ordinary match decided
 *   tied: boolean,
 *   playoff: object|null,      // the playoff match, once an admin made one
 *   playoffSettled: object|null,
 *   playoffWinner: 'a'|'b'|null,
 *   winner: 'a'|'b'|null,      // points leader, else the playoff's winner
 *   needsPlayoff: boolean      // level, all played, and no playoff drawn yet
 * }}
 *
 * `complete && !winner` is the other question worth asking: the cup is level
 * and still unsettled, whether or not the playoff has been drawn.
 */
export function mpOutcome(mp) {
  const all = matchList(mp?.matches);
  const regular = all.filter(m => !isPlayoff(m));
  const playoff = all.find(isPlayoff) || null;
  const totals = teamTotals(all);
  const complete = regular.length > 0 && regular.every(m => matchState(m) === 'COMPLETED');
  const playoffSettled = playoff ? settleMatchOf(playoff) : null;
  const playoffWinner = playoffSettled?.finished ? playoffSettled.winner : null;
  const lead = totals.a > totals.b ? 'a' : totals.b > totals.a ? 'b' : null;
  return {
    totals, complete, tied: !lead, playoff, playoffSettled, playoffWinner,
    winner: lead || playoffWinner || null,
    // Only while there is no playoff at all: once one is drawn, the answer is
    // to go and play it, not to draw another.
    needsPlayoff: complete && !lead && !playoff
  };
}

// A new playoff match and the session that holds it, ready for the admin to
// fill in the four players. Pure: the caller stores what it is given.
export function newPlayoffSession(mp, { holes = PLAYOFF_HOLES, sessionId, matchId } = {}) {
  const list = Object.values(mp?.sessions || {}).filter(Boolean);
  const day = list.reduce((d, s) => Math.max(d, Number(s.day) || 0), 1);
  const number = list.filter(s => (Number(s.day) || 0) === day)
    .reduce((n, s) => Math.max(n, Number(s.number) || 0), 0) + 1;
  const holeList = (holes || []).map(Number).filter(n => Number.isFinite(n) && n > 0);
  const session = {
    id: sessionId, day, number, format: 'FOURSOMES', startTime: '',
    playoff: true, holeList
  };
  const match = {
    id: matchId, sessionId, number: 1, teeTime: '', format: 'FOURSOMES',
    playoff: true, holeList, totalHoles: holeList.length,
    players: { a: [], b: [] }
  };
  return { session, match };
}

// The tournament's one roster, wherever its kind keeps it: stroke play's
// sp.players (persons and, in a team event, the teams), match play's
// mp.roster. The entry shape is one superset — { name, userId?, teamId?,
// hcp?, status?, division?, groups?, kind?, members?, addedAt? } — and a
// match play entry is a subset of it. Readers that need a kind's own
// fields still read their own node; this is for everything that only asks
// who is in.
export const tnRoster = (tn) => (tnKind(tn) === 'stroke' ? tn?.sp?.players : tn?.mp?.roster) || {};

// How many entries the roster holds — a sheet-era tournament with only its
// entries snapshot counts those.
export function tnRosterCount(tn) {
  const n = Object.values(tnRoster(tn)).filter(Boolean).length;
  return n || (Array.isArray(tn?.entries) ? tn.entries.length : 0);
}

// A whole draw from a plan — one row per session: the day, the format, how
// many matches, when the first tees off. The shapes are the admin editor's
// own (add-session, add-match), so it reads a templated draw as if it had
// built it: sessions numbered through the plan, matches numbered within
// their session, tee times chained ten minutes apart from the session's
// start. Lineups stay empty for the admin to fill. With `singles` there are
// no sessions and no teams — the matches stand in one flat SINGLES list,
// which is what keeps tnKind reading the record as plain match play.
// Pure: ids come from idBase so a test can pin them.
export function mpTemplate(plan, { idBase = Date.now().toString(36), stepMin = 10, singles = false } = {}) {
  const sessions = {};
  const matches = {};
  const time = (v) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? v : '');
  let seq = 0;
  (Array.isArray(plan) ? plan : []).forEach((row, i) => {
    const count = Math.max(0, Math.floor(Number(row?.matches) || 0));
    if (!count) return;
    const format = singles ? 'SINGLES' : (FORMATS.includes(row?.format) ? row.format : 'FOURSOMES');
    let clock = time(row?.startTime);
    let sid = null;
    if (!singles) {
      sid = `s_${idBase}${i}`;
      sessions[sid] = {
        id: sid, day: Math.max(1, Number(row?.day) || 1),
        number: Object.keys(sessions).length + 1, format, startTime: clock
      };
    }
    for (let n = 1; n <= count; n++) {
      const mid = `m_${idBase}${seq}`;
      matches[mid] = {
        id: mid, ...(sid ? { sessionId: sid } : {}),
        number: singles ? seq + 1 : n, teeTime: clock, format,
        players: { a: [], b: [] }
      };
      seq += 1;
      clock = clock ? addMinutesHHMM(clock, stepMin) : '';
    }
  });
  return { sessions, matches };
}

// ---- Correction consent ----

// What entering `hole` should do for this user: write straight through, or
// file a proposal the original enterer has to approve. Officials and the
// person who entered the hole write directly; a hole nobody owns (entered
// before ownership was recorded, or still empty) is open; anything else is
// somebody else's entry and needs their consent.
export function holeChangeAction(user, match, hole) {
  if (!user) return 'propose';
  if (user.role === 'admin' || user.role === 'marshal') return 'direct';
  const existing = match?.holes?.[hole];
  if (existing !== 'a' && existing !== 'b' && existing !== HALVED) return 'direct';
  const owner = match?.holeMeta?.[hole]?.by;
  if (!owner || owner === user.id) return 'direct';
  return 'propose';
}

// May this user settle (approve/reject) the pending change on `hole`?
export function canResolveHoleChange(user, match, hole) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  return match?.holeMeta?.[hole]?.by === user.id;
}

// ---- Tournament kind ----

// Which engine a tournament runs on. 'ryder' is the team competition (two
// teams, sessions, the M Cup rules); 'match' is plain 1v1 match play (a flat
// list of singles matches, no teams); everything else is stroke play. Records
// written before 'ryder' existed carry format 'match' WITH teams/sessions, so
// shape breaks the tie for them.
// What deleting these matches would take with them: a match IS its scores
// (its holes live on it), so the count is the holes on each. The editor
// asks this of a fresh read at save time — see spScoredRemovals for why.
// `ids` may be a Set or an array.
export function mpScoredRemovals(mp, ids) {
  const matches = mp?.matches || {};
  const roster = mp?.roster || {};
  const names = (pids) => (pids || []).map(pid => roster[pid]?.name || pid).join(' / ');
  return [...(ids || [])].map(id => {
    const m = matches[id];
    const holes = Object.values(m?.holes || {}).filter(v => v !== null && v !== undefined && v !== '').length;
    return {
      id,
      number: m?.number ?? null,
      label: `${m?.number != null ? `#${m.number} ` : ''}${names(m?.players?.a)} – ${names(m?.players?.b)}`.trim(),
      holes
    };
  }).filter(x => x.holes > 0);
}

export function tnKind(tn) {
  if (!tn) return 'stroke';
  if (tn.format === 'ryder') return 'ryder';
  if (tn.format === 'match') {
    const mp = tn.mp;
    if (mp && (mp.teams || mp.sessions)) return 'ryder';
    return 'match';
  }
  return 'stroke';
}

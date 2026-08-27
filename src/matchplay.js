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
export function settleMatch(holes, total = DEFAULT_HOLES) {
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
  const settled = settleMatch(match?.holes, match?.totalHoles || DEFAULT_HOLES);
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
    const settled = settleMatch(m.holes, m.totalHoles || DEFAULT_HOLES);
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
    const settled = settleMatch(m.holes, m.totalHoles || DEFAULT_HOLES);
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

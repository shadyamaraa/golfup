// World Handicap System math for casual-game scorecards.
//
// Method (WHS): Score Differential = (113 / Slope) × (AGS − Course Rating),
// with PCC taken as 0 (playing-conditions adjustment needs association data
// we don't have). Handicap Index = the WHS average of the best differentials
// from the most recent 20 rounds, capped at 54.0.
//
// v1 simplification: games carry a total par, not per-hole pars, so the
// adjusted gross score is the raw hole sum with each hole already clamped
// 1..15 at entry — the net-double-bogey hole cap needs per-hole par and a
// stroke index and is deferred until games carry them.

import { holePar, coursePars, resolveCourse } from './courses.js';

export const MAX_HCP_INDEX = 54.0;

// How many of the most recent N differentials count, and the flat adjustment
// applied — straight from the WHS small-sample table.
const WHS_TABLE = [
  { scores: 3, best: 1, adj: -2.0 },
  { scores: 4, best: 1, adj: -1.0 },
  { scores: 5, best: 1, adj: 0 },
  { scores: 6, best: 2, adj: -1.0 },
  { scores: 7, best: 2, adj: 0 },
  { scores: 9, best: 3, adj: 0 },
  { scores: 12, best: 4, adj: 0 },
  { scores: 15, best: 5, adj: 0 },
  { scores: 17, best: 6, adj: 0 },
  { scores: 19, best: 7, adj: 0 },
  { scores: 20, best: 8, adj: 0 },
];

export function scoreDifferential(ags, rating, slope) {
  if (!ags || !rating || !slope) return null;
  return Math.round((113 / slope) * (ags - rating) * 10) / 10;
}

// differentials: newest first; fewer than 3 rounds → no index yet.
export function handicapIndex(differentials) {
  const recent = (differentials || []).filter(d => typeof d === 'number').slice(0, 20);
  if (recent.length < 3) return null;
  let row = WHS_TABLE[0];
  for (const r of WHS_TABLE) if (recent.length >= r.scores) row = r;
  const best = [...recent].sort((a, b) => a - b).slice(0, row.best);
  const avg = best.reduce((s, d) => s + d, 0) / best.length + row.adj;
  return Math.min(MAX_HCP_INDEX, Math.round(avg * 10) / 10);
}

export function courseHandicap(index, slope, rating, par) {
  if (index == null || !slope || !rating || !par) return null;
  return Math.round(index * (slope / 113) + (rating - par));
}

// Handicap strokes a player receives on one hole, allocated by stroke index:
// everyone gets floor(hcp/18) on every hole, and the remainder lands on the
// holes with the lowest (hardest) SI first.
export function strokesReceived(hcp, si) {
  if (!hcp || hcp < 0 || !si) return 0;
  return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
}

// game.holes is 'full18' | 'back9' (older games may miss it → 18).
export function gameHoleCount(game) {
  return !game?.holes || game.holes === 'full18' ? 18 : 9;
}

// game + entered scores → a rounds/{ghin}/{gameId} record shaped like a GHIN
// score posting (see src/ghin.js). Returns null until the player has entered
// every hole. differential stays null when the game has no course data.
export function roundFromGame(game, playerId) {
  const holes = game?.scores?.[playerId]?.holes || {};
  const holeCount = gameHoleCount(game);
  let total = 0;
  // Built hole by hole rather than spread: RTDB hands numeric-keyed maps back
  // as sparse arrays, and spreading one would leak an undefined slot 0.
  const holeScores = {};
  for (let n = 1; n <= holeCount; n++) {
    const s = holes[n];
    if (!s) return null;
    // AGS cap: where the hole's par is known, a blow-up hole counts as at
    // most par + 5 for handicap purposes (the WHS maximum for a player
    // without an established index; the per-player net-double-bogey cap
    // needs a course handicap at entry time and stays v2). The stored
    // scorecard keeps the real strokes — only the AGS/differential is capped.
    const par = holePar(game, n);
    total += par ? Math.min(s, par + 5) : s;
    holeScores[n] = s;
  }
  const c = game.course || {};
  return {
    playedAt: game.date ? new Date(game.date).getTime() : (game.createdAt || Date.now()),
    courseName: c.name || game.location || game.venue || '',
    courseRating: c.rating || null,
    slopeRating: c.slope || null,
    par: c.par || null,
    holesPlayed: holeCount,
    agsTotal: total,
    differential: scoreDifferential(total, c.rating, c.slope),
    holeScores,
    source: 'game',
    gameId: game.id,
    playerId,
    ghinPosted: false,
  };
}

// One tournament stroke-play round + its 18-hole map → the same record shape
// as roundFromGame, keyed for rounds/{ghin}/{tnId_rN} (the gameId field is
// what store.upsertRound keys by, so corrections re-post idempotently).
// Returns null until every hole is in; differential stays null unless the
// tournament carries the tee's rating/slope.
export function roundFromTournament(tn, playerId, round, holes) {
  if (!tn?.id || !playerId || !round) return null;
  // Course key first, venue-name alias second — same tolerance as tnPars.
  const pars = coursePars(tn.course) || coursePars(tn.venue);
  let total = 0;
  const holeScores = {};
  for (let n = 1; n <= 18; n++) {
    const s = Number(holes?.[n]);
    if (!Number.isFinite(s) || s <= 0) return null;
    // Same AGS cap as roundFromGame: par + 5 where the hole's par is known.
    const par = pars?.[n];
    total += par ? Math.min(s, par + 5) : s;
    holeScores[n] = s;
  }
  return {
    playedAt: tn.startDate ? new Date(tn.startDate).getTime() : Date.now(),
    courseName: (resolveCourse(tn.course) || resolveCourse(tn.venue))?.name || tn.venue || '',
    courseRating: tn.rating || null,
    slopeRating: tn.slope || null,
    par: tn.par || null,
    holesPlayed: 18,
    agsTotal: total,
    differential: scoreDifferential(total, tn.rating, tn.slope),
    holeScores,
    source: 'tournament',
    gameId: `${tn.id}_r${round}`,
    tournamentId: tn.id,
    round,
    playerId,
    ghinPosted: false,
  };
}

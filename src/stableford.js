// src/stableford.js
// Stableford points — pure functions only, shared by the casual game scorer
// (src/game-formats.js) and the tournament board (src/strokeplay.js).
//
// Stableford scores each hole on its own: the player's strokes, less the
// handicap strokes that hole gives them, measured against par. Par is worth
// two points, and every stroke better or worse moves the hole by one, floored
// at nothing — so a blow-up hole costs a player their two points and no more,
// which is the whole appeal of the format for a club field.
//
//   albatross 5 · eagle 4 · birdie 3 · par 2 · bogey 1 · double bogey or worse 0
//
// The two benchmarks worth remembering: a round played exactly to par scores
// 36 points gross, and a player who plays exactly to their handicap also
// scores 36 — so "36 points" reads the same way "level par" does.
//
// Handicap strokes come from strokesReceived(hcp, si) — the FULL playing
// handicap allocated by the hole's stroke index, which is how club Stableford
// is played. (Match play and skins in src/game-formats.js allocate a
// DIFFERENCE off the low man instead; same allocator, different argument.)
// A player with no handicap simply scores gross Stableford, and a course with
// no stroke index does the same, because strokesReceived() returns 0 for both.
//
// Nothing here knows about a game or a tournament record: both callers pass
// their own hole map, pars and stroke indexes, which is what lets one engine
// serve two very different data shapes.

import { strokesReceived } from './handicap.js';

// What par is worth. Every stroke better or worse is one point.
export const PAR_POINTS = 2;

/**
 * One hole's points. `strokesGiven` is how many handicap strokes the player
 * receives on this hole (0 for gross play).
 * Returns null when the hole cannot be scored — no strokes entered, or a
 * course whose par for that hole is unknown.
 */
export function holePoints(strokes, par, strokesGiven = 0) {
  const s = Number(strokes);
  const p = Number(par);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return null;
  const given = Number.isFinite(Number(strokesGiven)) ? Number(strokesGiven) : 0;
  return Math.max(0, PAR_POINTS - ((s - given) - p));
}

/**
 * A round's points from its hole map — the Stableford counterpart of
 * roundGross() in src/strokeplay.js, and deliberately the same shape of
 * answer.
 *
 *   holes: { [hole]: strokes }   pars: { [hole]: par } | null
 *   sis:   { [hole]: si } | null hcp:  number | null
 *
 * Returns { points, holesIn, parsKnown }. Non-numeric and non-positive
 * strokes are ignored, the way an admin clearing a hole writes null and RTDB
 * drops it. `parsKnown` goes false the moment an entered hole has no par:
 * without a course card Stableford cannot be scored at all, and the caller
 * should show nothing rather than a total that quietly skipped holes.
 *
 * Points accumulate hole by hole, so a round in progress has an honest
 * running total — unlike to-par, which needs the whole card on a course with
 * no per-hole pars.
 */
export function roundPoints(holes, pars = null, sis = null, hcp = null) {
  let points = 0;
  let holesIn = 0;
  let parsKnown = !!pars;
  const h = Number(hcp);
  const playing = Number.isFinite(h) ? h : null;

  Object.entries(holes || {}).forEach(([hole, v]) => {
    const strokes = Number(v);
    if (!Number.isFinite(strokes) || strokes <= 0) return;
    holesIn += 1;
    const par = Number(pars?.[hole]);
    if (!Number.isFinite(par)) { parsKnown = false; return; }
    const given = playing === null ? 0 : strokesReceived(playing, sis?.[hole] ?? null);
    points += holePoints(strokes, par, given) ?? 0;
  });

  return { points, holesIn, parsKnown };
}

/**
 * How many strokes a handicap gives over a set of holes — what a scorer
 * prints beside a player ("+7 цох."). `holeList` is the card's hole numbers.
 */
export function strokesOverHoles(holeList, sis, hcp) {
  const h = Number(hcp);
  if (!Number.isFinite(h)) return 0;
  return (holeList || []).reduce((n, hole) => n + strokesReceived(h, sis?.[hole] ?? null), 0);
}

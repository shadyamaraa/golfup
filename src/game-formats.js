// src/game-formats.js
// Casual-game formats — pure functions only, the same division of labour as
// matchplay.js and strokeplay.js: nothing here touches the DOM or Firebase.
//
// A casual game scores one way on the course whatever its format: every
// player's strokes per hole, entered with the group scorer's stepper. The
// format decides how those strokes are READ. Stroke play ranks them; match
// play turns each hole into a winner for the two players paired against each
// other; skins turns each hole into a pot the lowest score takes outright.
// Every reading is derived on render from the same strokes — the invariant
// the M Cup engine already keeps ("only hole winners are stored").
//
// What the format adds to games/{id}, all optional:
//
//   format:        'stroke' | 'match' | 'skins'   // missing = 'stroke'
//   pairing:       { [groupIdx]: [playerId, ...] } // the group's playing ORDER:
//                  //   order[0] v order[1], order[2] v order[3] (Phase 2 team
//                  //   formats: order[0]+order[1] v order[2]+order[3])
//   holeOverrides: { [pairKey]: { [hole]: playerId | 'h' } }
//                  // a conceded hole, set by hand; wins over the derived result
//
// A pairing is honoured only while its ids are exactly the group's ids —
// regrouping simply drops it back to join order. Overrides are keyed by the
// sorted pair, so re-pairing never mis-attributes a hole: a pair that is not
// currently playing each other is never read, and comes back when it is.
//
// Handicaps: "play off the low man". In a match the higher-handicap player
// receives the DIFFERENCE, allocated by stroke index; in skins every player
// receives their difference to the group's lowest. Net only when everyone
// involved has a handicap — one missing makes the contest gross, since a
// one-sided allowance would be no fairer than none. On a 9-hole card the full
// difference is allocated against the 18-hole SI of the nine holes actually
// played (a rough half-allowance, on the hardest holes) — the v1 rule.

import { settleMatch, statusText, HALVED } from './matchplay.js';
import { strokesReceived, gameHoleCount } from './handicap.js';
import { holeSI } from './courses.js';

export const FORMATS = ['stroke', 'match', 'skins'];

// The i18n key each format's name lives under (Phase 2 names included so the
// label lookup never has to change).
export const FORMAT_LABEL_KEY = {
  stroke: 'fmtStroke', match: 'fmtMatch', skins: 'fmtSkins',
  scramble: 'fmtScramble', fourball: 'fmtFourball', foursome: 'fmtFoursome'
};

// Unknown or missing formats read as stroke play — records written before
// the field existed are never backfilled.
export function gameFormat(game) {
  return FORMATS.includes(game?.format) ? game.format : 'stroke';
}

export const isStrokeFormat = (game) => gameFormat(game) === 'stroke';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// A player's strokes on a card hole, or null when not entered.
function strokesOf(game, pid, hole) {
  const s = Number(game?.scores?.[pid]?.holes?.[hole]);
  return Number.isFinite(s) && s > 0 ? s : null;
}

// ---- Pairing ----

// The key a pair's overrides live under — order-independent, so whichever
// way round the two are paired the same holes are found.
export const pairKey = (a, b) => [String(a), String(b)].sort().join('+');

// Every way the group can be split into matches, as id orders. Four players
// have exactly three; any other size has only the join order.
export function pairingOptions(players) {
  const ids = (players || []).filter(Boolean).map(p => p.id);
  if (ids.length !== 4) return [ids];
  const [p1, p2, p3, p4] = ids;
  return [[p1, p2, p3, p4], [p1, p3, p2, p4], [p1, p4, p2, p3]];
}

// The order the group plays in: the stored pairing when it still names
// exactly these players, the join order otherwise. Tolerates the stored
// order coming back from RTDB as an object.
export function groupOrder(game, groupIdx, players) {
  const ids = (players || []).filter(Boolean).map(p => String(p.id));
  const raw = game?.pairing?.[groupIdx];
  const stored = raw ? (Array.isArray(raw) ? raw : Object.values(raw)).map(String) : null;
  if (stored && stored.length === ids.length
    && [...stored].sort().join(' ') === [...ids].sort().join(' ')) return stored;
  return ids;
}

// The group's matches by its order: (0 v 1), (2 v 3); an odd player out has
// no match and still enters strokes for their own card.
export function groupPairs(game, groupIdx, players) {
  const list = (players || []).filter(Boolean);
  const order = groupOrder(game, groupIdx, list);
  const byId = Object.fromEntries(list.map(p => [String(p.id), p]));
  const pairs = [];
  let i = 0;
  for (; i + 1 < order.length; i += 2) {
    const a = byId[order[i]];
    const b = byId[order[i + 1]];
    pairs.push({ key: pairKey(a.id, b.id), a, b });
  }
  return { order, pairs, unpaired: order.slice(i).map(id => byId[id]) };
}

// The split after the current one, wrapping — what the scorer's swap writes.
export function nextPairing(game, groupIdx, players) {
  const opts = pairingOptions(players);
  const cur = groupOrder(game, groupIdx, players).join(',');
  const at = opts.findIndex(o => o.join(',') === cur);
  return opts[(at + 1) % opts.length];
}

// ---- Handicap allowance ----

// Strokes each side of a match receives: the difference off the lower
// handicap. Gross (0 / 0) unless both have one.
export function pairAllowance(hcps, pair) {
  const ha = hcps?.[pair.a.id];
  const hb = hcps?.[pair.b.id];
  if (!isNum(ha) || !isNum(hb)) return { net: false, base: null, a: 0, b: 0 };
  const base = Math.min(ha, hb);
  return { net: true, base, a: ha - base, b: hb - base };
}

// Skins: everyone's difference to the group's lowest; gross for all unless
// every player has a handicap.
export function groupAllowance(hcps, players) {
  const list = (players || []).filter(Boolean);
  const vals = list.map(p => hcps?.[p.id]);
  if (!list.length || !vals.every(isNum)) {
    return { net: false, base: null, strokes: Object.fromEntries(list.map(p => [p.id, 0])) };
  }
  const base = Math.min(...vals);
  return { net: true, base, strokes: Object.fromEntries(list.map(p => [p.id, hcps[p.id] - base])) };
}

// Strokes less the handicap strokes received on this hole. A course without
// a card has no SI, so strokesReceived() gives 0 and play is gross.
export function netStrokes(game, hole, strokes, allowance) {
  return strokes - strokesReceived(allowance, holeSI(game, hole));
}

// How many strokes an allowance comes to over this card — what the UI names
// beside the player ("5 str.").
export function allowanceTotal(game, diff) {
  let n = 0;
  for (let h = 1; h <= gameHoleCount(game); h++) n += strokesReceived(diff, holeSI(game, h));
  return n;
}

// ---- Match play ----

// One pair's holes as the match engine wants them: 'a' | 'b' | 'h' per hole.
// An override wins outright; otherwise both players' strokes decide; a hole
// either has not entered stays absent — settleMatch stops at the first gap,
// which is what lets a hand-set conceded hole carry the walk past missing
// strokes. `source` says which holes were set by hand.
export function matchHoles(game, pair, hcps, overrides) {
  const total = gameHoleCount(game);
  const allowance = pairAllowance(hcps, pair);
  const ov = overrides?.[pair.key] || {};
  const holes = {};
  const source = {};
  for (let n = 1; n <= total; n++) {
    const o = ov[n];
    if (o === HALVED || o === pair.a.id || o === pair.b.id) {
      holes[n] = o === HALVED ? HALVED : o === pair.a.id ? 'a' : 'b';
      source[n] = 'override';
      continue;
    }
    const sa = strokesOf(game, pair.a.id, n);
    const sb = strokesOf(game, pair.b.id, n);
    if (sa === null || sb === null) continue;
    const na = netStrokes(game, n, sa, allowance.a);
    const nb = netStrokes(game, n, sb, allowance.b);
    holes[n] = na < nb ? 'a' : nb < na ? 'b' : HALVED;
    source[n] = 'derived';
  }
  return { holes, source, allowance };
}

// The settled match plus what the screens print. `status` is match play
// notation ('AS', '2 UP', '4 & 3', 'HALVED') and deliberately untranslated,
// as on the M Cup board. `gapHole` names the first hole with no result while
// later holes have one — the hole somebody has to set by hand before the
// match can move on.
export function matchResult(game, pair, hcps, overrides) {
  const totalHoles = gameHoleCount(game);
  const { holes, source, allowance } = matchHoles(game, pair, hcps, overrides);
  const settled = settleMatch(holes, totalHoles);
  let gapHole = null;
  if (!settled.finished) {
    const last = Math.max(0, ...Object.keys(holes).map(Number));
    for (let n = 1; n < last; n++) {
      if (!holes[n]) { gapHole = n; break; }
    }
  }
  return {
    pair, holes, source, allowance, settled,
    status: statusText(settled), thru: settled.thru, totalHoles, gapHole
  };
}

// Every match in a group, settled — the one call the scorer, the game page
// and the printed card make.
export function groupMatches(game, groupIdx, players, hcps, overrides) {
  const { order, pairs, unpaired } = groupPairs(game, groupIdx, players);
  return { order, unpaired, matches: pairs.map(pair => matchResult(game, pair, hcps, overrides)) };
}

// ---- Skins ----

// Hole by hole: the pot is one skin plus whatever carried; the unique lowest
// net score takes it, a tie carries it to the next hole. The walk stops at
// the first hole somebody has not entered — a skin cannot be decided with a
// player missing. Whatever is still carrying at the end is unclaimed.
export function skinsResult(game, players, hcps) {
  const list = (players || []).filter(Boolean);
  if (list.length < 2) return null;
  const total = gameHoleCount(game);
  const allowance = groupAllowance(hcps, list);
  const totals = Object.fromEntries(list.map(p => [p.id, 0]));
  const perHole = [];
  let carry = 0;
  let thru = 0;
  for (let n = 1; n <= total; n++) {
    const nets = list.map(p => {
      const s = strokesOf(game, p.id, n);
      return s === null ? null : netStrokes(game, n, s, allowance.strokes[p.id]);
    });
    if (nets.some(v => v === null)) break;
    thru = n;
    const pot = 1 + carry;
    const best = Math.min(...nets);
    const winners = list.filter((_, i) => nets[i] === best);
    if (winners.length === 1) {
      totals[winners[0].id] += pot;
      perHole.push({ hole: n, winner: winners[0].id, pot, best });
      carry = 0;
    } else {
      perHole.push({ hole: n, winner: null, pot, best });
      carry = pot;
    }
  }
  return { perHole, totals, carry, thru, net: allowance.net, base: allowance.base };
}

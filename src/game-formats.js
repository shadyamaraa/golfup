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
//   format:        'stroke' | 'match' | 'skins' | 'stableford'
//                  // | 'scramble' | 'fourball' | 'foursome'   missing = 'stroke'
//   pairing:       { [groupIdx]: [playerId, ...] } // the group's playing ORDER:
//                  //   singles: order[0] v order[1], order[2] v order[3]
//                  //   teams:   order[0]+order[1] v order[2]+order[3]
//   holeOverrides: { [key]: { [hole]: sideId | 'h' } }
//                  // a conceded hole, set by hand; wins over the derived
//                  // result. `key` is the sorted pair of player ids for a
//                  // singles match, of TEAM keys for a team match.
//   teamScores:    { [teamKey]: { holes: { [hole]: strokes } } }
//                  // the one ball a scramble or foursome team plays
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
//
// Stableford is the exception: it is not a contest between these players but
// each player against par, so every player receives their FULL handicap (see
// src/stableford.js) and one player's missing handicap only makes THAT player
// gross. Same allocator either way.
//
// The three TEAM formats put two players a side, from the same order the pair
// swap already cycles. Fourball reads four ordinary cards and takes each side's
// best net ball; scramble and foursome play ONE ball, so the team is the
// scoring unit and its strokes live under teamScores — the only thing this app
// stores that is not a player's own card. All three settle hole by hole through
// the same match engine, so dormie, close-outs and conceded holes come free.

import { settleMatch, statusText, HALVED } from './matchplay.js';
import { strokesReceived, gameHoleCount } from './handicap.js';
import { holePar, holeSI } from './courses.js';
import { holePoints, strokesOverHoles } from './stableford.js';

export const FORMATS = [
  'stroke', 'match', 'skins', 'stableford', 'scramble', 'fourball', 'foursome'
];

// 2 v 2 inside the tee group.
export const TEAM_FORMATS = ['scramble', 'fourball', 'foursome'];

// The i18n key each format's name lives under.
export const FORMAT_LABEL_KEY = {
  stroke: 'fmtStroke', match: 'fmtMatch', skins: 'fmtSkins', stableford: 'fmtStableford',
  scramble: 'fmtScramble', fourball: 'fmtFourball', foursome: 'fmtFoursome'
};

// Unknown or missing formats read as stroke play — records written before
// the field existed are never backfilled.
export function gameFormat(game) {
  return FORMATS.includes(game?.format) ? game.format : 'stroke';
}

export const isStrokeFormat = (game) => gameFormat(game) === 'stroke';

export const isTeamFormat = (game) => TEAM_FORMATS.includes(gameFormat(game));

// Scramble and foursome play one ball per team, so the team is the scoring
// unit and no player has an individual card — which is why they never post a
// WHS round. Fourball is a team format too, but it is derived from four
// perfectly ordinary cards, so it posts exactly as stroke play does.
export const isOneBallFormat = (game) =>
  gameFormat(game) === 'scramble' || gameFormat(game) === 'foursome';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// A player's strokes on a card hole, or null when not entered.
function strokesOf(game, pid, hole) {
  const s = Number(game?.scores?.[pid]?.holes?.[hole]);
  return Number.isFinite(s) && s > 0 ? s : null;
}

// A team's strokes on a card hole — the one-ball counterpart of strokesOf.
export function teamStrokesOf(game, teamKey, hole) {
  const s = Number(game?.teamScores?.[teamKey]?.holes?.[hole]);
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

// Pair a list of SIDES into contests: (0 v 1), (2 v 3) …, with any odd side
// left over. A side is anything with an id — a player, or a team, whose id is
// its two partners' pair key. One rule, applied once for singles and twice for
// the team formats.
function pairUp(sides) {
  const pairs = [];
  let i = 0;
  for (; i + 1 < sides.length; i += 2) {
    pairs.push({ key: pairKey(sides[i].id, sides[i + 1].id), a: sides[i], b: sides[i + 1] });
  }
  return { pairs, spare: sides.slice(i) };
}

// The group's matches by its order: (0 v 1), (2 v 3); an odd player out has
// no match and still enters strokes for their own card.
export function groupPairs(game, groupIdx, players) {
  const list = (players || []).filter(Boolean);
  const order = groupOrder(game, groupIdx, list);
  const byId = Object.fromEntries(list.map(p => [String(p.id), p]));
  const { pairs, spare } = pairUp(order.map(id => byId[id]));
  return { order, pairs, unpaired: spare };
}

// The group's TEAMS, from the same order the ⇄ cycles: order[0]+order[1],
// order[2]+order[3], … A team's id IS its two partners' pair key, so a split
// the ⇄ cycles away and back finds its ball again, and an odd player out keeps
// their own individual card exactly as they do in a 1 v 1 group.
export function groupTeams(game, groupIdx, players) {
  const { order, pairs, unpaired } = groupPairs(game, groupIdx, players);
  return { order, teams: pairs.map(p => ({ id: p.key, players: [p.a, p.b] })), unpaired };
}

// The team-against-team contests: consecutive teams, the same way groupPairs
// takes consecutive players. Four players are one contest, eight are two, and
// six are one contest and a team with nobody to play. A contest has exactly the
// shape groupPairs' pairs do — { key, a, b } — so every match renderer the 1 v 1
// already has reads it unchanged, with teams where it expects players.
export function teamContests(game, groupIdx, players) {
  const { order, teams, unpaired } = groupTeams(game, groupIdx, players);
  const { pairs, spare } = pairUp(teams);
  return { order, teams, contests: pairs, spareTeams: spare, unpaired };
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

// A team's playing handicap: the average of its two players. null when either
// of them has none — the same all-or-nothing rule pairAllowance uses, for the
// same reason (half an allowance is no fairer than none).
export function teamHcp(hcps, team) {
  const vals = (team?.players || []).map(p => hcps?.[p.id]);
  if (!vals.length || !vals.every(isNum)) return null;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

// Scramble and foursome: the two team averages play off the lower of them, and
// the higher team receives the difference. Rounded, because a team average is
// commonly a half and strokesReceived allocates whole strokes by stroke index;
// half a stroke rounds UP to the receiving team, the same direction
// courseHandicap already rounds. `hcpA`/`hcpB` are the raw averages, for the
// chip beside each team's name.
export function teamAllowance(hcps, contest) {
  const ha = teamHcp(hcps, contest?.a);
  const hb = teamHcp(hcps, contest?.b);
  if (ha === null || hb === null) {
    return { net: false, base: null, hcpA: ha, hcpB: hb, a: 0, b: 0 };
  }
  const base = Math.min(ha, hb);
  return { net: true, base, hcpA: ha, hcpB: hb, a: Math.round(ha - base), b: Math.round(hb - base) };
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

// The walk every match makes, singles or team: an override wins outright,
// otherwise the two sides' net balls decide, and a hole either side has not
// finished stays absent — settleMatch stops at the first gap, which is what
// lets a hand-set conceded hole carry the walk past missing strokes. `source`
// says which holes were set by hand. `aId`/`bId` are the ids an override
// names: player ids for a singles match, team ids for a team match, and
// `ballA`/`ballB` are how each side's net score for a hole is found.
//
// One implementation for both, so the concession rule and the gap rule can
// never drift apart between them.
function walkHoles(total, ov, aId, bId, ballA, ballB) {
  const holes = {};
  const source = {};
  for (let n = 1; n <= total; n++) {
    const o = ov?.[n];
    if (o === HALVED || o === aId || o === bId) {
      holes[n] = o === HALVED ? HALVED : o === aId ? 'a' : 'b';
      source[n] = 'override';
      continue;
    }
    const na = ballA(n);
    const nb = ballB(n);
    if (na === null || nb === null) continue;
    holes[n] = na < nb ? 'a' : nb < na ? 'b' : HALVED;
    source[n] = 'derived';
  }
  return { holes, source };
}

// The first hole with no result while a later hole has one — the hole somebody
// has to set by hand before the match can move on.
function firstGap(holes, settled) {
  if (settled.finished) return null;
  const last = Math.max(0, ...Object.keys(holes).map(Number));
  for (let n = 1; n < last; n++) if (!holes[n]) return n;
  return null;
}

// One pair's holes as the match engine wants them: 'a' | 'b' | 'h' per hole.
export function matchHoles(game, pair, hcps, overrides) {
  const allowance = pairAllowance(hcps, pair);
  const ball = (p, diff) => (n) => {
    const strokes = strokesOf(game, p.id, n);
    return strokes === null ? null : netStrokes(game, n, strokes, diff);
  };
  const { holes, source } = walkHoles(
    gameHoleCount(game), overrides?.[pair.key], pair.a.id, pair.b.id,
    ball(pair.a, allowance.a), ball(pair.b, allowance.b));
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
  return {
    pair, holes, source, allowance, settled,
    status: statusText(settled), thru: settled.thru, totalHoles,
    gapHole: firstGap(holes, settled)
  };
}

// Every match in a group, settled — the one call the scorer, the game page
// and the printed card make.
export function groupMatches(game, groupIdx, players, hcps, overrides) {
  const { order, pairs, unpaired } = groupPairs(game, groupIdx, players);
  return { order, unpaired, matches: pairs.map(pair => matchResult(game, pair, hcps, overrides)) };
}

// ---- Team formats: scramble, fourball, foursome ----

// One contest's holes as the match engine wants them.
//
// Scramble and foursome read the single ball each team played, off the
// difference between the two team averages. Fourball reads the four individual
// cards, off the lowest of THOSE FOUR (groupAllowance, exactly as match play
// and skins) — the four in this contest, not the whole group, since a player in
// another contest has nothing to do with this one.
export function teamMatchHoles(game, contest, hcps, overrides) {
  const total = gameHoleCount(game);
  const ov = overrides?.[contest.key];

  if (gameFormat(game) === 'fourball') {
    const allowance = groupAllowance(hcps, [...contest.a.players, ...contest.b.players]);
    // A side's score is its BEST net ball. One ball is enough: a partner who
    // picked up leaves the hole blank, which is ordinary fourball, so waiting
    // for both would stall almost every hole. A side with neither ball in has
    // not finished, and the walk stops there.
    const best = (team) => (n) => {
      const nets = team.players.map(p => {
        const strokes = strokesOf(game, p.id, n);
        return strokes === null ? null : netStrokes(game, n, strokes, allowance.strokes[p.id]);
      }).filter(v => v !== null);
      return nets.length ? Math.min(...nets) : null;
    };
    const { holes, source } = walkHoles(
      total, ov, contest.a.id, contest.b.id, best(contest.a), best(contest.b));
    return { holes, source, allowance };
  }

  const allowance = teamAllowance(hcps, contest);
  const ball = (team, diff) => (n) => {
    const strokes = teamStrokesOf(game, team.id, n);
    return strokes === null ? null : netStrokes(game, n, strokes, diff);
  };
  const { holes, source } = walkHoles(total, ov, contest.a.id, contest.b.id,
    ball(contest.a, allowance.a), ball(contest.b, allowance.b));
  return { holes, source, allowance };
}

// A team's own ball as a line — deliberately the shape gameScoreLine() returns,
// so the panels and the printed card format it with the code they already have.
// `given` is what the allowance comes to over the card actually being played.
export function teamBallLine(game, teamId, diff = 0) {
  const total = gameHoleCount(game);
  let sum = 0, thru = 0, parSum = 0, parHoles = 0;
  for (let n = 1; n <= total; n++) {
    const strokes = teamStrokesOf(game, teamId, n);
    if (strokes === null) continue;
    sum += strokes;
    thru += 1;
    const par = holePar(game, n);
    if (par) { parSum += par; parHoles += 1; }
  }
  const toPar = thru && parHoles === thru ? sum - parSum : null;
  const given = allowanceTotal(game, diff);
  return {
    total: sum, thru, toPar, given,
    net: thru ? sum - given : null,
    netToPar: toPar === null ? null : toPar - given
  };
}

// One settled team contest — the exact shape matchResult returns, with teams
// where it has players, so every renderer the 1 v 1 match already has reads it
// unchanged. `lines` carries each team's own ball for the one-ball formats;
// fourball's numbers are the players' own and are already on their rows.
export function teamMatchResult(game, contest, hcps, overrides) {
  const totalHoles = gameHoleCount(game);
  const oneBall = isOneBallFormat(game);
  const { holes, source, allowance } = teamMatchHoles(game, contest, hcps, overrides);
  const settled = settleMatch(holes, totalHoles);
  return {
    pair: contest, holes, source, allowance, settled,
    status: statusText(settled), thru: settled.thru, totalHoles,
    gapHole: firstGap(holes, settled),
    lines: oneBall
      ? { a: teamBallLine(game, contest.a.id, allowance.a),
          b: teamBallLine(game, contest.b.id, allowance.b) }
      : null
  };
}

// Every team contest in a group, settled — the one call the scorer, the game
// page and the printed card make, and the twin of groupMatches.
export function groupTeamMatches(game, groupIdx, players, hcps, overrides) {
  const { order, teams, contests, spareTeams, unpaired } = teamContests(game, groupIdx, players);
  return {
    order, teams, spareTeams, unpaired,
    matches: contests.map(c => teamMatchResult(game, c, hcps, overrides))
  };
}

// Has anything been entered for this game at all — individual strokes OR a team
// ball? Both the printable-scorecard button and the printed card ask, and both
// used to ask about players only, which reads a finished scramble as unplayed.
export function gameHasAnyScore(game) {
  const any = (branch) => Object.values(branch || {})
    .some(e => e?.holes && Object.values(e.holes).some(v => Number(v) > 0));
  return any(game?.scores) || any(game?.teamScores);
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

// ---- Stableford ----

// Every player against par, hole by hole, off their FULL playing handicap
// allocated by stroke index — not against each other, so there is no pairing
// and nothing to concede. Par is two points; a blow-up hole costs the two and
// no more. A player without a handicap scores gross, and so does everybody on
// a course with no stroke index (strokesReceived returns 0 for both).
//
// Unlike skins, a hole nobody finished does not stop the walk: a player who
// picks up simply scores nothing there, which is exactly what Stableford is
// for. `thru` counts the holes a player actually entered.
export function stablefordResult(game, players, hcps) {
  const list = (players || []).filter(Boolean);
  if (!list.length) return null;
  const total = gameHoleCount(game);
  const holeList = Array.from({ length: total }, (_, i) => i + 1);
  let parsKnown = true;
  for (const n of holeList) if (!holePar(game, n)) { parsKnown = false; break; }
  // The card's stroke indexes, keyed by card hole (holeSI maps a back-9 card
  // through to its physical hole for us).
  const sis = Object.fromEntries(holeList.map(n => [n, holeSI(game, n)]));

  const perPlayer = {};
  list.forEach(p => {
    const hcp = Number.isFinite(Number(hcps?.[p.id])) ? Number(hcps[p.id]) : null;
    const perHole = [];
    let points = 0;
    let thru = 0;
    holeList.forEach(n => {
      const strokes = strokesOf(game, p.id, n);
      const given = hcp === null ? 0 : strokesReceived(hcp, holeSI(game, n));
      const pts = holePoints(strokes, holePar(game, n), given);
      if (strokes !== null) thru += 1;
      if (pts !== null) points += pts;
      perHole.push({ hole: n, strokes, given, points: pts });
    });
    // `given` is the allowance line the panel prints: how many strokes this
    // handicap gives over the card actually being played.
    const given = strokesOverHoles(holeList, sis, hcp);
    perPlayer[p.id] = { points, thru, hcp, given, perHole };
  });

  const order = list.map(p => p.id).sort((a, b) =>
    perPlayer[b].points - perPlayer[a].points
    || perPlayer[b].thru - perPlayer[a].thru
    || String(list.find(p => p.id === a)?.name || '').localeCompare(String(list.find(p => p.id === b)?.name || '')));

  return {
    perPlayer,
    order,
    thru: Math.max(0, ...list.map(p => perPlayer[p.id].thru)),
    net: list.some(p => Number.isFinite(Number(hcps?.[p.id]))),
    parsKnown
  };
}

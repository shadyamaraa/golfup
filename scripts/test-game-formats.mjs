// scripts/test-game-formats.mjs
// Unit tests for the casual-game formats engine. Run with: npm run test:mp
// Pure module — no browser, no Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATS, TEAM_FORMATS, gameFormat, isStrokeFormat, isTeamFormat, isOneBallFormat,
  pairKey, pairingOptions, groupOrder, groupPairs, groupTeams, teamContests,
  nextPairing, pairAllowance, groupAllowance, teamHcp, teamAllowance,
  netStrokes, allowanceTotal, teamStrokesOf, teamBallLine, gameHasAnyScore,
  matchHoles, matchResult, groupMatches, groupTeamMatches, skinsResult, stablefordResult
} from '../src/game-formats.js';
import { HALVED } from '../src/matchplay.js';
import { strokesReceived } from '../src/handicap.js';

const P = (id, name) => ({ id, name, joinedAt: 1 });
const P1 = P('p1', 'Бат'), P2 = P('p2', 'Дорж'), P3 = P('p3', 'Сараа'), P4 = P('p4', 'Тулга');
const FOUR = [P1, P2, P3, P4];

// A card: card(4, 5, 4) → { 1: 4, 2: 5, 3: 4 }
const card = (...strokes) => Object.fromEntries(strokes.map((s, i) => [i + 1, s]));
const same = (n, s) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, s]));

const G = (extra = {}) => ({
  id: 'g1', location: 'Sky Resort Golf Club', holes: 'full18',
  groups: [FOUR], scores: {}, ...extra
});
const withScores = (game, scores) => ({
  ...game, scores: Object.fromEntries(Object.entries(scores).map(([pid, holes]) => [pid, { holes }]))
});
const withTeamScores = (game, teams) => ({
  ...game, teamScores: Object.fromEntries(Object.entries(teams).map(([key, holes]) => [key, { holes }]))
});

// ---- format ----

test('gameFormat: missing or unknown reads as stroke play', () => {
  assert.equal(gameFormat({}), 'stroke');
  assert.equal(gameFormat({ format: 'ryder' }), 'stroke');
  assert.equal(gameFormat(null), 'stroke');
  assert.equal(gameFormat({ format: 'match' }), 'match');
  assert.equal(gameFormat({ format: 'skins' }), 'skins');
  assert.ok(isStrokeFormat({}));
  assert.ok(!isStrokeFormat({ format: 'skins' }));
  assert.deepEqual(FORMATS,
    ['stroke', 'match', 'skins', 'stableford', 'scramble', 'fourball', 'foursome']);
  assert.equal(gameFormat({ format: 'stableford' }), 'stableford');
});

test('team formats are named, and only scramble/foursome play one ball', () => {
  assert.deepEqual(TEAM_FORMATS, ['scramble', 'fourball', 'foursome']);
  for (const f of TEAM_FORMATS) assert.ok(isTeamFormat({ format: f }), f);
  for (const f of ['stroke', 'match', 'skins', 'stableford', 'nonsense']) {
    assert.ok(!isTeamFormat({ format: f }), f);
    assert.ok(!isOneBallFormat({ format: f }), f);
  }
  assert.ok(isOneBallFormat({ format: 'scramble' }));
  assert.ok(isOneBallFormat({ format: 'foursome' }));
  // Fourball is a team format built from four ordinary cards, so it still
  // posts a WHS round — the distinction the whole handicap path hangs on.
  assert.ok(isTeamFormat({ format: 'fourball' }));
  assert.ok(!isOneBallFormat({ format: 'fourball' }));
  assert.ok(!isTeamFormat({}) && !isOneBallFormat({}));
});

// ---- pairing ----

test('pairKey is order-independent', () => {
  assert.equal(pairKey('p2', 'p1'), pairKey('p1', 'p2'));
  assert.equal(pairKey('p1', 'p2'), 'p1+p2');
});

test('pairingOptions: three splits for four players, one otherwise', () => {
  const opts = pairingOptions(FOUR);
  assert.equal(opts.length, 3);
  assert.equal(new Set(opts.map(o => o.join())).size, 3);
  assert.deepEqual(opts[0], ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(pairingOptions([P1, P2, P3]), [['p1', 'p2', 'p3']]);
  assert.deepEqual(pairingOptions([P1, P2]), [['p1', 'p2']]);
});

test('groupPairs: defaults by join order; odd player out is unpaired', () => {
  const four = groupPairs(G(), 0, FOUR);
  assert.equal(four.pairs.length, 2);
  assert.equal(four.pairs[0].a.id, 'p1'); assert.equal(four.pairs[0].b.id, 'p2');
  assert.equal(four.pairs[1].a.id, 'p3'); assert.equal(four.pairs[1].b.id, 'p4');
  assert.equal(four.pairs[0].key, 'p1+p2');
  assert.deepEqual(four.unpaired, []);

  const three = groupPairs(G(), 0, [P1, P2, P3]);
  assert.equal(three.pairs.length, 1);
  assert.deepEqual(three.unpaired.map(p => p.id), ['p3']);

  const two = groupPairs(G(), 0, [P1, P2]);
  assert.equal(two.pairs.length, 1);
  assert.equal(groupPairs(G(), 0, [P1]).pairs.length, 0);
  assert.equal(groupPairs(G(), 0, []).pairs.length, 0);
});

test('groupPairs: a stored order is honoured, a stale one ignored', () => {
  const stored = groupPairs(G({ pairing: { 0: ['p1', 'p3', 'p2', 'p4'] } }), 0, FOUR);
  assert.equal(stored.pairs[0].key, 'p1+p3');
  assert.equal(stored.pairs[1].key, 'p2+p4');
  // RTDB may hand the order back as an object.
  const obj = groupPairs(G({ pairing: [{ 0: 'p1', 1: 'p4', 2: 'p2', 3: 'p3' }] }), 0, FOUR);
  assert.equal(obj.pairs[0].key, 'p1+p4');
  // A player left the group since: the pairing no longer names these ids.
  const stale = groupPairs(G({ pairing: { 0: ['p1', 'p3', 'p2', 'p9'] } }), 0, FOUR);
  assert.deepEqual(stale.order, ['p1', 'p2', 'p3', 'p4']);
  // A different group index is not this group's pairing.
  assert.deepEqual(groupOrder(G({ pairing: { 1: ['p1', 'p3', 'p2', 'p4'] } }), 0, FOUR), ['p1', 'p2', 'p3', 'p4']);
});

test('nextPairing cycles the three splits and wraps', () => {
  const g = G();
  const first = nextPairing(g, 0, FOUR);
  assert.deepEqual(first, ['p1', 'p3', 'p2', 'p4']);
  const second = nextPairing({ ...g, pairing: { 0: first } }, 0, FOUR);
  assert.deepEqual(second, ['p1', 'p4', 'p2', 'p3']);
  const third = nextPairing({ ...g, pairing: { 0: second } }, 0, FOUR);
  assert.deepEqual(third, ['p1', 'p2', 'p3', 'p4']);
});

// ---- allowance ----

test('pairAllowance: the difference off the low man, gross if one is missing', () => {
  const pair = { key: 'p1+p2', a: P1, b: P2 };
  assert.deepEqual(pairAllowance({ p1: 5, p2: 12 }, pair), { net: true, base: 5, a: 0, b: 7 });
  assert.deepEqual(pairAllowance({ p1: 12, p2: 5 }, pair), { net: true, base: 5, a: 7, b: 0 });
  assert.deepEqual(pairAllowance({ p1: 5 }, pair), { net: false, base: null, a: 0, b: 0 });
  assert.deepEqual(pairAllowance({ p1: 5, p2: null }, pair), { net: false, base: null, a: 0, b: 0 });
});

test('groupAllowance: everyone off the group minimum, gross unless all have one', () => {
  const all = groupAllowance({ p1: 4, p2: 10, p3: 16 }, [P1, P2, P3]);
  assert.equal(all.net, true);
  assert.equal(all.base, 4);
  assert.deepEqual(all.strokes, { p1: 0, p2: 6, p3: 12 });
  const missing = groupAllowance({ p1: 4, p2: 10 }, [P1, P2, P3]);
  assert.equal(missing.net, false);
  assert.deepEqual(missing.strokes, { p1: 0, p2: 0, p3: 0 });
});

test('strokes land on the lowest SI holes (Sky Resort card)', () => {
  const g = G();
  // Sky SI: 9→1, 12→2, 2→3, 15→4, 1→5, 16→6, 5→7 — seven holes at diff 7.
  const holes = [];
  for (let n = 1; n <= 18; n++) if (netStrokes(g, n, 5, 7) === 4) holes.push(n);
  assert.deepEqual(holes, [1, 2, 5, 9, 12, 15, 16]);
  assert.equal(allowanceTotal(g, 7), 7);
  assert.equal(allowanceTotal(g, 20), 20);
  assert.equal(allowanceTotal(g, 0), 0);
  // Same allocation as handicap.js's own allocator, hole by hole.
  for (let n = 1; n <= 18; n++) {
    assert.equal(5 - netStrokes(g, n, 5, 7), strokesReceived(7, [5, 3, 9, 11, 7, 15, 13, 17, 1, 18, 10, 2, 12, 16, 4, 6, 14, 8][n - 1]));
  }
});

test('nine-hole cards allocate against their own holes\' 18-hole SI', () => {
  const front = G({ holes: 'front9' });
  const fh = [];
  for (let n = 1; n <= 9; n++) if (netStrokes(front, n, 5, 5) === 4) fh.push(n);
  assert.deepEqual(fh, [1, 2, 9]);
  assert.equal(allowanceTotal(front, 5), 3);
  // Value9 plays physical 10..18: SI 2 is hole 12 (card 3), SI 4 is hole 15 (card 6).
  const back = G({ holes: 'back9' });
  const bh = [];
  for (let n = 1; n <= 9; n++) if (netStrokes(back, n, 5, 5) === 4) bh.push(n);
  assert.deepEqual(bh, [3, 6]);
});

test('a course without a card plays gross', () => {
  const g = G({ location: 'Somewhere Else' });
  assert.equal(netStrokes(g, 1, 5, 12), 5);
  assert.equal(allowanceTotal(g, 12), 0);
});

// ---- match play ----

test('match from strokes, gross: ten straight holes close out 10 & 8', () => {
  const g = withScores(G({ format: 'match' }), { p1: same(10, 4), p2: same(10, 5) });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const r = matchResult(g, pair, {}, null);
  assert.equal(r.status, '10 & 8');
  assert.equal(r.settled.finished, true);
  assert.equal(r.settled.winner, 'a');
  assert.equal(r.thru, 10);
  assert.equal(r.allowance.net, false);
  assert.equal(r.gapHole, null);
  assert.equal(r.source[1], 'derived');
});

test('match: all square through 18 is HALVED; a lead reads as N UP', () => {
  const g = withScores(G(), { p1: same(18, 4), p2: same(18, 4) });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  assert.equal(matchResult(g, pair, {}, null).status, 'HALVED');
  const lead = withScores(G(), { p1: card(4, 4, 5), p2: card(5, 4, 5) });
  const r = matchResult(lead, pair, {}, null);
  assert.equal(r.status, '1 UP');
  assert.equal(r.settled.leader, 'a');
  assert.equal(r.thru, 3);
});

test('match: a handicap stroke flips a hole to halved', () => {
  // Hole 9 is SI 1 on Sky: a 5 v 12 match gives B a stroke there.
  const g = withScores(G(), { p1: card(4, 4, 4, 4, 4, 4, 4, 4, 4), p2: card(4, 4, 4, 4, 4, 4, 4, 4, 5) });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const gross = matchHoles(g, pair, {}, null);
  assert.equal(gross.holes[9], 'a');
  const net = matchHoles(g, pair, { p1: 5, p2: 12 }, null);
  assert.equal(net.holes[9], HALVED);
  assert.equal(net.allowance.b, 7);
  // Hole 1 (SI 5) also carries a stroke: a gross halve becomes B's hole.
  assert.equal(gross.holes[1], HALVED);
  assert.equal(net.holes[1], 'b');
});

test('match: a missing hole stops the walk and is reported as the gap', () => {
  const g = withScores(G(), { p1: { 1: 4, 2: 4, 4: 4, 5: 4 }, p2: { 1: 5, 2: 5, 4: 5, 5: 5 } });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const r = matchResult(g, pair, {}, null);
  assert.equal(r.thru, 2);
  assert.equal(r.status, '2 UP');
  assert.equal(r.gapHole, 3);
  assert.equal(r.holes[4], 'a');   // derived, but past the gap for the engine
});

test('override beats the derived result and is marked as such', () => {
  const g = withScores(G(), { p1: card(4, 4), p2: card(5, 5) });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const r = matchResult(g, pair, {}, { 'p1+p2': { 1: 'h', 2: 'p2' } });
  assert.equal(r.holes[1], HALVED);
  assert.equal(r.holes[2], 'b');
  assert.equal(r.source[1], 'override');
  assert.equal(r.source[2], 'override');
  assert.equal(r.status, '1 UP');   // B leads after 2
  assert.equal(r.settled.leader, 'b');
});

test('a conceded hole with no strokes lets the match walk on', () => {
  const g = withScores(G(), { p1: { 1: 4, 2: 4, 4: 4 }, p2: { 1: 5, 2: 5, 4: 3 } });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const without = matchResult(g, pair, {}, null);
  assert.equal(without.thru, 2);
  assert.equal(without.gapHole, 3);
  const withOv = matchResult(g, pair, {}, { 'p1+p2': { 3: 'p2' } });
  assert.equal(withOv.thru, 4);
  assert.equal(withOv.holes[3], 'b');
  assert.equal(withOv.status, 'AS');
  assert.equal(withOv.gapHole, null);
});

test('overrides under another pair or naming a stranger are ignored', () => {
  const g = withScores(G(), { p1: card(4), p2: card(5) });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const other = matchResult(g, pair, {}, { 'p1+p3': { 1: 'h' } });
  assert.equal(other.holes[1], 'a');
  assert.equal(other.source[1], 'derived');
  const stranger = matchResult(g, pair, {}, { 'p1+p2': { 1: 'p9' } });
  assert.equal(stranger.holes[1], 'a');
  assert.equal(stranger.source[1], 'derived');
});

test('overrides survive a re-pair: keyed by the pair, not the slot', () => {
  const g = withScores(G({ pairing: { 0: ['p1', 'p3', 'p2', 'p4'] } }), { p1: card(4), p3: card(4) });
  const ov = { 'p1+p2': { 1: 'p2' }, 'p1+p3': { 1: 'h' } };
  const now = groupMatches(g, 0, FOUR, {}, ov);
  assert.equal(now.matches[0].pair.key, 'p1+p3');
  assert.equal(now.matches[0].holes[1], HALVED);
  const back = groupMatches({ ...g, pairing: null }, 0, FOUR, {}, ov);
  assert.equal(back.matches[0].pair.key, 'p1+p2');
  assert.equal(back.matches[0].holes[1], 'b');
});

test('groupMatches settles every pair and names the odd player out', () => {
  const g = withScores(G(), { p1: card(4), p2: card(5), p3: card(3) });
  const r = groupMatches(g, 0, [P1, P2, P3], {}, null);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].status, '1 UP');
  assert.deepEqual(r.unpaired.map(p => p.id), ['p3']);
});

test('match on a nine-hole card finishes at nine', () => {
  const g = withScores(G({ holes: 'front9' }), { p1: same(9, 4), p2: same(9, 4) });
  const pair = groupPairs(g, 0, FOUR).pairs[0];
  const r = matchResult(g, pair, {}, null);
  assert.equal(r.totalHoles, 9);
  assert.equal(r.settled.finished, true);
  assert.equal(r.status, 'HALVED');
});

// ---- skins ----

test('skins: the lowest takes the pot, ties carry, the walk stops at a missing hole', () => {
  const g = withScores(G({ format: 'skins' }), {
    p1: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 4, 6: 4 },
    p2: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 },
    p3: { 1: 5, 2: 5, 3: 4, 4: 6, 5: 4 }
  });
  const r = skinsResult(g, [P1, P2, P3], {});
  assert.equal(r.thru, 5);
  assert.deepEqual(r.totals, { p1: 1, p2: 3, p3: 0 });
  assert.equal(r.carry, 1);
  assert.equal(r.net, false);
  assert.deepEqual(r.perHole.map(h => [h.hole, h.winner, h.pot]),
    [[1, 'p1', 1], [2, null, 1], [3, null, 2], [4, 'p2', 3], [5, null, 1]]);
});

test('skins net off the low man: a stroke on SI 1 turns a win into a tie', () => {
  // Hole 9 is SI 1: at hcps 4/5/5 the two higher players receive exactly one
  // stroke each, and it lands there. Holes 1-8 are all-square either way.
  const scores = { p1: same(9, 4), p2: same(9, 4), p3: same(9, 4) };
  scores.p2[9] = 5; scores.p3[9] = 6;
  const g = withScores(G(), scores);
  const gross = skinsResult(g, [P1, P2, P3], {});
  assert.equal(gross.perHole[8].winner, 'p1');
  assert.equal(gross.perHole[8].pot, 9);          // eight carried ties + this hole
  assert.deepEqual(gross.totals, { p1: 9, p2: 0, p3: 0 });
  assert.equal(gross.carry, 0);
  const net = skinsResult(g, [P1, P2, P3], { p1: 4, p2: 5, p3: 5 });
  assert.equal(net.net, true);
  assert.equal(net.base, 4);
  assert.equal(net.perHole[8].winner, null);      // p1 4, p2 4, p3 5 → tie
  assert.deepEqual(net.totals, { p1: 0, p2: 0, p3: 0 });
  assert.equal(net.carry, 9);                     // the whole pot is still unclaimed
  const partial = skinsResult(g, [P1, P2, P3], { p1: 4, p2: 10 });
  assert.equal(partial.net, false);
});

test('skins: nine-hole cards stop at nine; fewer than two players is nothing', () => {
  const g = withScores(G({ holes: 'front9' }), { p1: same(18, 4), p2: same(18, 5) });
  const r = skinsResult(g, [P1, P2], {});
  assert.equal(r.thru, 9);
  assert.equal(r.totals.p1, 9);
  assert.equal(skinsResult(g, [P1], {}), null);
  assert.equal(skinsResult(g, [], {}), null);
});

// ---- stableford ----

// Sky Resort's card: four par 3s, ten par 4s, four par 5s.
const SKY_PARS = { 1: 5, 2: 4, 3: 4, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 4, 10: 4, 11: 4, 12: 5, 13: 3, 14: 4, 15: 4, 16: 4, 17: 3, 18: 5 };
const levelPar = () => ({ ...SKY_PARS });

test('stableford: a level-par round is 36 points gross', () => {
  const g = withScores(G({ format: 'stableford' }), { p1: levelPar(), p2: levelPar() });
  const r = stablefordResult(g, [P1, P2], {});
  assert.equal(r.parsKnown, true);
  assert.equal(r.net, false);
  assert.equal(r.perPlayer.p1.points, 36);
  assert.equal(r.perPlayer.p1.thru, 18);
  assert.equal(r.perPlayer.p1.given, 0);
  // All 4s: birdie on every par 3, par on every par 4, bogey on every par 5.
  const flat = withScores(G(), { p1: same(18, 4) });
  const r2 = stablefordResult(flat, [P1], {});
  assert.equal(r2.perPlayer.p1.points, 4 * 3 + 10 * 2 + 4 * 1);
});

test('stableford: each player takes their OWN full handicap by stroke index', () => {
  const g = withScores(G(), { p1: levelPar(), p2: levelPar(), p3: levelPar() });
  const r = stablefordResult(g, [P1, P2, P3], { p1: 10, p2: null, p3: 4 });
  // Unlike match play and skins, one missing handicap only makes THAT player
  // gross — everyone else keeps their allowance.
  assert.equal(r.perPlayer.p1.points, 46);
  assert.equal(r.perPlayer.p2.points, 36);
  assert.equal(r.perPlayer.p3.points, 40);
  assert.equal(r.perPlayer.p1.given, 10);
  assert.equal(r.perPlayer.p2.given, 0);
  assert.equal(r.net, true);
  assert.deepEqual(r.order, ['p1', 'p3', 'p2']);
});

test('stableford: a blow-up hole costs the two points and no more', () => {
  const card = levelPar();
  card[1] = 15;                       // par 5, so this is a +10
  const g = withScores(G(), { p1: card });
  assert.equal(stablefordResult(g, [P1], {}).perPlayer.p1.points, 34);
  assert.equal(stablefordResult(g, [P1], {}).perPlayer.p1.perHole[0].points, 0);
});

test('stableford: a hole nobody finished scores nothing and stops nothing', () => {
  // Skins stops its walk at the first missing hole; Stableford does not — a
  // player who picks up simply scores no points there.
  const card = levelPar();
  delete card[3];
  const g = withScores(G(), { p1: card });
  const r = stablefordResult(g, [P1], {});
  assert.equal(r.perPlayer.p1.thru, 17);
  assert.equal(r.perPlayer.p1.points, 34);
  assert.equal(r.perPlayer.p1.perHole[2].points, null);
  assert.equal(r.perPlayer.p1.perHole[3].points, 2);   // hole 4 still counts
});

test('stableford: thru is per player, not per group', () => {
  const g = withScores(G(), { p1: levelPar(), p2: { 1: 5, 2: 4 } });
  const r = stablefordResult(g, [P1, P2], {});
  assert.equal(r.perPlayer.p1.thru, 18);
  assert.equal(r.perPlayer.p2.thru, 2);
  assert.equal(r.thru, 18);
});

test('stableford: a nine allocates against the holes it actually plays', () => {
  // Value9 plays physical holes 10-18: SI 2 is hole 12 (card 3), SI 4 is 15 (card 6).
  const back = withScores(G({ holes: 'back9' }), { p1: same(9, 4) });
  const r = stablefordResult(back, [P1], { p1: 5 });
  assert.equal(r.perPlayer.p1.given, 2);
  assert.deepEqual(r.perPlayer.p1.perHole.filter(h => h.given).map(h => h.hole), [3, 6]);
  assert.equal(r.perPlayer.p1.perHole.length, 9);
  // Front nine: SI 5, 3, 1 are card holes 1, 2, 9.
  const front = withScores(G({ holes: 'front9' }), { p1: same(9, 4) });
  const f = stablefordResult(front, [P1], { p1: 5 });
  assert.deepEqual(f.perPlayer.p1.perHole.filter(h => h.given).map(h => h.hole), [1, 2, 9]);
});

test('stableford: a course with no card cannot be scored in points', () => {
  const g = withScores(G({ location: 'Somewhere Else' }), { p1: same(18, 4) });
  const r = stablefordResult(g, [P1], { p1: 10 });
  assert.equal(r.parsKnown, false);
  assert.equal(r.perPlayer.p1.points, 0);
  assert.equal(r.perPlayer.p1.perHole[0].points, null);
});

test('stableford: order is points first, then who has played more', () => {
  const g = withScores(G(), { p1: { 1: 5, 2: 4 }, p2: { 1: 5 }, p3: levelPar() });
  const r = stablefordResult(g, [P1, P2, P3], {});
  assert.deepEqual(r.order, ['p3', 'p1', 'p2']);   // 36 · 4 (thru 2) · 2 (thru 1)
  assert.equal(stablefordResult(g, [], {}), null);
});

// ---- team formats: scramble, fourball, foursome ----

const TA = pairKey('p1', 'p2');            // team A's id, in join order
const TB = pairKey('p3', 'p4');            // team B's
const TKEY = pairKey(TA, TB);              // the contest's override key
const P5 = P('p5', 'Ганаа'), P6 = P('p6', 'Оюу');
const P7 = P('p7', 'Ням'), P8 = P('p8', 'Цэрэн');

// The one contest a four-player group plays, settled.
const teamMatch = (game, players, hcps, overrides) =>
  groupTeamMatches(game, 0, players, hcps, overrides).matches[0];

test('groupTeams: consecutive pairs of the playing order', () => {
  const info = groupTeams(G(), 0, FOUR);
  assert.deepEqual(info.teams.map(t => t.id), [TA, TB]);
  assert.deepEqual(info.teams.map(t => t.players.map(p => p.id)), [['p1', 'p2'], ['p3', 'p4']]);
  assert.deepEqual(info.unpaired, []);
  assert.equal(teamContests(G(), 0, FOUR).contests[0].key, TKEY);
});

test('groupTeams follows the same pairing the ⇄ writes', () => {
  const g = G({ pairing: { 0: ['p1', 'p3', 'p2', 'p4'] } });
  assert.deepEqual(groupTeams(g, 0, FOUR).teams.map(t => t.players.map(p => p.id)),
    [['p1', 'p3'], ['p2', 'p4']]);
  assert.equal(teamContests(g, 0, FOUR).contests[0].key,
    pairKey(pairKey('p1', 'p3'), pairKey('p2', 'p4')));
  // A stored order naming somebody who is no longer here is ignored, exactly
  // as it is for singles — the group falls back to join order.
  const stale = G({ pairing: { 0: ['p1', 'p9', 'p2', 'p4'] } });
  assert.deepEqual(groupTeams(stale, 0, FOUR).teams.map(t => t.id), [TA, TB]);
});

test('teamContests: teams are pairs of players, contests are pairs of teams', () => {
  const at = (players) => {
    const c = teamContests(G(), 0, players);
    return [c.teams.length, c.contests.length, c.spareTeams.length, c.unpaired.length];
  };
  assert.deepEqual(at([P1]), [0, 0, 0, 1]);
  assert.deepEqual(at([P1, P2]), [1, 0, 1, 0]);              // a team, no opponent
  assert.deepEqual(at([P1, P2, P3]), [1, 0, 1, 1]);
  assert.deepEqual(at(FOUR), [2, 1, 0, 0]);                  // the normal case
  assert.deepEqual(at([...FOUR, P5]), [2, 1, 0, 1]);
  assert.deepEqual(at([...FOUR, P5, P6]), [3, 1, 1, 0]);
  assert.deepEqual(at([...FOUR, P5, P6, P7, P8]), [4, 2, 0, 0]);
  assert.deepEqual(teamContests(G(), 0, [...FOUR, P5, P6, P7, P8]).contests.map(c => c.key),
    [TKEY, pairKey(pairKey('p5', 'p6'), pairKey('p7', 'p8'))]);
});

test('a team plays off the average of its two handicaps', () => {
  const [tA] = groupTeams(G(), 0, FOUR).teams;
  assert.equal(teamHcp({ p1: 12, p2: 8 }, tA), 10);
  assert.equal(teamHcp({ p1: 12, p2: 7 }, tA), 9.5);
  assert.equal(teamHcp({ p1: 0, p2: 0 }, tA), 0);
  // One partner without a handicap leaves the team without one.
  assert.equal(teamHcp({ p1: 10 }, tA), null);
  assert.equal(teamHcp({}, tA), null);
  assert.equal(teamHcp({}, null), null);
});

test('the higher team receives the difference, rounded, off the lower', () => {
  const [c] = teamContests(G(), 0, FOUR).contests;
  assert.deepEqual(teamAllowance({ p1: 12, p2: 8, p3: 6, p4: 4 }, c),
    { net: true, base: 5, hcpA: 10, hcpB: 5, a: 5, b: 0 });
  // Half a stroke is not half a stroke on a card: 9.5 against 5 rounds UP to
  // the team receiving it, the way courseHandicap already rounds.
  assert.equal(teamAllowance({ p1: 12, p2: 7, p3: 6, p4: 4 }, c).a, 5);
  // The same teams the other way round.
  assert.deepEqual(teamAllowance({ p1: 6, p2: 4, p3: 12, p4: 8 }, c),
    { net: true, base: 5, hcpA: 5, hcpB: 10, a: 0, b: 5 });
  // Level teams play level, even out of very unlevel players.
  assert.equal(teamAllowance({ p1: 4, p2: 12, p3: 8, p4: 8 }, c).a, 0);
  // One missing handicap of the four makes the whole contest gross.
  assert.deepEqual(teamAllowance({ p1: 10, p2: 13, p3: 6 }, c),
    { net: false, base: null, hcpA: 11.5, hcpB: null, a: 0, b: 0 });
});

test('teamStrokesOf ignores cleared and junk holes the way RTDB drops them', () => {
  const g = withTeamScores(G(), { [TA]: { 1: 4, 2: 0, 3: null, 4: 'x' } });
  assert.equal(teamStrokesOf(g, TA, 1), 4);
  assert.equal(teamStrokesOf(g, TA, 2), null);
  assert.equal(teamStrokesOf(g, TA, 3), null);
  assert.equal(teamStrokesOf(g, TA, 4), null);
  assert.equal(teamStrokesOf(g, 'nobody', 1), null);
  assert.equal(teamStrokesOf({}, TA, 1), null);
});

test('scramble: the team ball decides the hole, off the team allowance', () => {
  // Both teams play every hole in par, so gross the match is all square. Team A
  // averages 11.5 against 8, so it is owed four strokes and wins exactly the
  // four lowest-SI holes.
  const g = withTeamScores(G({ format: 'scramble' }), { [TA]: levelPar(), [TB]: levelPar() });
  const m = teamMatch(g, FOUR, { p1: 10, p2: 13, p3: 6, p4: 10 }, null);
  assert.equal(m.allowance.a, 4);
  assert.equal(m.allowance.b, 0);
  const won = Object.entries(m.holes).filter(([, v]) => v === 'a').map(([h]) => Number(h));
  assert.deepEqual(won, [2, 9, 12, 15]);          // Sky's SI 1-4
  assert.ok(Object.entries(m.holes).every(([h, v]) => won.includes(Number(h)) || v === HALVED));
  // Four up with three to play closes the match out on the 15th.
  assert.equal(m.status, '4 & 3');
  assert.equal(m.settled.winner, 'a');
  assert.equal(m.thru, 15);
});

test('scramble: the team line reads the one ball they played', () => {
  const g = withTeamScores(G({ format: 'scramble' }), {
    [TA]: { ...levelPar(), 1: 4 },               // a birdie on the par-5 first
    [TB]: levelPar()
  });
  const m = teamMatch(g, FOUR, {}, null);
  assert.deepEqual(m.lines.a, { total: 71, thru: 18, toPar: -1, given: 0, net: 71, netToPar: -1 });
  assert.deepEqual(m.lines.b, { total: 72, thru: 18, toPar: 0, given: 0, net: 72, netToPar: 0 });
  // The allowance comes off the net reading, not off the strokes.
  assert.deepEqual(teamBallLine(g, TA, 7), { total: 71, thru: 18, toPar: -1, given: 7, net: 64, netToPar: -8 });
  // A partial round is honest, and a team that has played nothing has no line.
  assert.deepEqual(teamBallLine(withTeamScores(G(), { [TA]: { 1: 4, 2: 4 } }), TA),
    { total: 8, thru: 2, toPar: -1, given: 0, net: 8, netToPar: -1 });
  assert.deepEqual(teamBallLine(G(), TA), { total: 0, thru: 0, toPar: null, given: 0, net: null, netToPar: null });
  // Fourball's numbers are the players' own cards, so it carries no team line.
  assert.equal(teamMatch(withScores(G({ format: 'fourball' }), { p1: { 1: 4 } }), FOUR, {}, null).lines, null);
});

test('foursome walks the same one-ball path as scramble', () => {
  const g = withTeamScores(G({ format: 'foursome' }), { [TA]: same(18, 4), [TB]: same(18, 5) });
  const m = teamMatch(g, FOUR, {}, null);
  assert.ok(isOneBallFormat(g));
  assert.equal(m.settled.winner, 'a');
  assert.equal(m.allowance.net, false);          // no handicaps → gross
});

test('a nine-hole team card allocates against the holes actually played', () => {
  // Value9 is the back nine, so card hole n is physical hole n + 9.
  const g = withTeamScores(G({ format: 'scramble', holes: 'back9' }),
    { [TA]: same(9, 4), [TB]: same(9, 4) });
  const m = teamMatch(g, FOUR, { p1: 8, p2: 10, p3: 4, p4: 4 }, null);
  assert.equal(m.allowance.a, 5);                // averages 9 and 4
  // The v1 rule: the FULL difference is allocated against the 18-hole stroke
  // index of the nine holes played, so only the strokes that land count —
  // physical 12 (SI 2) and 15 (SI 4), which are card holes 3 and 6.
  const won = Object.entries(m.holes).filter(([, v]) => v === 'a').map(([h]) => Number(h));
  assert.deepEqual(won, [3, 6]);
  assert.equal(allowanceTotal(g, 5), 2);
  assert.equal(m.totalHoles, 9);
});

test('fourball: the allowance is off the lowest of the four in the contest', () => {
  const g = withScores(G({ format: 'fourball' }),
    { p1: levelPar(), p2: levelPar(), p3: levelPar(), p4: levelPar() });
  const m = teamMatch(g, FOUR, { p1: 4, p2: 8, p3: 4, p4: 4 }, null);
  assert.equal(m.allowance.base, 4);
  assert.deepEqual(m.allowance.strokes, { p1: 0, p2: 4, p3: 0, p4: 0 });
  // Everyone is level par gross, so team A wins exactly the holes p2's four
  // strokes fall on — Sky's SI 1-4 again.
  const won = Object.entries(m.holes).filter(([, v]) => v === 'a').map(([h]) => Number(h));
  assert.deepEqual(won, [2, 9, 12, 15]);
  // One missing handicap of the four makes the whole fourball gross.
  assert.equal(teamMatch(g, FOUR, { p1: 4, p2: 8, p3: 4 }, null).allowance.net, false);
});

test('fourball: a side plays its best net ball, and one ball is enough', () => {
  const g = withScores(G({ format: 'fourball' }), {
    p1: { 1: 6, 2: 4, 3: 5 }, p2: { 1: 4, 2: 6 },      // A: 4, 4, then only p1's 5
    p3: { 1: 5, 2: 5, 3: 4 }, p4: { 1: 5, 2: 5, 3: 6 } // B: 5, 5, 4
  });
  const m = teamMatch(g, FOUR, {}, null);
  assert.equal(m.holes[1], 'a');                 // 4 beats 5
  assert.equal(m.holes[2], 'a');                 // p1's 4 beats both of B's 5s
  // p2 picked up on the third: A still has p1's ball, and B's 4 takes the hole.
  assert.equal(m.holes[3], 'b');
  assert.equal(m.thru, 3);
});

test('fourball: a side with neither ball in has not finished the hole', () => {
  const g = withScores(G({ format: 'fourball' }), {
    p1: { 1: 4 }, p2: { 1: 4 }, p3: { 1: 5, 2: 5 }, p4: { 1: 5, 2: 5 }
  });
  const m = teamMatch(g, FOUR, {}, null);
  assert.equal(m.holes[1], 'a');
  assert.equal(m.holes[2], undefined);
  assert.equal(m.thru, 1);
});

test('a team hole can be conceded by hand, with no strokes at all', () => {
  const g = withTeamScores(G({ format: 'scramble' }), { [TA]: { 1: 4 }, [TB]: { 1: 5 } });
  const m = teamMatch(g, FOUR, {}, { [TKEY]: { 2: TB, 3: HALVED } });
  assert.equal(m.holes[1], 'a');
  assert.equal(m.holes[2], 'b');
  assert.equal(m.holes[3], HALVED);
  assert.equal(m.source[1], 'derived');
  assert.equal(m.source[2], 'override');
  // The walk carries past holes nobody entered, as a singles match does.
  assert.equal(m.thru, 3);
  assert.equal(m.settled.leader, null);          // one each and a half
  // A gap the walk is waiting on is named, and a concession fills it.
  const gap = teamMatch(withTeamScores(G({ format: 'scramble' }),
    { [TA]: { 1: 4, 3: 4 }, [TB]: { 1: 5, 3: 5 } }), FOUR, {}, null);
  assert.equal(gap.thru, 1);
  assert.equal(gap.gapHole, 2);
});

test('cycling the pairing is lossless for team balls and hand-set holes', () => {
  const base = withTeamScores(G({ format: 'scramble' }), { [TA]: { 1: 4 }, [TB]: { 1: 5 } });
  const overrides = { [TKEY]: { 2: TA } };
  const before = teamMatch(base, FOUR, {}, overrides);
  assert.equal(before.thru, 2);

  // Swap to p1+p3 against p2+p4 — teams that have played nothing …
  const swapped = { ...base, pairing: { 0: nextPairing(base, 0, FOUR) } };
  const mid = teamMatch(swapped, FOUR, {}, overrides);
  assert.notEqual(mid.pair.key, before.pair.key);
  assert.deepEqual(mid.holes, {});

  // … and back again: the same teams read exactly what they read before.
  const back = { ...base, pairing: { 0: ['p1', 'p2', 'p3', 'p4'] } };
  assert.deepEqual(teamMatch(back, FOUR, {}, overrides).holes, before.holes);
  assert.equal(teamStrokesOf(back, TA, 1), 4);
});

test('a group that cannot field two teams has no contest, not an empty one', () => {
  const g = withTeamScores(G({ format: 'foursome' }), { [TA]: { 1: 4 } });
  const r = groupTeamMatches(g, 0, [P1, P2, P3], {}, null);
  assert.deepEqual(r.matches, []);
  assert.deepEqual(r.spareTeams.map(t => t.id), [TA]);
  assert.deepEqual(r.unpaired.map(p => p.id), ['p3']);
  // Nothing entered is lost — the one team's ball still reads.
  assert.deepEqual(teamBallLine(g, TA).toPar, -1);
});

test('gameHasAnyScore sees a team ball as well as a player card', () => {
  assert.equal(gameHasAnyScore(G()), false);
  assert.equal(gameHasAnyScore(withScores(G(), { p1: { 1: 4 } })), true);
  assert.equal(gameHasAnyScore(withTeamScores(G(), { [TA]: { 1: 4 } })), true);
  // A hole cleared back to nothing is not a score.
  assert.equal(gameHasAnyScore(withTeamScores(G(), { [TA]: { 1: 0 } })), false);
  assert.equal(gameHasAnyScore(withScores(G(), { p1: {} })), false);
  assert.equal(gameHasAnyScore(null), false);
});

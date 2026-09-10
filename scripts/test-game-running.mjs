// scripts/test-game-running.mjs
// The figure beside a name on the casual scoring screen: the net reading
// (strokes − pars − handicap) when a handicap applies, gross to-par without
// one, the stroke total when the course card is unknown.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { runningScore, gameScoreLine } = await import('../src/game-score.js');
const { teamBallLine, pairKey } = await import('../src/game-formats.js');
const { holePar } = await import('../src/courses.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const RED = 'var(--red)', MUTED = 'var(--text-secondary)', INK = 'var(--text-primary)';
const P = (id, name) => ({ id, name, joinedAt: 1 });
const FOUR = [P('p1', 'Бат'), P('p2', 'Дорж'), P('p3', 'Сараа'), P('p4', 'Тулга')];
const G = (extra = {}) => ({
  id: 'g1', location: 'Sky Resort Golf Club', holes: 'full18',
  groups: [FOUR], scores: {}, ...extra
});
// A card as deltas against the course par: rel({ 1: +1, 2: 0 }) → bogey, par.
const rel = (game, deltas) =>
  Object.fromEntries(Object.entries(deltas).map(([h, d]) => [h, holePar(game, Number(h)) + d]));
const withCard = (game, pid, holes) => ({ ...game, scores: { ...game.scores, [pid]: { holes } } });

// The screenshot that prompted this: Competition 9/9, HCP 14 (7/7), twelve
// holes in at gross +8 — F +4, B +4.
const comp = G({ scoreMode: 'comp' });
const twelve = rel(comp, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 1, 11: 1, 12: 2 });

test('with a handicap the figure is the net reading — the club rule', () => {
  const line = gameScoreLine(withCard(comp, 'p1', twelve), 'p1', 14);
  assert.equal(line.toPar, 8);
  assert.deepEqual([line.netF, line.netB, line.netToPar], [-3, -3, -6]);
  assert.deepEqual(runningScore(line, true), { text: '−6', label: 'Net', color: RED });
});

test('through the front nine only, the front half of the handicap is in play', () => {
  const five = rel(comp, { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0 });
  const line = gameScoreLine(withCard(comp, 'p1', five), 'p1', 14);
  assert.equal(line.netToPar, 2 - 7);
  assert.deepEqual(runningScore(line, true), { text: '−5', label: 'Net', color: RED });
});

test('normal mode: an HCP 12 player opening with a par stands at −12', () => {
  const g = withCard(G(), 'p1', rel(G(), { 1: 0 }));
  assert.deepEqual(runningScore(gameScoreLine(g, 'p1', 12), true), { text: '−12', label: 'Net', color: RED });
  // Net over par reads in plain ink, net level muted.
  const g2 = withCard(G(), 'p1', rel(G(), { 1: 1, 2: 1, 3: 1 }));
  assert.deepEqual(runningScore(gameScoreLine(g2, 'p1', 2), true), { text: '+1', label: 'Net', color: INK });
  assert.deepEqual(runningScore(gameScoreLine(g2, 'p1', 3), true), { text: 'E', label: 'Net', color: MUTED });
});

test('without a handicap the figure is gross to-par, no cue', () => {
  const g = withCard(comp, 'p1', twelve);
  assert.deepEqual(runningScore(gameScoreLine(g, 'p1', null), false), { text: '+8', label: '', color: INK });
  const level = withCard(G(), 'p1', rel(G(), { 1: 0, 2: 0 }));
  assert.deepEqual(runningScore(gameScoreLine(level, 'p1', undefined), false), { text: 'E', label: '', color: MUTED });
  const under = withCard(G(), 'p1', rel(G(), { 1: -1 }));
  assert.deepEqual(runningScore(gameScoreLine(under, 'p1', null), false), { text: '−1', label: '', color: RED });
});

test('a handicap of zero is still a handicap: net, with the cue', () => {
  const g = withCard(G(), 'p1', rel(G(), { 1: 1 }));
  assert.deepEqual(runningScore(gameScoreLine(g, 'p1', 0), true), { text: '+1', label: 'Net', color: INK });
});

test('no course card: the stroke total, handicap or not', () => {
  const g = { ...G({ location: 'Somewhere new' }), scores: { p1: { holes: { 1: 5, 2: 4, 3: 6 } } } };
  const line = gameScoreLine(g, 'p1', 10);
  assert.equal(line.toPar, null);
  assert.equal(line.netToPar, null);
  assert.deepEqual(runningScore(line, true), { text: '15', label: '', color: INK });
  assert.deepEqual(runningScore(gameScoreLine(g, 'p1', null), false), { text: '15', label: '', color: INK });
});

test('nothing entered: no figure', () => {
  assert.deepEqual(runningScore(gameScoreLine(G(), 'p1', 14), true), { text: '', label: '', color: MUTED });
  assert.deepEqual(runningScore(null, true), { text: '', label: '', color: MUTED });
});

test('a scramble team: net with an allowance, gross without one', () => {
  const TA = pairKey('p1', 'p2');
  const par18 = rel(G(), Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 0])));
  const g = { ...G({ format: 'scramble' }), teamScores: { [TA]: { holes: { ...par18, 1: par18[1] - 1 } } } };
  const given = teamBallLine(g, TA, 7);
  assert.deepEqual([given.toPar, given.given, given.netToPar], [-1, 7, -8]);
  assert.deepEqual(runningScore(given, given.given > 0), { text: '−8', label: 'Net', color: RED });
  const none = teamBallLine(g, TA, 0);
  assert.deepEqual(runningScore(none, none.given > 0), { text: '−1', label: '', color: RED });
});

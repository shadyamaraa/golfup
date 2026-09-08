// scripts/test-game-share.mjs
// A casual game's result as the share kit draws it: the board a stroke play,
// Stableford or skins game yields, the matches a match play or 2 v 2 game
// yields, and the text the Viber groups get. Pure model; the drawing is not
// under test here.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }
};

const { gameResultModel, gameResultText } = await import('../src/game-share.js');
const { teamContests } = await import('../src/game-formats.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const P = (id, name) => ({ id, name, joinedAt: 1 });
const P1 = P('p1', 'Бат'), P2 = P('p2', 'Дорж'), P3 = P('p3', 'Сараа'), P4 = P('p4', 'Тулга');
const FOUR = [P1, P2, P3, P4];
const USERS = { p1: { username: 'bat', firstName: 'Бат' }, p2: { username: 'dorj', firstName: 'Дорж' } };

const same = (n, s) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, s]));
const card = (...strokes) => Object.fromEntries(strokes.map((s, i) => [i + 1, s]));
const G = (extra = {}) => ({
  id: 'g1', location: 'Sky Resort Golf Club', holes: 'full18', date: '2026-09-08', time: '08:00',
  groups: [FOUR], scores: {}, ...extra
});
const withScores = (game, scores) => ({
  ...game, scores: Object.fromEntries(Object.entries(scores).map(([pid, holes]) => [pid, { holes }]))
});

test('stroke play: a board ranked on net to par when everybody has a handicap', () => {
  // Sky's par is 72; a card of all 4s is 72 gross → E; hcps 10 and 5 net −10 and −5.
  const game = withScores(G({ hcp: { p1: 10, p2: 5, p3: 0, p4: 0 } }), {
    p1: same(18, 4), p2: same(18, 4), p3: same(18, 4), p4: same(9, 4)
  });
  const m = gameResultModel(game, { users: USERS, state: 'final' });
  assert.equal(m.kind, 'stroke');
  assert.equal(m.points, false);
  assert.equal(m.hasHcp, true);
  assert.equal(m.par, 72);
  const b = m.boards[0];
  assert.deepEqual(b.entries.map(e => [e.posLabel, e.name, e.total, e.gross, e.thru]), [
    ['1', 'bat', -10, 72, 18],
    ['2', 'dorj', -5, 72, 18],
    // Both stand at net E — a tie on the figure the board ranks on.
    ['T3', 'Сараа', 0, 72, 18],
    ['T3', 'Тулга', 0, 36, 9]
  ]);
  assert.deepEqual(b.leaders.map(e => e.name), ['bat']);
  assert.equal(m.segments.length, 0);
});

test('stroke play without handicaps ranks gross to par, ties read T', () => {
  const game = withScores(G(), { p1: same(18, 4), p2: same(18, 4), p3: card(...Array(17).fill(4), 5) });
  const m = gameResultModel(game, { users: USERS });
  assert.equal(m.hasHcp, false);
  assert.deepEqual(m.boards[0].entries.map(e => [e.posLabel, e.total]), [['T1', 0], ['T1', 0], ['3', 1]]);
  assert.equal(m.boards[0].leaders.length, 2);
});

test('competition mode names the leader of each nine', () => {
  const back = (s) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 10, s]));
  const game = withScores(G({ scoreMode: 'comp', hcp: { p1: 10, p2: 6 } }), {
    // p1 pars the front (net −5 off 5), bogeys the back (net +4 off 5): 18 net −1.
    p1: { ...same(9, 4), ...back(5) },
    // p2 bogeys the front (net +6 off 3), pars the back (net −3 off 3): 18 net +3.
    p2: { ...same(9, 5), ...back(4) }
  });
  const m = gameResultModel(game, { users: USERS });
  assert.equal(m.comp, true);
  assert.deepEqual(m.segments, [
    { label: 'F9', leaders: ['bat'], score: -5 },
    { label: 'B9', leaders: ['dorj'], score: -3 }
  ]);
  assert.deepEqual(m.boards[0].entries.map(e => [e.name, e.total]), [['bat', -1], ['dorj', 3]]);
});

test('stableford: one board across the groups, points, highest first', () => {
  const game = withScores(G({ format: 'stableford', groups: [[P1, P2], [P3, P4]] }), {
    p1: same(18, 4), p2: same(18, 5), p3: same(18, 3), p4: same(18, 4)
  });
  const m = gameResultModel(game, { users: USERS });
  assert.equal(m.points, true);
  assert.equal(m.boards.length, 1);
  // Par is 2 a hole: 36 for all pars, 54 for birdies, 18 for bogeys.
  assert.deepEqual(m.boards[0].entries.map(e => [e.posLabel, e.name, e.total, e.gross]), [
    ['1', 'Сараа', 54, 54], ['T2', 'bat', 36, 72], ['T2', 'Тулга', 36, 72], ['4', 'dorj', 18, 90]
  ]);
});

test('skins: a board per group with the carry noted', () => {
  const game = withScores(G({ format: 'skins', groups: [[P1, P2], [P3, P4]] }), {
    // Group 1: p1 takes hole 1, holes 2–3 halve and carry (2 skins riding at hole 3).
    p1: card(3, 4, 4), p2: card(4, 4, 4),
    // Group 2: p4 wins both of the first two holes.
    p3: card(5, 5), p4: card(4, 4)
  });
  const m = gameResultModel(game, { users: USERS });
  assert.equal(m.boards.length, 2);
  assert.deepEqual(m.boards.map(b => b.division), [1, 2]);
  assert.deepEqual(m.boards[0].entries.map(e => [e.posLabel, e.name, e.total, e.thru]), [['1', 'bat', 1, 3], ['2', 'dorj', 0, 3]]);
  assert.deepEqual(m.boards[0].carry, { skins: 2, unclaimed: false });
  assert.deepEqual(m.boards[1].entries.map(e => [e.name, e.total]), [['Тулга', 2], ['Сараа', 0]]);
  assert.equal(m.boards[1].carry, null);
});

test('match play: the group\'s matches with the winner, a live one', () => {
  const game = withScores(G({ format: 'match' }), {
    p1: same(18, 4), p2: same(18, 5),          // p1 closes it out early
    p3: same(6, 4), p4: card(4, 4, 4, 4, 4, 3)  // live, p4 1 UP thru 6
  });
  const m = gameResultModel(game, { users: USERS });
  assert.equal(m.kind, 'matches');
  assert.equal(m.groups.length, 1);
  assert.equal(m.groups[0].label, null);
  const rows = m.groups[0].matches;
  assert.equal(rows.length, 2);
  const done = rows.find(r => r.finished);
  const live = rows.find(r => !r.finished);
  assert.ok(done && live);
  assert.equal(done.winner, 'a');
  assert.match(done.result, /&/);
  assert.equal(done.halved, false);
  assert.equal(live.thru, 6);
  assert.equal(live.result, '1 UP');
  assert.equal(live.winner, null);
  assert.ok(live.leader === 'a' || live.leader === 'b');
  assert.equal(m.played, 2);
});

test('match play: a match halved over the full round reads as halved', () => {
  const game = withScores(G({ format: 'match', groups: [[P1, P2]] }), { p1: same(18, 4), p2: same(18, 4) });
  const m = gameResultModel(game, { users: USERS, state: 'final' });
  const r = m.groups[0].matches[0];
  assert.equal(r.finished, true);
  assert.equal(r.halved, true);
  assert.equal(r.winner, null);
});

test('a scramble names each side by its two players and carries the ball', () => {
  const game = { ...G({ format: 'scramble' }), teamScores: {} };
  // The engine keys team balls by the pair key; ask it which teams it made.
  const { contests } = teamContests(game, 0, FOUR);
  assert.equal(contests.length, 1);
  game.teamScores = { [contests[0].a.id]: { holes: same(18, 4) }, [contests[0].b.id]: { holes: same(18, 5) } };
  const m = gameResultModel(game, { users: USERS, state: 'final' });
  assert.equal(m.kind, 'matches');
  const r = m.groups[0].matches[0];
  assert.match(r.a, / \+ /);
  assert.match(r.b, / \+ /);
  assert.ok(r.lines?.a && r.lines?.b, 'the one-ball format carries each side\'s ball');
  assert.equal(r.lines.a.total, 72);
  assert.equal(r.finished, true);
  assert.equal(r.winner, 'a');
});

test('the result as text: positions, scores, handicaps, thru; matches with the winner marked', () => {
  const game = withScores(G({ hcp: { p1: 10, p2: 5 }, groups: [[P1, P2]] }), { p1: same(18, 4), p2: same(9, 4) });
  const m = gameResultModel(game, { users: USERS, state: 'live' });
  const text = gameResultText(m, { thru: 'Thru', final: 'F' });
  assert.deepEqual(text.split('\n'), ['1. bat −10 (72) · HCP 10 · F', '2. dorj −5 (36) · HCP 5 · Thru 9']);

  const mp = gameResultModel(withScores(G({ format: 'match', groups: [[P1, P2]] }), { p1: same(18, 4), p2: same(18, 5) }), { users: USERS });
  const mt = gameResultText(mp, { tied: 'HALVED' });
  assert.match(mt, /^🏆 Бат  \d+ & \d+  Дорж$/);
});

test('an unscored game yields an empty board, and the state passes through', () => {
  const m = gameResultModel(G(), { users: USERS, state: 'final' });
  assert.equal(m.kind, 'stroke');
  assert.deepEqual(m.boards, []);
  assert.equal(m.state, 'final');
  assert.equal(m.players, 4);
  assert.equal(m.formatKey, 'fmtStroke');
});

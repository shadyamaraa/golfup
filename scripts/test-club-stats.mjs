// scripts/test-club-stats.mjs
// The club's public numbers: a season in figures, the champions wall and the
// casual-game activity, from hand-made tournaments and games. Pure model —
// what the landing and the statistics page lay out. Run with: npm run test:mp

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { seasonStats, championsWall, casualActivity, seasonYears, defaultSeasonYear, tnYear, tnState } =
  await import('../src/club-stats.js');
const { SP_HOLES } = await import('../src/strokeplay.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const NOW = new Date('2026-09-09T12:00:00').getTime();
const full = (avg) => Object.fromEntries(Array.from({ length: SP_HOLES }, (_, i) => [i + 1, avg]));
const partial = (n, avg) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, avg]));
const holes = (...r) => Object.fromEntries(r.map((v, i) => [i + 1, v]));

// The JCI Open of the results tests: two rounds on Sky, an eagle, a WD, and
// a tie for second. Болд wins on 71 + 72.
const FIELD = (extra = {}) => ({
  id: 'tn1', name: 'JCI Open', format: 'stroke', course: 'sky', par: 72, rounds: 2,
  startDate: '2026-09-05', endDate: '2026-09-06', venue: 'Sky Resort',
  sp: {
    players: {
      u1: { name: 'Ганбат', hcp: 4 },
      u2: { name: 'Болд', hcp: 8 },
      u3: { name: 'Сараа', hcp: 12 },
      p_9: { name: 'Дорж', hcp: 20 },
      u5: { name: 'Тэмүүжин', hcp: 9, status: 'WD' }
    },
    scores: {
      u1: { 1: full(4), 2: full(4) },
      u2: { 1: { ...full(4), 1: 3 }, 2: full(4) },
      u3: { 1: full(4), 2: full(4) },
      p_9: { 1: full(5), 2: full(5) },
      u5: { 1: partial(9, 5) }
    }
  },
  ...extra
});

// A cup ALTAI wins 2.5 – 0.5, played to the end.
const CUP = (extra = {}) => ({
  id: 'mcup', name: 'M Cup 2026', format: 'ryder', startDate: '2026-08-26', endDate: '2026-08-27',
  mp: {
    teams: { a: { name: 'Altai', short: 'ALTAI', color: '#123456' }, b: { name: 'Wellcom', short: 'WELLCOM', color: '#654321' } },
    roster: { u1: { teamId: 'a', name: 'Ганбат' }, p2: { teamId: 'a', name: 'Болд', userId: 'u2' }, u7: { teamId: 'b', name: 'Сүхээ' }, u8: { teamId: 'b', name: 'Наран' } },
    sessions: { s1: { id: 's1', day: 1, number: 1, format: 'FOURSOMES' }, s2: { id: 's2', day: 2, number: 1, format: 'SINGLES' } },
    matches: {
      m1: { id: 'm1', sessionId: 's1', number: 1, players: { a: ['u1', 'p2'], b: ['u7', 'u8'] }, holes: holes(...Array(10).fill('a')) },
      m2: { id: 'm2', sessionId: 's2', number: 1, players: { a: ['u1'], b: ['u7'] }, holes: holes(...Array(18).fill('h')) },
      m3: { id: 'm3', sessionId: 's2', number: 2, players: { a: ['p2'], b: ['u8'] }, holes: holes(...Array(10).fill('a')) }
    }
  },
  ...extra
});

// A singles draw: two matches, one player on 2 points.
const DRAW = () => ({
  id: 'draw', name: 'Club Match Play', format: 'match', startDate: '2026-07-10',
  mp: {
    roster: { u1: { name: 'Ганбат' }, u9: { name: 'Отгон' }, u10: { name: 'Баяр' } },
    matches: {
      x1: { id: 'x1', number: 1, players: { a: ['u1'], b: ['u9'] }, holes: holes(...Array(10).fill('a')) },
      x2: { id: 'x2', number: 2, players: { a: ['u1'], b: ['u10'] }, holes: holes(...Array(10).fill('a')) }
    }
  }
});

// A sheet-era record: totals only, three level at the top.
const LEGACY = () => ({
  id: 'old', name: 'Spring Cup 2025', format: 'stroke', startDate: '2025-05-20',
  entries: [
    { name: 'Ганбат', total: -2, rounds: [-2] }, { name: 'Наран', total: -2, rounds: [-2] },
    { name: 'Сүхээ', total: -2, rounds: [-2] }, { name: 'Дорж', total: 4, rounds: [4] }
  ]
});

const SET = () => [
  FIELD(),
  CUP(),
  DRAW(),
  LEGACY(),
  FIELD({ id: 'next', name: 'Next Open', startDate: '2027-06-01', endDate: '2027-06-02' }),
  FIELD({ id: 'hidden', name: 'Hidden Open', startDate: '2026-06-01', endDate: '2026-06-01', homeHidden: true }),
  FIELD({ id: 'gone', name: 'Deleted Open', startDate: '2026-05-01', status: 'deleted' }),
  FIELD({ id: 'blank', name: 'Unscored Open', startDate: '2026-04-01', endDate: '2026-04-01', sp: { players: { u1: { name: 'Ганбат' } }, scores: {} } })
];

test('years: which seasons exist and which one opens by default', () => {
  assert.deepEqual(seasonYears(SET()), [2027, 2026, 2025]);
  assert.equal(defaultSeasonYear(SET(), NOW), 2026);
  assert.equal(defaultSeasonYear([LEGACY()], NOW), 2025);       // nothing this year → the newest with one
  assert.equal(defaultSeasonYear([], NOW), 2026);
  assert.equal(tnYear({ startDate: 'nope' }), null);
});

test('state: an explicit status wins, otherwise the dates, the end date a whole day', () => {
  assert.equal(tnState(FIELD(), NOW), 'final');
  assert.equal(tnState(FIELD({ startDate: '2026-09-09', endDate: '2026-09-10' }), NOW), 'live');
  assert.equal(tnState(FIELD({ startDate: '2026-09-20' }), NOW), 'upcoming');
  assert.equal(tnState(FIELD({ status: 'live' }), NOW), 'live');
});

test('season: the 2026 figures — counts, distinct people, complete rounds, the low round, eagles', () => {
  const s = seasonStats(SET(), { now: NOW });
  assert.equal(s.year, 2026);
  // JCI, the cup, the draw, the hidden and the unscored one; not next year's, not the deleted one.
  assert.equal(s.tournaments, 5);
  assert.deepEqual([s.live, s.upcoming, s.finished], [0, 0, 5]);
  // People, once each: u1 u2 u3 p_9(Дорж) u5 from the field (twice), u7 u8 from the cup
  // (its p2 IS u2 by the userId an older roster carries), u9 u10 from the draw.
  assert.equal(s.players, 9);
  // JCI: 4 complete rounds twice over (R1 + R2 of four finishers) and the hidden copy again = 16.
  assert.equal(s.rounds, 16);
  // The cup's three matches and the draw's two, all played.
  assert.equal(s.matches, 5);
  assert.deepEqual(s.lowRound, { name: 'Болд', gross: 71, toPar: -1, round: 1, tnId: 'tn1', tnName: 'JCI Open', tied: 2 });
  assert.equal(s.hasPars, true);
  assert.equal(s.eagles, 2);          // the 3 on Sky's par-5 first, in both copies
  // A card of 4s birdies Sky's four par-5s: 8 + 7 (the eagle hole) + 8 + 0 (the 5s) a copy, twice.
  assert.equal(s.birdies, 46);
  assert.deepEqual(s.byFormat, { stroke: 3, stableford: 0, team: 0, ryder: 1, match: 1 });
});

test('season: a year with nothing scored gives zeros and no low round', () => {
  const s = seasonStats(SET(), { year: 2027, now: NOW });
  assert.equal(s.tournaments, 1);
  assert.equal(s.upcoming, 1);
  assert.equal(s.rounds, 8);          // the copy carries the field's cards; the date is what is in the future
  assert.equal(s.matches, 0);
  const empty = seasonStats([FIELD({ sp: { players: { u1: { name: 'x' } }, scores: {} } })], { now: NOW });
  assert.equal(empty.rounds, 0);
  assert.equal(empty.lowRound, null);
  assert.equal(empty.eagles, null);
  assert.equal(empty.hasPars, false);
  assert.equal(empty.players, 1);
});

test('season: a legacy snapshot counts its people and nothing else', () => {
  const s = seasonStats([LEGACY()], { now: NOW });
  assert.deepEqual([s.tournaments, s.players, s.rounds, s.lowRound, s.eagles], [1, 4, 0, null, null]);
});

test('champions: finished only, newest first, every winner named, teams and draws in their own shape', () => {
  const rows = championsWall(SET(), { now: NOW });
  assert.deepEqual(rows.map(r => r.id), ['tn1', 'mcup', 'draw', 'hidden', 'old']);
  const jci = rows[0];
  assert.equal(jci.kind, 'stroke');
  assert.equal(jci.year, 2026);
  assert.equal(jci.venue, 'Sky Resort');
  assert.deepEqual(jci.divisions, [{ division: null, winners: [{ pid: 'u2', name: 'Болд', total: -1 }], tied: 1 }]);
  const cup = rows[1];
  assert.equal(cup.kind, 'ryder');
  assert.deepEqual([cup.teams.a.short, cup.teams.a.points, cup.teams.b.points, cup.teams.winner], ['ALTAI', 2.5, 0.5, 'a']);
  const draw = rows[2];
  assert.equal(draw.kind, 'singles');
  assert.deepEqual(draw.leaders, [{ name: 'Ганбат', points: 2 }]);
  assert.equal(draw.divisions, undefined);
  const old = rows[4];
  assert.equal(old.divisions[0].tied, 3);
  assert.deepEqual(old.divisions[0].winners.map(w => w.name), ['Ганбат', 'Наран', 'Сүхээ']);
  // Not on the wall: next year's, the deleted one, the finished one nobody scored.
  assert.ok(!rows.some(r => ['next', 'gone', 'blank'].includes(r.id)));
});

test('champions: a live tournament is not a champion yet, and the app\'s own state reading is honoured', () => {
  const live = FIELD({ id: 'live', startDate: '2026-09-09', endDate: '2026-09-10' });
  assert.equal(championsWall([live], { now: NOW }).length, 0);
  assert.equal(championsWall([live], { now: NOW, stateOf: () => 'final' }).length, 1);
});

const P = (id) => ({ id, name: id });
const G = (id, date, time, location, players, extra = {}) => ({ id, date, time, location, groups: [players.map(P)], status: 'open', createdAt: 1, ...extra });

test('casual activity: games, this month, active players, courses, the month strip', () => {
  const games = [
    G('g1', '2026-09-08', '08:00', 'Sky Resort Golf Club', ['a', 'b', 'c']),
    G('g2', '2026-09-01', '13:00', 'Mt. Bogd Golf Club', ['a', 'd']),
    G('g3', '2026-08-20', '09:00', 'Sky Resort Golf Club', ['e', 'f']),
    G('g4', '2026-07-05', '09:00', 'Sky Resort Golf Club', ['a']),
    G('g5', '2026-06-05', '09:00', 'Chinggis Khaan Golf', ['g'], { groups: { 0: { 0: P('g') } } }),   // RTDB's arrays-as-objects
    G('g6', '2026-09-03', '09:00', 'Sky Resort Golf Club', ['z'], { status: 'deleted' }),
    G('g7', 'someday', '', 'Mt. Bogd Golf Club', ['h'])
  ];
  const s = casualActivity(games, { now: NOW });
  assert.equal(s.games, 6);                       // the deleted one is out, the undated one counts
  assert.equal(s.thisMonth, 2);
  assert.equal(s.active30, 6);                    // a b c d (September) + e f (20 Aug is inside thirty days)
  assert.equal(s.players, 8);
  assert.deepEqual(s.topLocations, [{ name: 'Sky Resort Golf Club', count: 3 }, { name: 'Mt. Bogd Golf Club', count: 2 }, { name: 'Chinggis Khaan Golf', count: 1 }]);
  assert.deepEqual(s.byMonth, [
    { ym: '2026-04', count: 0 }, { ym: '2026-05', count: 0 }, { ym: '2026-06', count: 1 },
    { ym: '2026-07', count: 1 }, { ym: '2026-08', count: 1 }, { ym: '2026-09', count: 2 }
  ]);
  assert.ok(!JSON.stringify(s).includes('"name":"a"'), 'no player ids or names ride out');
  assert.deepEqual(casualActivity([], { now: NOW }).byMonth.length, 6);
});

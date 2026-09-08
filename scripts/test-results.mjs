// scripts/test-results.mjs
// The tournament results model — what the results page, the printed sheet
// and the shared image all read. Run with: npm run test:mp
//
// The model imports the match centre's team helpers, which pull in i18n.js
// and store.js; both read localStorage at import time, so a two-method stub
// stands in for the browser before the dynamic import. Nothing here touches
// the DOM.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { tnResultModel, resultScoreText, resultPointsText, resultUnder, RESULT_TOP } =
  await import('../src/tournament-results.js');
const { SP_HOLES } = await import('../src/strokeplay.js');
const { coursePars } = await import('../src/courses.js');

import test from 'node:test';
import assert from 'node:assert/strict';

// A full 18-hole round averaging `avg` strokes; override single holes after.
const full = (avg) => Object.fromEntries(Array.from({ length: SP_HOLES }, (_, i) => [i + 1, avg]));
const partial = (n, avg) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, avg]));

// Sky Resort: par 72 with per-hole pars in the registry, so to-par, eagles
// and birdies are all real.
const FIELD = (extra = {}) => ({
  id: 'tn1', name: 'JCI Open', format: 'stroke', course: 'sky', par: 72, rounds: 2,
  startDate: '2026-09-05', endDate: '2026-09-06',
  sp: {
    players: {
      u1: { name: 'Ганбат', hcp: 4 },
      u2: { name: 'Болд', hcp: 8 },
      u3: { name: 'Сараа', hcp: 12 },
      u4: { name: 'Дорж', hcp: 20 },
      u5: { name: 'Тэмүүжин', hcp: 9, status: 'WD' }
    },
    scores: {
      u1: { 1: full(4), 2: full(4) },                 // 72 + 72 = E
      u2: { 1: { ...full(4), 1: 3 }, 2: full(4) },    // 71 + 72 = −1: the 3 on the par-5 1st is an eagle where a 4 was a birdie
      u3: { 1: full(4), 2: full(4) },                 // E, ties u1
      u4: { 1: full(5), 2: full(5) },                 // +36
      u5: { 1: partial(9, 5) }
    }
  },
  ...extra
});

test('stroke play: the winner, positions with ties, the retired at the bottom', () => {
  const m = tnResultModel(FIELD(), { state: 'final' });
  assert.equal(m.kind, 'stroke');
  assert.equal(m.state, 'final');
  assert.equal(m.rounds, 2);
  assert.equal(m.round, 2);
  assert.equal(m.points, false);
  assert.equal(m.team, false);
  assert.equal(m.hasHcp, true);
  assert.equal(m.players, 5);
  assert.equal(m.boards.length, 1);
  const [b] = m.boards;
  assert.equal(b.division, null);
  assert.deepEqual(b.leaders.map(e => e.name), ['Болд']);
  assert.equal(b.leaders[0].total, -1);          // 71 + 72 against par 72 + 72
  assert.deepEqual(b.entries.map(e => e.posLabel), ['1', 'T2', 'T2', '4', 'WD']);
  assert.deepEqual(b.inPlay.map(e => e.name), ['Болд', 'Ганбат', 'Сараа', 'Дорж']);
  assert.deepEqual(b.retired.map(e => e.name), ['Тэмүүжин']);
  assert.equal(b.cut.length, 0);
  assert.equal(b.idle.length, 0);
  assert.deepEqual(b.top.map(e => e.name), b.inPlay.map(e => e.name));
  // Strokes ride along for the STROKES column.
  assert.equal(b.entries[0].gross, 143);
  assert.equal(b.entries[1].gross, 144);
});

test('stroke play: the field statistics — low round with ties, average, eagles, finished', () => {
  const { stats } = tnResultModel(FIELD());
  assert.ok(stats);
  assert.equal(stats.hasPars, true);
  assert.equal(stats.players, 5);
  assert.equal(stats.finished, 4);              // the WD has nine holes
  assert.equal(stats.rounds.length, 2);
  const r1 = stats.rounds[0];
  assert.equal(r1.round, 1);
  assert.equal(r1.count, 4);                    // complete rounds only
  assert.equal(r1.avg, (72 + 71 + 72 + 90) / 4);
  assert.deepEqual(r1.low.map(x => [x.name, x.gross, x.toPar]), [['Болд', 71, -1]]);
  const r2 = stats.rounds[1];
  assert.equal(r2.count, 4);
  // Three players level on 72 share round two's low round.
  assert.deepEqual(r2.low.map(x => x.name), ['Ганбат', 'Болд', 'Сараа']);
  assert.equal(stats.eagles, 1);                // Болд's 3 on the par-5 1st
  // Sky has four par 3s: every 4 on a par 5 is a birdie — u1, u2 (bar the eagle), u3 in both rounds.
  assert.ok(stats.birdies > 0);
  assert.deepEqual([stats.best.name, stats.best.gross, stats.best.round], ['Болд', 71, 1]);
});

test('stroke play: a course the registry does not carry keeps strokes but no eagles', () => {
  const tn = FIELD({ course: '', venue: 'Somewhere', par: 70 });
  const m = tnResultModel(tn);
  assert.equal(m.par, 70);
  assert.equal(m.stats.hasPars, false);
  assert.equal(m.stats.eagles, null);
  assert.equal(m.stats.birdies, null);
  // Without per-hole pars the low round's to-par comes off the course par.
  assert.equal(m.stats.rounds[0].low[0].toPar, 71 - 70);
});

test('stroke play: the cut splits the table and its rows keep their totals', () => {
  const tn = FIELD({ cutAfterRound: 1, cutSize: 2 });
  const [b] = tnResultModel(tn).boards;
  // After R1: Болд 70, Ганбат 72, Сараа 72 (tie on the edge stays), Дорж 90 → cut.
  assert.deepEqual(b.inPlay.map(e => e.name), ['Болд', 'Ганбат', 'Сараа']);
  assert.deepEqual(b.cut.map(e => [e.name, e.posLabel, e.total]), [['Дорж', 'CUT', 36]]);
  assert.deepEqual(b.retired.map(e => e.name), ['Тэмүүжин']);
  assert.equal(b.cutSize, 2);
  assert.equal(b.cutAfterRound, 1);
});

test('stroke play: while live the state rides through and the leader is a leader', () => {
  const tn = FIELD();
  tn.sp.scores.u1[2] = partial(12, 4);
  tn.sp.scores.u2[2] = partial(12, 4);
  const m = tnResultModel(tn, { state: 'live' });
  assert.equal(m.state, 'live');
  assert.equal(m.round, 2);
  assert.deepEqual(m.boards[0].leaders.map(e => e.name), ['Болд']);
  assert.equal(m.boards[0].leaders[0].thru, '12');
  // Round two has no complete round yet for those two, so its low round is
  // whoever finished: Сараа's 72 and Дорж's 90 → Сараа.
  assert.deepEqual(m.stats.rounds[1].low.map(x => x.name), ['Сараа']);
  assert.equal(m.stats.finished, 2);
});

test('stroke play: a field nobody has scored in has no leaders and no stats', () => {
  const tn = FIELD();
  tn.sp.scores = {};
  const m = tnResultModel(tn, { state: 'upcoming' });
  assert.equal(m.boards[0].leaders.length, 0);
  assert.equal(m.boards[0].inPlay.length, 0);
  assert.equal(m.boards[0].idle.length, 4);      // the WD stays retired
  assert.equal(m.stats, null);
});

test('divisions: one board per division, each with its own winner and positions', () => {
  const tn = FIELD({ spDivisions: 'gender' });
  tn.sp.players.u3.division = 'female';
  tn.sp.players.u4.division = 'female';
  const m = tnResultModel(tn);
  assert.deepEqual(m.boards.map(b => b.division), ['male', 'female']);
  assert.deepEqual(m.boards[0].leaders.map(e => e.name), ['Болд']);
  assert.deepEqual(m.boards[1].leaders.map(e => e.name), ['Сараа']);
  assert.deepEqual(m.boards[1].entries.map(e => e.posLabel), ['1', '2']);
  // Stats read the whole field.
  assert.equal(m.stats.players, 5);
});

test('Stableford: points rank the other way up and read as plain numbers', () => {
  const tn = FIELD({ spScoring: 'stableford' });
  const m = tnResultModel(tn);
  assert.equal(m.points, true);
  const [b] = m.boards;
  // Higher handicap on the same strokes → more points: Дорж's 90s off 20 do
  // not beat Болд, but Сараа (12) outpoints Ганбат (4) on identical cards.
  assert.equal(b.entries[0].rank, 1);
  const iSaraa = b.inPlay.findIndex(e => e.name === 'Сараа');
  const iGanbat = b.inPlay.findIndex(e => e.name === 'Ганбат');
  assert.ok(iSaraa < iGanbat);
  assert.equal(resultScoreText(b.entries[0].total, true), String(b.entries[0].total));
});

test('team event: the teams are the entries and carry their members', () => {
  const tn = {
    id: 't', name: 'Han Bogd Cup', format: 'scramble', spTeamSize: 2, course: 'sky', par: 72, rounds: 1,
    sp: {
      players: {
        u1: { name: 'A' }, u2: { name: 'B' }, u3: { name: 'C' }, u4: { name: 'D' },
        'u1+u2': { kind: 'team', name: 'A / B', members: { u1: true, u2: true } },
        'u3+u4': { kind: 'team', name: 'C / D', members: { u3: true, u4: true } }
      },
      scores: { 'u1+u2': { 1: full(4) }, 'u3+u4': { 1: { ...full(4), 2: 3 } } }
    }
  };
  const m = tnResultModel(tn);
  assert.equal(m.team, true);
  assert.equal(m.teamSize, 2);
  assert.deepEqual(m.boards[0].leaders.map(e => e.name), ['C / D']);
  assert.deepEqual(m.boards[0].leaders[0].memberIds.sort(), ['u3', 'u4']);
  assert.equal(m.stats.players, 2);
  // A 4 on every par 5 is a birdie for both teams, plus the 3 on the par-4 2nd.
  const par5s = Object.values(coursePars('sky')).filter(p => p === 5).length;
  assert.equal(m.stats.birdies, 2 * par5s + 1);
});

const H = 'h';
const holes = (...r) => Object.fromEntries(r.map((v, i) => [i + 1, v]));
const CUP = () => ({
  id: 'mcup', name: 'M Cup 2026', format: 'ryder', startDate: '2026-09-12',
  mp: {
    teams: { a: { name: 'Altai', short: 'ALTAI', color: '#123456' }, b: { name: 'Wellcom', short: 'WELLCOM', color: '#654321' } },
    roster: { p1: { teamId: 'a', name: 'Бат' }, p2: { teamId: 'a', name: 'Дорж' }, p3: { teamId: 'b', name: 'Сүхээ' }, p4: { teamId: 'b', name: 'Наран' } },
    sessions: { s2: { id: 's2', day: 2, number: 1, format: 'SINGLES' }, s1: { id: 's1', day: 1, number: 1, format: 'FOURSOMES', startTime: '08:00' } },
    matches: {
      m1: { id: 'm1', sessionId: 's1', number: 1, players: { a: ['p1', 'p2'], b: ['p3', 'p4'] }, holes: holes('a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a') },  // 10 up thru 10 → 10&8
      m2: { id: 'm2', sessionId: 's2', number: 1, players: { a: ['p1'], b: ['p3'] }, holes: holes(...Array(18).fill(H)) },                                             // halved
      m3: { id: 'm3', sessionId: 's2', number: 2, players: { a: ['p2'], b: ['p4'] }, holes: holes('b', 'b', 'a') }                                                    // live, b 1 up
    }
  }
});

test('M Cup: team points, the winner, sessions in order with every match named', () => {
  const m = tnResultModel(CUP(), { state: 'live' });
  assert.equal(m.kind, 'ryder');
  assert.equal(m.complete, false);
  assert.equal(m.teams.a.points, 1.5);
  assert.equal(m.teams.b.points, 0.5);
  assert.equal(m.winner, 'a');
  assert.equal(m.teams.a.short, 'ALTAI');
  assert.equal(m.teams.b.color, '#654321');
  assert.equal(m.teams.a.logo, null);
  assert.deepEqual(m.sessions.map(s => [s.id, s.day, s.format]), [['s1', 1, 'FOURSOMES'], ['s2', 2, 'SINGLES']]);
  assert.deepEqual(m.sessions[0].totals, { a: 1, b: 0 });
  assert.deepEqual(m.sessions[1].totals, { a: 0.5, b: 0.5 });
  const [m1] = m.sessions[0].matches;
  assert.deepEqual([m1.a, m1.b, m1.result, m1.winner, m1.state], [['Бат', 'Дорж'], ['Сүхээ', 'Наран'], '10 & 8', 'a', 'COMPLETED']);
  const [m2, m3] = m.sessions[1].matches;
  assert.deepEqual([m2.result, m2.winner, m2.state], ['HALVED', null, 'COMPLETED']);
  assert.deepEqual([m3.result, m3.leader, m3.thru, m3.state], ['1 UP', 'b', 3, 'LIVE']);
  assert.equal(m.matches, 3);
  assert.equal(m.played, 2);
});

test('M Cup: a match without a session keeps its points in a row of its own', () => {
  const tn = CUP();
  delete tn.mp.matches.m1.sessionId;
  const m = tnResultModel(tn);
  assert.equal(m.sessions.length, 3);
  assert.equal(m.sessions[2].matches.length, 1);
  assert.deepEqual(m.sessions[2].totals, { a: 1, b: 0 });
  assert.equal(m.teams.a.points, 1.5);
});

test('M Cup: a tie has no winner; all matches decided reads complete', () => {
  const tn = CUP();
  delete tn.mp.matches.m3;
  tn.mp.matches.m4 = { id: 'm4', sessionId: 's2', number: 2, players: { a: ['p2'], b: ['p4'] }, holes: holes(...Array(10).fill('b')) };
  const m = tnResultModel(tn, { state: 'final' });
  assert.equal(m.complete, true);
  assert.equal(m.teams.a.points, 1.5);
  assert.equal(m.teams.b.points, 1.5);
  assert.equal(m.winner, null);
});

test('plain match play: standings by points with tie-aware positions', () => {
  const tn = CUP();
  tn.format = 'match';
  delete tn.mp.teams;
  delete tn.mp.sessions;
  tn.mp.matches.m3.holes = holes(...Array(10).fill('b'));   // p4 beats p2
  const m = tnResultModel(tn, { state: 'final' });
  assert.equal(m.kind, 'singles');
  assert.equal(m.complete, true);
  // m1: p1,p2 win (1 each); m2: p1/p3 halve (½); m3: p4 beats p2 (1).
  assert.deepEqual(m.standings.map(r => [r.name, r.points, r.posLabel]),
    [['Бат', 1.5, '1'], ['Дорж', 1, 'T2'], ['Наран', 1, 'T2'], ['Сүхээ', 0.5, '4']]);
  assert.deepEqual(m.leaders.map(r => r.name), ['Бат']);
  assert.equal(m.top.length, 4);
});

test('readings: to-par text, points text, the under-par flag', () => {
  assert.equal(resultScoreText(0), 'E');
  assert.equal(resultScoreText(-3), '−3');
  assert.equal(resultScoreText(5), '+5');
  assert.equal(resultScoreText(null), '–');
  assert.equal(resultScoreText(36, true), '36');
  assert.equal(resultPointsText(8.5), '8.5');
  assert.equal(resultPointsText(8), '8');
  assert.equal(resultPointsText(undefined), '0');
  assert.equal(resultUnder(-1), true);
  assert.equal(resultUnder(0), false);
  assert.equal(resultUnder(-1, true), false);
  assert.equal(RESULT_TOP, 10);
});

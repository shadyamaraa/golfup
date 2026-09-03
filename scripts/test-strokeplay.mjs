// scripts/test-strokeplay.mjs
// Unit tests for the in-app stroke play engine. Run with: npm run test:mp
// Pure module — no browser, no Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSES, courseByKey, roundGross, spEntries, spActive, spHasHcp, canScoreSp, SP_HOLES,
  holeDiffClass, spSegment, spPlayerCard, spPlayerStats
} from '../src/strokeplay.js';
import { rankEntries } from '../src/tournament-sheet.js';
import { resolveCourse, courseTees, coursePars } from '../src/courses.js';
import { roundFromTournament, courseHandicap } from '../src/handicap.js';

// A full 18-hole round averaging `avg` strokes; override single holes after.
const fullRound = (avg) => Object.fromEntries(
  Array.from({ length: SP_HOLES }, (_, i) => [i + 1, avg]));

const TN = (players, scores, extra = {}) => ({
  format: 'stroke', par: 72, rounds: 2,
  sp: { players, scores },
  ...extra
});

test('course presets carry venue, city and par', () => {
  assert.ok(COURSES.length >= 2);
  assert.equal(courseByKey('sky').par, 72);
  assert.equal(courseByKey('nope'), null);
});

test('the registry answers by key, name and legacy alias alike', () => {
  assert.equal(courseByKey('sky').name, 'Sky Resort Golf Club');
  assert.equal(courseByKey('chinggis').pars[1], 4);
  // The tournament side's original preset said "Club"; both spellings land
  // on the same registry entry.
  assert.equal(resolveCourse('Chinggis Khaan Golf Club').name, 'Chinggis Khaan Golf Course');
  assert.equal(resolveCourse('Chinggis Khaan Golf Course').key, 'chinggis');
  assert.deepEqual(courseTees('sky'), courseTees('Sky Resort Golf Club'));
  assert.ok(courseTees('sky').some(x => x.key === 'blue' && x.rating === 71.5 && x.slope === 130));
  assert.equal(resolveCourse(''), null);
  assert.equal(coursePars('custom-course'), null);
});

test('roundGross sums entered holes and counts them', () => {
  assert.deepEqual(roundGross({ 1: 4, 2: 5, 3: 3 }), { gross: 12, holesIn: 3, toPar: null });
  assert.deepEqual(roundGross(fullRound(4)), { gross: 72, holesIn: 18, toPar: null });
  assert.deepEqual(roundGross({}), { gross: 0, holesIn: 0, toPar: null });
  assert.deepEqual(roundGross(null), { gross: 0, holesIn: 0, toPar: null });
  // Cleared and junk values are ignored.
  assert.deepEqual(roundGross({ 1: 4, 2: null, 3: 'x', 4: 0 }), { gross: 4, holesIn: 1, toPar: null });
});

test('roundGross with per-hole pars carries the running to-par', () => {
  const pars = coursePars('sky');
  assert.equal(pars[1], 5);                     // Sky opens on a par 5
  // 4 on the par-5 1st, 4 on the par-4 2nd: one under thru 2.
  assert.deepEqual(roundGross({ 1: 4, 2: 4 }, pars), { gross: 8, holesIn: 2, toPar: -1 });
  assert.deepEqual(roundGross(fullRound(4), pars), { gross: 72, holesIn: 18, toPar: 0 });
  assert.deepEqual(roundGross({}, pars), { gross: 0, holesIn: 0, toPar: null });
});

test('a complete round posts to-par; a partial one only shows thru', () => {
  const tn = TN(
    { u1: { name: 'Бат' } },
    { u1: { 1: fullRound(4), 2: { 1: 5, 2: 4 } } });  // R1 = 72 (E), R2 thru 2
  const [e] = spEntries(tn);
  assert.equal(e.total, 0);            // only the complete round counts
  assert.deepEqual(e.rounds, [0, null]);
  assert.equal(e.gross, 72);
  assert.equal(e.thru, '2');           // the running round's holes
});

test('finished rounds read F; nothing entered reads blank', () => {
  const done = TN({ u1: { name: 'Бат' } }, { u1: { 1: fullRound(4) } });
  assert.equal(spEntries(done)[0].thru, 'F');
  const idle = TN({ u1: { name: 'Бат' } }, {});
  const [e] = spEntries(idle);
  assert.equal(e.thru, '');
  assert.equal(e.total, null);
});

test('net metric subtracts HCP per completed round', () => {
  const r1 = fullRound(4); r1[1] = 9;  // gross 77, +5
  const tn = TN(
    { u1: { name: 'Бат', hcp: 8 }, u2: { name: 'Дорж' } },
    { u1: { 1: r1 }, u2: { 1: fullRound(4) } });
  const gross = spEntries(tn, 'gross');
  assert.equal(gross.find(e => e.pid === 'u1').total, 5);
  const net = spEntries(tn, 'net');
  const u1 = net.find(e => e.pid === 'u1');
  assert.equal(u1.total, -3);          // +5 gross − 8 hcp
  assert.deepEqual(u1.rounds, [-3, null]);  // R2 of 2 not started
  assert.equal(u1.netTotal, 69);
  // No HCP → net falls back to gross numbers.
  assert.equal(net.find(e => e.pid === 'u2').total, 0);
});

test('two complete rounds accumulate, net doubles the HCP allowance', () => {
  const tn = TN(
    { u1: { name: 'Бат', hcp: 2 } },
    { u1: { 1: fullRound(4), 2: fullRound(5) } });   // 72 + 90 → +18
  assert.equal(spEntries(tn, 'gross')[0].total, 18);
  assert.equal(spEntries(tn, 'net')[0].total, 14);   // − 2×2
});

test('spEntries feeds rankEntries: net order differs from gross', () => {
  const r77 = fullRound(4); r77[1] = 9;
  const tn = TN(
    { u1: { name: 'Бат', hcp: 10 }, u2: { name: 'Дорж', hcp: 0 } },
    { u1: { 1: r77 }, u2: { 1: fullRound(4) } });
  const byGross = rankEntries(spEntries(tn, 'gross'), {});
  assert.equal(byGross[0].name, 'Дорж');
  const byNet = rankEntries(spEntries(tn, 'net'), {});
  assert.equal(byNet[0].name, 'Бат');  // 77 − 10 beats 72
  assert.equal(byNet[0].posLabel, '1');
});

test('WD keeps its status through the entry', () => {
  const tn = TN({ u1: { name: 'Бат', status: 'WD' } }, {});
  const ranked = rankEntries(spEntries(tn), {});
  assert.equal(ranked[0].posLabel, 'WD');
});

test('manual players have no userId; members carry their own id', () => {
  const tn = TN({ u9: { name: 'Бат' }, p_x1: { name: 'Зочин' } }, {});
  const byPid = Object.fromEntries(spEntries(tn).map(e => [e.pid, e]));
  assert.equal(byPid.u9.userId, 'u9');
  assert.equal(byPid.p_x1.userId, null);
});

test('spActive and spHasHcp gate the new board paths', () => {
  assert.equal(spActive({ sp: { players: {} } }), true);
  assert.equal(spActive({ entries: [] }), false);
  assert.equal(spHasHcp(TN({ u1: { name: 'a', hcp: 5 } }, {})), true);
  assert.equal(spHasHcp(TN({ u1: { name: 'a' } }, {})), false);
});

test('canScoreSp: self, officials, nobody else', () => {
  const players = { u1: { name: 'Бат' }, p_x: { name: 'Зочин', userId: 'u7' } };
  assert.equal(canScoreSp({ id: 'u1' }, 'u1', players), true);
  assert.equal(canScoreSp({ id: 'u7' }, 'p_x', players), true);  // legacy userId link
  assert.equal(canScoreSp({ id: 'u2' }, 'u1', players), false);
  assert.equal(canScoreSp({ id: 'm', role: 'marshal' }, 'u1', players), true);
  assert.equal(canScoreSp({ id: 'a', role: 'admin' }, 'p_zzz', players), true);
  assert.equal(canScoreSp(null, 'u1', players), false);
});

// ---- Groups (flights) ----

const { chunkGroups, drawGroups, spGroupList, spPlayerGroup } =
  await import('../src/strokeplay.js');

test('chunkGroups spreads the leftover so nobody plays alone', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
  assert.deepEqual(chunkGroups(ids(8), 4).map(g => g.length), [4, 4]);
  assert.deepEqual(chunkGroups(ids(10), 4).map(g => g.length), [4, 3, 3]);
  assert.deepEqual(chunkGroups(ids(5), 4).map(g => g.length), [3, 2]);
  assert.deepEqual(chunkGroups([], 4), []);
});

test('drawGroups random is a permutation in groups of size', () => {
  const tn = TN({ a: { name: 'a' }, b: { name: 'b' }, c: { name: 'c' },
    d: { name: 'd' }, e: { name: 'e' } }, {});
  let seed = 0.1;
  const groups = drawGroups(tn, { method: 'random', size: 4, rnd: () => (seed = (seed * 9301 + 49297) % 233280 / 233280) });
  assert.deepEqual(groups.map(g => g.length), [3, 2]);
  assert.deepEqual(groups.flat().sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('drawGroups hcp snakes strong and weak into every group', () => {
  const tn = TN({
    a: { name: 'a', hcp: 1 }, b: { name: 'b', hcp: 2 },
    c: { name: 'c', hcp: 10 }, d: { name: 'd', hcp: 20 }
  }, {});
  const groups = drawGroups(tn, { method: 'hcp', size: 2 });
  // Two groups; the two lowest handicaps must not share one.
  assert.equal(groups.length, 2);
  const together = groups.some(g => g.includes('a') && g.includes('b'));
  assert.equal(together, false);
});

test('drawGroups standings puts the leaders in the LAST group', () => {
  const r70 = fullRound(4); r70[1] = 2;             // 70 → −2 (leader)
  const r80 = fullRound(4); r80[1] = 12;            // 80 → +8 (worst)
  const tn = TN({
    lead: { name: 'lead' }, mid: { name: 'mid' }, tail: { name: 'tail' }
  }, { lead: { 1: r70 }, mid: { 1: fullRound(4) }, tail: { 1: r80 } });
  const groups = drawGroups(tn, { method: 'standings', size: 2 });
  assert.ok(groups.at(-1).includes('lead'), 'leader tees off last');
  assert.ok(groups[0].includes('tail'), 'the tail goes out first');
});

test('drawGroups leaves WD/DQ out of the draw', () => {
  const tn = TN({ a: { name: 'a' }, b: { name: 'b', status: 'WD' } }, {});
  assert.deepEqual(drawGroups(tn, { method: 'random', rnd: () => 0.5 }).flat(), ['a']);
});

test('canScoreSp lets a flight-mate score, but only in that round', () => {
  const players = {
    u1: { name: 'a', groups: { 1: 'g1' } },
    u2: { name: 'b', groups: { 1: 'g1', 2: 'g9' } },
    u3: { name: 'c', groups: { 1: 'g2' } }
  };
  assert.equal(canScoreSp({ id: 'u2' }, 'u1', players, 1), true);   // same flight
  assert.equal(canScoreSp({ id: 'u3' }, 'u1', players, 1), false);  // other flight
  assert.equal(canScoreSp({ id: 'u2' }, 'u1', players, 2), false);  // regrouped
  assert.equal(canScoreSp({ id: 'u2' }, 'u1', players), false);     // no round given
  assert.equal(canScoreSp({ id: 'u1' }, 'u1', players), true);      // self always
});

test('spGroupList sorts by number and spPlayerGroup reads the pointer', () => {
  const tn = { sp: { groups: { 1: {
    g2: { number: 2, teeTime: '09:10', players: { c: true } },
    g1: { number: 1, teeTime: '09:00', players: { a: true, b: true } }
  } } } };
  assert.deepEqual(spGroupList(tn, 1).map(g => g.gid), ['g1', 'g2']);
  assert.equal(spPlayerGroup({ a: { groups: { 1: 'g1' } } }, 'a', 1), 'g1');
  assert.equal(spPlayerGroup({}, 'a', 1), null);
});

// ---- Excel/CSV draw import (groupsFromRows) ----
// strokeplay-admin pulls i18n, which reads localStorage at import time.
globalThis.localStorage ??= {
  _v: {}, getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; }
};
const { groupsFromRows } = await import('../src/strokeplay-admin.js');

test('groupsFromRows: [group, name, tee] rows become the draw', () => {
  const players = { u1: { name: 'Бат Дорж' }, u2: { name: 'Саруул Ганбат' }, u3: { name: 'Тулга Бямба' } };
  const rows = [
    ['Групп', 'Нэр', 'Цаг'],
    ['1', 'Бат Дорж', '08:00'],
    ['1', 'Саруул Ганбат', ''],
    ['2', 'Тулга Бямба', '08:10'],
    ['2', 'Үл Мэдэгдэх Хүн', '']
  ];
  const res = groupsFromRows(rows, players);
  assert.equal(res.groups.length, 2);
  assert.deepEqual(res.groups[0].pids.sort(), ['u1', 'u2']);
  assert.equal(res.groups[0].teeTime, '08:00');
  assert.deepEqual(res.groups[1].pids, ['u3']);
  assert.equal(res.matched, 3);
  assert.ok(res.unmatched.some(n => n.includes('Үл Мэдэгдэх')));
});

test('groupsFromRows: "Group N" heading rows bucket the bare names below', () => {
  const players = { u1: { name: 'Бат Дорж' }, u2: { name: 'Саруул Ганбат' } };
  const rows = [
    ['Group 1'], ['Бат Дорж'],
    ['Групп 2'], ['Саруул Ганбат']
  ];
  const res = groupsFromRows(rows, players);
  assert.equal(res.groups.length, 2);
  assert.deepEqual(res.groups[0].pids, ['u1']);
  assert.deepEqual(res.groups[1].pids, ['u2']);
});

// ---- Unified course/HCP: mid-round to-par and WHS posting ----

test('a registry course posts a running to-par mid-round', () => {
  const tn = TN(
    { u1: { name: 'Бат', hcp: 8 } },
    { u1: { 1: { 1: 4, 2: 4 } } },   // −1 thru 2 on Sky
    { course: 'sky' });
  const [e] = spEntries(tn);
  assert.deepEqual(e.rounds, [-1, null]);
  assert.equal(e.total, -1);
  assert.equal(e.thru, '2');
  // Net keeps the club's flat reading: the full HCP off from the first hole.
  const [n] = spEntries(tn, 'net');
  assert.deepEqual(n.rounds, [-9, null]);
  assert.equal(n.total, -9);
  // Stroke totals still only speak for finished rounds.
  assert.equal(e.gross, null);
});

test('a custom course still waits for the 18th hole', () => {
  const tn = TN({ u1: { name: 'Бат' } }, { u1: { 1: { 1: 4, 2: 4 } } });
  const [e] = spEntries(tn);
  assert.deepEqual(e.rounds, [null, null]);
  assert.equal(e.total, null);
  assert.equal(e.thru, '2');
});

test('complete rounds on a registry course match the old math', () => {
  const r1 = fullRound(4); r1[1] = 9;  // gross 77, +5 on Sky
  const tn = TN({ u1: { name: 'Бат', hcp: 8 } }, { u1: { 1: r1 } }, { course: 'sky' });
  assert.equal(spEntries(tn)[0].total, 5);
  assert.equal(spEntries(tn, 'net')[0].total, -3);
});

const SP_TN = (extra = {}) => ({
  id: 'tn1', course: 'sky', par: 72, rating: 71.5, slope: 130,
  startDate: '2026-08-01', ...extra
});

test('roundFromTournament needs all 18 holes', () => {
  const holes = fullRound(4);
  delete holes[7];
  assert.equal(roundFromTournament(SP_TN(), 'u1', 1, holes), null);
  assert.equal(roundFromTournament(SP_TN(), 'u1', 1, null), null);
});

test('roundFromTournament posts a WHS-shaped round keyed by tnId_rN', () => {
  const rec = roundFromTournament(SP_TN(), 'u1', 2, fullRound(4));
  assert.equal(rec.agsTotal, 72);
  assert.equal(rec.gameId, 'tn1_r2');
  assert.equal(rec.tournamentId, 'tn1');
  assert.equal(rec.round, 2);
  assert.equal(rec.source, 'tournament');
  assert.equal(rec.courseName, 'Sky Resort Golf Club');
  assert.equal(rec.playerId, 'u1');
  assert.equal(rec.holesPlayed, 18);
  // (113/130) × (72 − 71.5) rounded to a decimal.
  assert.equal(rec.differential, 0.4);
});

test('roundFromTournament caps a blow-up hole at par + 5 for the AGS only', () => {
  const holes = fullRound(4);
  holes[4] = 12;                      // Sky's 4th is a par 3 → counts as 8
  const rec = roundFromTournament(SP_TN(), 'u1', 1, holes);
  assert.equal(rec.agsTotal, 72 - 4 + 8);
  assert.equal(rec.holeScores[4], 12);  // the card keeps the real strokes
});

test('roundFromTournament without rating/slope posts no differential', () => {
  const rec = roundFromTournament(SP_TN({ rating: null, slope: null }), 'u1', 1, fullRound(4));
  assert.equal(rec.differential, null);
});

test('courseHandicap seeds the roster from a WHS index', () => {
  // 12.4 × (130/113) + (71.5 − 72) = 13.77 → 14 on Sky's blue tees.
  assert.equal(courseHandicap(12.4, 130, 71.5, 72), 14);
  assert.equal(courseHandicap(null, 130, 71.5, 72), null);
});

test('a started player outranks a scoreless one even without pars', () => {
  // Custom course (no registry pars): a partial round has no total, but the
  // player who has holes in still sits above those with nothing at all.
  const tn = TN(
    { a: { name: 'Анар' }, b: { name: 'Бат' }, c: { name: 'Цэрэн' }, d: { name: 'Дорж' } },
    { b: { 1: fullRound(4) }, d: { 1: { 1: 4, 2: 4 } } },
    { rounds: 1, course: '' });
  const names = rankEntries(spEntries(tn), {}).map(e => e.name);
  assert.deepEqual(names, ['Бат', 'Дорж', 'Анар', 'Цэрэн']);
  // With pars the started player carries a real running total instead.
  const withPars = rankEntries(spEntries({ ...tn, course: 'sky' }), {});
  assert.deepEqual(withPars.map(e => e.name), ['Дорж', 'Бат', 'Анар', 'Цэрэн']);
  assert.equal(withPars[0].total, -1);
});

test('a typed venue resolves pars when no course key was ever picked', () => {
  // The JCI case: course was never chosen, but the venue says Mt. Bogd —
  // a registry alias for Sky Resort — so mid-round to-par still posts.
  assert.equal(resolveCourse('Mt. Bogd').key, 'sky');
  const tn = TN(
    { u1: { name: 'Бат' } },
    { u1: { 1: { 1: 4, 2: 4 } } },
    { rounds: 1, course: '', venue: 'Mt. Bogd' });
  const [e] = spEntries(tn);
  assert.equal(e.total, -1);
  assert.equal(e.thru, '2');
});

// ---- Player card + stats (the PGA-style read-only view's engine) ----

// Sky's front nine: 5 4 4 3 5 4 4 3 4 (36), back: 4 4 5 3 4 4 4 3 5 (36).
const SKY = (players, scores, extra = {}) =>
  TN(players, scores, { rounds: 1, course: 'sky', ...extra });

test('holeDiffClass buckets a hole the way the printed card does', () => {
  assert.equal(holeDiffClass(3, 5), 'eagle');
  assert.equal(holeDiffClass(1, 4), 'eagle');     // an albatross folds in
  assert.equal(holeDiffClass(3, 4), 'birdie');
  assert.equal(holeDiffClass(4, 4), 'par');
  assert.equal(holeDiffClass(5, 4), 'bogey');
  assert.equal(holeDiffClass(6, 4), 'double');
  assert.equal(holeDiffClass(9, 4), 'double');
  assert.equal(holeDiffClass(4, null), null);
  assert.equal(holeDiffClass(null, 4), null);
  assert.equal(holeDiffClass(0, 4), null);
});

test('spSegment sums a nine and carries its FULL par', () => {
  const pars = coursePars('sky');
  assert.deepEqual(spSegment(fullRound(4), pars, 1, 9), { gross: 36, holesIn: 9, toPar: 0, par: 36 });
  assert.deepEqual(spSegment(fullRound(4), pars, 10, 18), { gross: 36, holesIn: 9, toPar: 0, par: 36 });
  assert.equal(spSegment(fullRound(4), pars, 1, 18).par, 72);
  // A part-played nine still prints the whole nine's par.
  const three = { 1: 5, 2: 4, 3: 4 };
  assert.deepEqual(spSegment(three, pars, 1, 9), { gross: 13, holesIn: 3, toPar: 0, par: 36 });
  // No registry pars → par null, strokes still counted.
  assert.deepEqual(spSegment(three, null, 1, 9), { gross: 13, holesIn: 3, toPar: null, par: null });
});

test('spPlayerCard reads each hole against its par', () => {
  const r1 = fullRound(4); r1[1] = 3; r1[4] = 2; r1[13] = 6;  // eagle, birdie, double
  const card = spPlayerCard(SKY({ u1: { name: 'Бат', hcp: 8 } }, { u1: { 1: r1 } }), 'u1', 1);
  assert.equal(card.hasPars, true);
  assert.equal(card.holes[0].cls, 'eagle');     // 3 on the par 5
  assert.equal(card.holes[3].cls, 'birdie');    // 2 on the par 3
  assert.equal(card.holes[12].cls, 'double');   // 6 on the par 3
  assert.equal(card.holes[1].cls, 'par');
  assert.equal(card.holes[0].si, 5);            // Sky's stroke index for hole 1
  assert.equal(card.thru, 'F');
});

test('spPlayerCard runs the score through the turn', () => {
  const r1 = fullRound(4); r1[1] = 3; r1[4] = 2; r1[13] = 6;
  const card = spPlayerCard(SKY({ u1: { name: 'Бат' } }, { u1: { 1: r1 } }), 'u1', 1);
  // −2 after the eagle, and the last cell is the round's to-par.
  assert.equal(card.holes[0].running, -2);
  assert.equal(card.holes[17].running, card.total.toPar);
  assert.equal(card.front.gross + card.back.gross, card.total.gross);
  assert.deepEqual([card.front.par, card.back.par, card.total.par], [36, 36, 72]);
});

test('spPlayerCard without registry pars keeps strokes, drops the reading', () => {
  const card = spPlayerCard(
    TN({ u1: { name: 'Бат' } }, { u1: { 1: fullRound(4) } }, { rounds: 1, course: '', venue: 'Nowhere' }),
    'u1', 1);
  assert.equal(card.hasPars, false);
  assert.ok(card.holes.every(h => h.par === null && h.cls === null && h.running === null));
  assert.equal(card.total.gross, 72);
  assert.equal(card.total.par, null);   // never synthesized from tn.par
  assert.equal(card.thru, 'F');
});

test('spPlayerCard handles a partial round and an untouched one', () => {
  const seven = {}; for (let h = 1; h <= 7; h++) seven[h] = 4;
  const tn = SKY({ u1: { name: 'Бат' } }, { u1: { 1: seven } }, { rounds: 2 });
  const card = spPlayerCard(tn, 'u1', 1);
  assert.equal(card.total.holesIn, 7);
  assert.equal(card.thru, '7');
  assert.equal(card.back.holesIn, 0);
  assert.equal(card.holes[7].running, null);
  const idle = spPlayerCard(tn, 'u1', 2);
  assert.equal(idle.thru, '');
  assert.ok(idle.holes.every(h => h.strokes === null));
  assert.equal(spPlayerCard(tn, 'nobody', 1), null);
});

test('spPlayerStats counts the scoring spread', () => {
  // 1 eagle, 3 birdies, 10 pars, 3 bogeys, 1 triple.
  const r = {}; const pars = coursePars('sky');
  for (let h = 1; h <= 18; h++) r[h] = pars[h];
  r[1] = pars[1] - 2; r[2] = pars[2] - 1; r[3] = pars[3] - 1; r[5] = pars[5] - 1;
  r[10] = pars[10] + 1; r[11] = pars[11] + 1; r[12] = pars[12] + 1; r[13] = pars[13] + 3;
  const s = spPlayerStats(SKY({ u1: { name: 'Бат' } }, { u1: { 1: r } }), 'u1', null);
  assert.deepEqual(s.dist, { eagle: 1, birdie: 3, par: 10, bogey: 3, double: 1 });
  assert.equal(s.best.cls, 'eagle');
  assert.equal(s.best.hole, 1);
  assert.equal(s.worst.diff, 3);
  assert.equal(s.worst.hole, 13);
});

test('spPlayerStats averages by par type', () => {
  const s = spPlayerStats(SKY({ u1: { name: 'Бат' } }, { u1: { 1: fullRound(4) } }), 'u1', null);
  assert.equal(s.byPar[3].count, 4);            // Sky has four par 3s
  assert.equal(s.byPar[3].avg, 4);
  assert.equal(s.byPar[3].toPar, 1);
  assert.equal(s.byPar[4].toPar, 0);
  assert.equal(s.byPar[5].toPar, -1);
});

test('spPlayerStats aggregates rounds and scopes to one', () => {
  const r2 = fullRound(4); r2[1] = 6;
  const tn = SKY({ u1: { name: 'Бат' } }, { u1: { 1: fullRound(4), 2: r2 } }, { rounds: 2 });
  const all = spPlayerStats(tn, 'u1', null);
  assert.equal(all.roundsPlayed, 2);
  assert.equal(all.roundsComplete, 2);
  assert.equal(all.holesPlayed, 36);
  assert.equal(all.gross, 72 + 74);
  assert.equal(all.scoringAvg, 73);
  assert.equal(all.front.gross, 36 + 38);   // R2's opening 6 lands on the front nine
  assert.equal(all.rounds.length, 2);
  const one = spPlayerStats(tn, 'u1', 1);
  assert.equal(one.holesPlayed, 18);
  assert.equal(one.gross, 72);
  assert.equal(one.scoringAvg, 72);
  assert.equal(one.rounds.length, 2);            // the list always shows every round
});

test('spPlayerStats nets off the HCP per completed round', () => {
  const two = { u1: { 1: fullRound(4), 2: fullRound(4) } };
  const withHcp = spPlayerStats(SKY({ u1: { name: 'Бат', hcp: 8 } }, two, { rounds: 2 }), 'u1', null);
  assert.equal(withHcp.net, 144 - 16);
  const noHcp = spPlayerStats(SKY({ u1: { name: 'Бат' } }, two, { rounds: 2 }), 'u1', null);
  assert.equal(noHcp.net, null);
  // A round still on the course doesn't earn its allowance yet.
  const part = { u1: { 1: fullRound(4), 2: { 1: 4, 2: 4 } } };
  const mid = spPlayerStats(SKY({ u1: { name: 'Бат', hcp: 8 } }, part, { rounds: 2 }), 'u1', null);
  assert.equal(mid.roundsComplete, 1);
  assert.equal(mid.net, mid.gross - 8);
});

test('spPlayerStats survives WD, manual players and a course with no card', () => {
  const eleven = {}; for (let h = 1; h <= 11; h++) eleven[h] = 4;
  const wd = spPlayerStats(SKY({ u1: { name: 'Бат', status: 'WD' } }, { u1: { 1: eleven } }), 'u1', null);
  assert.equal(wd.status, 'WD');
  assert.equal(wd.holesPlayed, 11);
  assert.equal(wd.roundsComplete, 0);
  assert.equal(wd.scoringAvg, null);
  assert.equal(wd.net, null);
  assert.equal(wd.dist.par + wd.dist.birdie + wd.dist.bogey + wd.dist.eagle + wd.dist.double, 11);

  const manual = spPlayerStats(SKY({ p_x: { name: 'Зочин' } }, { p_x: { 1: { 1: 5, 2: 4 } } }), 'p_x', null);
  assert.equal(manual.name, 'Зочин');
  assert.equal(manual.holesPlayed, 2);

  const bare = spPlayerStats(
    TN({ u1: { name: 'Бат' } }, { u1: { 1: fullRound(4) } }, { rounds: 1, course: '', venue: 'Nowhere' }),
    'u1', null);
  assert.equal(bare.hasPars, false);
  assert.equal(bare.dist, null);
  assert.equal(bare.byPar, null);
  assert.equal(bare.best, null);
  assert.equal(bare.toPar, null);
  assert.equal(bare.gross, 72);
  assert.equal(bare.holeAvg, 4);
  assert.equal(spPlayerStats(SKY({ u1: { name: 'Бат' } }, {}), 'nobody', null), null);
});

test('spPlayerStats reports the field average over the same scope', () => {
  const tn = SKY({ u1: { name: 'Бат' }, u2: { name: 'Дорж' }, u3: { name: 'Сараа' } },
    { u1: { 1: fullRound(4) }, u2: { 1: fullRound(5) }, u3: { 1: { 1: 4 } } });
  const s = spPlayerStats(tn, 'u1', null);
  assert.equal(s.fieldAvg, (72 + 90) / 2);   // only complete rounds count
});

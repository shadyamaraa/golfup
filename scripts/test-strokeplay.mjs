// scripts/test-strokeplay.mjs
// Unit tests for the in-app stroke play engine. Run with: npm run test:mp
// Pure module — no browser, no Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSES, courseByKey, roundGross, spEntries, spActive, spHasHcp, canScoreSp, SP_HOLES
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

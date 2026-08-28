// scripts/test-strokeplay.mjs
// Unit tests for the in-app stroke play engine. Run with: npm run test:mp
// Pure module — no browser, no Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COURSES, courseByKey, roundGross, spEntries, spActive, spHasHcp, canScoreSp, SP_HOLES
} from '../src/strokeplay.js';
import { rankEntries } from '../src/tournament-sheet.js';

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

test('roundGross sums entered holes and counts them', () => {
  assert.deepEqual(roundGross({ 1: 4, 2: 5, 3: 3 }), { gross: 12, holesIn: 3 });
  assert.deepEqual(roundGross(fullRound(4)), { gross: 72, holesIn: 18 });
  assert.deepEqual(roundGross({}), { gross: 0, holesIn: 0 });
  assert.deepEqual(roundGross(null), { gross: 0, holesIn: 0 });
  // Cleared and junk values are ignored.
  assert.deepEqual(roundGross({ 1: 4, 2: null, 3: 'x', 4: 0 }), { gross: 4, holesIn: 1 });
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

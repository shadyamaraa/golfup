// scripts/test-tee-notify.mjs
// Stroke play tee-time notifications — the pure half: which players a
// round's draw instructs, what each instruction says, and who is told when
// the draw changes against the ledger of what they were last told. The
// same block is copied into functions/index.js (the function cannot import
// the client bundle); the last test keeps the two copies identical.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spTeeSlots, spTeeSig, spTeeUid, spTeeAnnounce } from '../src/strokeplay.js';

// A roster: four members (pids are userIds), one hand-added guest, one team
// of two members, one withdrawn member.
const PLAYERS = () => ({
  u1: { name: 'A', userId: 'u1' },
  u2: { name: 'B', userId: 'u2' },
  u3: { name: 'C', userId: 'u3' },
  u4: { name: 'D', userId: 'u4', status: 'WD' },
  old: { name: 'Legacy', userId: 'u9' },
  p_guest: { name: 'Guest' },
  'u5+u6': { name: 'Pair', kind: 'team', members: { u5: true, u6: true } },
  u5: { name: 'E', userId: 'u5' },
  u6: { name: 'F', userId: 'u6' }
});
const G = (number, teeTime, pids, extra = {}) => ({ number, teeTime, players: Object.fromEntries(pids.map(p => [p, true])), ...extra });
const DRAW = () => ({
  g1: G(1, '08:00', ['u1', 'u2']),
  g2: G(2, '08:10', ['u3', 'u4', 'p_guest', 'old']),
  g3: G(3, '08:20', ['u5+u6'], { startHole: 10 })
});
const sigsOf = (groups, players = PLAYERS()) => Object.fromEntries(Object.entries(spTeeSlots(groups, players)).map(([pid, s]) => [pid, spTeeSig(s)]));

test('spTeeSlots: every timed flight instructs its people; teams open into members; WD and unknown drop', () => {
  const slots = spTeeSlots(DRAW(), PLAYERS());
  assert.deepEqual(Object.keys(slots).sort(), ['old', 'p_guest', 'u1', 'u2', 'u3', 'u5', 'u6']);
  assert.deepEqual(slots.u1, { teeTime: '08:00', startHole: null, number: 1, gid: 'g1' });
  assert.deepEqual(slots.u5, { teeTime: '08:20', startHole: 10, number: 3, gid: 'g3' });
  assert.ok(!('u5+u6' in slots), 'the team key itself is not a person');
  assert.ok(!('u4' in slots), 'a withdrawn player is not instructed');
  // A flight with no tee time is not an instruction yet; a null flight is skipped.
  const blank = { g1: G(1, '', ['u1']), g2: null, g3: G(3, '08:00', ['nobody']) };
  assert.deepEqual(spTeeSlots(blank, PLAYERS()), {});
  assert.deepEqual(spTeeSlots(null, PLAYERS()), {});
});

test('spTeeSig reads the time and the start hole, never the flight number', () => {
  assert.equal(spTeeSig({ teeTime: '08:40', startHole: null, number: 3 }), '08:40|');
  assert.equal(spTeeSig({ teeTime: '08:40', startHole: 7, number: 9 }), '08:40|7');
  assert.equal(spTeeSig(null), '');
});

test('spTeeUid: a member is their pid, a legacy entry its userId, a guest nobody', () => {
  const players = PLAYERS();
  assert.equal(spTeeUid('u1', players), 'u1');
  assert.equal(spTeeUid('old', players), 'u9');
  assert.equal(spTeeUid('p_guest', players), null);
  assert.equal(spTeeUid('u5', players), 'u5');
});

test('first publish tells everyone drawn and marks the round as first published', () => {
  const r = spTeeAnnounce({ before: null, after: DRAW(), players: PLAYERS(), prev: null });
  assert.equal(r.firstPublish, true);
  assert.deepEqual(r.notify.map(n => n.pid).sort(), ['old', 'p_guest', 'u1', 'u2', 'u3', 'u5', 'u6']);
  assert.ok(r.notify.every(n => n.prevSig === ''));
  assert.deepEqual(r.sigs, sigsOf(DRAW()));
});

test('an identical re-save against the ledger tells nobody', () => {
  const prev = sigsOf(DRAW());
  const r = spTeeAnnounce({ before: DRAW(), after: DRAW(), players: PLAYERS(), prev });
  assert.deepEqual(r.notify, []);
  assert.equal(r.firstPublish, false);
});

test('a moved tee time and a changed start hole are news; a renumber and new flight-mates are not', () => {
  const prev = sigsOf(DRAW());
  const moved = DRAW(); moved.g1.teeTime = '09:00';
  let r = spTeeAnnounce({ before: DRAW(), after: moved, players: PLAYERS(), prev });
  assert.deepEqual(r.notify.map(n => [n.pid, n.prevSig, n.slot.teeTime]).sort(), [['u1', '08:00|', '09:00'], ['u2', '08:00|', '09:00']]);

  const hole = DRAW(); hole.g3.startHole = 1;
  r = spTeeAnnounce({ before: DRAW(), after: hole, players: PLAYERS(), prev });
  assert.deepEqual(r.notify.map(n => n.pid).sort(), ['u5', 'u6']);

  const renumbered = DRAW(); renumbered.g1.number = 7; renumbered.g2.number = 8;
  r = spTeeAnnounce({ before: DRAW(), after: renumbered, players: PLAYERS(), prev });
  assert.deepEqual(r.notify, [], 'a renumbering that keeps every time is silent');

  // u3 moves into u1's flight (same time as before? no — 08:00 instead of 08:10): that IS news for u3 only.
  const mates = DRAW(); delete mates.g2.players.u3; mates.g1.players.u3 = true;
  r = spTeeAnnounce({ before: DRAW(), after: mates, players: PLAYERS(), prev });
  assert.deepEqual(r.notify.map(n => n.pid), ['u3']);
  // And a swap that keeps the times is silent for everyone.
  const swap = DRAW(); swap.g1.players = { u1: true, u2: true }; swap.g2.players = { u3: true, 'old': true, p_guest: true };
  r = spTeeAnnounce({ before: DRAW(), after: swap, players: PLAYERS(), prev });
  assert.deepEqual(r.notify, []);
});

test('a dropped player, a deleted flight or a cleared round tells nobody', () => {
  const prev = sigsOf(DRAW());
  const gone = DRAW(); delete gone.g1;
  let r = spTeeAnnounce({ before: DRAW(), after: gone, players: PLAYERS(), prev });
  assert.deepEqual(r.notify, []);
  assert.ok(!('u1' in r.sigs) && !('u2' in r.sigs));
  r = spTeeAnnounce({ before: DRAW(), after: null, players: PLAYERS(), prev });
  assert.deepEqual(r.notify, []);
  assert.deepEqual(r.sigs, {});
  assert.equal(r.firstPublish, false);
});

test('flights without times are not a publish; a player withdrawn after the draw is dropped', () => {
  const untimed = { g1: G(1, '', ['u1', 'u2']), g2: G(2, '', ['u3']) };
  let r = spTeeAnnounce({ before: null, after: untimed, players: PLAYERS(), prev: null });
  assert.equal(r.firstPublish, false);
  assert.deepEqual(r.notify, []);
  const players = PLAYERS(); players.u1.status = 'DQ';
  r = spTeeAnnounce({ before: DRAW(), after: DRAW(), players, prev: sigsOf(DRAW()) });
  assert.deepEqual(r.notify, []);
  assert.ok(!('u1' in r.sigs));
});

test('a round the ledger never saw: what the record said before stands in, so only the changed are told', () => {
  const moved = DRAW(); moved.g2.teeTime = '08:15';
  const r = spTeeAnnounce({ before: DRAW(), after: moved, players: PLAYERS(), prev: null });
  assert.equal(r.firstPublish, false);
  assert.deepEqual(r.notify.map(n => n.pid).sort(), ['old', 'p_guest', 'u3']);
  assert.equal(r.notify.find(n => n.pid === 'u3').prevSig, '08:10|');
});

test('the copy in functions/index.js is identical to the client block', () => {
  const block = (src) => {
    const a = src.indexOf('// >>> tee-notify');
    const b = src.indexOf('// <<< tee-notify');
    assert.ok(a >= 0 && b > a, 'markers present');
    return src.slice(a, b);
  };
  const client = block(fs.readFileSync(new URL('../src/strokeplay.js', import.meta.url), 'utf8'));
  const server = block(fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8'));
  assert.equal(server, client);
});

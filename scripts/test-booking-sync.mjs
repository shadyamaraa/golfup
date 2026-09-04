// scripts/test-booking-sync.mjs
// The MTBogd booking state machine and the game-vs-MTBogd comparison.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingState, compareBooking, verifyOutcome, attachable, remoteSummary,
  bookingReason, logEntry, gamePlayerCount,
} from '../src/booking-sync.js';
import { MTBOGD_CONFIG } from '../src/config.js';

const MT = MTBOGD_CONFIG.locationName;
const game = (over = {}) => ({
  id: 'g1', location: MT, date: '2026-09-03', time: '13:40', status: 'open',
  groups: [[{ id: 'u1' }, { id: 'u2' }]],
  ...over,
});
const remote = (over = {}) => ({
  bookingId: 'B1', bookingCode: 'BKAAAA', status: 'confirmed', slotId: '20260903_1340_T1',
  date: '2026-09-03', time: '13:40', players: [{ name: 'a' }, { name: 'b' }], paymentStatus: 'pending',
  ...over,
});

test('bookingState: total on garbage, na off the MTBogd course', () => {
  assert.equal(bookingState(null), 'na');
  assert.equal(bookingState('x'), 'na');
  assert.equal(bookingState({}), 'na');
  assert.equal(bookingState(game({ location: 'Chinggis Khaan Golf Course', bookingId: 'B1' })), 'na');
});

test('bookingState: every state, legacy records read neutrally', () => {
  assert.equal(bookingState(game()), 'none', 'legacy no-booking game');
  assert.equal(bookingState(game({ bookingId: 'B1' })), 'unverified', 'legacy booked game, never checked');
  assert.equal(bookingState(game({ bookingId: 'B1', booking: { status: 'confirmed', verifiedAt: 1 } })), 'synced');
  assert.equal(bookingState(game({ bookingId: 'B1', booking: { status: 'mismatch', verifiedAt: 1 } })), 'mismatch');
  assert.equal(bookingState(game({ bookingId: 'B1', bookingCancelled: true })), 'cancelled_remote', 'webhook flag');
  assert.equal(bookingState(game({ bookingId: 'B1', booking: { mtbogd: { status: 'cancelled' }, verifiedAt: 1 } })), 'cancelled_remote', 'a check found it cancelled');
  assert.equal(bookingState(game({ bookingId: 'B1', booking: { status: 'cancel_failed' } })), 'cancel_failed');
  assert.equal(bookingState(game({ booking: 'junk', bookingId: 'B1' })), 'unverified', 'non-object booking ignored');
});

test('bookingState: a skipped booking without an id is none, not cancelled', () => {
  assert.equal(bookingState(game({ booking: { status: 'none', reason: 'slot_lost' } })), 'none');
  assert.equal(bookingState(game({ bookingCancelled: true })), 'none', 'cancel flag without an id');
});

test('compareBooking: identical record matches', () => {
  assert.deepEqual(compareBooking(game({ bookingSlotId: '20260903_1340_T1' }), remote()), { ok: true, issues: [] });
});

test('compareBooking: each difference is named', () => {
  const g = game({ bookingSlotId: '20260903_1340_T1' });
  assert.deepEqual(compareBooking(g, null), { ok: false, issues: ['not_found'] });
  assert.deepEqual(compareBooking(g, remote({ status: 'CANCELLED' })).issues, ['status_cancelled']);
  assert.deepEqual(compareBooking(g, remote({ date: '2026-09-04' })).issues, ['date_differs']);
  assert.deepEqual(compareBooking(g, remote({ time: '14:00' })).issues, ['time_differs']);
  assert.deepEqual(compareBooking(g, remote({ slotId: '20260903_1400_T1' })).issues, ['slot_differs']);
  assert.deepEqual(compareBooking(g, remote({ players: [{}, {}, {}] })).issues, ['players_differ']);
  const many = compareBooking(g, remote({ status: 'cancelled', date: '2026-09-04', time: '14:00' }));
  assert.deepEqual(many.issues, ['status_cancelled', 'date_differs', 'time_differs']);
});

test('compareBooking: time tolerates leading zeros and unknowns', () => {
  assert.equal(compareBooking(game({ time: '9:00' }), remote({ time: '09:00', players: undefined })).ok, true);
  assert.equal(compareBooking(game({ time: 'later' }), remote({ time: '09:00', players: undefined })).ok, true, 'unreadable time is not a difference');
  assert.equal(compareBooking(game({ groups: [] }), remote({ players: [{}, {}, {}] })).ok, true, 'empty flight is not compared');
  assert.equal(compareBooking(game(), remote({ players: undefined, playerCount: 2 })).ok, true, 'playerCount fallback');
});

test('verifyOutcome maps the comparison to a stored status', () => {
  assert.deepEqual(verifyOutcome(game(), remote()), { status: 'confirmed', issues: [] });
  assert.deepEqual(verifyOutcome(game(), remote({ status: 'cancelled' })), { status: 'mismatch', issues: ['status_cancelled'] });
});

test('attachable: guards in order', () => {
  assert.deepEqual(attachable(null, remote()), { ok: false, reason: 'no_game' });
  assert.deepEqual(attachable(game({ status: 'deleted' }), remote()), { ok: false, reason: 'game_deleted' });
  assert.deepEqual(attachable(game(), null), { ok: false, reason: 'not_found' });
  assert.deepEqual(attachable(game(), remote({ bookingId: undefined })), { ok: false, reason: 'no_id' });
  assert.deepEqual(attachable(game(), remote({ status: 'cancelled' })), { ok: false, reason: 'remote_cancelled' });
  assert.deepEqual(attachable(game(), remote({ date: '2026-09-04' })), { ok: false, reason: 'date_differs' });
  assert.deepEqual(attachable(game(), remote()), { ok: true });
  assert.deepEqual(attachable(game(), remote({ time: '15:00' })), { ok: true }, 'a different time on the same day is still attachable');
});

test('remoteSummary keeps only what the game caches, no undefined', () => {
  const s = remoteSummary(remote());
  assert.deepEqual(s, { status: 'confirmed', slotId: '20260903_1340_T1', date: '2026-09-03', time: '13:40', playerCount: 2, paymentStatus: 'pending', bookingCode: 'BKAAAA' });
  assert.equal(remoteSummary(null), null);
  const sparse = remoteSummary({ status: 'confirmed' });
  assert.equal(sparse.slotId, null);
  for (const v of Object.values(sparse)) assert.notEqual(v, undefined);
});

test('bookingReason', () => {
  assert.equal(bookingReason(true), 'slot_lost');
  assert.equal(bookingReason(false), 'user_skipped');
});

test('logEntry stamps time, drops undefined, keeps errors', () => {
  const e = logEntry('hold_failed', { at: 5, by: 'u1', error: 'boom', httpStatus: 502, detail: undefined });
  assert.deepEqual(e, { at: 5, event: 'hold_failed', by: 'u1', error: 'boom', httpStatus: 502 });
  assert.equal('detail' in e, false);
  const now = logEntry('no_slot');
  assert.equal(typeof now.at, 'number');
  assert.equal(now.event, 'no_slot');
  assert.equal(logEntry(undefined, null).event, '');
});

test('gamePlayerCount: arrays, objects, duplicates', () => {
  assert.equal(gamePlayerCount(game()), 2);
  assert.equal(gamePlayerCount({ groups: { a: { x: { id: 'u1' }, y: { id: 'u1' } } } }), 1);
  assert.equal(gamePlayerCount({}), 0);
  assert.equal(gamePlayerCount(null), null);
});

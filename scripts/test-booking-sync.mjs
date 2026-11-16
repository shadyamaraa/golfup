// scripts/test-booking-sync.mjs
// The MTBogd booking state machine and the game-vs-MTBogd comparison.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingState, compareBooking, verifyOutcome, attachable, remoteSummary,
  bookingReason, logEntry, gamePlayerCount,
  BOOK_MODES, bookModeOf, seatsToBook, bookingRoster, bookingPrice,
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

// ---- Seats and per-player pricing (MTBogd bills per player since 2026-11) ----

test('bookModeOf reads a known mode and nothing else', () => {
  assert.deepEqual(BOOK_MODES, ['flight', 'self']);
  assert.equal(bookModeOf({ bookingMode: 'flight' }), 'flight');
  assert.equal(bookModeOf({ bookingMode: 'self' }), 'self');
  assert.equal(bookModeOf({ bookingMode: 'all' }), null);
  assert.equal(bookModeOf({}), null);
  assert.equal(bookModeOf(null), null);
});

test('seatsToBook: the whole flight, or the players already in', () => {
  assert.equal(seatsToBook('flight', 4, 1), 4);
  assert.equal(seatsToBook('flight', '5', 2), 5);
  assert.equal(seatsToBook('flight', 0, 2), 1);
  assert.equal(seatsToBook('self', 4, 1), 1);
  assert.equal(seatsToBook('self', 4, 3), 3);
  assert.equal(seatsToBook('self', 4, 0), 1);      // the booker always holds a seat
  assert.equal(seatsToBook(undefined, 4, 2), 2);
});

test('bookingRoster pads a flight booking to its seats and leaves others as they are', () => {
  const a = { name: 'Bat', phone: '99' }, b = { name: 'Bold' };
  const flight = { bookingMode: 'flight', bookingSeats: 4 };
  assert.deepEqual(bookingRoster(flight, [a, b], 'Mak'), [a, b, { name: 'Mak' }, { name: 'Mak' }]);
  // A full (or overfull) flight is sent as it stands.
  assert.deepEqual(bookingRoster({ bookingMode: 'flight', bookingSeats: 2 }, [a, b, a], 'Mak'), [a, b, a]);
  // Self and legacy bookings send the roster: the bill follows who joined.
  assert.deepEqual(bookingRoster({ bookingMode: 'self', bookingSeats: 4 }, [a], 'Mak'), [a]);
  assert.deepEqual(bookingRoster({}, { x: a, y: b }, 'Mak'), [a, b]);
  assert.deepEqual(bookingRoster(flight, null, 'Mak'), [{ name: 'Mak' }, { name: 'Mak' }, { name: 'Mak' }, { name: 'Mak' }]);
});

test('bookingPrice reads the per-player record and tolerates the flat one', () => {
  // Per-player (today): unit × count = total.
  assert.deepEqual(bookingPrice({ greenFeeUnitPrice: 380000, playerCount: 4, greenFeePrice: 1520000 }),
    { unit: 380000, seats: 4, total: 1520000 });
  // Total missing: worked out from unit × count.
  assert.deepEqual(bookingPrice({ greenFeeUnitPrice: 300000, players: [{}, {}] }), { unit: 300000, seats: 2, total: 600000 });
  // Flat-price days: no unit, the total stands alone.
  assert.deepEqual(bookingPrice({ greenFeeUnitPrice: null, playerCount: 3, greenFeePrice: 300000 }), { unit: null, seats: 3, total: 300000 });
  // qpay-status shape: only an amount.
  assert.deepEqual(bookingPrice({ amount: 380000 }), { unit: null, seats: null, total: 380000 });
  assert.equal(bookingPrice({}), null);
  assert.equal(bookingPrice(null), null);
  assert.equal(bookingPrice({ greenFeePrice: 0, amount: 'x' }), null);
});

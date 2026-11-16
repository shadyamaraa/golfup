// scripts/test-booking-sync.mjs
// The MTBogd booking state machine and the game-vs-MTBogd comparison.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingState, compareBooking, verifyOutcome, attachable, remoteSummary,
  bookingReason, logEntry, gamePlayerCount,
  phoneKey, bookingPlayer, seatsToBook, bookingPrice, seatsByPlayer, bookingQuoteOf, sameQuote,
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

// ---- Seats: every player pays their own (Sky ONE, 2026-11-16) ----

test('phoneKey keeps the last eight digits', () => {
  assert.equal(phoneKey('99119007'), '99119007');
  assert.equal(phoneKey('+976 9911-9007'), '99119007');
  assert.equal(phoneKey(99119007), '99119007');
  assert.equal(phoneKey('123'), '123');
  assert.equal(phoneKey(''), '');
  assert.equal(phoneKey(null), '');
});

test('bookingPlayer: a name, and a phone only when there is one', () => {
  assert.deepEqual(bookingPlayer(' Bat ', ' 99110001 '), { name: 'Bat', phone: '99110001' });
  assert.deepEqual(bookingPlayer('Bat', ''), { name: 'Bat' });
  assert.deepEqual(bookingPlayer('Bat'), { name: 'Bat' });
  assert.deepEqual(bookingPlayer(null, null), { name: '' });
});

test('seatsToBook: the players already in, at least the booker', () => {
  assert.equal(seatsToBook(1), 1);
  assert.equal(seatsToBook(3), 3);
  assert.equal(seatsToBook(0), 1);
  assert.equal(seatsToBook(null), 1);
  assert.equal(seatsToBook('2'), 2);
});

test('bookingPrice reads the per-player record and tolerates the flat one', () => {
  assert.deepEqual(bookingPrice({ greenFeeUnitPrice: 380000, greenFeeMemberUnitPrice: 300000, playerCount: 4, greenFeePrice: 1520000 }),
    { unit: 380000, memberUnit: 300000, seats: 4, total: 1520000 });
  // Total missing: worked out from unit × count.
  assert.deepEqual(bookingPrice({ greenFeeUnitPrice: 300000, players: [{}, {}] }), { unit: 300000, memberUnit: null, seats: 2, total: 600000 });
  // Flat-price days: no unit, the total stands alone.
  assert.deepEqual(bookingPrice({ greenFeeUnitPrice: null, playerCount: 3, greenFeePrice: 300000 }), { unit: null, memberUnit: null, seats: 3, total: 300000 });
  // qpay-status shape: an amount and a count.
  assert.deepEqual(bookingPrice({ amount: 380000 }), { unit: null, memberUnit: null, seats: null, total: 380000 });
  assert.equal(bookingPrice({}), null);
  assert.equal(bookingPrice(null), null);
  assert.equal(bookingPrice({ greenFeePrice: 0, amount: 'x' }), null);
});

// MTBogd's qpay-status answer, as it came back on 2026-11-16.
const seat = (name, phone, amount, paid = false) => ({ name, phone, amount, paid, paidAt: null, paymentMethod: null });
const statusOf = (players, over = {}) => ({
  paymentStatus: 'pending', amount: players.reduce((n, s) => n + s.amount, 0),
  playerCount: players.length, paidSeats: players.filter(s => s.paid).length,
  balanceDue: players.filter(s => !s.paid).reduce((n, s) => n + s.amount, 0),
  players: players.map((s, index) => ({ index, ...s })), customerType: 'guest', ...over,
});

test('seatsByPlayer matches by phone before name', () => {
  const st = statusOf([seat('Dorj', '88112233', 380000, true), seat('Bat', '99110001', 300000)]);
  const by = seatsByPlayer(st, [
    { id: 'u1', name: 'Bat-Erdene', phone: '+976 99110001' },   // name differs, phone agrees
    { id: 'u2', name: 'Dorj', phone: '' },
  ]);
  assert.deepEqual(by, { u1: { amount: 300000, paid: false }, u2: { amount: 380000, paid: true } });
});

test('seatsByPlayer: a seat is given out once, and same names take seats in turn', () => {
  const st = statusOf([seat('Mak', '', 380000, true), seat('Mak', '', 380000)]);
  assert.deepEqual(seatsByPlayer(st, [{ id: 'a', name: 'mak' }, { id: 'b', name: ' Mak ' }]),
    { a: { amount: 380000, paid: true }, b: { amount: 380000, paid: false } });
});

test('seatsByPlayer pairs the rest in order only when the counts agree', () => {
  // One player, one seat, the name spelt another way: it can only be theirs.
  assert.deepEqual(seatsByPlayer(statusOf([seat('Amarbayasgalan B', '', 380000)]), [{ id: 'u1', name: 'amara' }]),
    { u1: { amount: 380000, paid: false } });
  // One player, four seats under other names: no guess.
  const four = statusOf([seat('X', '', 380000), seat('X', '', 380000), seat('X', '', 380000), seat('X', '', 380000)]);
  assert.deepEqual(seatsByPlayer(four, [{ id: 'u1', name: 'amara' }]), {});
  assert.deepEqual(seatsByPlayer(null, [{ id: 'u1', name: 'a' }]), {});
  assert.deepEqual(seatsByPlayer(four, null), {});
  assert.deepEqual(seatsByPlayer({ players: 'junk' }, [{ id: 'u1', name: 'a' }]), {});
});

test('bookingQuoteOf: the total, the seats paid and each player\'s own seat', () => {
  const booking = { greenFeeUnitPrice: 380000, greenFeeMemberUnitPrice: 300000, playerCount: 2, greenFeePrice: 680000 };
  const st = statusOf([seat('Bat', '99110001', 300000, true), seat('Dorj', '88112233', 380000)], { customerType: 'member' });
  const q = bookingQuoteOf(booking, st, [{ id: 'u1', name: 'Bat', phone: '99110001' }, { id: 'u2', name: 'Dorj', phone: '88112233' }]);
  assert.deepEqual(q, {
    amount: 680000, unit: 380000, memberUnit: 300000, seats: 2, customerType: 'member',
    paidSeats: 1, balanceDue: 380000, allPaid: false,
    paid: { u1: true }, due: { u1: 300000, u2: 380000 },
  });
  assert.equal(JSON.stringify(q).includes('99110001'), false, 'no phone is kept on the game');
});

test('bookingQuoteOf: paid in full, the status alone, and nothing at all', () => {
  const st = statusOf([seat('Bat', '', 380000, true)], { paymentStatus: 'paid' });
  const q = bookingQuoteOf(null, st, [{ id: 'u1', name: 'Bat' }]);
  assert.equal(q.amount, 380000);
  assert.equal(q.allPaid, true);
  assert.equal(q.paidSeats, 1);
  assert.equal(q.balanceDue, 0);
  assert.deepEqual(q.paid, { u1: true });
  // A status from before the per-player fields: a total and nothing else.
  assert.deepEqual(bookingQuoteOf(null, { amount: 300000, customerType: 'member' }, [{ id: 'u1', name: 'Bat' }]), {
    amount: 300000, unit: null, memberUnit: null, seats: null, customerType: 'member',
    paidSeats: null, balanceDue: null, allPaid: false, paid: {}, due: {},
  });
  assert.equal(bookingQuoteOf(null, null, []), null);
  assert.equal(bookingQuoteOf({}, {}, []), null);
});

test('sameQuote reads past what the database drops', () => {
  const q = { amount: 380000, unit: 380000, memberUnit: 300000, seats: 1, customerType: 'guest', paidSeats: 0, balanceDue: 380000, allPaid: false, paid: {}, due: { u1: 380000 } };
  // As it comes back: nulls, false and empty maps gone, a timestamp added.
  const stored = { amount: 380000, unit: 380000, memberUnit: 300000, seats: 1, customerType: 'guest', paidSeats: 0, balanceDue: 380000, due: { u1: 380000 }, at: 5 };
  assert.equal(sameQuote(q, stored), true);
  assert.equal(sameQuote(q, { ...stored, paid: { u1: true } }), false);
  assert.equal(sameQuote(q, { ...stored, balanceDue: 0 }), false);
  assert.equal(sameQuote(q, { ...stored, due: { u1: 300000 } }), false);
  assert.equal(sameQuote(q, null), false);
  assert.equal(sameQuote(null, undefined), true);
});

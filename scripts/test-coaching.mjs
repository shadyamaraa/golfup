// Coaching: the slots a coach opens, the writes that book and cancel, what
// a member sees. Pure — src/coaching.js. The database rules that guard the
// same writes are tested on the real rules engine in scripts/test-rules.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SLOT_MINUTES, CANCEL_HOURS, CANCEL_MS, MAX_NEW_SLOTS,
  slotId, lessonKey, isCoach, cleanProfile, priceOf, cleanNote,
  newSlots, slotWrites, bookingWrites, cancelWrites, canPlayerCancel,
  slotList, upcoming, openSlots, dayKey, timeText, byDay, myLessons, applyWrites,
  MAX_REPEAT_SLOTS, REPEAT_WEEKS, newSlotsRepeat, weeklySeries,
  moveWrites, changeRequestWrites, dropChangeWrites, changeTarget, approveChangeWrites,
} from '../src/coaching.js';

// A fixed "now": 2026-11-20 08:00 in the machine's own time.
const NOW = new Date(2026, 10, 20, 8, 0).getTime();
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
const HOUR = 60 * 60 * 1000;

test('a coach is a member an admin has made one, and who is taking bookings', () => {
  const coaches = { c1: { active: true }, c2: { active: false }, c3: { bio: 'x' } };
  assert.equal(isCoach(coaches, 'c1'), true);
  assert.equal(isCoach(coaches, 'c2'), false);
  assert.equal(isCoach(coaches, 'c3'), false);
  assert.equal(isCoach(coaches, 'nobody'), false);
  assert.equal(isCoach(null, 'c1'), false);
  assert.equal(isCoach(coaches, ''), false);
});

test('cleanProfile: what a coach typed, as it is stored', () => {
  assert.deepEqual(cleanProfile({ bio: '  PGA Class A  ', place: ' Mt. Bogd range ', price30: '50,000₮', price60: '80000' }),
    { bio: 'PGA Class A', place: 'Mt. Bogd range', price30: 50000, price60: 80000 });
  assert.deepEqual(cleanProfile({}), { bio: '', place: '', price30: 0, price60: 0 });
  assert.deepEqual(cleanProfile(null), { bio: '', place: '', price30: 0, price60: 0 });
  assert.equal(cleanProfile({ bio: 'x'.repeat(900) }).bio.length, 600);
  assert.equal(cleanProfile({ place: 'y'.repeat(300) }).place.length, 120);
  assert.equal(cleanProfile({ price60: '-5' }).price60, 5);            // a sign is not a price
  assert.equal(cleanProfile({ price60: 'free' }).price60, 0);
  assert.equal(cleanProfile({ price60: 99999999999 }).price60, 10000000);
});

test('priceOf: the coach\'s price for the length, nothing when not set', () => {
  const p = { price30: 50000, price60: 80000 };
  assert.equal(priceOf(p, 30), 50000);
  assert.equal(priceOf(p, 60), 80000);
  assert.equal(priceOf({}, 60), 0);
  assert.equal(priceOf(null, 30), 0);
});

test('a note is trimmed and kept short', () => {
  assert.equal(cleanNote('  my slice  '), 'my slice');
  assert.equal(cleanNote(null), '');
  assert.equal(cleanNote('n'.repeat(500)).length, 300);
});

test('slotId: a slot is keyed by its start — one slot to a start, in time order', () => {
  assert.equal(slotId(1763600400000), 's1763600400000');
  assert.equal(slotId('1763600400000'), 's1763600400000');
  assert.ok(slotId(at(21, 9)) < slotId(at(21, 10)));
  assert.equal(lessonKey('c1', 's1'), 'c1_s1');
});

test('newSlots: every hour from ten until four', () => {
  const out = newSlots({ date: '2026-11-21', from: '10:00', to: '16:00', minutes: 60, price: 80000, now: NOW });
  assert.equal(out.error, null);
  assert.deepEqual(out.slots.map(s => timeText(s.start)), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);
  assert.deepEqual(out.slots[0], { id: slotId(at(21, 10)), start: at(21, 10), minutes: 60, status: 'open', price: 80000, createdAt: NOW });
  assert.deepEqual([out.past, out.overlap], [0, 0]);
});

test('newSlots: half hours; a tail too short for a lesson is not a slot', () => {
  const out = newSlots({ date: '2026-11-21', from: '9:00', to: '10:45', minutes: 30, now: NOW });
  assert.deepEqual(out.slots.map(s => timeText(s.start)), ['09:00', '09:30', '10:00']);
  assert.equal(out.slots[0].price, 0);
  const until24 = newSlots({ date: '2026-11-21', from: '23:00', to: '24:00', minutes: 60, now: NOW });
  assert.deepEqual(until24.slots.map(s => timeText(s.start)), ['23:00']);
});

test('newSlots: a slot that has begun is left out, and counted', () => {
  const out = newSlots({ date: '2026-11-20', from: '07:00', to: '11:00', minutes: 60, now: NOW });
  assert.deepEqual(out.slots.map(s => timeText(s.start)), ['09:00', '10:00']);   // 07:00 and 08:00 (now) are gone
  assert.equal(out.past, 2);
});

test('newSlots: a slot over one the coach already has is left out, whatever its status or length', () => {
  const existing = [
    { start: at(21, 11), minutes: 60, status: 'booked' },
    { start: at(21, 13, 30), minutes: 30, status: 'open' },
  ];
  const out = newSlots({ date: '2026-11-21', from: '10:00', to: '15:00', minutes: 60, existing, now: NOW });
  assert.deepEqual(out.slots.map(s => timeText(s.start)), ['10:00', '12:00', '14:00']);
  assert.equal(out.overlap, 2);
  // Back to back is not an overlap.
  const next = newSlots({ date: '2026-11-21', from: '12:00', to: '13:00', minutes: 60, existing, now: NOW });
  assert.equal(next.slots.length, 1);
});

test('newSlots: what it will not take', () => {
  const base = { date: '2026-11-21', from: '10:00', to: '12:00', minutes: 60, now: NOW };
  assert.equal(newSlots({ ...base, minutes: 45 }).error, 'minutes');
  assert.equal(newSlots({ ...base, minutes: '60' }).error, null);
  assert.equal(newSlots({ ...base, date: '21/11/2026' }).error, 'time');
  assert.equal(newSlots({ ...base, date: '2026-02-31' }).error, 'time');
  assert.equal(newSlots({ ...base, from: 'ten' }).error, 'time');
  assert.equal(newSlots({ ...base, to: '25:00' }).error, 'time');
  assert.equal(newSlots({ ...base, to: '24:30' }).error, 'time');
  assert.equal(newSlots({ ...base, from: '12:00', to: '10:00' }).error, 'range');
  assert.equal(newSlots({ ...base, from: '10:00', to: '10:30' }).error, 'range');
  assert.equal(newSlots({ ...base, from: '00:00', to: '24:00', minutes: 30 }).error, 'many');
  assert.equal(24 * 2 > MAX_NEW_SLOTS, true);
  assert.deepEqual(SLOT_MINUTES, [30, 60]);
});

test('slotWrites: each slot under its coach, by its id', () => {
  const { slots } = newSlots({ date: '2026-11-21', from: '10:00', to: '12:00', minutes: 60, price: 80000, now: NOW });
  const w = slotWrites('c1', slots);
  assert.deepEqual(Object.keys(w), [`coachSlots/c1/${slotId(at(21, 10))}`, `coachSlots/c1/${slotId(at(21, 11))}`]);
  assert.deepEqual(w[`coachSlots/c1/${slotId(at(21, 10))}`], { start: at(21, 10), minutes: 60, status: 'open', price: 80000, createdAt: NOW });
  assert.deepEqual(slotWrites('c1', []), {});
});

const SLOT = { id: slotId(at(21, 10)), start: at(21, 10), minutes: 60, status: 'open', price: 80000 };

test('bookingWrites: the slot is taken, the booking says who, the lesson joins the player\'s list — one write', () => {
  const w = bookingWrites('c1', SLOT, 'p1', '  first lesson ', NOW);
  assert.deepEqual(w, {
    [`coachSlots/c1/${SLOT.id}/status`]: 'booked',
    [`coachBookings/c1/${SLOT.id}`]: { playerId: 'p1', bookedAt: NOW, note: 'first lesson' },
    [`playerLessons/p1/c1_${SLOT.id}`]: { coachId: 'c1', slotId: SLOT.id, start: SLOT.start, minutes: 60 },
  });
  // No note, no note field.
  assert.deepEqual(bookingWrites('c1', SLOT, 'p1', '', NOW)[`coachBookings/c1/${SLOT.id}`], { playerId: 'p1', bookedAt: NOW });
});

test('who booked is not on the slot', () => {
  const w = bookingWrites('c1', SLOT, 'p1', 'x', NOW);
  const onSlot = Object.entries(w).filter(([p]) => p.startsWith('coachSlots/'));
  assert.equal(JSON.stringify(onSlot).includes('p1'), false);
});

test('cancelWrites: the booking and the lesson go; the slot opens again, or goes too', () => {
  // …and a request to move the lesson goes with it: there is nothing left to move.
  assert.deepEqual(cancelWrites('c1', SLOT.id, 'p1'), {
    [`coachBookings/c1/${SLOT.id}`]: null,
    [`playerLessons/p1/c1_${SLOT.id}`]: null,
    [`coachChanges/c1/${SLOT.id}`]: null,
    [`coachSlots/c1/${SLOT.id}/status`]: 'open',
  });
  assert.deepEqual(cancelWrites('c1', SLOT.id, 'p1', { removeSlot: true }), {
    [`coachBookings/c1/${SLOT.id}`]: null,
    [`playerLessons/p1/c1_${SLOT.id}`]: null,
    [`coachChanges/c1/${SLOT.id}`]: null,
    [`coachSlots/c1/${SLOT.id}`]: null,
  });
});

// ---- several weeks at once ----
// 20 November 2026 is a Friday; NOW is that morning at eight.
test('newSlotsRepeat: the same hours on the chosen weekdays, week after week', () => {
  // Tuesdays and Thursdays 16:00–18:00 for four weeks, from Monday the 23rd.
  const out = newSlotsRepeat({ date: '2026-11-23', from: '16:00', to: '18:00', minutes: 60, price: 80000, now: NOW, days: [2, 4], weeks: 4 });
  assert.equal(out.error, null);
  assert.equal(out.slots.length, 16);                                       // 2 days × 2 hours × 4 weeks
  assert.deepEqual([...new Set(out.slots.map(s => new Date(s.start).getDay()))], [2, 4]);
  assert.deepEqual(out.slots.slice(0, 4).map(s => `${dayKey(s.start)} ${timeText(s.start)}`),
    ['2026-11-24 16:00', '2026-11-24 17:00', '2026-11-26 16:00', '2026-11-26 17:00']);
  assert.equal(dayKey(out.slots.at(-1).start), '2026-12-17');               // the fourth Thursday — over the month's end
  assert.ok(out.slots.every(s => s.status === 'open' && s.price === 80000 && s.id === slotId(s.start)));
});

test('newSlotsRepeat: no weekday chosen is the day itself, each week; one week of it is newSlots', () => {
  const weekly = newSlotsRepeat({ date: '2026-11-21', from: '10:00', to: '11:00', minutes: 60, now: NOW, weeks: 3 });
  assert.deepEqual(weekly.slots.map(s => dayKey(s.start)), ['2026-11-21', '2026-11-28', '2026-12-05']);
  const args = { date: '2026-11-21', from: '10:00', to: '13:00', minutes: 30, price: 5, now: NOW };
  assert.deepEqual(newSlotsRepeat({ ...args, weeks: 1 }), newSlots(args));
  assert.deepEqual(newSlotsRepeat(args), newSlots(args));
});

test('newSlotsRepeat: what has begun or overlaps is left out and counted, across all the days', () => {
  // From today (Friday, 08:00 now): today's 07:00 has begun; next Friday's 07:00 is one the coach already has.
  const existing = [{ start: at(27, 7), minutes: 60 }];
  const out = newSlotsRepeat({ date: '2026-11-20', from: '07:00', to: '09:00', minutes: 60, now: NOW, weeks: 2, existing });
  assert.deepEqual(out.slots.map(s => `${dayKey(s.start)} ${timeText(s.start)}`), ['2026-11-27 08:00']);
  assert.deepEqual([out.past, out.overlap], [2, 1]);
});

test('newSlotsRepeat: what it will not take', () => {
  const ok = { date: '2026-11-23', from: '10:00', to: '12:00', minutes: 60, now: NOW, days: [1], weeks: 2 };
  assert.equal(newSlotsRepeat({ ...ok, date: '2026-02-31' }).error, 'time');
  assert.equal(newSlotsRepeat({ ...ok, date: 'tomorrow' }).error, 'time');
  assert.equal(newSlotsRepeat({ ...ok, to: '10:30' }).error, 'range');
  assert.equal(newSlotsRepeat({ ...ok, minutes: 45 }).error, 'minutes');
  // Every day, 06:00–22:00 in half hours, for twelve weeks: more than one go takes.
  const flood = newSlotsRepeat({ ...ok, from: '06:00', to: '22:00', minutes: 30, days: [0, 1, 2, 3, 4, 5, 6], weeks: 12 });
  assert.deepEqual([flood.error, flood.slots.length], ['many', 0]);
  assert.ok(MAX_REPEAT_SLOTS >= 160);                                       // five days of eight lessons, for a month
  // Weeks out of range are brought in; weekdays that are not are dropped.
  assert.equal(newSlotsRepeat({ ...ok, weeks: 99 }).slots.length, 12 * 2);
  assert.equal(newSlotsRepeat({ ...ok, weeks: 0 }).slots.length, 2);
  assert.deepEqual([...new Set(newSlotsRepeat({ ...ok, days: [1, 9, -1] }).slots.map(s => new Date(s.start).getDay()))], [1]);
  assert.deepEqual(REPEAT_WEEKS, [1, 2, 3, 4, 6, 8, 12]);
});

test('weeklySeries: the same weekday and hour, week after week — the open ones a player can take', () => {
  // The coach has Tuesdays 16:00 open for four weeks; the third is taken, and the fourth is a half hour.
  const tue = (k) => new Date(2026, 10, 24 + 7 * k, 16, 0).getTime();
  const slots = [
    { id: slotId(tue(0)), start: tue(0), minutes: 60, status: 'open' },
    { id: slotId(tue(1)), start: tue(1), minutes: 60, status: 'open' },
    { id: slotId(tue(2)), start: tue(2), minutes: 60, status: 'booked' },
    { id: slotId(tue(3)), start: tue(3), minutes: 30, status: 'open' },
    { id: 'other', start: tue(1) + 3600000, minutes: 60, status: 'open' },
  ];
  const series = weeklySeries(slots, slots[0], 5, NOW);
  assert.deepEqual(series.map(x => x.start), [0, 1, 2, 3, 4].map(tue));
  assert.deepEqual(series.map(x => x.slot && x.slot.id), [slots[0].id, slots[1].id, null, null, null]);
  assert.deepEqual(weeklySeries(slots, slots[0], 1, NOW).map(x => x.slot.id), [slots[0].id]);
  // One that has begun is not there to take.
  assert.equal(weeklySeries(slots, slots[0], 1, tue(0) + 1)[0].slot, null);
});

// ---- another time for a booked lesson ----
const FROM = { id: slotId(at(24, 16)), start: at(24, 16), minutes: 60, status: 'booked', price: 80000 };
const TO = { id: slotId(at(24, 15)), start: at(24, 15), minutes: 60, status: 'open', price: 90000 };

test('moveWrites: the old time is freed and the new one taken, in one write', () => {
  assert.deepEqual(moveWrites('c1', FROM.id, TO, 'p1', ' moved ', NOW), {
    [`coachBookings/c1/${FROM.id}`]: null,
    [`playerLessons/p1/c1_${FROM.id}`]: null,
    [`coachChanges/c1/${FROM.id}`]: null,
    [`coachSlots/c1/${FROM.id}/status`]: 'open',
    [`coachSlots/c1/${TO.id}/status`]: 'booked',
    [`coachBookings/c1/${TO.id}`]: { playerId: 'p1', bookedAt: NOW, note: 'moved' },
    [`playerLessons/p1/c1_${TO.id}`]: { coachId: 'c1', slotId: TO.id, start: TO.start, minutes: 60 },
  });
});

test('asking the coach for another time, and taking the request back', () => {
  assert.deepEqual(changeRequestWrites('c1', FROM.id, 'p1', at(24, 15), '  an hour earlier ', NOW),
    { [`coachChanges/c1/${FROM.id}`]: { playerId: 'p1', wantStart: at(24, 15), at: NOW, note: 'an hour earlier' } });
  assert.equal('note' in changeRequestWrites('c1', FROM.id, 'p1', at(24, 15), ' ', NOW)[`coachChanges/c1/${FROM.id}`], false);
  assert.deepEqual(dropChangeWrites('c1', FROM.id), { [`coachChanges/c1/${FROM.id}`]: null });
});

test('changeTarget: an open slot is taken, a free hour is made, another lesson is in the way', () => {
  const other = { id: slotId(at(24, 13)), start: at(24, 13), minutes: 60, status: 'booked' };
  const slots = [FROM, TO, other];
  assert.deepEqual(changeTarget(slots, FROM, TO.start, NOW), { slot: TO, error: null });               // the open slot there
  assert.deepEqual(changeTarget(slots, FROM, at(24, 18), NOW), { slot: null, error: null });           // nothing there: one is made
  assert.deepEqual(changeTarget(slots, FROM, other.start, NOW), { slot: null, error: 'busy' });        // someone else's lesson
  assert.deepEqual(changeTarget(slots, FROM, at(24, 13, 30), NOW), { slot: null, error: 'busy' });     // would run into it
  assert.deepEqual(changeTarget(slots, FROM, at(24, 12), NOW), { slot: null, error: null });           // ends as it begins: fine
  assert.deepEqual(changeTarget(slots, FROM, at(24, 16, 30), NOW), { slot: null, error: null });       // only its own old time in the way
  assert.deepEqual(changeTarget(slots, FROM, FROM.start, NOW), { slot: null, error: 'same' });
  assert.deepEqual(changeTarget(slots, FROM, NOW - 1, NOW), { slot: null, error: 'past' });
  assert.deepEqual(changeTarget(slots, FROM, NOW, NOW), { slot: null, error: 'past' });
  // An open slot in the way of a made one is the coach's own to sort out — it is not a lesson.
  assert.deepEqual(changeTarget(slots, FROM, at(24, 14, 30), NOW), { slot: null, error: null });
});

test('approveChangeWrites: the lesson leaves its time and takes the one asked for — an open slot, or one made for it', () => {
  const request = { playerId: 'p1', wantStart: TO.start, at: NOW };
  // Onto an open slot that is there: its own length and price stay.
  assert.deepEqual(approveChangeWrites('c1', FROM, request, { slot: TO, note: 'my slice', now: NOW }), {
    [`coachBookings/c1/${FROM.id}`]: null,
    [`playerLessons/p1/c1_${FROM.id}`]: null,
    [`coachChanges/c1/${FROM.id}`]: null,
    [`coachSlots/c1/${FROM.id}/status`]: 'open',
    [`coachBookings/c1/${TO.id}`]: { playerId: 'p1', bookedAt: NOW, movedFrom: FROM.id, note: 'my slice' },
    [`playerLessons/p1/c1_${TO.id}`]: { coachId: 'c1', slotId: TO.id, start: TO.start, minutes: 60 },
    [`coachSlots/c1/${TO.id}/status`]: 'booked',
  });
  // Onto a time with no slot: one is made, the lesson's own length and price carried over.
  const made = approveChangeWrites('c1', { ...FROM, minutes: 30 }, { playerId: 'p1', wantStart: at(25, 9) }, { now: NOW });
  const to = slotId(at(25, 9));
  assert.deepEqual(made[`coachSlots/c1/${to}`], { start: at(25, 9), minutes: 30, status: 'booked', price: 80000, createdAt: NOW });
  assert.deepEqual(made[`coachBookings/c1/${to}`], { playerId: 'p1', bookedAt: NOW, movedFrom: FROM.id });
  assert.deepEqual(made[`playerLessons/p1/c1_${to}`], { coachId: 'c1', slotId: to, start: at(25, 9), minutes: 30 });
  assert.equal(`coachSlots/c1/${to}/status` in made, false);
  assert.equal(made[`coachSlots/c1/${FROM.id}/status`], 'open');
});

test('a player may cancel until twelve hours before', () => {
  assert.equal(CANCEL_HOURS, 12);
  assert.equal(canPlayerCancel(NOW + 12 * HOUR, NOW), true);
  assert.equal(canPlayerCancel(NOW + 12 * HOUR - 1, NOW), false);
  assert.equal(canPlayerCancel(NOW + 48 * HOUR, NOW), true);
  assert.equal(canPlayerCancel(NOW - HOUR, NOW), false);
});

test('the database rules carry the same twelve hours', () => {
  const rules = JSON.stringify(JSON.parse(fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8')).rules.coachBookings);
  assert.ok(rules.includes(`- now >= ${CANCEL_MS}`), 'coachBookings rule and CANCEL_MS agree');
});

const MAP = {
  [slotId(at(19, 10))]: { start: at(19, 10), minutes: 60, status: 'open' },          // yesterday
  [slotId(at(21, 11))]: { start: at(21, 11), minutes: 60, status: 'booked', price: 80000 },
  [slotId(at(21, 10))]: { start: at(21, 10), minutes: 30, status: 'open', price: 50000 },
  [slotId(at(22, 9))]: { start: at(22, 9), minutes: 60, status: 'open' },
  junk: 'x',
};

test('slotList / upcoming / openSlots: in time order, the past and the taken apart', () => {
  const list = slotList(MAP);
  assert.deepEqual(list.map(s => [dayKey(s.start), timeText(s.start), s.status]), [
    ['2026-11-19', '10:00', 'open'], ['2026-11-21', '10:00', 'open'], ['2026-11-21', '11:00', 'booked'], ['2026-11-22', '09:00', 'open'],
  ]);
  assert.equal(list[1].id, slotId(at(21, 10)));
  assert.equal(upcoming(list, NOW).length, 3);
  assert.deepEqual(openSlots(list, NOW).map(s => timeText(s.start)), ['10:00', '09:00']);
  assert.deepEqual(slotList(null), []);
});

test('byDay: slots under their day', () => {
  const days = byDay(upcoming(slotList(MAP), NOW));
  assert.deepEqual(days.map(d => [d.day, d.slots.map(s => timeText(s.start))]), [
    ['2026-11-21', ['10:00', '11:00']], ['2026-11-22', ['09:00']],
  ]);
  assert.deepEqual(byDay([]), []);
});

test('myLessons: a member\'s lessons to come, with the price — and one whose time the coach withdrew', () => {
  const lessons = {
    [`c1_${slotId(at(21, 11))}`]: { coachId: 'c1', slotId: slotId(at(21, 11)), start: at(21, 11), minutes: 60 },
    [`c2_${slotId(at(23, 9))}`]: { coachId: 'c2', slotId: slotId(at(23, 9)), start: at(23, 9), minutes: 30 },   // the slot is gone
    [`c1_${slotId(at(19, 10))}`]: { coachId: 'c1', slotId: slotId(at(19, 10)), start: at(19, 10), minutes: 60 }, // past
    [`c1_${slotId(at(22, 9))}`]: { coachId: 'c1', slotId: slotId(at(22, 9)), start: at(22, 9), minutes: 60 },    // reopened behind the player's back
  };
  const out = myLessons(lessons, { c1: MAP }, NOW);
  assert.deepEqual(out.map(l => [l.coachId, timeText(l.start), l.minutes, l.price, l.gone]), [
    ['c1', '11:00', 60, 80000, false],
    ['c1', '09:00', 60, 0, true],
    ['c2', '09:00', 30, 0, true],
  ]);
  assert.deepEqual(myLessons(null, {}, NOW), []);
});

test('applyWrites: local mode books and cancels as the database would', () => {
  const { slots } = newSlots({ date: '2026-11-21', from: '10:00', to: '12:00', minutes: 60, price: 80000, now: NOW });
  let tree = applyWrites({}, slotWrites('c1', slots));
  assert.deepEqual(Object.keys(tree.coachSlots.c1), slots.map(s => s.id));
  tree = applyWrites(tree, bookingWrites('c1', slots[0], 'p1', 'hello', NOW));
  assert.equal(tree.coachSlots.c1[slots[0].id].status, 'booked');
  assert.equal(tree.coachSlots.c1[slots[0].id].price, 80000);              // the rest of the slot is untouched
  assert.equal(tree.coachBookings.c1[slots[0].id].playerId, 'p1');
  assert.equal(tree.playerLessons.p1[`c1_${slots[0].id}`].start, slots[0].start);
  const before = JSON.stringify(tree);
  const after = applyWrites(tree, cancelWrites('c1', slots[0].id, 'p1'));
  assert.equal(JSON.stringify(tree), before, 'the tree it was given is not changed');
  assert.equal(after.coachSlots.c1[slots[0].id].status, 'open');
  assert.equal(after.coachBookings.c1[slots[0].id], undefined);
  assert.equal(after.playerLessons.p1[`c1_${slots[0].id}`], undefined);
  const gone = applyWrites(tree, cancelWrites('c1', slots[0].id, 'p1', { removeSlot: true }));
  assert.equal(gone.coachSlots.c1[slots[0].id], undefined);
  assert.equal(gone.coachSlots.c1[slots[1].id].status, 'open');
});

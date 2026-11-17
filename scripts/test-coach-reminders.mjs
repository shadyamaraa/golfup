// scripts/test-coach-reminders.mjs
// Lesson reminders from the server (functions/coaching.js) against a made-up
// club: which lessons are announced and when, that none is announced twice,
// and what the notice says.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const coaching = require('../functions/coaching.js');

const HOUR = 60 * 60 * 1000;
// 12:00 in Ulaanbaatar (UTC+8) on 17 November 2026.
const NOW = Date.parse('2026-11-17T04:00:00.000Z');
const id = (start) => 's' + start;
const slot = (start, status = 'booked') => ({ start, minutes: 60, status, price: 80000, createdAt: 1 });
// One coach (c1), a lesson `ahead` from now, booked `bookedAgo` ago by p1.
const club = (ahead, bookedAgo, over = {}) => {
  const start = NOW + ahead;
  return {
    start,
    slots: { c1: { [id(start)]: slot(start, over.status) } },
    bookings: over.noBooking ? {} : { c1: { [id(start)]: { playerId: 'p1', bookedAt: NOW - bookedAgo } } },
  };
};
const kinds = (out) => out.due.map(d => d.kind);

test('a lesson is announced a day before, and again two hours before', () => {
  const far = club(30 * HOUR, 5 * HOUR);
  assert.deepEqual(coaching.dueReminders(far.slots, far.bookings, {}, NOW), { due: [], marks: {} }, 'thirty hours off: nothing yet');

  const day = club(23 * HOUR, 30 * HOUR);
  const out = coaching.dueReminders(day.slots, day.bookings, {}, NOW);
  assert.deepEqual(out.due, [{ coachId: 'c1', slotId: id(day.start), kind: 'day', playerId: 'p1', start: day.start }]);
  assert.deepEqual(out.marks, { [`c1/${id(day.start)}/day`]: NOW - 30 * HOUR });

  const soon = club(90 * 60 * 1000, 30 * HOUR);
  const sent = { c1: { [id(soon.start)]: { day: NOW - 30 * HOUR } } };
  assert.deepEqual(kinds(coaching.dueReminders(soon.slots, soon.bookings, sent, NOW)), ['soon']);
});

test('the window\'s edge: exactly a day ahead is due, a minute more is not', () => {
  const at = club(24 * HOUR, 30 * HOUR);
  assert.deepEqual(kinds(coaching.dueReminders(at.slots, at.bookings, {}, NOW)), ['day']);
  const over = club(24 * HOUR + 60000, 30 * HOUR);
  assert.deepEqual(kinds(coaching.dueReminders(over.slots, over.bookings, {}, NOW)), []);
});

test('a reminder is not sent twice', () => {
  const c = club(23 * HOUR, 30 * HOUR);
  const first = coaching.dueReminders(c.slots, c.bookings, {}, NOW);
  // The marks as the database would hold them after the first run.
  const sent = { c1: { [id(c.start)]: { day: first.marks[`c1/${id(c.start)}/day`] } } };
  assert.deepEqual(coaching.dueReminders(c.slots, c.bookings, sent, NOW + HOUR / 2), { due: [], marks: {} });
});

test('booked inside a window: marked, not announced for it', () => {
  // Booked an hour ago for a lesson five hours off: no «day» reminder —
  // and the «soon» one is still to come.
  const c = club(5 * HOUR, HOUR);
  const out = coaching.dueReminders(c.slots, c.bookings, {}, NOW);
  assert.deepEqual(out.due, []);
  assert.deepEqual(Object.keys(out.marks), [`c1/${id(c.start)}/day`]);
  const later = coaching.dueReminders(c.slots, c.bookings, { c1: { [id(c.start)]: { day: NOW - HOUR } } }, NOW + 3.5 * HOUR);
  assert.deepEqual(kinds(later), ['soon']);
  // Booked half an hour before it begins: nothing at all.
  const late = club(HOUR / 2, 10 * 60 * 1000);
  assert.deepEqual(coaching.dueReminders(late.slots, late.bookings, {}, NOW).due, []);
});

test('both due at once (the job was down): the nearer one goes, both are marked', () => {
  const c = club(HOUR, 30 * HOUR);
  const out = coaching.dueReminders(c.slots, c.bookings, {}, NOW);
  assert.deepEqual(kinds(out), ['soon']);
  assert.deepEqual(Object.keys(out.marks).sort(), [`c1/${id(c.start)}/day`, `c1/${id(c.start)}/soon`]);
});

test('only a booked lesson still to come is announced', () => {
  for (const [what, c] of [
    ['an open slot', club(23 * HOUR, 30 * HOUR, { status: 'open', noBooking: true })],
    ['a booked slot with no booking', club(23 * HOUR, 30 * HOUR, { noBooking: true })],
    ['an open slot with a booking left behind', club(23 * HOUR, 30 * HOUR, { status: 'open' })],
    ['a lesson that has begun', club(-HOUR, 30 * HOUR)],
    ['a lesson beginning this instant', club(0, 30 * HOUR)],
  ]) assert.deepEqual(coaching.dueReminders(c.slots, c.bookings, {}, NOW).due, [], what);
});

test('a slot cancelled and booked again by someone else starts over', () => {
  const c = club(23 * HOUR, 30 * HOUR);
  const sent = { c1: { [id(c.start)]: { day: NOW - 30 * HOUR } } };
  // Same slot, a new booking made two days ago by p2 (so before the window).
  const again = { c1: { [id(c.start)]: { playerId: 'p2', bookedAt: NOW - 48 * HOUR } } };
  const out = coaching.dueReminders(c.slots, again, sent, NOW);
  assert.deepEqual(out.due.map(d => [d.kind, d.playerId]), [['day', 'p2']]);
});

test('a mark for a lesson that is over, cancelled or withdrawn is cleared', () => {
  const live = club(23 * HOUR, 30 * HOUR);
  const liveId = id(live.start);
  const past = NOW - HOUR;
  const slots = { c1: { ...live.slots.c1, [id(past)]: slot(past), s9: slot(NOW + 5 * HOUR, 'open') } };
  const bookings = { c1: { ...live.bookings.c1, [id(past)]: { playerId: 'p1', bookedAt: 1 } } };
  const sent = { c1: { [liveId]: { day: NOW - 30 * HOUR }, [id(past)]: { day: 1, soon: 1 }, s9: { day: 1 }, sGone: { day: 1 } } };
  const out = coaching.dueReminders(slots, bookings, sent, NOW);
  assert.deepEqual(out.marks, { [`c1/${id(past)}`]: null, 'c1/s9': null, 'c1/sGone': null });
  assert.deepEqual(out.due, []);
});

test('what the notice says: the club\'s own clock, the other one\'s name', () => {
  // 02:00 UTC on the 18th is 10:00 in Ulaanbaatar — tomorrow, by the club's clock.
  const start = Date.parse('2026-11-18T02:00:00.000Z');
  assert.equal(coaching.whenText(start, NOW), 'Маргааш 10:00');
  assert.equal(coaching.whenText(NOW + 2 * HOUR, NOW), 'Өнөөдөр 14:00');
  assert.equal(coaching.whenText(Date.parse('2026-11-19T07:30:00.000Z'), NOW), '11-р сарын 19, 15:30');
  // 23:30 in Ulaanbaatar is still today there, though already tomorrow in UTC... and the reverse.
  assert.equal(coaching.whenText(Date.parse('2026-11-17T15:30:00.000Z'), NOW), 'Өнөөдөр 23:30');
  assert.equal(coaching.whenText(Date.parse('2026-11-17T16:30:00.000Z'), NOW), 'Маргааш 00:30');

  const users = { c1: { firstName: 'Bold', lastName: 'B' }, p1: { username: 'nomin' } };
  const [toPlayer, toCoach] = coaching.noticesFor({ coachId: 'c1', slotId: 's1', kind: 'day', playerId: 'p1', start }, users, NOW);
  assert.deepEqual(toPlayer, { to: 'p1', notice: {
    type: 'tn_sched', kind: 'coach', title: 'Хичээлийн сануулга', link: '#/coaching', tag: 'coach_s1_day',
    body: 'Маргааш 10:00 · дасгалжуулагч Bold B',
  } });
  assert.equal(toCoach.to, 'c1');
  assert.equal(toCoach.notice.body, 'Маргааш 10:00 · nomin');
  // A member who cannot be read: the time alone.
  const [bare] = coaching.noticesFor({ coachId: 'c1', slotId: 's1', kind: 'soon', playerId: 'p1', start }, {}, NOW);
  assert.equal(bare.notice.body, 'Маргааш 10:00');
});

// ---- a whole run ----
function fakeClub(c, { failNotify = false, sent = null } = {}) {
  const tree = { coachSlots: c.slots, coachBookings: c.bookings, coachReminded: sent };
  const log = [];
  return {
    tree, log, notices: [],
    deps: {
      now: () => NOW,
      read: async (path) => tree[path] ?? null,
      mark: async (writes) => {
        log.push('mark');
        tree.coachReminded = tree.coachReminded || {};
        for (const [path, value] of Object.entries(writes)) {
          const [coach, slotKey, kind] = path.split('/');
          tree.coachReminded[coach] = tree.coachReminded[coach] || {};
          if (value === null) delete tree.coachReminded[coach][slotKey];
          else (tree.coachReminded[coach][slotKey] = tree.coachReminded[coach][slotKey] || {})[kind] = value;
        }
      },
      loadUser: async (uid) => ({ c1: { firstName: 'Bold' }, p1: { firstName: 'Nomin' } })[uid] || null,
      notify: async function (to, notice) {
        log.push('notify');
        if (failNotify) throw new Error('no such member');
        this.sentTo = (this.sentTo || []).concat(to);
        this.last = notice;
      },
    },
  };
}

test('a run: marks first, then the player and the coach are told — once', async () => {
  const f = fakeClub(club(23 * HOUR, 30 * HOUR));
  assert.deepEqual(await coaching.remind(f.deps), { reminders: 1, sent: 2, failed: 0 });
  assert.deepEqual(f.log, ['mark', 'notify', 'notify'], 'marked before anything is sent');
  assert.deepEqual(f.deps.sentTo, ['p1', 'c1']);
  assert.equal(f.deps.last.body, 'Маргааш 11:00 · Nomin');
  // The next run finds the mark and says nothing.
  f.log.length = 0;
  assert.deepEqual(await coaching.remind(f.deps), { reminders: 0, sent: 0, failed: 0 });
  assert.deepEqual(f.log, []);
});

test('a run: nothing booked, nothing read amiss — an empty club', async () => {
  const f = fakeClub({ slots: null, bookings: null });
  assert.deepEqual(await coaching.remind(f.deps), { reminders: 0, sent: 0, failed: 0 });
  assert.deepEqual(f.log, []);
});

test('a run: a notice that cannot be sent is counted, and not tried again', async () => {
  const f = fakeClub(club(23 * HOUR, 30 * HOUR), { failNotify: true });
  assert.deepEqual(await coaching.remind(f.deps), { reminders: 1, sent: 0, failed: 2 });
  f.deps.notify = async () => { throw new Error('must not be called'); };
  assert.deepEqual(await coaching.remind(f.deps), { reminders: 0, sent: 0, failed: 0 });
});

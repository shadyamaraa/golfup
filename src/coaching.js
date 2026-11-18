// src/coaching.js
// Coaching — a lesson booked with a coach. Pure: no network, no Firebase, no DOM.
//
// A coach is a member an admin has made one. The coach opens slots — a start
// and a length — and a member books one; it is theirs at once. Payment is
// between the two of them for now (the price is shown), not through the app.
//
//   coaches/{coachId}                 { active, bio, place, price30, price60,
//                                       updatedAt, approvedBy, approvedAt }
//   coachSlots/{coachId}/{slotId}     { start, minutes, status, price, createdAt }
//                                       status: 'open' | 'booked' — every member reads
//   coachBookings/{coachId}/{slotId}  { playerId, bookedAt, note }
//                                       — the coach and that player read
//   playerLessons/{playerId}/{key}    { coachId, slotId, start, minutes }
//                                       — the player's own list
//   coachChanges/{coachId}/{slotId}   { playerId, wantStart, note, at }
//                                       — the player of a booked lesson asks for
//                                         another time; the coach says yes or no
//
// Who booked is not on the slot: other members see only that it is taken.
// Booking is one write to three places (bookingWrites), cancelling another
// (cancelWrites); the database rules let each through only whole and only
// from the right person — database.rules.json, docs/coaching.md.

export const SLOT_MINUTES = [30, 60];
// A player may cancel until this long before the lesson; after that it is
// the coach's to cancel. The database rules carry the same number
// (CANCEL_MS) — scripts/test-coaching.mjs checks they agree.
export const CANCEL_HOURS = 12;
export const CANCEL_MS = CANCEL_HOURS * 60 * 60 * 1000;
// So many slots opened in one go: a long day in half hours, and to spare.
export const MAX_NEW_SLOTS = 40;
// … and over several weeks at once: a full week of days, for three months.
export const MAX_REPEAT_SLOTS = 400;
// How many weeks a coach may open — or a player take — in one go.
export const REPEAT_WEEKS = [1, 2, 3, 4, 6, 8, 12];
// The rest a coach may leave between one lesson and the next, in minutes.
export const GAP_MINUTES = [0, 5, 10, 15, 20, 30];
const BIO_MAX = 600;
const PLACE_MAX = 120;
const NOTE_MAX = 300;
const PRICE_MAX = 10000000;

const MIN = 60 * 1000;

/** A slot's key under its coach: its start. One slot to a start, sorted by time. */
export const slotId = (start) => 's' + String(Math.round(Number(start)));

/** A lesson's key in the player's own list. */
export const lessonKey = (coachId, id) => `${coachId}_${id}`;

/** Is this member a coach taking bookings? `coaches` is coaches/* by member id. */
export function isCoach(coaches, memberId) {
  return !!(memberId && coaches && coaches[memberId] && coaches[memberId].active === true);
}

const price = (v) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, PRICE_MAX) : 0;
};

/** What a coach may say of themselves, as typed → as stored. */
export function cleanProfile(input) {
  const i = input || {};
  return {
    bio: String(i.bio ?? '').trim().slice(0, BIO_MAX),
    place: String(i.place ?? '').trim().slice(0, PLACE_MAX),
    price30: price(i.price30),
    price60: price(i.price60),
  };
}

/** A coach's price for a lesson of this length; 0 when they have not set one. */
export function priceOf(profile, minutes) {
  const p = profile || {};
  return price(minutes === 30 ? p.price30 : p.price60);
}

/** A note a player leaves with a booking, as typed → as stored. */
export const cleanNote = (v) => String(v ?? '').trim().slice(0, NOTE_MAX);

// 'YYYY-MM-DD' + 'HH:MM' in the device's own time → ms, or NaN.
function at(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
  if (!d || !t) return NaN;
  const [y, mo, day] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])];
  const [h, m] = [Number(t[1]), Number(t[2])];
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return NaN;
  // 31 February is not a day; Date would roll it into March.
  const midnight = new Date(y, mo, day);
  if (midnight.getMonth() !== mo || midnight.getDate() !== day) return NaN;
  return new Date(y, mo, day, h, m, 0, 0).getTime();   // 24:00 is the next day's midnight
}

/** 'YYYY-MM-DD' and 'HH:MM' in the device's own time → the moment, or NaN. */
export const momentOf = (date, time) => at(date, time);

const overlaps = (aStart, aMin, bStart, bMin) => aStart < bStart + bMin * MIN && bStart < aStart + aMin * MIN;

/**
 * The slots a coach opens in one go: a lesson of `minutes` from `from`, then
 * the next after a rest of `gap` minutes, until `to` on `date`. A slot that
 * has already begun, or that overlaps one the coach already has (`existing`,
 * any status), is left out and counted.
 *
 * Lunch (`lunchFrom`–`lunchTo`, both or neither): no lesson runs into it —
 * one that would is not opened, and the day goes on from the end of lunch.
 *
 * @returns {{ slots: object[], past: number, overlap: number, error: string|null }}
 *   error: 'minutes' | 'time' | 'range' | 'many' | 'lunch' | null
 */
export function newSlots({ date, from, to, minutes, price: slotPrice, existing = [], now = Date.now(), gap = 0, lunchFrom = '', lunchTo = '' }) {
  const none = (error) => ({ slots: [], past: 0, overlap: 0, error });
  const len = Number(minutes);
  if (!SLOT_MINUTES.includes(len)) return none('minutes');
  const first = at(date, from);
  const end = at(date, to);
  if (!Number.isFinite(first) || !Number.isFinite(end)) return none('time');
  if (end - first < len * MIN) return none('range');
  if ((end - first) / (len * MIN) > MAX_NEW_SLOTS) return none('many');
  const rest = Math.max(0, Math.min(120, Math.round(Number(gap)) || 0)) * MIN;
  const lunch = String(lunchFrom || '').trim() || String(lunchTo || '').trim()
    ? [at(date, lunchFrom), at(date, lunchTo)] : null;
  if (lunch && !(Number.isFinite(lunch[0]) && Number.isFinite(lunch[1]) && lunch[1] > lunch[0])) return none('lunch');

  const taken = (existing || []).filter(s => s && Number.isFinite(Number(s.start)));
  const slots = [];
  let past = 0;
  let overlap = 0;
  let start = first;
  while (start + len * MIN <= end) {
    // Into lunch: not this one — on from where lunch ends, with no rest to wait out.
    if (lunch && start < lunch[1] && start + len * MIN > lunch[0]) { start = lunch[1]; continue; }
    if (start <= now) past++;
    else if (taken.some(s => overlaps(start, len, Number(s.start), Number(s.minutes) || 60))) overlap++;
    else slots.push({ id: slotId(start), start, minutes: len, status: 'open', price: price(slotPrice), createdAt: now });
    start += len * MIN + rest;
  }
  return { slots, past, overlap, error: null };
}

/**
 * The same hours opened on several days at once: on each chosen weekday,
 * from `date` on, for `weeks` weeks. `days` are weekdays as Date has them —
 * 0 Sunday … 6 Saturday; none chosen means the weekday of `date` itself.
 * Counts and errors as newSlots; 'many' when it comes to more than
 * MAX_REPEAT_SLOTS.
 */
export function newSlotsRepeat({ date, from, to, minutes, price: slotPrice, existing = [], now = Date.now(), days = [], weeks = 1, gap = 0, lunchFrom = '', lunchTo = '' }) {
  const none = (error) => ({ slots: [], past: 0, overlap: 0, error });
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!d || !Number.isFinite(at(date, '00:00'))) return none('time');
  const [y, mo, day] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])];
  const want = new Set((days || []).map(Number).filter(n => n >= 0 && n <= 6));
  if (!want.size) want.add(new Date(y, mo, day).getDay());
  const span = Math.max(1, Math.min(12, Math.round(Number(weeks)) || 1)) * 7;
  const total = { slots: [], past: 0, overlap: 0, error: null };
  for (let i = 0; i < span; i++) {
    const on = new Date(y, mo, day + i);
    if (!want.has(on.getDay())) continue;
    const one = newSlots({ date: dayKey(on.getTime()), from, to, minutes, price: slotPrice, existing, now, gap, lunchFrom, lunchTo });
    if (one.error) return none(one.error);
    total.slots.push(...one.slots);
    total.past += one.past;
    total.overlap += one.overlap;
    if (total.slots.length > MAX_REPEAT_SLOTS) return none('many');
  }
  return total;
}

/**
 * The same weekday and hour in the weeks from `first` on: one entry a week,
 * with the coach's open slot of the same length at that moment, or null
 * when there is none to take. `first` itself is week one.
 */
export function weeklySeries(slots, first, weeks, now = Date.now()) {
  const d = new Date(first.start);
  const free = openSlots(slots, now);
  const out = [];
  for (let k = 0; k < Math.max(1, Math.round(Number(weeks)) || 1); k++) {
    // By the calendar, not by adding hours: the same clock time across a change of clocks.
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * k, d.getHours(), d.getMinutes()).getTime();
    const slot = free.find(s => s.start === start && s.minutes === first.minutes) || null;
    out.push({ start, slot });
  }
  return out;
}

/** The write that opens slots. Paths from the database root. */
export function slotWrites(coachId, slots) {
  const out = {};
  for (const s of slots || []) {
    // eslint-disable-next-line no-unused-vars
    const { id, ...record } = s;
    out[`coachSlots/${coachId}/${id}`] = record;
  }
  return out;
}

/**
 * The write that books a slot: the slot is taken, the booking says who, and
 * the lesson joins the player's own list — all three or none.
 */
export function bookingWrites(coachId, slot, playerId, note, now = Date.now()) {
  const id = slot.id;
  const booking = { playerId, bookedAt: now };
  const n = cleanNote(note);
  if (n) booking.note = n;
  return {
    [`coachSlots/${coachId}/${id}/status`]: 'booked',
    [`coachBookings/${coachId}/${id}`]: booking,
    [`playerLessons/${playerId}/${lessonKey(coachId, id)}`]: {
      coachId, slotId: id, start: slot.start, minutes: slot.minutes,
    },
  };
}

/**
 * The write that undoes a booking. The slot opens again — or goes too, when
 * the coach is withdrawing the time itself (`removeSlot`).
 */
export function cancelWrites(coachId, id, playerId, { removeSlot = false } = {}) {
  const out = {
    [`coachBookings/${coachId}/${id}`]: null,
    [`playerLessons/${playerId}/${lessonKey(coachId, id)}`]: null,
    // a request to move this lesson has nothing left to move
    [`coachChanges/${coachId}/${id}`]: null,
  };
  if (removeSlot) out[`coachSlots/${coachId}/${id}`] = null;
  else out[`coachSlots/${coachId}/${id}/status`] = 'open';
  return out;
}

/**
 * The write that moves a player's lesson to another of the coach's open
 * slots — the old time freed and the new one taken, both or neither. The
 * player's own to make while they may still cancel the old one.
 */
export function moveWrites(coachId, fromId, toSlot, playerId, note, now = Date.now()) {
  return { ...cancelWrites(coachId, fromId, playerId), ...bookingWrites(coachId, toSlot, playerId, note, now) };
}

/** The write that asks the coach to move a booked lesson to another time. */
export function changeRequestWrites(coachId, id, playerId, wantStart, note, now = Date.now()) {
  const request = { playerId, wantStart: Math.round(Number(wantStart)), at: now };
  const n = cleanNote(note);
  if (n) request.note = n;
  return { [`coachChanges/${coachId}/${id}`]: request };
}

/** The write that takes a request back, or turns it down. */
export const dropChangeWrites = (coachId, id) => ({ [`coachChanges/${coachId}/${id}`]: null });

/**
 * Can the coach grant a request, and how? `slots` is the coach's list
 * (slotList), `from` the lesson's own slot, `wantStart` the time asked for.
 *
 * @returns {{ slot: object|null, error: string|null }}
 *   slot: the open slot already at that time, to take — or null, to make one
 *   error: 'past' | 'same' | 'busy' (another lesson is there, or would overlap) | null
 */
export function changeTarget(slots, from, wantStart, now = Date.now()) {
  const start = Math.round(Number(wantStart));
  if (!(start > now)) return { slot: null, error: 'past' };
  if (start === from.start) return { slot: null, error: 'same' };
  const others = (slots || []).filter(s => s.id !== from.id);
  const there = others.find(s => s.start === start) || null;
  if (there && there.status !== 'open') return { slot: null, error: 'busy' };
  // The open slot at that moment is taken, or — with none there — one is made:
  // either way not across another lesson.
  const minutes = there ? there.minutes : from.minutes;
  const clash = others.some(s => s.status === 'booked' && overlaps(start, minutes, s.start, s.minutes));
  return clash ? { slot: null, error: 'busy' } : { slot: there, error: null };
}

/**
 * The write with which the coach grants a request: the lesson leaves its old
 * time (which opens again) and takes the one asked for — an open slot that
 * is there (`slot`), or a new one made for it. One write, the request gone
 * with it.
 *
 * `slots` is the coach's list: the open times the moved lesson would run
 * into are withdrawn in the same write — left open, another member could
 * book one and the coach would be in two places. The old time itself opens
 * again only when the lesson does not run into it.
 */
export function approveChangeWrites(coachId, from, request, { slot = null, note = '', now = Date.now(), slots = [] } = {}) {
  const playerId = request.playerId;
  const start = slot ? slot.start : Math.round(Number(request.wantStart));
  const minutes = slot ? slot.minutes : from.minutes;
  const to = slotId(start);
  const booking = { playerId, bookedAt: now, movedFrom: from.id };
  const n = cleanNote(note);
  if (n) booking.note = n;
  const out = {
    ...cancelWrites(coachId, from.id, playerId, { removeSlot: overlaps(start, minutes, from.start, from.minutes) }),
    [`coachBookings/${coachId}/${to}`]: booking,
    [`playerLessons/${playerId}/${lessonKey(coachId, to)}`]: { coachId, slotId: to, start, minutes },
  };
  if (slot) out[`coachSlots/${coachId}/${to}/status`] = 'booked';
  else out[`coachSlots/${coachId}/${to}`] = { start, minutes, status: 'booked', price: price(from.price), createdAt: now };
  for (const s of slots || []) {
    if (s.id !== to && s.status === 'open' && overlaps(start, minutes, s.start, s.minutes)) {
      out[`coachSlots/${coachId}/${s.id}`] = null;
    }
  }
  return out;
}

/** May the player still cancel this lesson themselves? */
export function canPlayerCancel(start, now = Date.now()) {
  return Number(start) - now >= CANCEL_MS;
}

/** coachSlots/{coachId} as stored → a list with ids, soonest first. */
export function slotList(map) {
  return Object.entries(map || {})
    .filter(([, s]) => s && typeof s === 'object' && Number.isFinite(Number(s.start)))
    .map(([id, s]) => ({ id, ...s, start: Number(s.start), minutes: Number(s.minutes) || 60 }))
    .sort((a, b) => a.start - b.start);
}

/** The slots still to come. */
export const upcoming = (slots, now = Date.now()) => (slots || []).filter(s => s.start > now);

/**
 * The slots a member can book now: open, still to come — and not across a
 * lesson someone has booked (a slot made for a moved lesson can lie over an
 * open one; that one is no longer there to take).
 */
export function openSlots(slots, now = Date.now()) {
  const booked = (slots || []).filter(s => s.status === 'booked');
  return upcoming(slots, now).filter(s => s.status === 'open'
    && !booked.some(b => overlaps(s.start, s.minutes, b.start, b.minutes)));
}

/** 'YYYY-MM-DD' of a moment, in the device's own time. */
export function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'HH:MM' of a moment, in the device's own time. */
export function timeText(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Slots grouped by day, days and slots in order: [{ day, slots }]. */
export function byDay(slots) {
  const days = new Map();
  for (const s of [...(slots || [])].sort((a, b) => a.start - b.start)) {
    const k = dayKey(s.start);
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(s);
  }
  return [...days].map(([day, list]) => ({ day, slots: list }));
}

/**
 * A member's lessons to come, each with its slot and coach when they can
 * still be found. `lessons` is playerLessons/{playerId}; `slotsByCoach` is
 * { coachId: coachSlots/{coachId} }.
 */
export function myLessons(lessons, slotsByCoach, now = Date.now()) {
  return Object.entries(lessons || {})
    .filter(([, l]) => l && typeof l === 'object' && Number(l.start) > now)
    .map(([key, l]) => {
      const slot = ((slotsByCoach || {})[l.coachId] || {})[l.slotId] || null;
      return {
        key, coachId: l.coachId, slotId: l.slotId, start: Number(l.start), minutes: Number(l.minutes) || 60,
        price: slot ? price(slot.price) : 0,
        // The coach withdrew the time and this entry was left behind.
        gone: !slot || slot.status !== 'booked',
      };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * Writes laid over a tree, as the database would: a value at a path, null
 * to remove. For local mode, where there is no database to do it.
 */
export function applyWrites(tree, writes) {
  const out = JSON.parse(JSON.stringify(tree || {}));
  for (const [path, value] of Object.entries(writes || {})) {
    const keys = path.split('/').filter(Boolean);
    let node = out;
    for (const k of keys.slice(0, -1)) {
      if (!node[k] || typeof node[k] !== 'object') node[k] = {};
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = JSON.parse(JSON.stringify(value));
  }
  return out;
}

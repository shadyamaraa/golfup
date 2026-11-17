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

const overlaps = (aStart, aMin, bStart, bMin) => aStart < bStart + bMin * MIN && bStart < aStart + aMin * MIN;

/**
 * The slots a coach opens in one go: every `minutes` from `from` until `to`
 * on `date`. A slot that has already begun, or that overlaps one the coach
 * already has (`existing`, any status), is left out and counted.
 *
 * @returns {{ slots: object[], past: number, overlap: number, error: string|null }}
 *   error: 'minutes' | 'time' | 'range' | 'many' | null
 */
export function newSlots({ date, from, to, minutes, price: slotPrice, existing = [], now = Date.now() }) {
  const none = (error) => ({ slots: [], past: 0, overlap: 0, error });
  const len = Number(minutes);
  if (!SLOT_MINUTES.includes(len)) return none('minutes');
  const first = at(date, from);
  const end = at(date, to);
  if (!Number.isFinite(first) || !Number.isFinite(end)) return none('time');
  if (end - first < len * MIN) return none('range');
  if ((end - first) / (len * MIN) > MAX_NEW_SLOTS) return none('many');

  const taken = (existing || []).filter(s => s && Number.isFinite(Number(s.start)));
  const slots = [];
  let past = 0;
  let overlap = 0;
  for (let start = first; start + len * MIN <= end; start += len * MIN) {
    if (start <= now) { past++; continue; }
    if (taken.some(s => overlaps(start, len, Number(s.start), Number(s.minutes) || 60))) { overlap++; continue; }
    slots.push({ id: slotId(start), start, minutes: len, status: 'open', price: price(slotPrice), createdAt: now });
  }
  return { slots, past, overlap, error: null };
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
  };
  if (removeSlot) out[`coachSlots/${coachId}/${id}`] = null;
  else out[`coachSlots/${coachId}/${id}/status`] = 'open';
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

/** The slots a member can book now. */
export const openSlots = (slots, now = Date.now()) => upcoming(slots, now).filter(s => s.status === 'open');

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

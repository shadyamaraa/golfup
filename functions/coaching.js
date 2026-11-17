// functions/coaching.js
// Reminders for a lesson booked with a coach (src/coaching.js,
// docs/coaching.md). No Firebase in here: what is read and written is handed
// in, so scripts/test-coach-reminders.mjs can run it against a made-up club.
//
// A booked lesson is announced twice, to the player and to the coach: a day
// before — while the player can still cancel it themselves — and two hours
// before. A lesson booked inside a window is not announced for that window:
// the player has only just chosen the time.
//
//   coachReminded/{coachId}/{slotId}/{day|soon} = the booking's bookedAt
//
// is the server's own mark (no rule names it, so no browser reads or writes
// it) that keeps a reminder from going twice.

'use strict';

const HOUR = 60 * 60 * 1000;
// Nearest first: when both are due at once (the job was down), the nearer
// one is sent and the other only marked.
const KINDS = [
  { kind: 'soon', ahead: 2 * HOUR },
  { kind: 'day', ahead: 24 * HOUR },
];
const ZONE = 'Asia/Ulaanbaatar';

function memberName(u) {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.fullName || u.name || u.username || '';
}

// The club's own clock: { day: 'YYYY-MM-DD', month, date, time: 'HH:MM' }.
function clubTime(ms) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    month: Number(parts.month), date: Number(parts.day), time: `${parts.hour}:${parts.minute}`,
  };
}

/** «Өнөөдөр 10:00», «Маргааш 10:00», «11-р сарын 19, 10:00» — by the club's clock. */
function whenText(start, now) {
  const at = clubTime(start);
  if (at.day === clubTime(now).day) return `Өнөөдөр ${at.time}`;
  if (at.day === clubTime(now + 24 * HOUR).day) return `Маргааш ${at.time}`;
  return `${at.month}-р сарын ${at.date}, ${at.time}`;
}

/**
 * The reminders due now, and the marks to keep. Pure.
 *
 * @param {object} slots     coachSlots as stored: { coachId: { slotId: slot } }
 * @param {object} bookings  coachBookings as stored
 * @param {object} sent      coachReminded as stored
 * @param {number} now
 * @returns {{ due: object[], marks: object }}
 *   due: [{ coachId, slotId, kind, playerId, start }]
 *   marks: paths under coachReminded → the booking's time, or null for a mark no longer needed
 */
function dueReminders(slots, bookings, sent, now) {
  const due = [];
  const marks = {};
  for (const [coachId, bySlot] of Object.entries(slots || {})) {
    for (const [slotId, slot] of Object.entries(bySlot || {})) {
      const start = Number(slot && slot.start);
      const booking = ((bookings || {})[coachId] || {})[slotId];
      if (!slot || slot.status !== 'booked' || !booking || !booking.playerId) continue;
      if (!(start > now)) continue;
      // The mark is the booking it was sent for: a slot cancelled and booked
      // again by someone else starts over.
      const bookedAt = Number(booking.bookedAt) || 0;
      const done = ((sent || {})[coachId] || {})[slotId] || {};
      let said = false;
      for (const { kind, ahead } of KINDS) {
        if (start - now > ahead || done[kind] === bookedAt) continue;
        marks[`${coachId}/${slotId}/${kind}`] = bookedAt;
        // Booked inside this window, or a nearer reminder is going now.
        if (said || !(bookedAt < start - ahead)) continue;
        due.push({ coachId, slotId, kind, playerId: booking.playerId, start });
        said = true;
      }
    }
  }
  // A mark for a lesson that is over, cancelled or withdrawn has done its work.
  for (const [coachId, bySlot] of Object.entries(sent || {})) {
    for (const slotId of Object.keys(bySlot || {})) {
      const slot = ((slots || {})[coachId] || {})[slotId];
      const booking = ((bookings || {})[coachId] || {})[slotId];
      if (!slot || !booking || slot.status !== 'booked' || !(Number(slot.start) > now)) marks[`${coachId}/${slotId}`] = null;
    }
  }
  return { due, marks };
}

/** The two notices of one reminder: to the player and to the coach. */
function noticesFor(item, users, now) {
  const when = whenText(item.start, now);
  const base = { type: 'tn_sched', kind: 'coach', title: 'Хичээлийн сануулга', link: '#/coaching', tag: `coach_${item.slotId}_${item.kind}` };
  const coach = memberName(users[item.coachId]);
  const player = memberName(users[item.playerId]);
  return [
    { to: item.playerId, notice: { ...base, body: coach ? `${when} · дасгалжуулагч ${coach}` : when } },
    { to: item.coachId, notice: { ...base, body: player ? `${when} · ${player}` : when } },
  ];
}

/**
 * One run: read, mark, tell.
 *
 * deps: read(path) → value or null; mark(writes) — paths under coachReminded;
 *       loadUser(id) → the member's public record; notify(memberId, notice);
 *       now() (optional).
 * The marks are written before anything is sent: a reminder that fails to
 * send is lost rather than sent again every half hour.
 *
 * @returns {{ reminders: number, sent: number, failed: number }} counts only — no names.
 */
async function remind(deps) {
  const now = deps.now ? deps.now() : Date.now();
  const [slots, bookings, sent] = await Promise.all([
    deps.read('coachSlots'), deps.read('coachBookings'), deps.read('coachReminded'),
  ]);
  const { due, marks } = dueReminders(slots, bookings, sent, now);
  if (Object.keys(marks).length) await deps.mark(marks);

  const ids = [...new Set(due.flatMap(d => [d.coachId, d.playerId]))];
  const users = {};
  await Promise.all(ids.map(async (id) => {
    try { users[id] = await deps.loadUser(id); } catch (_) { users[id] = null; }
  }));

  let ok = 0;
  let failed = 0;
  for (const item of due) {
    for (const { to, notice } of noticesFor(item, users, now)) {
      try { await deps.notify(to, notice); ok++; } catch (_) { failed++; }
    }
  }
  return { reminders: due.length, sent: ok, failed };
}

module.exports = { KINDS, whenText, dueReminders, noticesFor, remind };

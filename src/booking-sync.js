// src/booking-sync.js
// The MTBogd booking's state as the app understands it, and how a game
// compares with what MTBogd actually holds. Pure — no DOM, no store — so the
// game detail, the admin tab and the tests all read the same verdicts.
//
// A game keeps its legacy top-level booking fields (bookingId, bookingCode,
// bookingSlotId, bookingPaid, bookingCancelled, bookingQuote) untouched; the
// additive `booking` object records HOW the booking came to be and what the
// last check against MTBogd found. Every function here is total: any input,
// however malformed, gets a plain answer rather than an exception, because
// these run inside render paths.

import { MTBOGD_CONFIG } from './config.js';

const asList = (v) => (!v ? [] : Array.isArray(v) ? v : Object.values(v));

// Minutes past midnight for 'H:MM' / 'HH:MM'; null when unreadable. Lets
// '9:00' and '09:00' agree.
function minutesOf(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

const isCancelled = (s) => String(s ?? '').toLowerCase() === 'cancelled';

/** Players actually in the game's flights (waiting list excluded). */
export function gamePlayerCount(game) {
  if (!game || typeof game !== 'object') return null;
  const ids = new Set();
  asList(game.groups).forEach(grp => asList(grp).forEach(p => { if (p?.id) ids.add(p.id); }));
  return ids.size;
}

/**
 * 'na'               — not an MTBogd-course game; nothing to sync
 * 'none'             — MTBogd course but no booking was ever attached
 * 'unverified'       — has a booking, never checked against MTBogd
 * 'synced'           — has a booking, last check matched
 * 'mismatch'         — has a booking, last check found a difference
 * 'cancelled_remote' — MTBogd says cancelled (webhook or a check)
 * 'cancel_failed'    — our cancel request failed; MTBogd may still hold the slot
 */
export function bookingState(game) {
  if (!game || typeof game !== 'object') return 'na';
  if (game.location !== MTBOGD_CONFIG.locationName) return 'na';
  const b = game.booking && typeof game.booking === 'object' ? game.booking : null;
  const hasId = !!game.bookingId;
  if (b?.status === 'cancel_failed') return 'cancel_failed';
  if (hasId && (game.bookingCancelled === true || isCancelled(b?.mtbogd?.status))) return 'cancelled_remote';
  if (!hasId) return 'none';
  if (b?.status === 'mismatch') return 'mismatch';
  if (b?.verifiedAt) return 'synced';
  return 'unverified';
}

/**
 * How the game differs from MTBogd's record. `remote` is the object MTBogd
 * returns from GET /bookings/{id}; null means it was not found.
 * Issues: not_found, status_cancelled, date_differs, time_differs,
 * slot_differs, players_differ.
 */
export function compareBooking(game, remote) {
  if (!remote || typeof remote !== 'object') return { ok: false, issues: ['not_found'] };
  const issues = [];
  if (isCancelled(remote.status)) issues.push('status_cancelled');
  if (remote.date && game?.date && String(remote.date) !== String(game.date)) issues.push('date_differs');
  const rt = minutesOf(remote.time); const gt = minutesOf(game?.time);
  if (rt !== null && gt !== null && rt !== gt) issues.push('time_differs');
  if (remote.slotId && game?.bookingSlotId && String(remote.slotId) !== String(game.bookingSlotId)) issues.push('slot_differs');
  const rp = Array.isArray(remote.players) ? remote.players.length
    : Number.isFinite(Number(remote.playerCount)) ? Number(remote.playerCount) : null;
  const gp = gamePlayerCount(game);
  if (rp !== null && gp !== null && gp > 0 && rp !== gp) issues.push('players_differ');
  return { ok: issues.length === 0, issues };
}

/** The booking status a check should record: confirmed when it matches. */
export function verifyOutcome(game, remote) {
  const cmp = compareBooking(game, remote);
  return { status: cmp.ok ? 'confirmed' : 'mismatch', issues: cmp.issues };
}

/**
 * May this MTBogd record be attached to this game (linked by code after the
 * fact)? Reasons: no_game, game_deleted, not_found, no_id, remote_cancelled,
 * date_differs.
 */
export function attachable(game, remote) {
  if (!game || typeof game !== 'object') return { ok: false, reason: 'no_game' };
  if (game.status === 'deleted') return { ok: false, reason: 'game_deleted' };
  if (!remote || typeof remote !== 'object') return { ok: false, reason: 'not_found' };
  if (!remote.bookingId) return { ok: false, reason: 'no_id' };
  if (isCancelled(remote.status)) return { ok: false, reason: 'remote_cancelled' };
  if (remote.date && game.date && String(remote.date) !== String(game.date)) return { ok: false, reason: 'date_differs' };
  return { ok: true };
}

/** The slice of MTBogd's record worth caching on the game after a check. */
export function remoteSummary(remote) {
  if (!remote || typeof remote !== 'object') return null;
  return clean({
    status: remote.status ?? null,
    slotId: remote.slotId ?? null,
    date: remote.date ?? null,
    time: remote.time ?? null,
    playerCount: Array.isArray(remote.players) ? remote.players.length
      : Number.isFinite(Number(remote.playerCount)) ? Number(remote.playerCount) : null,
    paymentStatus: remote.paymentStatus ?? null,
    bookingCode: remote.bookingCode ?? null,
  });
}

/** Why a game on the MTBogd course was created without a booking. */
export function bookingReason(slotEverSelected) {
  return slotEverSelected ? 'slot_lost' : 'user_skipped';
}

/**
 * One append-only log line. Firebase rejects `undefined`, so absent extras
 * are dropped rather than written.
 */
export function logEntry(event, extra = {}) {
  const at = Number.isFinite(Number(extra?.at)) ? Number(extra.at) : Date.now();
  const { at: _omit, ...rest } = extra || {};
  return clean({ at, event: String(event ?? ''), ...rest });
}

function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// ---- Seats: who is on the booking, what each owes, who has paid ----
// MTBogd (Sky ONE) bills a booking per player, and since 16 November 2026
// every player pays their own seat: the booker for themselves, each joiner
// for theirs. So the players list sent to MTBogd is exactly the players in
// the game — no seat is held under a repeated name — and each carries a
// phone when known: MTBogd ties a payment to a seat by phone, then by name,
// so a paid seat stays paid when the list is sent again or reordered, and a
// club member's phone gets that seat the member rate.

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** A phone as a match key: its last 8 digits ('' when there are none). */
export function phoneKey(phone) {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length > 8 ? d.slice(-8) : d;
}

const nameKey = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** One player as MTBogd takes them: { name, phone? }. */
export function bookingPlayer(name, phone) {
  const ph = String(phone ?? '').trim();
  return { name: String(name ?? '').trim(), ...(ph && { phone: ph }) };
}

/** Seats to book: the players already in — at least the booker. */
export function seatsToBook(joined) {
  return Math.max(1, Math.floor(Number(joined)) || 0);
}

/**
 * What MTBogd's booking record says it costs: { unit, memberUnit, seats,
 * total }, any of them null when MTBogd did not say. `unit` is the guest
 * price of a seat and `memberUnit` the member's. A booking from the
 * flat-price days has no unit price — its total stands alone. Null when
 * there is no price at all.
 */
export function bookingPrice(remote) {
  if (!remote || typeof remote !== 'object') return null;
  const unit = num(remote.greenFeeUnitPrice);
  const memberUnit = num(remote.greenFeeMemberUnitPrice);
  const seats = num(remote.playerCount) ?? (Array.isArray(remote.players) ? remote.players.length || null : null);
  const total = num(remote.greenFeePrice) ?? num(remote.amount) ?? (unit && seats ? unit * seats : null);
  if (!total && !unit) return null;
  return { unit, memberUnit, seats, total };
}

/**
 * Which MTBogd seat belongs to which player of the game: { [playerId]:
 * { amount, paid } }. `status` is MTBogd's qpay-status answer (players[] with
 * each seat's amount and paid flag); `players` are the game's, as { id, name,
 * phone }. A seat is matched by phone, then by name, and what is left is
 * paired in order only when as many seats as players remain — a guess is
 * worse than no answer where money is shown. Each seat is given out once.
 */
export function seatsByPlayer(status, players) {
  const seats = asList(status?.players).filter(s => s && typeof s === 'object');
  const list = asList(players).filter(p => p && p.id);
  const out = {};
  const free = new Set(seats.keys());
  const todo = new Set(list.keys());
  const take = (pi, si) => {
    out[list[pi].id] = { amount: num(seats[si].amount), paid: seats[si].paid === true };
    free.delete(si); todo.delete(pi);
  };
  const pass = (keyOf) => {
    for (const pi of [...todo]) {
      const k = keyOf(list[pi]);
      if (!k) continue;
      const si = [...free].find(i => keyOf(seats[i]) === k);
      if (si !== undefined) take(pi, si);
    }
  };
  pass(x => phoneKey(x.phone));
  pass(x => nameKey(x.name));
  if (todo.size && todo.size === free.size) {
    const rest = [...free];
    [...todo].forEach((pi, n) => take(pi, rest[n]));
  }
  return out;
}

/**
 * The money side of a booking as the game keeps it (`bookingQuote`), from
 * MTBogd's booking record and its qpay-status answer: the total and what it
 * is made of, how many seats are paid, and per player of the game what they
 * owe (`due`) and whether they have paid (`paid`). Holds no phone numbers —
 * the game record is readable by every client. Null when MTBogd gave no
 * price.
 */
export function bookingQuoteOf(booking, status, players) {
  const p = bookingPrice(booking) || bookingPrice(status);
  if (!p?.total) return null;
  const st = status && typeof status === 'object' ? status : {};
  const seats = asList(st.players).filter(s => s && typeof s === 'object');
  const paid = {}; const due = {};
  for (const [id, s] of Object.entries(seatsByPlayer(st, players))) {
    if (s.paid) paid[id] = true;
    if (s.amount) due[id] = s.amount;
  }
  // Zero is an answer here (no seat paid, nothing left to pay); blank is not.
  const count = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0
    ? null : Number(v));
  return {
    amount: p.total, unit: p.unit, memberUnit: p.memberUnit, seats: p.seats,
    customerType: st.customerType || null,
    paidSeats: count(st.paidSeats) ?? (seats.length ? seats.filter(s => s.paid === true).length : null),
    balanceDue: count(st.balanceDue),
    allPaid: String(st.paymentStatus ?? '').toLowerCase() === 'paid',
    paid, due,
  };
}

/**
 * Whether two quotes say the same thing. The database drops nulls and empty
 * objects, so a saved quote never looks like the one that was written; the
 * comparison reads past that (and past `at`, the time it was taken).
 */
export function sameQuote(a, b) {
  const norm = (q) => {
    const o = q && typeof q === 'object' ? q : {};
    const map = (m) => JSON.stringify(Object.entries(m && typeof m === 'object' ? m : {})
      .filter(([, v]) => v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
    return JSON.stringify([
      o.amount ?? null, o.unit ?? null, o.memberUnit ?? null, o.seats ?? null, o.customerType ?? null,
      o.paidSeats ?? null, o.balanceDue ?? null, !!o.allPaid, map(o.paid), map(o.due),
    ]);
  };
  return norm(a) === norm(b);
}

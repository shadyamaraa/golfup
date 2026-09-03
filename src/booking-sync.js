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

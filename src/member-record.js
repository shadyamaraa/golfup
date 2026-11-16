// src/member-record.js
// A member's record lives in two places, and this is the line between them.
// Pure — no Firebase, no DOM.
//
//   users/{id}        — the public half: the name on a leaderboard, the
//                       avatar, the handicap, the role. Anyone can read it,
//                       a visitor included.
//   userPrivate/{id}  — the private half: the phone number, the bank
//                       details, the club code. Only a signed-in member can
//                       read it (the database rules ask for the member's
//                       Firebase identity).
//
// The app keeps working with one record per member: the store merges the two
// halves when it reads and splits them when it writes, so no screen needs to
// know there are two. A visitor's copy simply has no private fields.
//
// The password is in neither — it is a hash only the server reads
// (functions/passwords.js).

import { withoutPassword } from './phone-auth.js';

/** The fields that are the member's own business and other members'. */
export const PRIVATE_FIELDS = ['phone', 'bankName', 'bankAccount', 'bankIban', 'mtbogdCode'];

/**
 * A record as the app holds it → what goes to each place: { pub, priv }.
 * `priv` carries only the private fields the record actually has (a field
 * left out is left alone in the database; null clears it). Never a password.
 */
export function splitMember(user) {
  const pub = {};
  const priv = {};
  if (!user || typeof user !== 'object') return { pub, priv };
  for (const [k, v] of Object.entries(withoutPassword(user))) {
    if (v === undefined) continue;
    (PRIVATE_FIELDS.includes(k) ? priv : pub)[k] = v;
  }
  return { pub, priv };
}

/** The two halves as one record. The private half wins where both have a field. */
export function mergeMember(pub, priv) {
  const out = { ...(pub && typeof pub === 'object' ? pub : {}) };
  if (priv && typeof priv === 'object') {
    for (const k of PRIVATE_FIELDS) if (priv[k] !== undefined && priv[k] !== null) out[k] = priv[k];
  }
  return out;
}

/** Whether a public record still carries a private field (it has not been moved yet). */
export function carriesPrivate(pub) {
  return !!pub && typeof pub === 'object'
    && PRIVATE_FIELDS.some(k => pub[k] !== undefined && pub[k] !== null);
}

/**
 * The fields of the public half that only an admin changes. The database
 * rules refuse anyone else's change to them, so a save sends one only when
 * it was actually changed here.
 */
export const GUARDED_FIELDS = ['role', 'status'];

// Nothing, null and '' are the same emptiness: a form that shows an absent
// field as an empty box has not changed it.
const held = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * What a record held when this browser read it, in the fields a save must
 * not send back unchanged — the private ones and the guarded ones.
 */
export function baselineOf(user) {
  const base = {};
  for (const k of [...PRIVATE_FIELDS, ...GUARDED_FIELDS]) base[k] = held(user?.[k]);
  return base;
}

/**
 * What saving `user` writes to each place: { pub, priv }. `base` is what
 * this browser last read of that member (baselineOf), or null when it never
 * read them.
 *
 *   pub  → users/{id}:       the public fields; role and status only when
 *                            they were changed here.
 *   priv → userPrivate/{id}: only the private fields that were changed here
 *                            ('' clears one — an empty string, not a removal,
 *                            so it still stands over an older public copy).
 *
 * Sending only what changed keeps a copy that has gone stale — a session, a
 * list an admin opened an hour ago — from putting an old phone number or an
 * old role back, and keeps a browser that may not write the private half
 * from being refused for a save that never touched it. Without a baseline
 * nothing private or guarded is written at all.
 */
export function memberWrites(user, base) {
  const { pub, priv } = splitMember(user);
  for (const k of GUARDED_FIELDS) {
    if (k in pub && (!base || held(pub[k]) === base[k])) delete pub[k];
  }
  const changed = {};
  if (base) {
    for (const k of Object.keys(priv)) {
      if (held(priv[k]) !== base[k]) changed[k] = priv[k] === null ? '' : priv[k];
    }
  }
  return { pub, priv: changed };
}

/**
 * The version of a signed-in session. A session from before members had a
 * Firebase identity cannot read the private half, so it is ended once and
 * the member signs in again; this number is what "before" means.
 */
export const SESSION_VERSION = '2';

export function sessionIsCurrent(marker) {
  return String(marker ?? '') === SESSION_VERSION;
}

/**
 * What to do with the session this browser woke up with:
 *   'keep'  — it is current, or there is none.
 *   'adopt' — it is from before, but this browser already carries that
 *             member's Firebase identity: mark it current, ask nothing.
 *   'end'   — it is from before and has no such identity: sign out, once.
 * `identity` is the member id in the browser's Firebase token, or null.
 */
export function sessionAction({ user, marker, identity }) {
  if (!user || !user.id || sessionIsCurrent(marker)) return 'keep';
  return identity && String(identity) === String(user.id) ? 'adopt' : 'end';
}

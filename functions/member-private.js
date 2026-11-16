// functions/member-private.js
// The private half of a member's record — the logic, apart from Firebase so
// it can be tested (scripts/test-member-private.mjs).
//
// A member's phone number, bank details and club code used to sit on the
// member record (users/{id}), which anyone can read, signed in or not. They
// now live under userPrivate/{memberId}, which the database rules open only
// to a signed-in member (see src/member-record.js for the app's side):
//
//   mergeUsers           — the members as the functions need them: the public
//                          records with the private half laid over. Sign-in
//                          finds a member by phone, so every function that
//                          reads members reads them through this.
//   migratePrivateFields — once, by an admin: every private field still on a
//                          public record is copied to userPrivate and removed
//                          from the record.

const { callerOf } = require('./passwords');

// Kept in step with src/member-record.js by a test.
const PRIVATE_FIELDS = ['phone', 'bankName', 'bankAccount', 'bankIban', 'mtbogdCode'];

// Bumped when the sign-in functions change what they read. The move below
// asks the deployed sign-in functions for theirs before it touches anything.
const SIGN_IN_VERSION = 2;

const fail = (status, code, message, extra) => ({ status, body: { error: { code, message: message || code, ...extra } } });
const has = (v) => v !== undefined && v !== null;

/** One member's two halves as one record. The private half wins where both have a field. */
function mergeMember(pub, priv) {
  if (!pub || typeof pub !== 'object') return pub;
  const out = { ...pub };
  if (priv && typeof priv === 'object') {
    for (const k of PRIVATE_FIELDS) if (has(priv[k])) out[k] = priv[k];
  }
  return out;
}

/**
 * Every member, merged: { key: record }, keyed as `users` is. A member's
 * private half is the one under the same key — the key is the member's id
 * (the database rules hold the `id` inside a record to it).
 */
function mergeUsers(users, privates) {
  const out = {};
  for (const [key, u] of Object.entries(users || {})) {
    out[key] = u && typeof u === 'object' ? mergeMember(u, (privates || {})[key]) : u;
  }
  return out;
}

/**
 * Move every private field off the public member records. Safe to run
 * again: a field already in the private half keeps the value it has there,
 * and a record with nothing left to move is passed over.
 *
 * It refuses to start unless the deployed sign-in functions already read the
 * private half (`signInReady`): moving the phone numbers out from under
 * functions that look only at the public records would leave no one able to
 * sign in.
 *
 * deps: { verifyIdToken, loadUser(id), loadUsers() (public, unmerged),
 *         loadPrivates(), writePrivate(memberId, patch), clearPublic(key, fields),
 *         signInReady(): [names of sign-in functions that are out of date] }
 */
async function migratePrivateFields(deps, body) {
  const caller = await callerOf(deps, body && body.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to do this');
  const me = await deps.loadUser(caller);
  if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Admins only');

  const outdated = await deps.signInReady();
  if (outdated.length) {
    return fail(409, 'FUNCTIONS_OUTDATED', 'Deploy the sign-in functions first', { outdated });
  }

  const users = (await deps.loadUsers()) || {};
  const privates = (await deps.loadPrivates()) || {};
  let moved = 0; let kept = 0; let cleared = 0;
  for (const [key, u] of Object.entries(users)) {
    if (!u || typeof u !== 'object') continue;
    const present = PRIVATE_FIELDS.filter(k => has(u[k]));
    if (!present.length) continue;
    const memberId = String(key);
    const already = privates[memberId] || {};
    const patch = {};
    // An empty public field has nothing to carry over; it is only removed.
    for (const k of present) if (u[k] !== '' && !has(already[k])) patch[k] = u[k];
    // The private copy is written before the public one goes: a failure
    // between the two leaves the field readable, never lost.
    if (Object.keys(patch).length) { await deps.writePrivate(memberId, patch); moved++; } else kept++;
    await deps.clearPublic(key, present);
    cleared++;
  }
  return { status: 200, body: { ok: true, moved, kept, cleared } };
}

module.exports = { PRIVATE_FIELDS, SIGN_IN_VERSION, mergeMember, mergeUsers, migratePrivateFields };

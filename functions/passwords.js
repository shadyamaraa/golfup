// functions/passwords.js
// Members' passwords, kept where only the server can read them — the logic,
// apart from Firebase so it can be tested (scripts/test-passwords.mjs).
//
// A password used to sit in plain text on the member record (users/{id}),
// which every client can read. It now lives as a scrypt hash under
// userSecrets/{memberId}, a path the database rules give to no client:
//
//   passwordLogin    — the fallback sign-in: phone + password, checked here.
//   setPassword      — a member changes their own; an admin sets anyone's.
//                      The caller proves who they are with a Firebase ID
//                      token carrying `memberId` (minted at sign-in).
//   migratePasswords — once, by an admin: every plain-text password is
//                      hashed into userSecrets and removed from the record.
//
// Sign-in by SMS (./phone-verify.js) does not touch any of this.

const crypto = require('crypto');
const { toE164 } = require('./phone-verify');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const MIN_LENGTH = 4;
const MAX_LENGTH = 128;
// Five wrong passwords in a row lock the member's password sign-in for a
// quarter of an hour. Sign-in by SMS is not affected.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

/** 'scrypt$N$r$p$salt$hash' — everything needed to check it again later. */
function hashPassword(password, salt = crypto.randomBytes(16)) {
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  const parts = String(stored == null ? '' : stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3]);
  if (![N, r, p].every(n => Number.isInteger(n) && n > 0)) return false;
  try {
    const salt = Buffer.from(parts[4], 'base64');
    const want = Buffer.from(parts[5], 'base64');
    if (!salt.length || !want.length) return false;
    const got = crypto.scryptSync(String(password == null ? '' : password), salt, want.length, { N, r, p });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch (_) {
    return false;
  }
}

const fail = (status, code, message, extra) => ({ status, body: { error: { code, message: message || code, ...extra } } });

// The member whose phone this is: { key, memberId, user, e164 } or null. The
// member's id is the record's key — never the `id` written inside the
// record, which the app writes and anyone could have changed.
function findByPhone(users, phone) {
  const want = toE164(phone);
  if (!want) return null;
  const hit = Object.entries(users || {}).find(([, u]) => u && typeof u === 'object' && toE164(u.phone) === want);
  return hit ? { key: hit[0], memberId: String(hit[0]), user: hit[1], e164: want } : null;
}

/**
 * Sign in with phone + password.
 * deps: { loadUsers(), getSecret(id), patchSecret(id, patch), mintToken(e164, memberId), now() }
 */
async function passwordLogin(deps, body) {
  const now = deps.now || Date.now;
  const b = body || {};
  if (!toE164(b.phone)) return fail(400, 'BAD_PHONE', 'Not a phone number');
  const found = findByPhone(await deps.loadUsers(), b.phone);
  if (!found) return fail(404, 'USER_NOT_FOUND', 'No member has this phone number');
  if (found.user.status === 'hold') return fail(403, 'USER_HELD', 'This member is on hold');

  const secret = (await deps.getSecret(found.memberId)) || {};
  const lockedFor = Number(secret.lockedUntil) - now();
  if (lockedFor > 0) return fail(429, 'LOCKED', 'Too many wrong passwords', { retryAfter: Math.ceil(lockedFor / 1000) });
  if (!secret.pass) return fail(401, 'NO_PASSWORD', 'This member has no password');

  if (!verifyPassword(b.password, secret.pass)) {
    const fails = (Number(secret.fails) || 0) + 1;
    if (fails >= MAX_FAILS) {
      await deps.patchSecret(found.memberId, { fails: 0, lockedUntil: now() + LOCK_MS });
      return fail(429, 'LOCKED', 'Too many wrong passwords', { retryAfter: Math.ceil(LOCK_MS / 1000) });
    }
    await deps.patchSecret(found.memberId, { fails, lockedUntil: null });
    return fail(401, 'WRONG_PASSWORD', 'Wrong password');
  }
  if (secret.fails || secret.lockedUntil) await deps.patchSecret(found.memberId, { fails: 0, lockedUntil: null });

  // The Firebase identity, as for an SMS sign-in: wanted, not waited on.
  let token = null; let uid = null; let tokenError = null;
  try {
    const minted = await deps.mintToken(found.e164, found.memberId);
    token = minted.token; uid = minted.uid;
  } catch (e) {
    tokenError = String((e && (e.code || e.message)) || e);
  }
  return { status: 200, body: { ok: true, memberId: found.memberId, token, uid, ...(tokenError && { tokenError }) } };
}

// Who is calling: the member id in a Firebase ID token, or null.
async function callerOf(deps, idToken) {
  if (!idToken) return null;
  try {
    const claims = await deps.verifyIdToken(String(idToken));
    return claims && claims.memberId ? String(claims.memberId) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Set a member's password.
 * deps: { verifyIdToken(token), loadUser(id), patchSecret(id, patch), now() }
 */
async function setPassword(deps, body) {
  const now = deps.now || Date.now;
  const b = body || {};
  const caller = await callerOf(deps, b.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to change a password');
  const target = String(b.memberId || caller);
  // A member id is a database key; anything else names no member.
  if (!/^[\w-]{1,64}$/.test(target)) return fail(404, 'USER_NOT_FOUND', 'No such member');
  if (target !== caller) {
    const me = await deps.loadUser(caller);
    if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Only an admin sets another member\'s password');
  }
  if (!(await deps.loadUser(target))) return fail(404, 'USER_NOT_FOUND', 'No such member');
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    return fail(400, 'WEAK_PASSWORD', `A password has ${MIN_LENGTH} to ${MAX_LENGTH} characters`);
  }
  await deps.patchSecret(target, { pass: hashPassword(password), passAt: now(), fails: 0, lockedUntil: null });
  return { status: 200, body: { ok: true } };
}

/**
 * Move every plain-text password off the member records. Safe to run again:
 * a member who already has a hash keeps it, and a record with nothing left
 * to move is passed over.
 * deps: { verifyIdToken, loadUser(id), loadUsers(), getSecret(id), patchSecret(id, patch), removePlain(key), now() }
 */
async function migratePasswords(deps, body) {
  const now = deps.now || Date.now;
  const caller = await callerOf(deps, body && body.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to do this');
  const me = await deps.loadUser(caller);
  if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Admins only');

  const users = (await deps.loadUsers()) || {};
  let hashed = 0; let kept = 0; let removed = 0;
  for (const [key, u] of Object.entries(users)) {
    if (!u || typeof u !== 'object' || !('password' in u)) continue;
    const memberId = String(key);
    if (typeof u.password === 'string' && u.password !== '') {
      const secret = await deps.getSecret(memberId);
      // The hash is written before the plain text goes: a failure between
      // the two leaves the password readable, never lost.
      if (secret && secret.pass) kept++;
      else { await deps.patchSecret(memberId, { pass: hashPassword(u.password), passAt: now() }); hashed++; }
    }
    await deps.removePlain(key);
    removed++;
  }
  return { status: 200, body: { ok: true, hashed, kept, removed } };
}

module.exports = {
  SCRYPT, MIN_LENGTH, MAX_LENGTH, MAX_FAILS, LOCK_MS,
  hashPassword, verifyPassword, passwordLogin, setPassword, migratePasswords, callerOf,
};

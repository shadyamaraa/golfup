// src/phone-auth.js
// Signing in by SMS — the pure half: phone numbers into the forms the app
// and the provider need, when two numbers are the same phone, the time left
// on a code, and what a refusal means in words a member can act on. No DOM,
// no Firebase.
//
// The provider is verify.mn, and it is mobile-ORIGINATED: nothing is sent to
// the member. They send one SMS — a six-digit text — from their own phone to
// the short code 144773, and verify.mn tells the server that phone sent it.
// The server half is functions/phone-verify.js; the browser's two calls are
// in store.js (startPhoneVerify / checkPhoneVerify). See docs/phone-login.md.

/** The club's members are in Mongolia: a bare 8-digit number is +976. */
export const DEFAULT_COUNTRY = '976';

/**
 * E.164 ('+97699119007') for a number as a member types it or as the
 * database holds it, or null when it is not a phone number we can send to.
 *   99119007          → +97699119007   (Mongolian, 8 digits)
 *   976 9911-9007     → +97699119007
 *   +976 99119007     → +97699119007
 *   010-1234-5678     → +821012345678  (a Korean mobile as written at home)
 *   +82 10 1234 5678  → +821012345678
 */
export function toE164(input, country = DEFAULT_COUNTRY) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('+') || raw.startsWith('00')) {
    if (raw.startsWith('00')) d = d.slice(2);
    return /^[1-9]\d{7,14}$/.test(d) ? '+' + d : null;
  }
  if (/^\d{8}$/.test(d)) return '+' + country + d;
  if (d.length === country.length + 8 && d.startsWith(country)) return '+' + d;
  if (/^01[016789]\d{7,8}$/.test(d)) return '+82' + d.slice(1);
  return null;
}

/** Whether two numbers, however written, are the same phone. */
export function samePhone(a, b) {
  const x = toE164(a);
  return !!x && x === toE164(b);
}

/**
 * The 8-digit Mongolian number in `phone`, or null. verify.mn works with
 * Mongolian operators only, so a member with a foreign number signs in with
 * the password.
 */
export function mnLocal(phone) {
  const e = toE164(phone);
  return e && e.startsWith('+' + DEFAULT_COUNTRY) && e.length === 1 + DEFAULT_COUNTRY.length + 8
    ? e.slice(1 + DEFAULT_COUNTRY.length) : null;
}

/** Time left as 'm:ss' — '0:00' once it has run out. */
export function leftText(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The i18n key for what went wrong, from the error a store call threw: the
 * sign-in functions name their refusals in `code`; a missing function is a
 * 404, and a request that never left is a TypeError from fetch.
 */
export function verifyErrorKey(err) {
  switch (String(err?.code ?? '')) {
    case 'USER_NOT_FOUND': return 'userNotFound';
    case 'USER_HELD': return 'svErrHeld';
    case 'UNSUPPORTED_PHONE': return 'svErrForeign';
    case 'NOT_CONFIGURED': return 'svErrNotEnabled';
    case 'BAD_TICKET': return 'svErrGeneric';
    default:
  }
  if (err?.status === 404) return 'svErrNotEnabled';
  if (err instanceof TypeError || err?.name === 'TypeError') return 'svErrNetwork';
  return 'svErrGeneric';
}

/**
 * A member record without its password. A password belongs to the server
 * (functions/passwords.js): the app neither keeps one in the browser nor
 * writes one to the member record.
 */
export function withoutPassword(user) {
  if (!user || typeof user !== 'object') return user;
  const { password, ...rest } = user;   // eslint-disable-line no-unused-vars
  return rest;
}

/**
 * The i18n key for a refusal from the password functions — signing in with
 * a password, changing one, moving the stored ones.
 */
export function passwordErrorKey(err) {
  switch (String(err?.code ?? '')) {
    case 'WRONG_PASSWORD': return 'pwErrWrong';
    case 'NO_PASSWORD': return 'pwErrNone';
    case 'LOCKED': return 'pwErrLocked';
    case 'USER_NOT_FOUND':
    case 'BAD_PHONE': return 'userNotFound';
    case 'USER_HELD': return 'svErrHeld';
    case 'UNAUTHENTICATED': return 'pwNeedsSignIn';
    case 'FORBIDDEN': return 'pwForbidden';
    case 'WEAK_PASSWORD': return 'pwWeak';
    default:
  }
  if (err?.status === 404) return 'pwErrUnavailable';
  if (err instanceof TypeError || err?.name === 'TypeError') return 'svErrNetwork';
  return 'svErrGeneric';
}

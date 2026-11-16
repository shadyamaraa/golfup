// src/phone-auth.js
// Signing in by a code sent to the member's phone — the pure half: how a
// number as typed or stored becomes the E.164 form an SMS provider takes,
// when two numbers are the same phone, and what a provider's refusal means
// in words a member can act on. No DOM, no Firebase.
//
// The provider is replaceable. Today it is Firebase Phone Auth, behind two
// calls in store.js (requestPhoneCode / confirmPhoneCode). A domestic SMS
// provider later takes its place behind the same two calls: a Cloud Function
// sends and checks the code, then mints a custom token for the SAME Firebase
// Auth user (found by its phone number), so the uid — and everything that
// comes to be keyed on it — carries over. See docs/phone-login.md.

/** The club's members are in Mongolia: a bare 8-digit number is +976. */
export const DEFAULT_COUNTRY = '976';

/** Seconds before another code may be asked for. */
export const RESEND_SECONDS = 60;

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

/** A sign-in code as the provider sends it: six digits. */
export function codeOk(code) {
  return /^\d{6}$/.test(String(code ?? '').trim());
}

/**
 * The i18n key for what went wrong, from the provider's error. Firebase
 * names its refusals `auth/...`; a provider that replaces it should throw
 * errors carrying the same codes, so the words do not change with it.
 */
export function otpErrorKey(err) {
  const code = String(err?.code ?? '');
  switch (code) {
    case 'auth/invalid-phone-number':
    case 'auth/missing-phone-number':
      return 'otpErrInvalidPhone';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'otpErrTooMany';
    case 'auth/invalid-verification-code':
    case 'auth/missing-verification-code':
      return 'otpErrBadCode';
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'otpErrExpired';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
    case 'auth/unauthorized-domain':
      return 'otpErrCaptcha';
    case 'auth/operation-not-allowed':
    case 'auth/billing-not-enabled':
    case 'auth/admin-restricted-operation':
      return 'otpErrNotEnabled';
    case 'auth/network-request-failed':
      return 'otpErrNetwork';
    default:
      return 'otpErrGeneric';
  }
}

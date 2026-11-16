// functions/phone-verify.js
// Sign-in by SMS through verify.mn — the logic, kept apart from Firebase so
// it can be tested (scripts/test-phone-verify.mjs) with a fake fetch.
//
// verify.mn is mobile-ORIGINATED: nothing is sent to the member. The member
// sends one SMS, a six-digit text, from their own phone to the short code
// 144773; verify.mn tells us that phone sent that text. So:
//
//   start  — the phone must be a member's; a session is opened at verify.mn
//            with a fresh code, and the browser gets what to show (the short
//            code, the text, an sms: link) plus a ticket.
//   check  — the browser polls with the ticket; verify.mn's own record is
//            the truth. Once VERIFIED, a Firebase custom token is minted for
//            the Firebase Auth user that owns the phone number.
//
// Nothing is stored between the two calls. The ticket is an HMAC over the
// session, the member and the phone, so `check` knows a session was opened
// here, for that member, without a database.

const crypto = require('crypto');

const VERIFY_MN_BASE = 'https://api.verify.mn';
// A ticket outlives its session a little — an SMS sent in the last seconds
// still has to be collected — and then is dead.
const TICKET_GRACE_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 5 * 60 * 1000;
// The reply the member's phone gets. ASCII only (operator limit); Unitel
// sends its own default instead, Lime none — the app's screen is what says
// the sign-in worked.
const REPLY_SMS = 'UB Golf: Tany dugaar batalgaajlaa. App ruugaa butsaarai.';

/** The 8-digit Mongolian number in `phone`, or null (verify.mn is Mongolia-only). */
function mnLocal(phone) {
  const raw = String(phone == null ? '' : phone).trim();
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('976')) d = d.slice(3);
  else if (raw.startsWith('+') || raw.startsWith('00')) return null;   // another country
  return /^\d{8}$/.test(d) ? d : null;
}

/** A fresh six-digit code. */
function newCode() {
  return String(crypto.randomInt(100000, 1000000));
}

// The ticket's key is derived from the API key, so there is one secret to
// set and it never signs anything directly.
function ticketKey(apiKey) {
  return crypto.createHmac('sha256', String(apiKey)).update('ubgolf/phone-verify/ticket/v1').digest();
}

function signTicket(apiKey, s) {
  return crypto.createHmac('sha256', ticketKey(apiKey))
    .update([s.sessionId, s.memberId, s.phone, s.expiresAt].join('|'))
    .digest('hex');
}

function ticketOk(apiKey, s, ticket) {
  const want = Buffer.from(signTicket(apiKey, s));
  const got = Buffer.from(String(ticket == null ? '' : ticket));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const fail = (status, code, message) => ({ status, body: { error: { code, message: message || code } } });

async function readJson(res) {
  try { return (await res.json()) || {}; } catch (_) { return {}; }
}

/**
 * Open a verification for a member's phone.
 * deps: { apiKey, fetch, loadUsers(): {id: user}, now(): ms, code?(): string }
 * → { status, body }
 */
async function startVerify(deps, body) {
  const { apiKey, fetch, loadUsers } = deps;
  const now = deps.now || Date.now;
  const code = deps.code || newCode;
  if (!apiKey) return fail(500, 'NOT_CONFIGURED', 'VERIFY_MN_API_KEY is not set');
  const phone = mnLocal(body && body.phone);
  if (!phone) return fail(400, 'UNSUPPORTED_PHONE', 'Only a Mongolian mobile number can sign in by SMS');

  // The phone must be a member's: a stranger has no account to sign in to.
  const users = (await loadUsers()) || {};
  const found = Object.entries(users).find(([, u]) => u && typeof u === 'object' && mnLocal(u.phone) === phone);
  if (!found) return fail(404, 'USER_NOT_FOUND', 'No member has this phone number');
  const [key, user] = found;
  if (user.status === 'hold') return fail(403, 'USER_HELD', 'This member is on hold');
  const memberId = String(user.id || key);

  // verify.mn refuses a second live session with the same phone and text;
  // six random digits all but never repeat, and one more draw settles it.
  let res; let data; let text;
  for (let attempt = 0; attempt < 2; attempt++) {
    text = code();
    try {
      res = await fetch(`${VERIFY_MN_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ phone, text, responseSms: REPLY_SMS }),
      });
    } catch (e) {
      return fail(502, 'PROVIDER_UNREACHABLE', String((e && e.message) || e));
    }
    data = await readJson(res);
    if (res.status !== 409) break;
  }
  // A refused key is our configuration, not the member's problem to read.
  if (res.status === 401) return fail(500, 'NOT_CONFIGURED', 'verify.mn refused the API key');
  if (!res.ok || !data.sessionId) return fail(502, 'PROVIDER_ERROR', String(data.message || res.status));

  const session = {
    sessionId: String(data.sessionId),
    memberId,
    phone,
    expiresAt: String(data.expiresAt || new Date(now() + SESSION_TTL_MS).toISOString()),
  };
  const sentText = String(data.text || text);
  const shortcode = String(data.shortcode || '144773');
  return {
    status: 200,
    body: {
      ...session,
      text: sentText,
      shortcode,
      smsUri: String(data.smsUri || `sms:${shortcode}?body=${encodeURIComponent(sentText)}`),
      displayInstruction: String(data.displayInstruction || ''),
      ticket: signTicket(apiKey, session),
    },
  };
}

/**
 * Ask whether the member has sent the SMS.
 * deps: { apiKey, fetch, mintToken(e164, memberId): {token, uid}, now(): ms }
 * → { status, body: { status: 'PENDING' | 'VERIFIED' | 'EXPIRED', ... } }
 */
async function checkVerify(deps, body) {
  const { apiKey, fetch, mintToken } = deps;
  const now = deps.now || Date.now;
  if (!apiKey) return fail(500, 'NOT_CONFIGURED', 'VERIFY_MN_API_KEY is not set');
  const b = body || {};
  const s = {
    sessionId: String(b.sessionId || ''),
    memberId: String(b.memberId || ''),
    phone: mnLocal(b.phone),
    expiresAt: String(b.expiresAt || ''),
  };
  if (!s.sessionId || !s.memberId || !s.phone || !ticketOk(apiKey, s, b.ticket)) {
    return fail(400, 'BAD_TICKET', 'This verification was not opened here');
  }
  const exp = Date.parse(s.expiresAt);
  if (!Number.isFinite(exp) || now() > exp + TICKET_GRACE_MS) return { status: 200, body: { status: 'EXPIRED' } };

  let res;
  try {
    res = await fetch(`${VERIFY_MN_BASE}/sessions/${encodeURIComponent(s.sessionId)}`);
  } catch (e) {
    return fail(502, 'PROVIDER_UNREACHABLE', String((e && e.message) || e));
  }
  const data = await readJson(res);
  if (res.status === 404) return { status: 200, body: { status: 'EXPIRED' } };
  if (!res.ok) return fail(502, 'PROVIDER_ERROR', String(data.message || res.status));

  const state = String(data.sessionStatus || '').toUpperCase();
  if (state !== 'VERIFIED') return { status: 200, body: { status: state === 'EXPIRED' ? 'EXPIRED' : 'PENDING' } };

  // That phone sent that text. The Firebase identity for it is a bonus the
  // sign-in does not wait on: without the IAM permission to sign tokens the
  // member still gets in, and the response says what was missing.
  const e164 = '+976' + s.phone;
  let token = null; let uid = null; let tokenError = null;
  try {
    const minted = await mintToken(e164, s.memberId);
    token = minted.token; uid = minted.uid;
  } catch (e) {
    tokenError = String((e && (e.code || e.message)) || e);
  }
  return {
    status: 200,
    body: {
      status: 'VERIFIED', phone: e164, memberId: s.memberId,
      verifiedAt: data.verifiedAt || null, token, uid,
      ...(tokenError && { tokenError }),
    },
  };
}

module.exports = {
  VERIFY_MN_BASE, TICKET_GRACE_MS, REPLY_SMS,
  mnLocal, newCode, signTicket, ticketOk, startVerify, checkVerify,
};

// scripts/test-phone-verify.mjs
// Sign-in by SMS through verify.mn — the server half (functions/phone-verify.js)
// run against a fake verify.mn: which phones may start, what the browser is
// handed, the ticket, and what a check answers in every state.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const pv = createRequire(import.meta.url)('../functions/phone-verify.js');
const KEY = 'vrf_test_key';
const NOW = Date.parse('2026-11-16T10:00:00.000Z');
const EXPIRES = '2026-11-16T10:05:00.000Z';

const users = {
  u_a: { id: 'u_a', name: 'Bat', phone: '99119007', status: 'active' },
  u_h: { id: 'u_h', name: 'Hold', phone: '88001122', status: 'hold' },
  u_k: { id: 'u_k', name: 'Kim', phone: '01012345678', status: 'active' },
  u_p: { name: 'Plus', phone: '+976 9500-1234', status: 'active' },   // no id field: the key stands in
  junk: 'not a user',
};

// A fake verify.mn: records what it was asked, answers as told.
function provider(script = {}) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null });
    if (script.throws) throw new Error('ECONNRESET');
    const isCreate = (opts.method || 'GET') === 'POST';
    const answer = isCreate ? (script.create ? script.create(calls.filter(c => c.method === 'POST').length) : null) : script.status;
    const status = answer?.http ?? 200;
    const body = answer?.body ?? (isCreate
      ? { sessionId: 'sess-1', phone: calls.at(-1).body.phone, shortcode: '144773', text: calls.at(-1).body.text,
        smsUri: `sms:144773?body=${calls.at(-1).body.text}`, displayInstruction: 'Та өөрийн дугаараас 144773 дугаарт SMS илгээнэ үү.', expiresAt: EXPIRES }
      : { sessionId: 'sess-1', sessionStatus: 'PENDING', callbackStatus: 'PENDING', verifiedAt: null, expiresAt: EXPIRES });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}
const startDeps = (p, over = {}) => ({ apiKey: KEY, fetch: p.fetch, loadUsers: async () => users, now: () => NOW, code: () => '482916', ...over });
const checkDeps = (p, over = {}) => ({ apiKey: KEY, fetch: p.fetch, mintToken: async (e164, memberId) => ({ token: `tok:${e164}:${memberId}`, uid: 'fb_uid_1' }), now: () => NOW, ...over });

test('mnLocal: a Mongolian number in any writing, and nothing else', () => {
  assert.equal(pv.mnLocal('99119007'), '99119007');
  assert.equal(pv.mnLocal(' 9911-9007 '), '99119007');
  assert.equal(pv.mnLocal('97699119007'), '99119007');
  assert.equal(pv.mnLocal('+976 9911 9007'), '99119007');
  assert.equal(pv.mnLocal('0097699119007'), '99119007');
  assert.equal(pv.mnLocal(88112233), '88112233');
  assert.equal(pv.mnLocal('01012345678'), null, 'a Korean mobile');
  assert.equal(pv.mnLocal('+821012345678'), null);
  assert.equal(pv.mnLocal('+97612345'), null);
  assert.equal(pv.mnLocal('1234567'), null);
  assert.equal(pv.mnLocal(''), null);
  assert.equal(pv.mnLocal(null), null);
});

test('newCode: six digits, never starting a shorter number', () => {
  for (let i = 0; i < 200; i++) assert.match(pv.newCode(), /^[1-9]\d{5}$/);
});

test('start: a member\'s phone opens a session and the browser gets what to show', async () => {
  const p = provider();
  const out = await pv.startVerify(startDeps(p), { phone: '+976 9911-9007' });
  assert.equal(out.status, 200);
  assert.equal(p.calls.length, 1);
  const call = p.calls[0];
  assert.equal(call.url, 'https://api.verify.mn/sessions');
  assert.equal(call.headers.Authorization, 'Bearer ' + KEY);
  assert.deepEqual(call.body, { phone: '99119007', text: '482916', responseSms: pv.REPLY_SMS });
  assert.match(pv.REPLY_SMS, /^[\x20-\x7E]{1,160}$/, 'the reply is printable ASCII within one SMS');
  const b = out.body;
  assert.equal(b.sessionId, 'sess-1');
  assert.equal(b.memberId, 'u_a');
  assert.equal(b.phone, '99119007');
  assert.equal(b.text, '482916');
  assert.equal(b.shortcode, '144773');
  assert.equal(b.smsUri, 'sms:144773?body=482916');
  assert.equal(b.expiresAt, EXPIRES);
  assert.ok(b.displayInstruction.includes('144773'));
  assert.equal(b.ticket, pv.signTicket(KEY, b));
  assert.equal(JSON.stringify(b).includes(KEY), false, 'the API key never reaches the browser');
});

test('start: who is turned away, before verify.mn is asked', async () => {
  const cases = [
    [{ phone: '99990000' }, 404, 'USER_NOT_FOUND'],
    [{ phone: '88001122' }, 403, 'USER_HELD'],
    [{ phone: '01012345678' }, 400, 'UNSUPPORTED_PHONE'],
    [{ phone: '' }, 400, 'UNSUPPORTED_PHONE'],
    [{}, 400, 'UNSUPPORTED_PHONE'],
    [null, 400, 'UNSUPPORTED_PHONE'],
  ];
  for (const [body, status, code] of cases) {
    const p = provider();
    const out = await pv.startVerify(startDeps(p), body);
    assert.equal(out.status, status, JSON.stringify(body));
    assert.equal(out.body.error.code, code);
    assert.equal(p.calls.length, 0, 'no session opened for ' + JSON.stringify(body));
  }
});

test('start: a member stored with +976 is found, and the record key stands in for a missing id', async () => {
  const p = provider();
  const out = await pv.startVerify(startDeps(p), { phone: '95001234' });
  assert.equal(out.status, 200);
  assert.equal(out.body.memberId, 'u_p');
});

test('start: the key missing or refused is our configuration', async () => {
  const none = await pv.startVerify(startDeps(provider(), { apiKey: '' }), { phone: '99119007' });
  assert.deepEqual([none.status, none.body.error.code], [500, 'NOT_CONFIGURED']);
  const refused = await pv.startVerify(startDeps(provider({ create: () => ({ http: 401, body: { statusCode: 401, message: 'Unauthorized' } }) })), { phone: '99119007' });
  assert.deepEqual([refused.status, refused.body.error.code], [500, 'NOT_CONFIGURED']);
});

test('start: a taken code is drawn again once; other refusals are the provider\'s', async () => {
  const codes = ['111111', '222222'];
  const p = provider({ create: (n) => (n === 1 ? { http: 409, body: { statusCode: 409, message: 'active session' } } : null) });
  const out = await pv.startVerify(startDeps(p, { code: () => codes.shift() }), { phone: '99119007' });
  assert.equal(out.status, 200);
  assert.deepEqual(p.calls.map(c => c.body.text), ['111111', '222222']);
  assert.equal(out.body.text, '222222');

  const down = await pv.startVerify(startDeps(provider({ create: () => ({ http: 500, body: { message: 'boom' } }) })), { phone: '99119007' });
  assert.deepEqual([down.status, down.body.error.code], [502, 'PROVIDER_ERROR']);
  const noId = await pv.startVerify(startDeps(provider({ create: () => ({ http: 200, body: {} }) })), { phone: '99119007' });
  assert.deepEqual([noId.status, noId.body.error.code], [502, 'PROVIDER_ERROR']);
  const dead = await pv.startVerify(startDeps(provider({ throws: true })), { phone: '99119007' });
  assert.deepEqual([dead.status, dead.body.error.code], [502, 'PROVIDER_UNREACHABLE']);
});

async function opened() {
  const out = await pv.startVerify(startDeps(provider()), { phone: '99119007' });
  const { sessionId, memberId, phone, expiresAt, ticket } = out.body;
  return { sessionId, memberId, phone, expiresAt, ticket };
}

test('check: still waiting', async () => {
  const p = provider();
  const out = await pv.checkVerify(checkDeps(p), await opened());
  assert.deepEqual(out, { status: 200, body: { status: 'PENDING' } });
  assert.equal(p.calls[0].url, 'https://api.verify.mn/sessions/sess-1');
  assert.equal(p.calls[0].method, 'GET');
});

test('check: verified mints a token for the phone\'s Firebase user, carrying the member', async () => {
  const p = provider({ status: { body: { sessionStatus: 'VERIFIED', verifiedAt: '2026-11-16T10:01:00.000Z' } } });
  const minted = [];
  const out = await pv.checkVerify(checkDeps(p, { mintToken: async (e164, memberId) => { minted.push([e164, memberId]); return { token: 'TOKEN', uid: 'fb_uid_1' }; } }), await opened());
  assert.deepEqual(minted, [['+97699119007', 'u_a']]);
  assert.deepEqual(out.body, { status: 'VERIFIED', phone: '+97699119007', memberId: 'u_a', verifiedAt: '2026-11-16T10:01:00.000Z', token: 'TOKEN', uid: 'fb_uid_1' });
});

test('check: verified without the permission to sign tokens still signs the member in', async () => {
  const p = provider({ status: { body: { sessionStatus: 'VERIFIED' } } });
  const out = await pv.checkVerify(checkDeps(p, { mintToken: async () => { throw Object.assign(new Error('denied'), { code: 'auth/insufficient-permission' }); } }), await opened());
  assert.equal(out.status, 200);
  assert.equal(out.body.status, 'VERIFIED');
  assert.equal(out.body.token, null);
  assert.equal(out.body.uid, null);
  assert.equal(out.body.tokenError, 'auth/insufficient-permission');
});

test('check: expired at verify.mn, unknown there, or past the ticket\'s own life', async () => {
  const s = await opened();
  assert.deepEqual((await pv.checkVerify(checkDeps(provider({ status: { body: { sessionStatus: 'EXPIRED' } } })), s)).body, { status: 'EXPIRED' });
  assert.deepEqual((await pv.checkVerify(checkDeps(provider({ status: { http: 404, body: { statusCode: 404, message: 'SESSION олдсонгүй.' } } })), s)).body, { status: 'EXPIRED' });
  const late = provider({ status: { body: { sessionStatus: 'VERIFIED' } } });
  const out = await pv.checkVerify(checkDeps(late, { now: () => Date.parse(EXPIRES) + pv.TICKET_GRACE_MS + 1 }), s);
  assert.deepEqual(out.body, { status: 'EXPIRED' });
  assert.equal(late.calls.length, 0, 'a dead ticket is not even asked about');
  // Inside the grace an SMS sent in the last seconds is still collected.
  const inGrace = await pv.checkVerify(checkDeps(provider({ status: { body: { sessionStatus: 'VERIFIED' } } }), { now: () => Date.parse(EXPIRES) + 60000 }), s);
  assert.equal(inGrace.body.status, 'VERIFIED');
});

test('check: a ticket for anything but what was opened is refused', async () => {
  const s = await opened();
  const verified = () => provider({ status: { body: { sessionStatus: 'VERIFIED' } } });
  const tampered = [
    { ...s, memberId: 'u_h' },                       // another member
    { ...s, phone: '88001122' },                     // another phone
    { ...s, sessionId: 'sess-2' },                   // another session
    { ...s, expiresAt: '2099-01-01T00:00:00.000Z' }, // a longer life
    { ...s, ticket: '' },
    { ...s, ticket: 'x'.repeat(64) },
    { ...s, ticket: undefined },
    {},
    null,
  ];
  for (const body of tampered) {
    const p = verified();
    const out = await pv.checkVerify(checkDeps(p), body);
    assert.deepEqual([out.status, out.body.error?.code], [400, 'BAD_TICKET'], JSON.stringify(body));
    assert.equal(p.calls.length, 0);
  }
  // Signed with another key: also refused.
  const other = await pv.checkVerify(checkDeps(verified(), { apiKey: 'vrf_other' }), s);
  assert.equal(other.body.error.code, 'BAD_TICKET');
});

test('check: the provider failing is said so, not mistaken for waiting', async () => {
  const s = await opened();
  const down = await pv.checkVerify(checkDeps(provider({ status: { http: 500, body: { message: 'boom' } } })), s);
  assert.deepEqual([down.status, down.body.error.code], [502, 'PROVIDER_ERROR']);
  const dead = await pv.checkVerify(checkDeps(provider({ throws: true })), s);
  assert.deepEqual([dead.status, dead.body.error.code], [502, 'PROVIDER_UNREACHABLE']);
  const none = await pv.checkVerify(checkDeps(provider(), { apiKey: '' }), s);
  assert.deepEqual([none.status, none.body.error.code], [500, 'NOT_CONFIGURED']);
});

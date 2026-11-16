// scripts/test-passwords.mjs
// Members' passwords on the server (functions/passwords.js) against a fake
// database: the hash, the fallback sign-in and its lock, who may set whose
// password, and the one-off move of the plain-text passwords.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { toE164 as clientE164 } from '../src/phone-auth.js';

const require = createRequire(import.meta.url);
const pw = require('../functions/passwords.js');
const pv = require('../functions/phone-verify.js');

const NOW = Date.parse('2026-11-16T10:00:00.000Z');

// A fake database: member records, the private secrets, and what was asked.
function world(over = {}) {
  const users = {
    u_a: { id: 'u_a', name: 'Bat', phone: '99119007', role: 'user', status: 'active' },
    u_adm: { id: 'u_adm', name: 'Admin', phone: '88001100', role: 'admin', status: 'active' },
    u_h: { id: 'u_h', name: 'Hold', phone: '88001122', role: 'user', status: 'hold' },
    u_k: { id: 'u_k', name: 'Kim', phone: '01012345678', role: 'user', status: 'active' },
    ...over.users,
  };
  const secrets = { u_a: { pass: pw.hashPassword('golf1234') }, u_k: { pass: pw.hashPassword('seoul-9') }, ...over.secrets };
  const tokens = { 'tok-a': { memberId: 'u_a' }, 'tok-adm': { memberId: 'u_adm' }, 'tok-anon': {} };
  const log = [];
  let now = NOW;
  const deps = {
    now: () => now,
    loadUsers: async () => users,
    loadUser: async (id) => users[id] || null,
    getSecret: async (id) => secrets[id] || null,
    patchSecret: async (id, patch) => {
      log.push(['patch', id, Object.keys(patch).sort().join(',')]);
      secrets[id] = { ...(secrets[id] || {}), ...patch };
      for (const k of Object.keys(secrets[id])) if (secrets[id][k] === null) delete secrets[id][k];
    },
    removePlain: async (key) => { log.push(['removePlain', key]); delete users[key].password; },
    mintToken: async (e164, memberId) => ({ token: `tok:${e164}:${memberId}`, uid: 'fb_' + memberId }),
    verifyIdToken: async (t) => { if (!tokens[t]) throw new Error('bad token'); return tokens[t]; },
  };
  return { users, secrets, log, deps, tick: (ms) => { now += ms; } };
}
const codeOf = (out) => out.body.error?.code;

test('the server reads a phone number the way the app does', () => {
  for (const n of ['99119007', ' 9911-9007 ', '97699119007', '+976 9911 9007', '0097699119007', 88112233, '70112233',
    '01012345678', '010-1234-5678', '+82 10 1234 5678', '0111234567', '+97612345', '1234567', '123456789',
    '+0123456789', '+123', '+1234567890123456', '', null, undefined, 'abc']) {
    assert.equal(pv.toE164(n), clientE164(n), String(n));
  }
});

test('hashPassword: a salted scrypt hash that only its own password opens', () => {
  const h = pw.hashPassword('golf1234');
  assert.match(h, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(h.includes('golf1234'), false);
  assert.notEqual(h, pw.hashPassword('golf1234'), 'a fresh salt every time');
  assert.equal(pw.verifyPassword('golf1234', h), true);
  assert.equal(pw.verifyPassword('golf1235', h), false);
  assert.equal(pw.verifyPassword('', h), false);
  assert.equal(pw.verifyPassword(null, h), false);
});

test('verifyPassword: anything that is not one of our hashes opens nothing', () => {
  for (const stored of ['', null, undefined, 'golf1234', 'scrypt$1$2', 'bcrypt$16384$8$1$AAAA$BBBB',
    'scrypt$x$8$1$AAAA$BBBB', 'scrypt$16384$8$1$$', 'scrypt$0$8$1$AAAA$BBBB']) {
    assert.equal(pw.verifyPassword('golf1234', stored), false, String(stored));
  }
});

test('passwordLogin: the right password signs in and carries the member to a token', async () => {
  const w = world();
  const out = await pw.passwordLogin(w.deps, { phone: '+976 9911-9007', password: 'golf1234' });
  assert.deepEqual(out, { status: 200, body: { ok: true, memberId: 'u_a', token: 'tok:+97699119007:u_a', uid: 'fb_u_a' } });
  assert.deepEqual(w.log, [], 'nothing to reset on a clean record');
  // A foreign number has no SMS sign-in; the password is its way in.
  const kim = await pw.passwordLogin(w.deps, { phone: '010-1234-5678', password: 'seoul-9' });
  assert.equal(kim.body.memberId, 'u_k');
  assert.equal(kim.body.token, 'tok:+821012345678:u_k');
});

test('passwordLogin: who is turned away, and why', async () => {
  const w = world();
  const cases = [
    [{ phone: 'abc', password: 'x' }, 400, 'BAD_PHONE'],
    [{ password: 'x' }, 400, 'BAD_PHONE'],
    [null, 400, 'BAD_PHONE'],
    [{ phone: '99990000', password: 'x' }, 404, 'USER_NOT_FOUND'],
    [{ phone: '88001122', password: 'x' }, 403, 'USER_HELD'],
    [{ phone: '88001100', password: 'x' }, 401, 'NO_PASSWORD'],
    [{ phone: '99119007', password: 'wrong' }, 401, 'WRONG_PASSWORD'],
    [{ phone: '99119007' }, 401, 'WRONG_PASSWORD'],
  ];
  for (const [body, status, code] of cases) {
    const out = await pw.passwordLogin(w.deps, body);
    assert.deepEqual([out.status, codeOf(out)], [status, code], JSON.stringify(body));
  }
});

test('passwordLogin: five wrong in a row lock it for a quarter of an hour, the right one included', async () => {
  const w = world();
  for (let i = 1; i < pw.MAX_FAILS; i++) {
    const out = await pw.passwordLogin(w.deps, { phone: '99119007', password: 'nope' });
    assert.equal(codeOf(out), 'WRONG_PASSWORD', 'attempt ' + i);
    assert.equal(w.secrets.u_a.fails, i);
  }
  const fifth = await pw.passwordLogin(w.deps, { phone: '99119007', password: 'nope' });
  assert.deepEqual([fifth.status, codeOf(fifth), fifth.body.error.retryAfter], [429, 'LOCKED', 900]);
  const right = await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' });
  assert.equal(codeOf(right), 'LOCKED', 'the right password does not open a locked door');
  w.tick(pw.LOCK_MS - 1000);
  assert.equal(codeOf(await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' })), 'LOCKED');
  w.tick(2000);
  const after = await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' });
  assert.equal(after.body.ok, true);
  assert.equal(w.secrets.u_a.fails, 0);
  assert.equal('lockedUntil' in w.secrets.u_a, false);
});

test('passwordLogin: a right password clears the count of wrong ones', async () => {
  const w = world();
  await pw.passwordLogin(w.deps, { phone: '99119007', password: 'nope' });
  await pw.passwordLogin(w.deps, { phone: '99119007', password: 'nope' });
  assert.equal(w.secrets.u_a.fails, 2);
  assert.equal((await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' })).body.ok, true);
  assert.equal(w.secrets.u_a.fails, 0);
});

test('passwordLogin: without the permission to sign tokens the member still gets in', async () => {
  const w = world();
  w.deps.mintToken = async () => { throw Object.assign(new Error('denied'), { code: 'auth/insufficient-permission' }); };
  const out = await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' });
  assert.deepEqual(out.body, { ok: true, memberId: 'u_a', token: null, uid: null, tokenError: 'auth/insufficient-permission' });
});

test('setPassword: a member changes their own, and it is the new one that opens', async () => {
  const w = world();
  const before = w.secrets.u_a.pass;
  const out = await pw.setPassword(w.deps, { idToken: 'tok-a', password: 'birdie-77' });
  assert.deepEqual(out, { status: 200, body: { ok: true } });
  assert.notEqual(w.secrets.u_a.pass, before);
  assert.equal(JSON.stringify(w.secrets).includes('birdie-77'), false, 'never stored as typed');
  assert.equal(w.secrets.u_a.passAt, NOW);
  assert.equal(codeOf(await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' })), 'WRONG_PASSWORD');
  assert.equal((await pw.passwordLogin(w.deps, { phone: '99119007', password: 'birdie-77' })).body.ok, true);
});

test('setPassword: a new password lifts a lock', async () => {
  const w = world({ secrets: { u_a: { pass: pw.hashPassword('golf1234'), fails: 3, lockedUntil: NOW + 60000 } } });
  await pw.setPassword(w.deps, { idToken: 'tok-a', password: 'birdie-77' });
  assert.equal((await pw.passwordLogin(w.deps, { phone: '99119007', password: 'birdie-77' })).body.ok, true);
});

test('setPassword: an admin sets anyone\'s; a member only their own', async () => {
  const w = world();
  const byAdmin = await pw.setPassword(w.deps, { idToken: 'tok-adm', memberId: 'u_k', password: 'hangang1' });
  assert.equal(byAdmin.body.ok, true);
  assert.equal((await pw.passwordLogin(w.deps, { phone: '01012345678', password: 'hangang1' })).body.ok, true);
  const byMember = await pw.setPassword(w.deps, { idToken: 'tok-a', memberId: 'u_k', password: 'hijacked' });
  assert.deepEqual([byMember.status, codeOf(byMember)], [403, 'FORBIDDEN']);
  assert.equal((await pw.passwordLogin(w.deps, { phone: '01012345678', password: 'hangang1' })).body.ok, true, 'unchanged');
});

test('setPassword: no proof of who is asking, no change', async () => {
  const w = world();
  const before = JSON.stringify(w.secrets);
  for (const body of [{ password: 'birdie-77' }, { idToken: '', password: 'birdie-77' }, { idToken: 'forged', password: 'birdie-77' },
    { idToken: 'tok-anon', password: 'birdie-77' }, null]) {
    const out = await pw.setPassword(w.deps, body);
    assert.deepEqual([out.status, codeOf(out)], [401, 'UNAUTHENTICATED'], JSON.stringify(body));
  }
  assert.equal(JSON.stringify(w.secrets), before);
});

test('setPassword: a member that does not exist, an id that is not one, a password too short or long', async () => {
  const w = world();
  assert.equal(codeOf(await pw.setPassword(w.deps, { idToken: 'tok-adm', memberId: 'u_gone', password: 'birdie-77' })), 'USER_NOT_FOUND');
  assert.equal(codeOf(await pw.setPassword(w.deps, { idToken: 'tok-adm', memberId: '../users/u_a', password: 'birdie-77' })), 'USER_NOT_FOUND');
  for (const password of ['', 'abc', 'x'.repeat(129), 1234, null, undefined]) {
    const out = await pw.setPassword(w.deps, { idToken: 'tok-a', password });
    assert.deepEqual([out.status, codeOf(out)], [400, 'WEAK_PASSWORD'], String(password));
  }
  assert.equal((await pw.setPassword(w.deps, { idToken: 'tok-a', password: 'abcd' })).body.ok, true, 'four is enough');
  assert.equal(w.log.filter(l => l[0] === 'patch').length, 1);
});

test('migratePasswords: every plain-text password is hashed, then removed, and still opens', async () => {
  const w = world({
    users: {
      u_a: { id: 'u_a', name: 'Bat', phone: '99119007', role: 'user', status: 'active', password: 'old-plain' },
      u_b: { id: 'u_b', name: 'Bold', phone: '95001234', role: 'user', status: 'active', password: 'tee-time' },
      u_adm: { id: 'u_adm', name: 'Admin', phone: '88001100', role: 'admin', status: 'active', password: 'adm1n-pw' },
      u_e: { id: 'u_e', name: 'Empty', phone: '95005678', role: 'user', status: 'active', password: '' },
      keyed: { name: 'No id field', phone: '95009999', role: 'user', status: 'active', password: 'by-key-1' },
    },
    secrets: { u_a: { pass: pw.hashPassword('golf1234') } },   // already has a hash: it is kept
  });
  const out = await pw.migratePasswords(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out, { status: 200, body: { ok: true, hashed: 3, kept: 1, removed: 5 } });
  assert.equal(Object.values(w.users).some(u => 'password' in u), false, 'no plain text is left on any record');
  assert.equal(JSON.stringify(w.secrets).includes('tee-time'), false);
  // Each move wrote the hash before it removed the plain text.
  const iHash = w.log.findIndex(l => l[0] === 'patch' && l[1] === 'u_b');
  const iRemove = w.log.findIndex(l => l[0] === 'removePlain' && l[1] === 'u_b');
  assert.ok(iHash >= 0 && iHash < iRemove);
  assert.equal((await pw.passwordLogin(w.deps, { phone: '95001234', password: 'tee-time' })).body.ok, true);
  assert.equal((await pw.passwordLogin(w.deps, { phone: '88001100', password: 'adm1n-pw' })).body.ok, true);
  assert.equal((await pw.passwordLogin(w.deps, { phone: '95009999', password: 'by-key-1' })).body.memberId, 'keyed');
  assert.equal((await pw.passwordLogin(w.deps, { phone: '99119007', password: 'golf1234' })).body.ok, true, 'the hash already there won');
  assert.equal(codeOf(await pw.passwordLogin(w.deps, { phone: '95005678', password: '' })), 'NO_PASSWORD');
  // Again: nothing left to do.
  const again = await pw.migratePasswords(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(again.body, { ok: true, hashed: 0, kept: 0, removed: 0 });
});

test('migratePasswords: admins only', async () => {
  const w = world({ users: { u_b: { id: 'u_b', phone: '95001234', role: 'user', status: 'active', password: 'tee-time' } } });
  for (const [body, status, code] of [[{ idToken: 'tok-a' }, 403, 'FORBIDDEN'], [{ idToken: 'forged' }, 401, 'UNAUTHENTICATED'],
    [{}, 401, 'UNAUTHENTICATED'], [null, 401, 'UNAUTHENTICATED']]) {
    const out = await pw.migratePasswords(w.deps, body);
    assert.deepEqual([out.status, codeOf(out)], [status, code], JSON.stringify(body));
  }
  assert.equal(w.users.u_b.password, 'tee-time', 'untouched');
  assert.deepEqual(w.log, []);
});

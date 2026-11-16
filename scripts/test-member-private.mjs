// scripts/test-member-private.mjs
// The private half of the member records on the server
// (functions/member-private.js) against a fake database: how sign-in sees
// the members, and the one-off move of phone numbers and bank details.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PRIVATE_FIELDS as CLIENT_FIELDS, mergeMember as clientMerge } from '../src/member-record.js';

const require = createRequire(import.meta.url);
const mp = require('../functions/member-private.js');
const pv = require('../functions/phone-verify.js');
const pw = require('../functions/passwords.js');

// A fake database: the public records, the private half, and what was done.
function world(over = {}) {
  const users = over.users || {
    u_a: { id: 'u_a', name: 'Bat', role: 'user', status: 'active', phone: '99119007', bankName: 'khan', bankAccount: '5001', bankIban: '', mtbogdCode: 'M-1' },
    u_b: { id: 'u_b', name: 'Bold', role: 'user', status: 'active', phone: '95001234' },
    u_adm: { id: 'u_adm', name: 'Admin', role: 'admin', status: 'active', phone: '88001100' },
    u_n: { id: 'u_n', name: 'No phone', role: 'user', status: 'active' },
  };
  const privates = over.privates || {};
  const tokens = { 'tok-a': { memberId: 'u_a' }, 'tok-adm': { memberId: 'u_adm' }, 'tok-anon': {} };
  const log = [];
  const deps = {
    verifyIdToken: async (t) => { if (!tokens[t]) throw new Error('bad token'); return tokens[t]; },
    loadUser: async (id) => users[id] || null,
    loadUsers: async () => users,
    loadPrivates: async () => privates,
    writePrivate: async (id, patch) => {
      if (over.failWriteFor === id) throw new Error('write failed');
      log.push(['writePrivate', id, Object.keys(patch).sort().join(',')]);
      privates[id] = { ...(privates[id] || {}), ...patch };
    },
    clearPublic: async (key, fields) => {
      log.push(['clearPublic', key, [...fields].sort().join(',')]);
      for (const k of fields) delete users[key][k];
    },
    signInReady: async () => over.outdated || [],
  };
  return { users, privates, log, deps };
}
const codeOf = (out) => out.body.error?.code;

test('the server and the app agree on which fields are private', () => {
  assert.deepEqual(mp.PRIVATE_FIELDS, CLIENT_FIELDS);
});

test('mergeMember: the server puts the halves together the way the app does', () => {
  const cases = [
    [{ id: 'u_a', name: 'Bat', phone: '99119007' }, null],
    [{ id: 'u_a', name: 'Bat', phone: '99119007' }, { phone: '88001122', bankAccount: '5001' }],
    [{ id: 'u_a', name: 'Bat', bankAccount: '5001' }, { bankAccount: '' }],
    [{ id: 'u_a', role: 'user' }, { role: 'admin', phone: '99119007' }],
    [{ id: 'u_a' }, { phone: null }],
  ];
  for (const [pub, priv] of cases) assert.deepEqual(mp.mergeMember(pub, priv), clientMerge(pub, priv));
});

test('mergeUsers: sign-in finds a phone wherever it is — before, during and after the move', () => {
  const users = {
    u_a: { id: 'u_a', name: 'Bat', phone: '99119007' },          // not moved yet
    u_b: { id: 'u_b', name: 'Bold' },                             // moved
    u_c: { id: 'u_c', name: 'Changed', phone: '95000000' },       // an admin changed it since: the private one is the newer
    u_n: { id: 'u_n', name: 'No phone' },
    junk: 'not a record',
  };
  const privates = { u_b: { phone: '95001234' }, u_c: { phone: '95009999' }, u_gone: { phone: '90000000' } };
  const merged = mp.mergeUsers(users, privates);
  assert.equal(merged.u_a.phone, '99119007');
  assert.equal(merged.u_b.phone, '95001234');
  assert.equal(merged.u_c.phone, '95009999');
  assert.equal('phone' in merged.u_n, false);
  assert.equal(merged.junk, 'not a record');
  assert.equal('u_gone' in merged, false, 'a private half with no member record is no member');
  assert.deepEqual(mp.mergeUsers(users, null).u_a, users.u_a);
  assert.deepEqual(mp.mergeUsers(null, privates), {});
});

test('mergeUsers: the private half is the one under the record\'s own key', () => {
  // A record that names another member in its `id` does not get their phone.
  const merged = mp.mergeUsers({ u_x: { id: 'u_adm', name: 'X' } }, { u_adm: { phone: '88001100' } });
  assert.equal('phone' in merged.u_x, false);
});

test('a member moved to the private half still signs in — by SMS and by password', async () => {
  const merged = mp.mergeUsers({ u_b: { id: 'u_b', name: 'Bold', status: 'active' } }, { u_b: { phone: '95001234' } });
  const sms = await pv.startVerify({
    apiKey: 'vrf_test',
    loadUsers: async () => merged,
    fetch: async () => ({ ok: true, status: 201, json: async () => ({ sessionId: 's1', expiresAt: '2026-11-16T10:05:00.000Z' }) }),
    code: () => '123456',
  }, { phone: '95001234' });
  assert.equal(sms.status, 200);
  assert.equal(sms.body.memberId, 'u_b');

  const out = await pw.passwordLogin({
    loadUsers: async () => merged,
    getSecret: async () => ({ pass: pw.hashPassword('tee-time') }),
    patchSecret: async () => {},
    mintToken: async (e164, memberId) => ({ token: `tok:${memberId}`, uid: 'fb' }),
  }, { phone: '95001234', password: 'tee-time' });
  assert.equal(out.status, 200);
  assert.equal(out.body.memberId, 'u_b');
});

test('the member a sign-in names is the record\'s key, whatever the record says of itself', async () => {
  // The public record is written by the app; an `id` in it proves nothing.
  const users = { u_x: { id: 'u_adm', name: 'X', status: 'active', phone: '95001234' } };
  const sms = await pv.startVerify({
    apiKey: 'vrf_test',
    loadUsers: async () => users,
    fetch: async () => ({ ok: true, status: 201, json: async () => ({ sessionId: 's1', expiresAt: '2026-11-16T10:05:00.000Z' }) }),
    code: () => '123456',
  }, { phone: '95001234' });
  assert.equal(sms.body.memberId, 'u_x');
  const out = await pw.passwordLogin({
    loadUsers: async () => users,
    getSecret: async (id) => (id === 'u_x' ? { pass: pw.hashPassword('tee-time') } : null),
    patchSecret: async () => {},
    mintToken: async (e164, memberId) => ({ token: `tok:${memberId}`, uid: 'fb' }),
  }, { phone: '95001234', password: 'tee-time' });
  assert.equal(out.body.memberId, 'u_x');
  assert.equal(out.body.token, 'tok:u_x');
});

test('migratePrivateFields: an admin only', async () => {
  const w = world();
  assert.equal(codeOf(await mp.migratePrivateFields(w.deps, {})), 'UNAUTHENTICATED');
  assert.equal(codeOf(await mp.migratePrivateFields(w.deps, { idToken: 'nope' })), 'UNAUTHENTICATED');
  assert.equal(codeOf(await mp.migratePrivateFields(w.deps, { idToken: 'tok-anon' })), 'UNAUTHENTICATED');
  const out = await mp.migratePrivateFields(w.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 403);
  assert.equal(codeOf(out), 'FORBIDDEN');
  assert.deepEqual(w.log, [], 'nothing was touched');
  assert.equal(w.users.u_a.phone, '99119007');
});

test('migratePrivateFields: refuses while a sign-in function is out of date', async () => {
  // Moving the phones out from under a function that reads only the public
  // records would leave no one able to sign in.
  const w = world({ outdated: ['phoneVerifyStart'] });
  const out = await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 409);
  assert.equal(codeOf(out), 'FUNCTIONS_OUTDATED');
  assert.deepEqual(out.body.error.outdated, ['phoneVerifyStart']);
  assert.deepEqual(w.log, []);
  assert.equal(w.users.u_a.phone, '99119007');
});

test('migratePrivateFields: every private field moves, and the public record keeps the rest', async () => {
  const w = world();
  const out = await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out, { status: 200, body: { ok: true, moved: 3, kept: 0, cleared: 3 } });
  assert.deepEqual(w.privates, {
    u_a: { phone: '99119007', bankName: 'khan', bankAccount: '5001', mtbogdCode: 'M-1' },   // the empty IBAN had nothing to carry
    u_b: { phone: '95001234' },
    u_adm: { phone: '88001100' },
  });
  assert.deepEqual(w.users.u_a, { id: 'u_a', name: 'Bat', role: 'user', status: 'active' });
  assert.deepEqual(w.users.u_n, { id: 'u_n', name: 'No phone', role: 'user', status: 'active' });
  for (const u of Object.values(w.users)) for (const k of mp.PRIVATE_FIELDS) assert.equal(k in u, false);
  // And sign-in still finds everyone.
  const merged = mp.mergeUsers(w.users, w.privates);
  assert.equal(merged.u_a.phone, '99119007');
  assert.equal(merged.u_adm.phone, '88001100');
});

test('migratePrivateFields: the private copy is written before the public one goes', async () => {
  const w = world();
  await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  const of = (id) => w.log.filter(l => l[1] === id).map(l => l[0]);
  assert.deepEqual(of('u_a'), ['writePrivate', 'clearPublic']);
  assert.deepEqual(of('u_b'), ['writePrivate', 'clearPublic']);
});

test('migratePrivateFields: a failed write leaves that member as they were', async () => {
  const w = world({ failWriteFor: 'u_b' });
  await assert.rejects(mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' }), /write failed/);
  assert.equal(w.users.u_b.phone, '95001234', 'still readable, never lost');
  assert.equal('u_b' in w.privates, false);
});

test('migratePrivateFields: a value already in the private half is the one that stays', async () => {
  // An admin changed the phone, and a member their account, after the rules
  // went in: those went to the private half; the public copies are stale.
  const w = world({
    users: {
      u_a: { id: 'u_a', name: 'Bat', role: 'user', status: 'active', phone: '99119007', bankAccount: '5001', bankName: 'khan' },
      u_adm: { id: 'u_adm', name: 'Admin', role: 'admin', status: 'active' },
    },
    privates: { u_a: { phone: '88112233', bankAccount: '' } },
  });
  const out = await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out.body, { ok: true, moved: 1, kept: 0, cleared: 1 });
  assert.deepEqual(w.privates.u_a, { phone: '88112233', bankAccount: '', bankName: 'khan' });
  assert.deepEqual(w.users.u_a, { id: 'u_a', name: 'Bat', role: 'user', status: 'active' });
});

test('migratePrivateFields: safe to run again', async () => {
  const w = world();
  await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  const before = JSON.stringify([w.users, w.privates]);
  w.log.length = 0;
  const again = await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(again.body, { ok: true, moved: 0, kept: 0, cleared: 0 });
  assert.deepEqual(w.log, []);
  assert.equal(JSON.stringify([w.users, w.privates]), before);
});

test('migratePrivateFields: a record with only empty private fields is just cleaned', async () => {
  const w = world({
    users: {
      u_e: { id: 'u_e', name: 'Empty', role: 'user', status: 'active', bankName: '', bankAccount: '', bankIban: '' },
      u_adm: { id: 'u_adm', name: 'Admin', role: 'admin', status: 'active' },
    },
  });
  const out = await mp.migratePrivateFields(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out.body, { ok: true, moved: 0, kept: 1, cleared: 1 });
  assert.deepEqual(w.privates, {});
  assert.deepEqual(w.users.u_e, { id: 'u_e', name: 'Empty', role: 'user', status: 'active' });
});

// scripts/test-device-access.mjs
// The pure half of the device-access self-heal: how a refusal is recognised,
// how the anonymous sign-in backs off, what a registration outcome means for
// the admin tab's banner, and the words a refused tournament write gets.
// Nothing here touches Firebase: initStore() is never called, so the store
// runs in its local mode. Run with: npm run test:mp

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const store = await import('../src/store.js');
const { tnWriteError, tnAccessBannerHTML } = await import('../src/tn-errors.js');

import test from 'node:test';
import assert from 'node:assert/strict';

test('isPermissionDenied reads the write shape, the read shape, and nothing else', () => {
  assert.equal(store.isPermissionDenied({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED: Permission denied' }), true);
  assert.equal(store.isPermissionDenied(new Error("permission_denied at /tournaments/x: Client doesn't have permission to access the desired data.")), true);
  assert.equal(store.isPermissionDenied('PERMISSION_DENIED: Permission denied'), true);
  assert.equal(store.isPermissionDenied({ code: 'NETWORK_ERROR', message: 'network' }), false);
  assert.equal(store.isPermissionDenied(new Error('boom')), false);
  assert.equal(store.isPermissionDenied(null), false);
  assert.equal(store.isPermissionDenied(undefined), false);
  assert.equal(store.isPermissionDenied({}), false);
});

test('nextAuthRetryMs doubles from two seconds and caps at a minute', () => {
  assert.equal(store.nextAuthRetryMs(0), 2000);
  assert.equal(store.nextAuthRetryMs(1), 4000);
  assert.equal(store.nextAuthRetryMs(4), 32000);
  assert.equal(store.nextAuthRetryMs(5), 60000);
  assert.equal(store.nextAuthRetryMs(40), 60000);
  assert.equal(store.nextAuthRetryMs(-1), 2000);
  assert.equal(store.nextAuthRetryMs(undefined), 2000);
  assert.equal(store.ANON_MAX_ATTEMPTS, 8);
});

test('deviceAccessProblem: nothing to say when in order or local; the three problems otherwise', () => {
  assert.equal(store.deviceAccessProblem(null), null);
  assert.equal(store.deviceAccessProblem({ ok: true, reason: 'local' }), null);
  assert.equal(store.deviceAccessProblem({ ok: false, uid: 'u', reason: 'no-user' }), null);
  assert.equal(store.deviceAccessProblem({ ok: true, uid: 'u', role: 'admin' }), null);
  assert.equal(store.deviceAccessProblem({ ok: false, uid: null, reason: 'no-auth' }), 'no-auth');
  assert.equal(store.deviceAccessProblem({ ok: false, uid: 'u', reason: 'denied' }), 'denied');
  assert.equal(store.deviceAccessProblem({ ok: false, uid: 'u', reason: 'error' }), 'error');
});

test('in local mode a registration is a no-op that reports ok, and no state is kept', async () => {
  assert.deepEqual(await store.ensureDeviceAccess({ id: 'u1', role: 'admin' }), { ok: true, reason: 'local' });
  assert.equal(store.deviceAccessState(), null);
  assert.equal(store.getDeviceUid(), null);
  assert.equal(await store.ensureAnonAuth(), null, 'no auth object: nothing to sign in to');
});

test('tnWriteError: a refusal explained, other errors in their own words, nothing → the fallback', () => {
  const denied = tnWriteError({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED: Permission denied' });
  assert.ok(denied.includes('admin device'), denied);
  assert.ok(!denied.includes('rules'), 'the rules are not blamed');
  assert.equal(tnWriteError(new Error('boom')), 'boom');
  assert.equal(tnWriteError('plain text'), 'plain text');
  assert.equal(tnWriteError({}), 'Could not save');
  assert.equal(tnWriteError(null, 'mpSaveFailed'), 'Could not save');
});

test('tnAccessBannerHTML: silent when in order; the reason, the role and the retry button otherwise', () => {
  assert.equal(tnAccessBannerHTML({ ok: true, uid: 'u', role: 'admin' }), '');
  assert.equal(tnAccessBannerHTML(null), '');
  const noAuth = tnAccessBannerHTML({ ok: false, uid: null, reason: 'no-auth' });
  assert.ok(noAuth.includes('id="tn-access-retry"') && noAuth.includes('data-tn-access="no-auth"'));
  assert.ok(noAuth.includes('not connected'), noAuth);
  const denied = tnAccessBannerHTML({ ok: false, uid: 'u', reason: 'denied', role: 'player' }, (r) => r === 'player' ? 'Player' : r);
  assert.ok(denied.includes('data-tn-access="denied"') && denied.includes('refused') && denied.includes('Player'), denied);
  const err = tnAccessBannerHTML({ ok: false, uid: 'u', reason: 'error', error: 'network' });
  assert.ok(err.includes('data-tn-access="error"') && err.includes('network'), err);
});

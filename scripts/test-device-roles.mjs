// scripts/test-device-roles.mjs
// The member-role → device-role ladder that automatic device registration
// and the database rules both rely on. Run with: npm run test:mp

// store.js only touches localStorage inside functions, but guard anyway so
// an unrelated refactor can't break the import under node.
globalThis.localStorage ??= {
  _v: {},
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { deviceRoleFor } = await import('../src/store.js');

import test from 'node:test';
import assert from 'node:assert/strict';

test('admins run tournaments, marshals score, members are players', () => {
  assert.equal(deviceRoleFor({ role: 'admin' }), 'admin');
  assert.equal(deviceRoleFor({ role: 'marshal' }), 'scorer');
  assert.equal(deviceRoleFor({ role: 'user' }), 'player');
  assert.equal(deviceRoleFor({ role: undefined }), 'player');
});

test('no user, no device role', () => {
  assert.equal(deviceRoleFor(null), null);
});

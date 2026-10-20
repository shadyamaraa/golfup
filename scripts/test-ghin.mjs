// scripts/test-ghin.mjs
// The GHIN lookup in functions/ghin.js, against a fake GHIN: login, the
// cached token, the one re-login on a 401, the home-club pick, and that
// personal fields (email, phone, birth date) never leave the server.
// Nothing here touches the network. Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ghin = require('../functions/ghin.js');

process.env.GHIN_EMAIL = 'club@example.com';
process.env.GHIN_PASSWORD = 'secret';
delete process.env.GHIN_BASE_URL;

const GOLFERS = [
  { ghin: 1234567, first_name: 'Bat', last_name: 'Dorj', club_name: 'Other Club', is_home_club: false,
    hi_display: '12.4', email: 'bat@example.com', phone_number: '99112233', date_of_birth: '1980-01-01' },
  { ghin: 1234567, first_name: 'Bat', last_name: 'Dorj', club_name: 'UB Golf', is_home_club: true,
    hi_display: '12.4', low_hi_display: '10.9', status: 'Active', gender: 'M',
    email: 'bat@example.com', phone_number: '99112233', date_of_birth: '1980-01-01' },
];

// A fake GHIN: records calls; `revoke` makes the next search answer 401 once.
function fakeGhin({ revoke = false } = {}) {
  const calls = [];
  let revoked = revoke;
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, auth: opts.headers?.Authorization });
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (url.endsWith('/users/login.json')) {
      const body = JSON.parse(opts.body);
      if (body.user.password !== 'secret') return json(401, { errors: 'bad' });
      return json(200, { token: 'tok' + calls.filter(c => c.url.endsWith('login.json')).length });
    }
    if (url.includes('/golfers/search.json')) {
      if (revoked) { revoked = false; return json(401, {}); }
      const id = new URL(url).searchParams.get('golfer_id');
      return json(200, { golfers: GOLFERS.filter(g => String(g.ghin) === id) });
    }
    return json(404, {});
  };
  return calls;
}

test('logs in on staging, then looks the golfer up with the bearer token', async () => {
  ghin._reset();
  const calls = fakeGhin();
  const g = await ghin.golferByGhin('1234567');
  assert.equal(calls[0].url, 'https://api-uat.ghin.com/api/v2/users/login.json');
  assert.match(calls[1].url, /^https:\/\/api-uat\.ghin\.com\/api\/v2\/golfers\/search\.json\?golfer_id=1234567/);
  assert.equal(calls[1].auth, 'Bearer tok1');
  assert.equal(g.clubName, 'UB Golf', 'the home club affiliation wins');
  assert.equal(g.handicapIndex, '12.4');
  assert.equal(g.lowHi, '10.9');
});

test('personal details stay on the server', async () => {
  ghin._reset();
  fakeGhin();
  const g = await ghin.golferByGhin('1234567');
  for (const k of ['email', 'phone_number', 'date_of_birth', 'phone', 'dateOfBirth']) assert.ok(!(k in g), k);
});

test('the token is reused across lookups', async () => {
  ghin._reset();
  const calls = fakeGhin();
  await ghin.golferByGhin('1234567');
  await ghin.golferByGhin('1234567');
  assert.equal(calls.filter(c => c.url.endsWith('login.json')).length, 1);
});

test('a revoked token logs in once more and retries', async () => {
  ghin._reset();
  await (fakeGhin(), ghin.golferByGhin('1234567')); // warm the cache
  const calls = fakeGhin({ revoke: true });
  const g = await ghin.golferByGhin('1234567');
  assert.equal(g.lastName, 'Dorj');
  assert.equal(calls.filter(c => c.url.endsWith('login.json')).length, 1);
});

test('an unknown number is null, not an error', async () => {
  ghin._reset();
  fakeGhin();
  assert.equal(await ghin.golferByGhin('7654321'), null);
});

test('missing credentials fail before any request', async () => {
  ghin._reset();
  const calls = fakeGhin();
  const saved = process.env.GHIN_PASSWORD;
  delete process.env.GHIN_PASSWORD;
  await assert.rejects(ghin.golferByGhin('1234567'), /not configured/);
  process.env.GHIN_PASSWORD = saved;
  assert.equal(calls.length, 0);
});

test('GHIN_BASE_URL switches to production', async () => {
  ghin._reset();
  const calls = fakeGhin();
  process.env.GHIN_BASE_URL = 'https://ghin.example.test/api/v2/';
  await ghin.golferByGhin('1234567');
  delete process.env.GHIN_BASE_URL;
  assert.equal(calls[0].url, 'https://ghin.example.test/api/v2/users/login.json');
});

// scripts/test-ghin.mjs
// Reading GHIN from the server (functions/ghin.js) against a fake GHIN: the
// login and its token, what is kept of a golfer and what is not, several
// numbers at once, and who may ask for what.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ghin = require('../functions/ghin.js');

const NOW = Date.parse('2026-11-16T10:00:00.000Z');
const EMAIL = 'mga@example.mn';
const PASSWORD = 'federation-secret';

// One row of golfers/search, as GHIN's own example has it — the personal
// details included, so the tests can see them not leave.
const row = (ghinNo, over = {}) => ({
  first_name: 'Bat', last_name: 'Bold', player_name: 'Bat Bold', gender: 'M',
  email: 'bat@example.mn', phone_number: '99119007', date_of_birth: '1988-04-02',
  street_1: '1 Peace Ave', city: 'Ulaanbaatar', zip: '14200',
  status: 'Active', ghin: ghinNo, handicap_index: '12.3', hi_value: 12.3, hi_display: '12.3',
  low_hi: '10.1', low_hi_value: 10.1, low_hi_display: '10.1', rev_date: '2026-11-10',
  association_id: 188, association_name: 'Mongolian Golf Association', club_name: 'UB Golf Club', club_id: 5001,
  is_home_club: true, hi_withdrawn: false, entitlement: true,
  ...over,
});

// A fake GHIN. `golfers` are the rows it holds; everything asked is logged.
function fakeGhin(golfers = [], over = {}) {
  const state = { logins: 0, searches: [], asked: [], tokens: new Set(), n: 0, ...over };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    state.asked.push({ url: String(url), method: init.method || 'GET', body: init.body || null, auth: init.headers?.Authorization || null });
    if (state.down) throw new TypeError('fetch failed');
    if (u.pathname.endsWith('/users/login.json')) {
      state.logins++;
      const b = JSON.parse(init.body);
      if (state.loginStatus) return json(state.loginStatus, {});
      if (b.user.email !== EMAIL || b.user.password !== PASSWORD) return json(401, { error: 'Invalid' });
      if (state.noToken) return json(200, { user: {} });
      const token = `T${++state.n}`;
      state.tokens.add(token);
      return json(200, { user: { id: '60' }, token });
    }
    const bearer = String(init.headers?.Authorization || '').replace(/^Bearer /, '');
    if (!state.tokens.has(bearer)) return json(401, { error: 'Unauthorized' });
    if (state.searchStatus) return json(state.searchStatus, {});
    if (u.pathname.endsWith('/golfers/search.json')) {
      const ids = u.searchParams.get('golfer_id').split(',');
      const page = Number(u.searchParams.get('page'));
      const per = Number(u.searchParams.get('per_page'));
      state.searches.push({ ids, page, per });
      const keys = new Set(ids.map(i => String(Number(i))));
      const all = golfers.filter(g => keys.has(String(Number(g._for ?? g.ghin))));
      // eslint-disable-next-line no-unused-vars
      const out = all.slice((page - 1) * per, page * per).map(({ _for, ...g }) => g);
      return json(200, { golfers: out });
    }
    return json(404, {});
  };
  return { state, fetch };
}

function clientFor(fake, over = {}) {
  let now = NOW;
  const client = ghin.createClient({ fetch: fake.fetch, email: EMAIL, password: PASSWORD, now: () => now, ...over });
  return { client, tick: (ms) => { now += ms; }, now: () => now };
}

// A fake database around the functions: members, the server-only secrets
// (the lookup counter lives there), and what was saved.
function world(golfers = [], over = {}) {
  ghin._resetTokens();
  const fake = fakeGhin(golfers, over.ghin);
  const { client, tick, now } = clientFor(fake);
  const users = over.users || {
    u_a: { id: 'u_a', name: 'Bat', role: 'user', status: 'active', ghinNumber: '12345678' },
    u_b: { id: 'u_b', name: 'Bold', role: 'user', status: 'active', ghinNumber: '7900344' },
    u_n: { id: 'u_n', name: 'No number', role: 'user', status: 'active' },
    u_adm: { id: 'u_adm', name: 'Admin', role: 'admin', status: 'active', ghinNumber: '23456789' },
  };
  const secrets = {};
  const saved = {};
  const tokens = { 'tok-a': { memberId: 'u_a' }, 'tok-b': { memberId: 'u_b' }, 'tok-adm': { memberId: 'u_adm' }, 'tok-anon': {} };
  const deps = {
    client,
    now,
    verifyIdToken: async (t) => { if (!tokens[t]) throw new Error('bad token'); return tokens[t]; },
    loadUser: async (id) => users[id] || null,
    loadUsers: async () => users,
    getSecret: async (id) => secrets[id] || null,
    patchSecret: async (id, patch) => { secrets[id] = { ...(secrets[id] || {}), ...patch }; },
    saveGhin: async (id, record) => { saved[id] = record; },
    saveAllGhin: async (records) => { Object.assign(saved, records); },
  };
  return { fake, deps, users, secrets, saved, tick };
}
const codeOf = (out) => out.body.error?.code;
const PII = ['email', 'phone_number', 'date_of_birth', 'street_1', 'city', 'zip', 'first_name', 'last_name'];

test('staging unless told otherwise', () => {
  assert.equal(ghin.baseUrlOf(undefined), 'https://api-uat.ghin.com/api/v2');
  assert.equal(ghin.baseUrlOf('https://api.ghin.com/api/v2/'), 'https://api.ghin.com/api/v2');
  assert.equal(ghin.envOf(ghin.UAT_BASE), 'staging');
  assert.equal(ghin.envOf('https://api.ghin.com/api/v2'), 'production');
  assert.equal(ghin.envOf('https://api2.ghin.com/api/v1'), 'production');
});

test('ghinNumber: seven or eight digits, however they were typed', () => {
  assert.equal(ghin.ghinNumber('12345678'), '12345678');
  assert.equal(ghin.ghinNumber(' 1234-567 '), '1234567');
  assert.equal(ghin.ghinNumber(7900344), '7900344');
  for (const bad of ['123456', '123456789', '', null, undefined, 'abc']) assert.equal(ghin.ghinNumber(bad), null, String(bad));
});

test('the client logs in once and keeps the token', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([row(12345678)]);
  const { client } = clientFor(fake);
  await client.get('golfers/search', { golfer_id: '12345678', per_page: 100, page: 1 });
  await client.get('golfers/search', { golfer_id: '12345678', per_page: 100, page: 1 });
  assert.equal(fake.state.logins, 1);
  assert.equal(fake.state.searches.length, 2);
  assert.equal(client.env, 'staging');
});

test('the password goes to the login and nowhere else', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([row(12345678)]);
  const { client } = clientFor(fake);
  await client.get('golfers/search', { golfer_id: '12345678', per_page: 100, page: 1 });
  const login = fake.state.asked.filter(a => a.url.endsWith('/users/login.json'));
  assert.equal(login.length, 1);
  assert.equal(login[0].method, 'POST');
  assert.deepEqual(JSON.parse(login[0].body), { user: { email: EMAIL, password: PASSWORD, remember_me: 'true' } });
  for (const a of fake.state.asked.filter(x => !x.url.endsWith('/users/login.json'))) {
    assert.equal(a.url.includes(PASSWORD), false);
    assert.equal(a.body, null);
    assert.match(a.auth, /^Bearer T\d+$/);
  }
});

test('the client logs in again when the token is old, or ended early', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([row(12345678)]);
  const { client, tick } = clientFor(fake);
  const ask = () => client.get('golfers/search', { golfer_id: '12345678', per_page: 100, page: 1 });
  await ask();
  tick(ghin.TOKEN_TTL_MS - 1000);
  await ask();
  assert.equal(fake.state.logins, 1, 'still good');
  tick(2000);
  await ask();
  assert.equal(fake.state.logins, 2, 'renewed a little before it runs out');
  // GHIN ends the token before its time: a 401, one more login, the answer.
  fake.state.tokens.clear();
  const data = await ask();
  assert.equal(fake.state.logins, 3);
  assert.equal(data.golfers.length, 1);
});

test('the client says what went wrong', async () => {
  const failing = async (over, clientOver) => {
    ghin._resetTokens();
    const fake = fakeGhin([], over);
    const { client } = clientFor(fake, clientOver);
    return client.get('golfers/search', { golfer_id: '12345678', per_page: 100, page: 1 }).then(() => null, e => e);
  };
  assert.equal((await failing({}, { password: '' })).ghin, 'NOT_CONFIGURED');
  assert.equal((await failing({}, { email: undefined })).ghin, 'NOT_CONFIGURED');
  assert.equal((await failing({}, { password: 'wrong' })).ghin, 'LOGIN_REFUSED');
  assert.equal((await failing({ noToken: true })).ghin, 'LOGIN_REFUSED');
  assert.equal((await failing({ loginStatus: 500 })).ghin, 'GHIN_ERROR');
  assert.equal((await failing({ down: true })).ghin, 'GHIN_UNREACHABLE');
  const err = await failing({ searchStatus: 503 });
  assert.equal(err.ghin, 'GHIN_ERROR');
  assert.equal(err.upstream, 503);
});

test('trimGolfer: a name, a club and a Handicap Index — nothing personal', () => {
  const g = ghin.trimGolfer(row(12345678), '12345678');
  assert.deepEqual(g, {
    number: '12345678', name: 'Bat Bold', club: 'UB Golf Club', association: 'Mongolian Golf Association',
    status: 'Active', hi: '12.3', hiValue: 12.3, lowHi: '10.1', revDate: '2026-11-10', withdrawn: false,
  });
  for (const k of PII) assert.equal(k in g, false, k);
  assert.equal(JSON.stringify(g).includes('bat@example.mn'), false);
  assert.equal(JSON.stringify(g).includes('1988'), false);
});

test('trimGolfer: no Handicap Index, a plus handicap, a withdrawn one', () => {
  const nh = ghin.trimGolfer(row(1234567, { handicap_index: 'NH', hi_display: 'NH', hi_value: 999, low_hi_display: 'NH', low_hi_value: 999, rev_date: null }), '1234567');
  assert.equal(nh.hi, 'NH');
  assert.equal(nh.hiValue, null);
  assert.equal(nh.revDate, null);
  const plus = ghin.trimGolfer(row(1234567, { handicap_index: '+1.2', hi_display: '+1.2', hi_value: -1.2 }), '1234567');
  assert.equal(plus.hi, '+1.2');
  assert.equal(plus.hiValue, -1.2);
  const wd = ghin.trimGolfer(row(1234567, { hi_display: 'WD', hi_value: 999, hi_withdrawn: true }), '1234567');
  assert.equal(wd.withdrawn, true);
  assert.equal(wd.hiValue, null);
  // An older shape of row: no display field, no player_name.
  const old = ghin.trimGolfer({ first_name: 'Bat', last_name: 'Bold', ghin: 1234567, handicap_index: '8.0' }, '1234567');
  assert.equal(old.hi, '8.0');
  assert.equal(old.name, 'Bat Bold');
});

test('golfersByNumber: the home club\'s row is the one read', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([
    row(12345678, { club_name: 'Another Club', is_home_club: false }),
    row(12345678, { club_name: 'UB Golf Club', is_home_club: true }),
  ]);
  const found = await ghin.golfersByNumber(clientFor(fake).client, ['12345678']);
  assert.equal(found.get('12345678').club, 'UB Golf Club');
});

test('golfersByNumber: several numbers in one request, an unknown one simply absent', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([row(12345678), row(7900344, { player_name: 'Phil B', hi_display: '19.3', hi_value: 19.3 })]);
  const found = await ghin.golfersByNumber(clientFor(fake).client, ['12345678', '7900344', '11111111', 'not a number', '12345678']);
  assert.equal(fake.state.searches.length, 1);
  assert.deepEqual(fake.state.searches[0].ids, ['12345678', '7900344', '11111111']);
  assert.equal(found.size, 2);
  assert.equal(found.get('7900344').hi, '19.3');
  assert.equal(found.has('11111111'), false);
});

test('golfersByNumber: fifty numbers a request, every page of the answer', async () => {
  ghin._resetTokens();
  const numbers = Array.from({ length: 120 }, (_, i) => String(20000000 + i));
  // Three rows a golfer — three clubs — so fifty golfers answer 150 rows: two pages.
  const golfers = numbers.flatMap(n => [row(Number(n), { is_home_club: false }), row(Number(n)), row(Number(n), { is_home_club: false })]);
  const fake = fakeGhin(golfers);
  const found = await ghin.golfersByNumber(clientFor(fake).client, numbers);
  assert.equal(found.size, 120);
  assert.deepEqual(fake.state.searches.map(s => [s.ids.length, s.page]), [[50, 1], [50, 2], [50, 1], [50, 2], [20, 1]]);
  assert.equal(fake.state.searches.every(s => s.per === 100), true);
});

test('golfersByNumber: GHIN answers a number as an integer', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([row(1234567)]);
  // The member typed it with a leading zero; GHIN has no such thing.
  const found = await ghin.golfersByNumber(clientFor(fake).client, ['01234567', '23456789']);
  assert.equal(found.get('01234567').hi, '12.3');
  assert.equal(found.get('01234567').number, '01234567');
});

test('golfersByNumber: a masked row is asked for again, one number at a time', async () => {
  ghin._resetTokens();
  // u_b's only row is for a club this login has no rights to: the number comes back masked.
  const fake = fakeGhin([row(12345678), row('7*****4', { _for: 7900344, player_name: 'Phil B', hi_display: '19.3' })]);
  const found = await ghin.golfersByNumber(clientFor(fake).client, ['12345678', '7900344', '11111111']);
  assert.equal(found.get('12345678').hi, '12.3');
  assert.equal(found.get('7900344').name, 'Phil B', 'found when asked for alone');
  assert.equal(found.has('11111111'), false);
  assert.deepEqual(fake.state.searches.map(s => s.ids), [['12345678', '7900344', '11111111'], ['7900344'], ['11111111']]);
});

test('lookup: a signed-in member, a real number', async () => {
  const w = world([row(12345678)]);
  assert.equal(codeOf(await ghin.lookup(w.deps, { ghin: '12345678' })), 'UNAUTHENTICATED');
  assert.equal(codeOf(await ghin.lookup(w.deps, { idToken: 'nope', ghin: '12345678' })), 'UNAUTHENTICATED');
  assert.equal(codeOf(await ghin.lookup(w.deps, { idToken: 'tok-anon', ghin: '12345678' })), 'UNAUTHENTICATED');
  assert.equal(w.fake.state.asked.length, 0, 'GHIN is not asked for a stranger');
  assert.equal(codeOf(await ghin.lookup(w.deps, { idToken: 'tok-a', ghin: '123' })), 'BAD_GHIN');
  const none = await ghin.lookup(w.deps, { idToken: 'tok-a', ghin: '11111111' });
  assert.equal(none.status, 404);
  assert.equal(codeOf(none), 'NOT_FOUND');
});

test('lookup: who GHIN has under the number, trimmed, and nothing stored', async () => {
  const w = world([row(12345678)]);
  const out = await ghin.lookup(w.deps, { idToken: 'tok-b', ghin: '1234-5678' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, {
    ok: true, env: 'staging',
    golfer: {
      number: '12345678', name: 'Bat Bold', club: 'UB Golf Club', association: 'Mongolian Golf Association',
      status: 'Active', hi: '12.3', hiValue: 12.3, lowHi: '10.1', revDate: '2026-11-10', withdrawn: false,
    },
  });
  assert.equal(JSON.stringify(out.body).includes('example.mn'), false);
  assert.deepEqual(w.saved, {});
});

test('lookup: thirty an hour for each member', async () => {
  const w = world([row(12345678)]);
  for (let i = 0; i < ghin.LOOKUPS_PER_HOUR; i++) {
    assert.equal((await ghin.lookup(w.deps, { idToken: 'tok-a', ghin: '12345678' })).status, 200, `lookup ${i + 1}`);
  }
  const asked = w.fake.state.searches.length;
  const over = await ghin.lookup(w.deps, { idToken: 'tok-a', ghin: '12345678' });
  assert.equal(over.status, 429);
  assert.equal(codeOf(over), 'TOO_MANY');
  assert.equal(over.body.error.retryAfter, 3600);
  assert.equal(w.fake.state.searches.length, asked, 'GHIN is not asked');
  // Another member is not held back by it.
  assert.equal((await ghin.lookup(w.deps, { idToken: 'tok-b', ghin: '12345678' })).status, 200);
  // An hour on, the count starts again.
  w.tick(60 * 60 * 1000);
  assert.equal((await ghin.lookup(w.deps, { idToken: 'tok-a', ghin: '12345678' })).status, 200);
  assert.equal(w.secrets.u_a.ghinCount, 1);
});

test('lookup: a failure on our side is told apart from one on GHIN\'s', async () => {
  const codeWith = async (over) => codeOf(await ghin.lookup(world([row(12345678)], { ghin: over }).deps, { idToken: 'tok-a', ghin: '12345678' }));
  assert.equal(await codeWith({ loginStatus: 401 }), 'LOGIN_REFUSED');
  assert.equal(await codeWith({ down: true }), 'GHIN_UNREACHABLE');
  assert.equal(await codeWith({ searchStatus: 500 }), 'GHIN_ERROR');
  const w = world([row(12345678)]);
  w.deps.client = ghin.createClient({ fetch: w.fake.fetch, email: '', password: '' });
  const out = await ghin.lookup(w.deps, { idToken: 'tok-a', ghin: '12345678' });
  assert.equal(out.status, 500);
  assert.equal(codeOf(out), 'NOT_CONFIGURED');
});

test('sync: a member\'s own Handicap Index, read by the number on their record', async () => {
  const w = world([row(12345678)]);
  const out = await ghin.sync(w.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 200);
  const want = {
    number: '12345678', name: 'Bat Bold', club: 'UB Golf Club', association: 'Mongolian Golf Association',
    status: 'Active', hi: '12.3', hiValue: 12.3, lowHi: '10.1', revDate: '2026-11-10', withdrawn: false,
    found: true, env: 'staging', syncedAt: NOW,
  };
  assert.deepEqual(out.body, { ok: true, ghin: want });
  assert.deepEqual(w.saved, { u_a: want });
  assert.deepEqual(w.fake.state.searches[0].ids, ['12345678'], 'the number is the record\'s, not one the caller sends');
});

test('sync: the number the caller sends is not the one read', async () => {
  const w = world([row(12345678), row(7900344, { hi_display: '2.0' })]);
  await ghin.sync(w.deps, { idToken: 'tok-a', ghin: '7900344', number: '7900344' });
  assert.equal(w.saved.u_a.number, '12345678');
  assert.equal(w.saved.u_a.hi, '12.3');
});

test('sync: another member\'s is an admin\'s to read', async () => {
  const w = world([row(12345678), row(7900344, { hi_display: '19.3' })]);
  const no = await ghin.sync(w.deps, { idToken: 'tok-a', memberId: 'u_b' });
  assert.equal(no.status, 403);
  assert.equal(codeOf(no), 'FORBIDDEN');
  assert.deepEqual(w.saved, {});
  const yes = await ghin.sync(w.deps, { idToken: 'tok-adm', memberId: 'u_b' });
  assert.equal(yes.status, 200);
  assert.equal(w.saved.u_b.hi, '19.3');
});

test('sync: who it cannot be done for', async () => {
  const w = world([row(12345678)]);
  assert.equal(codeOf(await ghin.sync(w.deps, {})), 'UNAUTHENTICATED');
  assert.equal(codeOf(await ghin.sync(w.deps, { idToken: 'tok-adm', memberId: 'u_gone' })), 'USER_NOT_FOUND');
  assert.equal(codeOf(await ghin.sync(w.deps, { idToken: 'tok-adm', memberId: 'users/u_a' })), 'USER_NOT_FOUND');
  assert.equal(codeOf(await ghin.sync(w.deps, { idToken: 'tok-adm', memberId: 'u_n' })), 'NO_GHIN');
  assert.deepEqual(w.saved, {});
});

test('sync: a number GHIN does not know is stored as not found', async () => {
  const w = world([]);
  const out = await ghin.sync(w.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 200);
  assert.deepEqual(w.saved.u_a, { number: '12345678', found: false, env: 'staging', syncedAt: NOW });
});

test('sync: when GHIN fails nothing is stored over what was there', async () => {
  const w = world([row(12345678)], { ghin: { searchStatus: 502 } });
  w.saved.u_a = { number: '12345678', found: true, hi: '12.3' };
  const out = await ghin.sync(w.deps, { idToken: 'tok-a' });
  assert.equal(codeOf(out), 'GHIN_ERROR');
  assert.deepEqual(w.saved.u_a, { number: '12345678', found: true, hi: '12.3' });
});

test('syncAll: admins only', async () => {
  const w = world([row(12345678)]);
  assert.equal(codeOf(await ghin.syncAll(w.deps, {})), 'UNAUTHENTICATED');
  const out = await ghin.syncAll(w.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 403);
  assert.equal(codeOf(out), 'FORBIDDEN');
  assert.equal(w.fake.state.asked.length, 0);
  assert.deepEqual(w.saved, {});
});

test('syncAll: every member with a number, in one request', async () => {
  const w = world([row(12345678), row(23456789, { player_name: 'Admin A', hi_display: '4.4', hi_value: 4.4 })]);
  const out = await ghin.syncAll(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out, { status: 200, body: { ok: true, members: 3, found: 2, notFound: 1, env: 'staging' } });
  assert.equal(w.fake.state.searches.length, 1);
  assert.deepEqual(Object.keys(w.saved).sort(), ['u_a', 'u_adm', 'u_b']);
  assert.equal(w.saved.u_a.hi, '12.3');
  assert.equal(w.saved.u_adm.name, 'Admin A');
  assert.deepEqual(w.saved.u_b, { number: '7900344', found: false, env: 'staging', syncedAt: NOW });
  assert.equal('u_n' in w.saved, false, 'a member with no number is passed over');
  assert.equal(JSON.stringify(w.saved).includes('example.mn'), false);
});

test('syncAll: when GHIN fails nothing is stored', async () => {
  const w = world([row(12345678)], { ghin: { down: true } });
  const out = await ghin.syncAll(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 502);
  assert.equal(codeOf(out), 'GHIN_UNREACHABLE');
  assert.deepEqual(w.saved, {});
});

test('syncAll: no member has a number', async () => {
  const w = world([], { users: { u_adm: { id: 'u_adm', role: 'admin', status: 'active' } } });
  const out = await ghin.syncAll(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out.body, { ok: true, members: 0, found: 0, notFound: 0, env: 'staging' });
  assert.equal(w.fake.state.asked.length, 0);
});

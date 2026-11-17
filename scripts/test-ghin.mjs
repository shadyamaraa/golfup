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
  const state = { logins: 0, searches: [], listings: [], asked: [], tokens: new Set(), n: 0, ...over };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
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
    const pageOf = (all) => {
      const page = Number(u.searchParams.get('page'));
      const per = Number(u.searchParams.get('per_page'));
      // eslint-disable-next-line no-unused-vars
      return all.slice((page - 1) * per, page * per).map(({ _for, ...g }) => g);
    };
    // An association's clubs.
    const clubsOf = u.pathname.match(/\/associations\/([^/]+)\/clubs\.json$/);
    if (clubsOf) {
      state.listings.push(`clubs of ${clubsOf[1]} p${u.searchParams.get('page')}`);
      if (state.clubsStatus) return json(state.clubsStatus, { error: 'AccessDenied: You are not authorized to access this page.' });
      const seen = new Map();
      for (const g of golfers) if (String(g.association_id) === clubsOf[1] && !seen.has(g.club_id)) seen.set(g.club_id, { id: g.club_id, club_name: g.club_name, golf_association_id: g.association_id });
      return json(200, { clubs: [...seen.values()], meta: {} });
    }
    // A club's roster: its golfers, the GHIN number under `id` — and, as the
    // real one answers, no phone.
    const roster = u.pathname.match(/\/clubs\/([^/]+)\/golfers\.json$/);
    if (roster) {
      state.listings.push(`club ${roster[1]} p${u.searchParams.get('page')}`);
      if (state.rosterStatus?.[roster[1]]) return json(state.rosterStatus[roster[1]], { error: 'AccessDenied: You are not authorized to access this page.' });
      // eslint-disable-next-line no-unused-vars
      return json(200, { golfers: pageOf(golfers.filter(g => String(g.club_id) === roster[1])).map(({ ghin, phone_number, ...g }) => ({ id: ghin, ...g })), meta: {} });
    }
    if (u.pathname.endsWith('/golfers/search.json') && u.searchParams.has('phone_number')) {
      // GHIN does not search by phone alone.
      return json(400, { errors: { base: ['Please provide a valid search criteria'] } });
    }
    if (u.pathname.endsWith('/golfers/search.json') && u.searchParams.has('association_id')) {
      // Nor everyone in an association by a bare wildcard.
      state.listings.push(`association ${u.searchParams.get('association_id')}`);
      return json(400, { error: 'last_name should contain at least 3 characters with the use of wildcards' });
    }
    if (state.searchFailAfter != null && u.pathname.endsWith('/golfers/search.json') && state.searches.length >= state.searchFailAfter) {
      return json(503, { error: 'Service Unavailable' });
    }
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

// ---- Finding a member on GHIN by their phone ----

test('phoneKey: a Mongolian number however GHIN holds it', () => {
  for (const p of ['99119007', '+976 9911 9007', '(976) 9911-9007', 97699119007, 99119007, '0097699119007']) {
    assert.equal(ghin.phoneKey(p), '99119007', String(p));
  }
  for (const p of ['', null, undefined, '+1 555 123 4567', '15551234567', '12345', 'n/a']) assert.equal(ghin.phoneKey(p), '', String(p));
});

test('a refused request carries what GHIN said', async () => {
  ghin._resetTokens();
  const fake = fakeGhin([]);
  const { client } = clientFor(fake);
  const err = await client.get('golfers/search', { phone_number: '99119007', per_page: 100, page: 1 }).then(() => null, e => e);
  assert.equal(err.ghin, 'GHIN_ERROR');
  assert.equal(err.upstream, 400);
  assert.match(err.detail, /valid search criteria/);
  assert.ok(err.detail.length <= 200);
});

// Members for the report: some tied to GHIN already, some not.
function phoneWorld(golfers, over = {}) {
  return world(golfers, {
    users: {
      l_same: { id: 'l_same', name: 'Same', role: 'user', ghinNumber: '12345678', phone: '99119007' },
      l_diff: { id: 'l_diff', name: 'Different', role: 'user', ghinNumber: '23456789', phone: '95001234' },
      l_none: { id: 'l_none', name: 'GHIN has no phone', role: 'user', ghinNumber: '34567890', phone: '95005678' },
      l_gone: { id: 'l_gone', name: 'Not on GHIN', role: 'user', ghinNumber: '45678901', phone: '95009999' },
      l_kr: { id: 'l_kr', name: 'Korean phone', role: 'user', ghinNumber: '56789012', phone: '01012345678' },
      n_one: { id: 'n_one', name: 'Found in the club', role: 'user', phone: '88110001' },
      n_taken: { id: 'n_taken', name: 'Found, but taken', role: 'user', phone: '88110002' },
      n_many: { id: 'n_many', name: 'Two golfers', role: 'user', phone: '88110003' },
      n_zero: { id: 'n_zero', name: 'Nobody', role: 'user', phone: '88110004' },
      n_other: { id: 'n_other', name: 'In another club', role: 'user', phone: '88110005' },
      n_nophone: { id: 'n_nophone', name: 'No phone', role: 'user' },
      admin_uid: { id: 'admin_uid', name: 'System Admin', role: 'admin' },
      u_adm: { id: 'u_adm', name: 'Admin', role: 'admin', phone: '88001100' },
    },
    ...over,
  });
}
// The club the linked members are in is 5001 (the row's default); 7002 is
// another club of the same association; 9001 is a club of another one.
const PHONE_GOLFERS = [
  row(12345678, { phone_number: '+976 9911 9007' }),
  row(12345678, { phone_number: '', club_id: 9001, club_name: 'NCGA Test Club', association_id: 77, association_name: 'Northern California Golf Association', is_home_club: false }),
  row(23456789, { phone_number: '976 8811 0002' }),                       // l_diff's golfer holds n_taken's phone
  row(34567890, { phone_number: '' }),
  row(56789012, { phone_number: '010-1234-5678' }),
  row(67890123, { phone_number: '88110001', player_name: 'Found Golfer', hi_display: '9.9', hi_value: 9.9 }),
  row('6*****3', { phone_number: '', club_id: 9001, association_id: 77, is_home_club: false, _for: 67890123 }),   // their row in a club this login may not see
  row(78901234, { phone_number: '88110003' }),
  row(89012345, { phone_number: '(976) 8811-0003' }),
  row(90123456, { phone_number: '88110005', club_id: 7002, club_name: 'Another Club', player_name: 'Elsewhere Golfer' }),
  row('9*****9', { phone_number: '88110004', club_id: 7002, _for: 99999999 }),   // the right phone, a masked golfer
];

test('phoneReport: admins only', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  assert.equal(codeOf(await ghin.phoneReport(w.deps, {})), 'UNAUTHENTICATED');
  w.deps.verifyIdToken = async () => ({ memberId: 'l_same' });
  const out = await ghin.phoneReport(w.deps, { idToken: 'x' });
  assert.equal(out.status, 403);
  assert.equal(w.fake.state.asked.length, 0);
});

test('phoneReport: is the phone GHIN holds the member\'s own? — and whose is not', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 200);
  // l_kr has no Mongolian phone to compare; the other four do.
  assert.deepEqual(out.body.linked, { members: 5, withPhone: 4, same: 1, different: 1, ghinNoPhone: 1, notOnGhin: 1 });
  assert.deepEqual(out.body.linkedLists, { different: ['l_diff'], ghinNoPhone: ['l_none'], notOnGhin: ['l_gone'] });
  assert.equal(out.body.env, 'staging');
});

test('phoneReport: the members\' association, its clubs, their rosters, then the phones by number', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out.body.association, { id: '188', name: 'Mongolian Golf Association' });
  // The club of another association that one golfer also has a row in is not gone to.
  assert.deepEqual(w.fake.state.listings, ['clubs of 188 p1', 'club 5001 p1', 'club 7002 p1']);
  // A roster has no phones: the golfers it names are searched by number —
  // those not read already, in one request, and not again one by one for the masked row.
  assert.deepEqual(w.fake.state.searches.map(x => x.ids), [
    ['12345678', '23456789', '34567890', '45678901', '56789012'],
    ['67890123', '78901234', '89012345', '90123456'],
  ]);
  assert.deepEqual(out.body.sources, [
    { kind: 'club', id: '5001', name: 'UB Golf Club', golfers: 7, withPhone: 5 },
    { kind: 'club', id: '7002', name: 'Another Club', golfers: 2, withPhone: 1 },
  ]);
  assert.deepEqual(out.body.refused, []);
  assert.equal(w.fake.state.asked.some(a => a.url.includes('phone_number') || a.url.includes('last_name')), false, 'GHIN is not asked what it refuses');
});

test('phoneReport: members with no GHIN number, found by their phone', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  // u_adm is a member too; the system admin is not, and n_nophone has nothing to look by.
  assert.deepEqual(out.body.unlinked, { members: 7, withPhone: 6, one: 3, many: 1, none: 2 });
  assert.deepEqual(out.body.candidates.map(c => [c.memberId, c.golfer.number, c.golfer.club, c.linkedTo]), [
    ['n_one', '67890123', 'UB Golf Club', null],
    ['n_taken', '23456789', 'UB Golf Club', 'l_diff'],
    ['n_other', '90123456', 'Another Club', null],      // in a club no linked member is in
  ]);
  assert.equal(out.body.candidates[0].golfer.name, 'Found Golfer');
  assert.equal(out.body.candidates[0].golfer.hi, '9.9');
  assert.deepEqual(out.body.ambiguous, [{ memberId: 'n_many', count: 2 }]);
  // n_zero's phone is on GHIN only under a masked golfer: that is nobody.
});

test('phoneReport: the association\'s clubs refused — the clubs the linked members are in', async () => {
  const w = phoneWorld(PHONE_GOLFERS, { ghin: { clubsStatus: 403 } });
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 200);
  assert.deepEqual(w.fake.state.listings, ['clubs of 188 p1', 'club 5001 p1'], 'their own association\'s club only');
  assert.deepEqual(out.body.sources.map(x => x.name), ['UB Golf Club']);
  assert.equal(out.body.refused.length, 1);
  assert.deepEqual([out.body.refused[0].kind, out.body.refused[0].name, out.body.refused[0].code, out.body.refused[0].upstream], ['association', 'Mongolian Golf Association', 'GHIN_ERROR', 403]);
  assert.match(out.body.refused[0].detail, /AccessDenied/);
  // Without the other club's roster, the member there is not found.
  assert.deepEqual(out.body.unlinked, { members: 7, withPhone: 6, one: 2, many: 1, none: 3 });
  assert.deepEqual(out.body.candidates.map(c => c.memberId), ['n_one', 'n_taken']);
});

test('phoneReport: every listing refused — what the linked members\' own rows say still stands', async () => {
  const w = phoneWorld(PHONE_GOLFERS, { ghin: { clubsStatus: 403, rosterStatus: { 5001: 404 } } });
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 200);
  assert.equal(out.body.linked.same, 1);
  assert.deepEqual(out.body.sources, []);
  assert.deepEqual(out.body.refused.map(r => [r.kind, r.upstream]), [['association', 403], ['club', 404]]);
  // n_taken's phone is held by a golfer already read for a linked member.
  assert.deepEqual(out.body.unlinked, { members: 7, withPhone: 6, one: 1, many: 0, none: 5 });
  assert.deepEqual(out.body.candidates.map(c => [c.memberId, c.linkedTo]), [['n_taken', 'l_diff']]);
});

test('phoneReport: the phones cannot be read — named, and the rest stands', async () => {
  // The linked members' search goes through; the one for the rosters' golfers fails.
  const w = phoneWorld(PHONE_GOLFERS, { ghin: { searchFailAfter: 1 } });
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.refused.map(r => [r.kind, r.name, r.upstream]), [['golfers', '4 golfers', 503]]);
  assert.deepEqual(out.body.sources.map(x => [x.name, x.golfers, x.withPhone]), [['UB Golf Club', 7, 2], ['Another Club', 2, 0]]);
  assert.deepEqual(out.body.candidates.map(c => c.memberId), ['n_taken']);
});

test('phoneReport: a long roster is read to its last page, its golfers fifty at a time', async () => {
  const many = Array.from({ length: 230 }, (_, i) => row(20000000 + i, { phone_number: String(70000000 + i) }));
  const w = phoneWorld([row(12345678, { phone_number: '99119007' }), ...many, row(67890123, { phone_number: '88110001' })]);
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(w.fake.state.listings.filter(l => l.startsWith('club ')), ['club 5001 p1', 'club 5001 p2', 'club 5001 p3']);
  assert.deepEqual(w.fake.state.searches.map(x => x.ids.length), [5, 50, 50, 50, 50, 31]);
  assert.deepEqual(out.body.sources, [{ kind: 'club', id: '5001', name: 'UB Golf Club', golfers: 232, withPhone: 232 }]);
  assert.deepEqual(out.body.candidates.map(c => c.memberId), ['n_one']);
});

test('phoneReport: no phone number and nothing personal is in the answer', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const text = JSON.stringify((await ghin.phoneReport(w.deps, { idToken: 'tok-adm' })).body);
  for (const phone of ['99119007', '95001234', '88110001', '88110002', '88110003', '88110005', '88001100']) assert.equal(text.includes(phone), false, phone);
  assert.equal(text.includes('example.mn'), false);
  assert.equal(text.includes('1988'), false);
  assert.deepEqual(w.saved, {}, 'and nothing is stored');
});

test('phoneReport: when the linked members cannot be read there is no answer — and GHIN\'s reason is passed on', async () => {
  const w = phoneWorld(PHONE_GOLFERS, { ghin: { searchStatus: 503 } });
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.equal(out.status, 502);
  assert.equal(codeOf(out), 'GHIN_ERROR');
  assert.equal(out.body.error.upstream, 503);
  assert.equal('candidates' in out.body, false);
});

test('phoneReport: nobody to look for', async () => {
  const w = phoneWorld([], { users: { u_adm: { id: 'u_adm', role: 'admin' } } });
  const out = await ghin.phoneReport(w.deps, { idToken: 'tok-adm' });
  assert.deepEqual(out.body.linked, { members: 0, withPhone: 0, same: 0, different: 0, ghinNoPhone: 0, notOnGhin: 0 });
  assert.deepEqual(out.body.unlinked, { members: 1, withPhone: 0, one: 0, many: 0, none: 0 });
  assert.deepEqual([out.body.association, out.body.sources, out.body.refused], [null, [], []]);
  assert.equal(w.fake.state.asked.length, 0);
});

test('a member\'s lookup does not pass GHIN\'s own words on; an admin\'s read-all does', async () => {
  const member = await ghin.lookup(world([row(12345678)], { ghin: { searchStatus: 500 } }).deps, { idToken: 'tok-a', ghin: '12345678' });
  assert.equal(codeOf(member), 'GHIN_ERROR');
  assert.equal('detail' in member.body.error, false);
  const adminOut = await ghin.syncAll(world([row(12345678)], { ghin: { searchStatus: 500 } }).deps, { idToken: 'tok-adm' });
  assert.equal(codeOf(adminOut), 'GHIN_ERROR');
  assert.equal(adminOut.body.error.upstream, 500);
});

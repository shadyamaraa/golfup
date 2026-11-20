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
  const state = { logins: 0, searches: [], listings: [], scoreAsks: [], courseAsks: [], asked: [], tokens: new Set(), n: 0, ...over };
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
    // Courses: a search by name, and one course with its tee sets.
    if (u.pathname.endsWith('/courses/search.json')) {
      state.courseAsks.push(`search ${u.searchParams.get('name')} offset ${u.searchParams.get('offset')} limit ${u.searchParams.get('limit')}`);
      if (state.courseStatus) return json(state.courseStatus, { error: 'AccessDenied: You are not authorized to access this page.' });
      // As the real one answers a limit with no offset.
      if (u.searchParams.has('offset') !== u.searchParams.has('limit')) {
        return json(400, { errors: { offset_and_limit: ['Offset and limit must be provided together or not at all.'] } });
      }
      return json(200, { courses: state.courseSearch || [] });
    }
    const crs = u.pathname.match(/\/courses\/(\d+)\.json$/);
    if (crs) {
      state.courseAsks.push(`course ${crs[1]}`);
      if (state.courseStatus) return json(state.courseStatus, { error: 'Service Unavailable' });
      const c = (state.courses || {})[crs[1]];
      return c ? json(200, c) : json(404, { error: 'Not Found' });
    }
    // A golfer's scoring record: both lists in one answer, or each on its own.
    const sc = u.pathname.match(/\/golfers\/(\d+)\/(scores|revision_scores|recent_scores)\.json$/);
    if (sc) {
      state.scoreAsks.push(`${sc[2]} ${sc[1]} for ${u.searchParams.get('source_golfer_id')}`);
      if (state.scoreStatus?.[sc[2]] === 'down') throw new TypeError('fetch failed');
      if (state.scoreStatus?.[sc[2]]) return json(state.scoreStatus[sc[2]], { error: 'AccessDenied: You are not authorized to access this page.' });
      const rec = (state.scoring || {})[sc[1]] || {};
      const vis = { scoring_record_visibility: rec.visibility, scoring_record_visibility_message: rec.message || '' };
      if (sc[2] === 'scores') {
        return json(200, {
          recent_scores: { scores: rec.recent || [] }, revision_scores: { scores: rec.revision || [] },
          '9_hole_score': { scores: [] }, score_history_stats: rec.stats, ...vis,
        });
      }
      if (sc[2] === 'revision_scores') return json(200, { total_differential: 31.8, scores: rec.revision || [], ...vis });
      return json(200, { scores: rec.recent || [], ...vis });
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
  const links = {};
  const kept = {};      // ghinScores/*
  const ties = over.ties || {};   // ghinLink/* — how the server tied a member to a golfer
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
    saveLink: async (id, tie) => { links[id] = tie; },
    loadLink: async (id) => ties[id] || null,
    loadScores: async (id) => kept[id] || null,
    saveScores: async (id, record) => { kept[id] = record; },
  };
  return { fake, deps, users, secrets, saved, links, kept, ties, tick };
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

// ---- Tying the members found by phone to their golfers ----

test('linkByPhone: admins only, and something to tie', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const one = [{ memberId: 'n_one', number: '67890123' }];
  assert.equal(codeOf(await ghin.linkByPhone(w.deps, { links: one })), 'UNAUTHENTICATED');
  w.deps.verifyIdToken = async (t) => ({ memberId: t === 'tok-adm' ? 'u_adm' : 'l_same' });
  assert.equal(codeOf(await ghin.linkByPhone(w.deps, { idToken: 'x', links: one })), 'FORBIDDEN');
  for (const links of [undefined, [], 'n_one', Array.from({ length: ghin.MAX_LINKS + 1 }, () => one[0])]) {
    assert.equal(codeOf(await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links })), 'BAD_LINKS');
  }
  assert.equal(w.fake.state.asked.length, 0);
  assert.deepEqual(w.links, {});
});

test('linkByPhone: the member is tied — the number, what GHIN said, and how', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links: [{ memberId: 'n_one', number: '6789-0123' }] });
  assert.deepEqual(out, { status: 200, body: { ok: true, env: 'staging', linked: [{ memberId: 'n_one', number: '67890123', name: 'Found Golfer' }], refused: [] } });
  assert.deepEqual(Object.keys(w.links), ['n_one']);
  const tie = w.links.n_one;
  assert.equal(tie.number, '67890123');
  assert.deepEqual(tie.link, { number: '67890123', by: 'phone', at: NOW, admin: 'u_adm' });
  assert.equal(tie.ghin.found, true);
  assert.equal(tie.ghin.name, 'Found Golfer');
  assert.equal(tie.ghin.hi, '9.9');
  assert.deepEqual([tie.ghin.env, tie.ghin.syncedAt], ['staging', NOW]);
  assert.equal(JSON.stringify(tie).includes('88110001'), false, 'the phone is not written anywhere');
  assert.equal(JSON.stringify(out.body).includes('88110001'), false);
});

test('linkByPhone: the phone is read again here — what the screen showed is not taken on trust', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  // n_zero's phone is not the one GHIN holds for that golfer.
  const out = await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links: [{ memberId: 'n_zero', number: '67890123' }] });
  assert.deepEqual(out.body.linked, []);
  assert.deepEqual(out.body.refused, [{ memberId: 'n_zero', number: '67890123', reason: 'PHONE_DIFFERS' }]);
  assert.deepEqual(w.links, {});
});

test('linkByPhone: each tie stands or falls on its own, with a reason', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.linkByPhone(w.deps, {
    idToken: 'tok-adm',
    links: [
      { memberId: 'n_one', number: '67890123' },      // good
      { memberId: 'n_other', number: '90123456' },    // good
      { memberId: 'nobody', number: '67890123' },     // no such member
      { memberId: 'admin_uid', number: '67890123' },  // not a member
      { memberId: 'users/n_one', number: '67890123' },
      { memberId: 'n_many', number: '12' },           // not a GHIN number
      { memberId: 'l_same', number: '67890123' },     // already has another number
      { memberId: 'n_nophone', number: '78901234' },  // nothing to prove it by
      { memberId: 'n_taken', number: '23456789' },    // l_diff's number
      { memberId: 'n_many', number: '67890123' },     // asked for twice here
      { memberId: 'n_zero', number: '11111111' },     // GHIN has no such golfer
    ],
  });
  assert.deepEqual(out.body.linked.map(x => x.memberId), ['n_one', 'n_other']);
  assert.deepEqual(out.body.refused.map(x => [x.memberId, x.reason]), [
    ['nobody', 'NO_MEMBER'], ['admin_uid', 'NO_MEMBER'], ['users/n_one', 'NO_MEMBER'],
    ['n_many', 'BAD_GHIN'], ['l_same', 'HAS_NUMBER'], ['n_nophone', 'NO_PHONE'],
    ['n_taken', 'TAKEN'], ['n_many', 'TAKEN'], ['n_zero', 'NOT_ON_GHIN'],
  ]);
  assert.deepEqual(Object.keys(w.links).sort(), ['n_one', 'n_other']);
  // The golfers to check are asked for together. One of them has a masked
  // row beside its own, so the number that was not found is asked for once more alone.
  assert.deepEqual(w.fake.state.searches.map(x => x.ids), [['67890123', '90123456', '11111111'], ['11111111']]);
});

test('linkByPhone: a member who already has that number is tied again — now with the proof', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links: [{ memberId: 'l_same', number: '12345678' }, { memberId: 'l_diff', number: '23456789' }] });
  assert.deepEqual(out.body.linked.map(x => x.memberId), ['l_same']);
  assert.deepEqual(out.body.refused, [{ memberId: 'l_diff', number: '23456789', reason: 'PHONE_DIFFERS' }]);
  assert.equal(w.links.l_same.link.by, 'phone');
});

test('linkByPhone: when GHIN fails nothing is tied', async () => {
  const w = phoneWorld(PHONE_GOLFERS, { ghin: { searchStatus: 503 } });
  const out = await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links: [{ memberId: 'n_one', number: '67890123' }] });
  assert.equal(out.status, 502);
  assert.equal(codeOf(out), 'GHIN_ERROR');
  assert.deepEqual(w.links, {});
});

test('linkByPhone: nothing to ask GHIN when every tie is refused beforehand', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  const out = await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links: [{ memberId: 'nobody', number: '67890123' }] });
  assert.equal(out.status, 200);
  assert.equal(w.fake.state.asked.length, 0);
});

// ---- Names, and the night's round ----

test('nameWords: Cyrillic and its Latin spellings fold to the same words', () => {
  assert.deepEqual(ghin.nameWords('Мөнхбат'), ghin.nameWords('Munkhbat'));
  assert.deepEqual(ghin.nameWords('Munkhbat'), ghin.nameWords('Monhbat'));
  assert.deepEqual(ghin.nameWords('Энхтуяа'), ghin.nameWords('Enkhtuya'));
  assert.deepEqual(ghin.nameWords('Бямбажав', 'Маргад'), ghin.nameWords('Byambajav Margad'));
  assert.deepEqual(ghin.nameWords('Жаргал'), ghin.nameWords('Zargal'));
  // Initials and short words say nothing: Б., Od, Bat.
  assert.deepEqual(ghin.nameWords('Б.', 'Od', 'Bat'), []);
  assert.deepEqual(ghin.nameWords(undefined, null, ''), []);
});

test('nameAgrees: one shared word, however the two names are written', () => {
  const yes = (member, golfer) => assert.equal(ghin.nameAgrees(member, golfer), true, `${JSON.stringify(member)} ~ ${golfer}`);
  const no = (member, golfer) => assert.equal(ghin.nameAgrees(member, golfer), false, `${JSON.stringify(member)} !~ ${golfer}`);
  yes({ firstName: 'Маргад', lastName: 'Бямбажав' }, 'Margad Byambajav');
  yes({ firstName: 'Margad', lastName: 'B' }, 'Byambajav Margad');          // either order, an initial
  yes({ name: 'Мөнхбат' }, 'Monkhbat Dorj');                               // only a display name
  yes({ firstName: 'Bat-Erdene' }, 'Baterdene Ganbold');                   // written as one word
  yes({ lastName: 'Tsetsegmaa' }, 'Tsetsegma Bold');                       // a letter apart
  no({ firstName: 'Skyresort', lastName: 'Marshal' }, 'Mtbogd Mtbogd');    // a placeholder golfer
  no({ firstName: 'Temuulen', lastName: 'Sukhbaatar' }, 'Dorjpalam Tsetsegmaa');
  no({ firstName: 'Bat', lastName: 'Od' }, 'Bat Od');                      // too short to mean anything
  no({ username: 'Margad' }, 'Margad Byambajav');                          // a nickname is not a name
  no({}, 'Margad Byambajav');
  no(null, 'Margad Byambajav');
  no({ firstName: 'Margad' }, '');
});

// A world for the night's round: saving a tie puts the number on the member,
// as the real one does, so the reading that follows sees it.
function nightWorld(golfers, over = {}) {
  const w = phoneWorld(golfers, over);
  w.deps.saveLink = async (id, tie) => { w.links[id] = tie; w.users[id] = { ...w.users[id], ghinNumber: tie.number }; };
  // The night's round has no caller: nothing in it may ask who is signed in.
  w.deps.verifyIdToken = async () => { throw new Error('the night\'s round asked for a caller'); };
  w.deps.loadUser = async () => { throw new Error('the night\'s round asked for a caller'); };
  return w;
}

test('nightly: a member found by phone, whose name GHIN bears out, is tied — and marked as tied by the server', async () => {
  const w = nightWorld(PHONE_GOLFERS);
  const out = await ghin.nightly(w.deps);
  assert.equal(out.ok, true);
  assert.equal(out.env, 'staging');
  assert.deepEqual(out.tied, [{ memberId: 'n_one', number: '67890123' }]);   // "Found in the club" ~ "Found Golfer"
  assert.deepEqual(Object.keys(w.links), ['n_one']);
  assert.deepEqual(w.links.n_one.link, { number: '67890123', by: 'phone', at: NOW, auto: true });
  assert.equal(w.links.n_one.ghin.name, 'Found Golfer');
  assert.equal(w.users.n_one.ghinNumber, '67890123');
});

test('nightly: a golfer with an unrelated name, another member\'s golfer, a phone two golfers share — left for an admin', async () => {
  const w = nightWorld(PHONE_GOLFERS);
  const out = await ghin.nightly(w.deps);
  // n_other ("In another club") ↔ "Elsewhere Golfer": the phone matches, the name says nothing.
  // n_taken's golfer is l_diff's. n_many's phone is two golfers'.
  assert.deepEqual(out.left, { name: 1, taken: 1, several: 1 });
  for (const id of ['n_other', 'n_taken', 'n_many', 'n_zero', 'n_nophone']) assert.equal(w.links[id], undefined, id);
  assert.equal(w.users.n_other.ghinNumber, undefined);
});

test('nightly: then every Handicap Index is read afresh — tonight\'s tie among them', async () => {
  const w = nightWorld(PHONE_GOLFERS);
  const out = await ghin.nightly(w.deps);
  assert.deepEqual(out.sync, { members: 6, found: 5, notFound: 1 });        // five tied before, n_one tonight; l_gone is not on GHIN
  assert.equal(w.saved.n_one.hi, '9.9');
  assert.equal(w.saved.l_same.found, true);
  assert.equal(w.saved.l_gone.found, false);
  assert.equal(w.saved.n_other, undefined);
});

test('nightly: no phone number and nothing personal in what it answers or stores', async () => {
  const w = nightWorld(PHONE_GOLFERS);
  const out = await ghin.nightly(w.deps);
  const all = JSON.stringify([out, w.links, w.saved]);
  for (const secret of ['88110001', '99119007', 'bat@example.mn', '1988-04-02', 'Peace Ave']) assert.equal(all.includes(secret), false, secret);
});

test('nightly: a second night ties no one again', async () => {
  const w = nightWorld(PHONE_GOLFERS);
  await ghin.nightly(w.deps);
  for (const k of Object.keys(w.links)) delete w.links[k];
  const out = await ghin.nightly(w.deps);
  assert.deepEqual(out.tied, []);
  assert.deepEqual(w.links, {});
  assert.equal(out.sync.members, 6);
});

test('nightly: GHIN down — nothing tied, nothing stored, and it says so instead of failing', async () => {
  const w = nightWorld(PHONE_GOLFERS, { ghin: { searchStatus: 503 } });
  const out = await ghin.nightly(w.deps);
  assert.equal(out.ok, false);
  assert.deepEqual(out.errors.map(e => [e.step, e.code]), [['find', 'GHIN_ERROR'], ['read', 'GHIN_ERROR']]);
  assert.deepEqual(out.tied, []);
  assert.deepEqual(w.links, {});
  assert.deepEqual(w.saved, {});
  assert.equal(out.sync, null);
});

test('nightly: the login refused (no secret set) — the same', async () => {
  const w = nightWorld(PHONE_GOLFERS, { ghin: { loginStatus: 401 } });
  const out = await ghin.nightly(w.deps);
  assert.equal(out.ok, false);
  assert.deepEqual([...new Set(out.errors.map(e => e.code))], ['LOGIN_REFUSED']);
  assert.deepEqual(w.links, {});
});

test('nightly: the rosters cannot be listed — no one is found, the Handicap Indexes are still read', async () => {
  const w = nightWorld(PHONE_GOLFERS, { ghin: { clubsStatus: 404, rosterStatus: { 5001: 404, 7002: 404 } } });
  const out = await ghin.nightly(w.deps);
  assert.equal(out.ok, true);
  assert.deepEqual(out.tied, []);
  assert.deepEqual(out.sync, { members: 5, found: 4, notFound: 1 });
});

test('nightly: nobody without a number — only the reading', async () => {
  const w = nightWorld(PHONE_GOLFERS, { users: { l_same: { id: 'l_same', name: 'Same', ghinNumber: '12345678', phone: '99119007' } } });
  const out = await ghin.nightly(w.deps);
  assert.deepEqual([out.ok, out.tied, out.left], [true, [], { name: 0, taken: 0, several: 0 }]);
  assert.deepEqual(out.sync, { members: 1, found: 1, notFound: 0 });
});

test('an admin\'s tie still carries the admin; the night\'s does not', async () => {
  const w = phoneWorld(PHONE_GOLFERS);
  await ghin.linkByPhone(w.deps, { idToken: 'tok-adm', links: [{ memberId: 'n_one', number: '67890123' }] });
  assert.deepEqual(w.links.n_one.link, { number: '67890123', by: 'phone', at: NOW, admin: 'u_adm' });
  assert.equal('auto' in w.links.n_one.link, false);
});

// ---- Scores ----

// One score as GHIN's own example has it.
const scoreRow = (played, over = {}) => ({
  id: 601, order_number: 256, score_day_order: 43, gender: 'M', status: 'Validated', is_manual: false,
  number_of_holes: 18, number_of_played_holes: 18, golfer_id: '12345678', course_id: '9085',
  course_name: 'Championship', facility_name: 'Chinggis Khaan Golf Club', played_at: played,
  adjusted_gross_score: 88, front9_adjusted: 45, back9_adjusted: 43, posted_on_home_course: true,
  differential: 15.4, unadjusted_differential: 15.4, score_type: 'H', tee_name: 'Blue', tee_set_id: '341107',
  course_rating: 71.2, slope_rating: 128, penalty: false, score_type_display_full: 'Home', score_type_display_short: 'H',
  posted_at: '2026-11-02T11:46:43.342Z', course_display_value: 'Chinggis Khaan Golf Club - Championship',
  ghin_course_name_display: 'Chinggis Khaan Golf Club - Championship / Blue', used: false, revision: true, pcc: 0,
  adjustments: [], hole_details: [{ hole_number: 1, raw_score: 5 }], exceptional: false, short_course: false,
  ...over,
});
const SCORING = {
  12345678: {
    visibility: 'everyone',
    revision: [scoreRow('2026-11-01', { id: 3, used: true }), scoreRow('2026-10-20', { id: 2, adjusted_gross_score: 94, differential: 20.7 })],
    recent: [scoreRow('2026-11-14', { id: 4, adjusted_gross_score: 85, differential: 12.8, revision: false })],
    stats: { total_count: 3, lowest_score: 85, highest_score: 94, average: 89 },
  },
  // Kept to the golfer's club.
  7900344: {
    visibility: 'club_only',
    revision: [scoreRow('2026-09-09', { id: 9, golfer_id: '7900344', adjusted_gross_score: 97, course_display_value: 'Mt Bogd Golf Club' })],
    recent: [scoreRow('2026-11-15', { id: 10, golfer_id: '7900344', adjusted_gross_score: 99, course_display_value: 'Mt Bogd Golf Club' })],
    stats: { total_count: 2, lowest_score: 97, highest_score: 99, average: 98 },
  },
  23456789: { visibility: 'club_only', revision: [scoreRow('2026-08-08', { id: 11, golfer_id: '23456789' })], recent: [] },
};
const scoring = (over = {}, w = {}) => world([row(12345678), row(7900344)], { ...w, ghin: { scoring: SCORING, ...over } });
// The server tied u_b to golfer 7900344 by the phone they sign in with.
const TIED = { ties: { u_b: { number: '7900344', by: 'phone', at: 1, auto: true } } };

test('trimScore: when, where, the score, the differential, whether it counts — and nothing else', () => {
  assert.deepEqual(ghin.trimScore(scoreRow('2026-11-01', { used: true })), {
    date: '2026-11-01', score: 88, used: true, id: '601', diff: 15.4, holes: 18,
    course: 'Chinggis Khaan Golf Club - Championship', tee: 'Blue', rating: 71.2, slope: 128, type: 'H',
  });
  // What marks a score out is kept only when it is so.
  const marked = ghin.trimScore(scoreRow('2026-11-01', { pcc: 1, exceptional: true, penalty: true, score_type_display_short: 'C', number_of_holes: 9 }));
  assert.deepEqual([marked.pcc, marked.exceptional, marked.penalty, marked.type, marked.holes], [1, true, true, 'C', 9]);
  // Numbers sent as text; a date with a time; a course with no display value.
  const loose = ghin.trimScore(scoreRow('2026-11-01T00:00:00Z', { adjusted_gross_score: '91', differential: '-1.2', course_display_value: null }));
  assert.deepEqual([loose.date, loose.score, loose.diff, loose.course], ['2026-11-01', 91, -1.2, 'Chinggis Khaan Golf Club - Championship']);
  // A differential GHIN adjusted: what it was before is kept beside it — only then.
  const adjusted = ghin.trimScore(scoreRow('2026-11-01', { differential: 7.4, unadjusted_differential: 8.4 }));
  assert.deepEqual([adjusted.diff, adjusted.rawDiff], [7.4, 8.4]);
  assert.equal('rawDiff' in ghin.trimScore(scoreRow('2026-11-01', { differential: null, unadjusted_differential: 8.4 })), false);
  assert.equal('rawDiff' in ghin.trimScore(scoreRow('2026-11-01', { unadjusted_differential: undefined })), false);
  // Nine holes: the eighteen-hole differential GHIN made of it, where it sends one.
  const nine = { number_of_holes: 9, number_of_played_holes: 9, adjusted_gross_score: 44, differential: 6.1, unadjusted_differential: 6.1 };
  const scaledUp = ghin.trimScore(scoreRow('2026-11-01', { ...nine, scaled_up_differential: 13.9, adjusted_scaled_up_differential: 12.9 }));
  assert.deepEqual([scaledUp.score, scaledUp.holes, scaledUp.diff, scaledUp.rawDiff], [44, 9, 12.9, 13.9]);
  const unscaled = ghin.trimScore(scoreRow('2026-11-01', { ...nine, scaled_up_differential: null, adjusted_scaled_up_differential: null }));
  assert.deepEqual([unscaled.diff, 'rawDiff' in unscaled], [6.1, false]);
  // … and only for nine holes: an eighteen-hole score's differential is its own.
  const full = ghin.trimScore(scoreRow('2026-11-01', { scaled_up_differential: 30.1, adjusted_scaled_up_differential: 29.1 }));
  assert.deepEqual([full.diff, 'rawDiff' in full], [15.4, false]);
  // A field GHIN left out is left out; `used` is only what GHIN says is.
  const bare = ghin.trimScore({ played_at: '2026-11-01', adjusted_gross_score: 90, used: 'true' });
  assert.deepEqual(bare, { date: '2026-11-01', score: 90, used: false });
  // Not a score.
  for (const bad of [null, 'x', {}, { played_at: '2026-11-01' }, { adjusted_gross_score: 90 }, { played_at: 'soon', adjusted_gross_score: 90 }, { played_at: '2026-11-01', adjusted_gross_score: '' }]) {
    assert.equal(ghin.trimScore(bad), null);
  }
});

test('scores: a member\'s own scoring record — one request, by the number on their record', async () => {
  const w = scoring();
  const out = await ghin.scores(w.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 200);
  const rec = out.body.scores;
  assert.deepEqual(w.fake.state.scoreAsks, ['scores 12345678 for 12345678']);
  assert.deepEqual({ number: rec.number, env: rec.env, syncedAt: rec.syncedAt, visibility: rec.visibility }, { number: '12345678', env: 'staging', syncedAt: NOW, visibility: 'everyone' });
  assert.deepEqual(rec.revision.map(x => [x.date, x.score, x.diff, x.used]), [['2026-11-01', 88, 15.4, true], ['2026-10-20', 94, 20.7, false]]);
  assert.deepEqual(rec.recent.map(x => [x.date, x.score, x.diff]), [['2026-11-14', 85, 12.8]]);
  assert.deepEqual(rec.stats, { count: 3, low: 85, high: 94, average: 89 });
  assert.equal('message' in rec, false);
  assert.deepEqual(w.kept, { u_a: rec }, 'stored as answered');
});

test('scores: the number a caller sends is not the one read; another member\'s is an admin\'s', async () => {
  const w = scoring();
  await ghin.scores(w.deps, { idToken: 'tok-a', ghin: '7900344', number: '7900344' });
  assert.equal(w.kept.u_a.number, '12345678');
  const no = await ghin.scores(w.deps, { idToken: 'tok-a', memberId: 'u_b' });
  assert.equal(no.status, 403);
  assert.equal(codeOf(no), 'FORBIDDEN');
  assert.equal('u_b' in w.kept, false);
  const yes = await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'u_b' });
  assert.equal(yes.status, 200);
  assert.equal(w.kept.u_b.number, '7900344');
  assert.equal(w.fake.state.scoreAsks.at(-1), 'scores 7900344 for 7900344');
});

test('scores: who it cannot be done for', async () => {
  const w = scoring();
  assert.equal(codeOf(await ghin.scores(w.deps, {})), 'UNAUTHENTICATED');
  assert.equal(codeOf(await ghin.scores(w.deps, { idToken: 'tok-anon' })), 'UNAUTHENTICATED');
  assert.equal(codeOf(await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'u_gone' })), 'USER_NOT_FOUND');
  assert.equal(codeOf(await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'ghinScores/u_a' })), 'USER_NOT_FOUND');
  assert.equal(codeOf(await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'u_n' })), 'NO_GHIN');
  assert.deepEqual(w.kept, {});
  assert.deepEqual(w.fake.state.scoreAsks, []);
});

test('scores: GHIN shows a record to everyone only when it says so', async () => {
  const w = scoring();
  await ghin.scores(w.deps, { idToken: 'tok-b' });
  assert.equal(w.kept.u_b.visibility, 'club', 'club_only');
  const none = world([row(12345678)], { ghin: { scoring: { 12345678: { revision: [scoreRow('2026-11-01')] } } } });
  await ghin.scores(none.deps, { idToken: 'tok-a' });
  assert.equal(none.kept.u_a.visibility, 'club', 'not said');
  // A record GHIN will not show: no scores, and its own words why.
  const zeroed = { total_count: 0, lowest_score: 0, highest_score: 0, average: 0 };
  const hidden = world([row(12345678)], { ghin: { scoring: { 12345678: { visibility: 'club_only', stats: zeroed, message: '  This golfer\'s scoring record\n is private. ' } } } });
  const out = await ghin.scores(hidden.deps, { idToken: 'tok-a' });
  assert.deepEqual([out.body.scores.revision, out.body.scores.recent, out.body.scores.message], [[], [], 'This golfer\'s scoring record is private.']);
  assert.equal('stats' in out.body.scores, false);
});

test('scores: a record kept to the golfer\'s club is the member\'s only once the server has tied them to that golfer', async () => {
  const none = (rec) => assert.deepEqual([rec.revision, rec.recent, rec.withheld, rec.visibility, 'stats' in rec], [[], [], true, 'club', false]);
  // The number is only typed on the member's record: nothing of the scores is answered or stored.
  const w = scoring();
  const out = await ghin.scores(w.deps, { idToken: 'tok-b' });
  assert.equal(out.status, 200);
  none(out.body.scores);
  none(w.kept.u_b);
  assert.deepEqual([out.body.scores.number, out.body.scores.env, out.body.scores.syncedAt], ['7900344', 'staging', NOW]);
  const told = JSON.stringify([out.body, w.kept]);
  for (const leak of ['Mt Bogd', '97', '99', '2026-09-09', '2026-11-15']) assert.equal(told.includes(leak), false, leak);
  // Tied by the server: the record is theirs.
  const tied = scoring({}, TIED);
  const mine = (await ghin.scores(tied.deps, { idToken: 'tok-b' })).body.scores;
  assert.deepEqual([mine.revision.map(x => x.score), mine.recent.map(x => x.score), 'withheld' in mine, mine.visibility], [[97], [99], false, 'club']);
  assert.deepEqual(mine.stats, { count: 2, low: 97, high: 99, average: 98 });
  assert.deepEqual(tied.kept.u_b, mine);
  // … however the tie spells the number; a tie to another golfer proves nothing about this one.
  const spelled = scoring({}, { ties: { u_b: { number: '07900344', by: 'phone', at: 1 } } });
  assert.equal((await ghin.scores(spelled.deps, { idToken: 'tok-b' })).body.scores.revision.length, 1);
  for (const tie of [{ number: '12345678', by: 'phone', at: 1 }, { by: 'phone', at: 1 }, 'yes', true]) {
    const other = scoring({}, { ties: { u_b: tie } });
    none((await ghin.scores(other.deps, { idToken: 'tok-b' })).body.scores);
  }
});

test('scores: a member who types another golfer\'s number on their record learns nothing of a record kept to the club', async () => {
  // u_a is tied to their own golfer, then puts u_b's number on their record.
  const w = scoring({}, { ties: { u_a: { number: '12345678', by: 'phone', at: 1 }, ...TIED.ties } });
  w.users.u_a.ghinNumber = '7900344';
  const out = await ghin.scores(w.deps, { idToken: 'tok-a' });
  assert.equal(out.body.scores.withheld, true);
  assert.deepEqual([out.body.scores.revision, out.body.scores.recent], [[], []]);
  assert.equal(JSON.stringify([out.body, w.kept]).includes('Mt Bogd'), false);
  // A record GHIN shows to everyone is anyone's to see — there, and so here.
  w.users.u_b.ghinNumber = '12345678';
  const open = (await ghin.scores(w.deps, { idToken: 'tok-b' })).body.scores;
  assert.deepEqual([open.revision.length, 'withheld' in open], [2, false]);
});

test('scores: an admin is answered in full — what is stored for the member still has no scores', async () => {
  const w = scoring();
  const full = (await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'u_b' })).body.scores;
  assert.deepEqual([full.revision.map(x => x.score), 'withheld' in full], [[97], false]);
  assert.deepEqual([w.kept.u_b.revision, w.kept.u_b.recent, w.kept.u_b.withheld, 'stats' in w.kept.u_b], [[], [], true, false]);
  // What was kept back is no answer for an admin: GHIN is asked again, at once.
  const again = (await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'u_b' })).body.scores;
  assert.equal(again.revision.length, 1);
  assert.equal(w.fake.state.scoreAsks.length, 2);
  // The member, a moment later, is given what is stored — and GHIN is not asked.
  const theirs = (await ghin.scores(w.deps, { idToken: 'tok-b' })).body.scores;
  assert.deepEqual([theirs.revision, theirs.withheld], [[], true]);
  assert.equal(w.fake.state.scoreAsks.length, 2);
  // An admin's own typed number: answered, not stored.
  const own = (await ghin.scores(w.deps, { idToken: 'tok-adm' })).body.scores;
  assert.deepEqual([own.revision.length, w.kept.u_adm.revision, w.kept.u_adm.withheld], [1, [], true]);
});

test('scores: newest first, a revision and a few to spare', async () => {
  const day = (n) => `2026-10-${String(n).padStart(2, '0')}`;
  const many = Array.from({ length: 30 }, (_, i) => scoreRow(day(i + 1), { id: i + 1 }));
  const sameDay = [scoreRow('2026-11-05', { id: 'am' }), scoreRow('2026-11-05', { id: 'pm' })];
  const w = world([row(12345678)], { ghin: { scoring: { 12345678: { visibility: 'everyone', revision: [...sameDay, ...many, { junk: true }, null], recent: many } } } });
  const rec = (await ghin.scores(w.deps, { idToken: 'tok-a' })).body.scores;
  assert.equal(rec.revision.length, 25);
  assert.deepEqual(rec.revision.slice(0, 4).map(x => x.id), ['am', 'pm', '30', '29'], 'two on a day stay as GHIN had them');
  assert.equal(rec.recent.length, 20);
  assert.equal(rec.recent[0].date, '2026-10-30');
});

test('scores: an answer a moment old stands — GHIN is not asked again', async () => {
  const w = scoring();
  const first = (await ghin.scores(w.deps, { idToken: 'tok-a' })).body.scores;
  w.tick(ghin.SCORES_FRESH_MS - 1);
  const again = await ghin.scores(w.deps, { idToken: 'tok-a' });
  assert.deepEqual(again.body, { ok: true, scores: first });
  assert.equal(w.fake.state.scoreAsks.length, 1);
  w.tick(1);
  const later = (await ghin.scores(w.deps, { idToken: 'tok-a' })).body.scores;
  assert.equal(w.fake.state.scoreAsks.length, 2);
  assert.equal(later.syncedAt, NOW + ghin.SCORES_FRESH_MS);
  // Kept for another number (the member's was corrected), from another
  // environment, or stamped in the future: not theirs to be given.
  for (const stale of [{ number: '7900344' }, { env: 'production' }, { syncedAt: NOW + 2 * ghin.SCORES_FRESH_MS }, { syncedAt: 'x' }]) {
    const asks = w.fake.state.scoreAsks.length;
    w.kept.u_a = { ...later, ...stale };
    await ghin.scores(w.deps, { idToken: 'tok-a' });
    assert.equal(w.fake.state.scoreAsks.length, asks + 1, JSON.stringify(stale));
  }
});

test('scores: the one request refused — the two lists are asked for on their own', async () => {
  const w = scoring({ scoreStatus: { scores: 404 } });
  const rec = (await ghin.scores(w.deps, { idToken: 'tok-a' })).body.scores;
  assert.deepEqual(w.fake.state.scoreAsks, ['scores 12345678 for 12345678', 'revision_scores 12345678 for 12345678', 'recent_scores 12345678 for 12345678']);
  assert.deepEqual([rec.revision.length, rec.recent.length, rec.visibility], [2, 1, 'everyone']);
  assert.equal('stats' in rec, false);
  // The scores posted since cannot be read: the revision alone still stands.
  const half = scoring({ scoreStatus: { scores: 403, recent_scores: 403 } });
  const out = await ghin.scores(half.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 200);
  assert.deepEqual([out.body.scores.revision.length, out.body.scores.recent], [2, []]);
  // GHIN gone quiet halfway is not "none posted since": nothing is stored.
  const cut = scoring({ scoreStatus: { scores: 404, recent_scores: 'down' } });
  assert.equal(codeOf(await ghin.scores(cut.deps, { idToken: 'tok-a' })), 'GHIN_UNREACHABLE');
  assert.deepEqual(cut.kept, {});
});

test('scores: when GHIN fails nothing is stored over what was there', async () => {
  const w = scoring({ scoreStatus: { scores: 403, revision_scores: 403 } });
  w.kept.u_a = { number: '12345678', env: 'staging', syncedAt: NOW - 3 * 24 * 3600 * 1000, revision: [{ date: '2026-10-01', score: 90, used: true }] };
  const before = JSON.stringify(w.kept.u_a);
  const out = await ghin.scores(w.deps, { idToken: 'tok-a' });
  assert.equal(out.status, 502);
  assert.equal(codeOf(out), 'GHIN_ERROR');
  assert.equal('detail' in out.body.error, false, 'a member is not passed GHIN\'s own words');
  assert.equal(JSON.stringify(w.kept.u_a), before);
  // An admin reading another member's is told what GHIN said.
  const adm = await ghin.scores(w.deps, { idToken: 'tok-adm', memberId: 'u_b' });
  assert.match(adm.body.error.detail, /AccessDenied/);
  // GHIN down, or the login refused: the same, and no second asking.
  const down = scoring({ down: true });
  assert.equal(codeOf(await ghin.scores(down.deps, { idToken: 'tok-a' })), 'GHIN_UNREACHABLE');
  assert.deepEqual(down.kept, {});
  assert.equal(down.fake.state.asked.length, 1, 'asked once');
  const refused = scoring({ loginStatus: 401 });
  assert.equal(codeOf(await ghin.scores(refused.deps, { idToken: 'tok-a' })), 'LOGIN_REFUSED');
  assert.equal(refused.fake.state.logins, 1, 'one login tried');
});

test('scores: nothing personal, and no hole-by-hole, in what is answered or stored', async () => {
  const w = scoring();
  const out = await ghin.scores(w.deps, { idToken: 'tok-a' });
  const text = JSON.stringify([out.body, w.kept]);
  for (const k of [...PII, 'golfer_id', 'gender', 'hole_details', 'posted_at', 'tee_set_id']) assert.equal(text.includes(`"${k}"`), false, k);
  assert.equal(text.includes('bat@example.mn'), false);
  assert.equal(text.includes('99119007'), false);
});

// ---- Courses ----

// A tee set as GHIN's own example has it.
const teeSet = (id, name, gender, rating, slope, over = {}) => ({
  TeeSetRatingId: id, TeeSetRatingName: name, Gender: gender, HolesNumber: 18, TotalYardage: 6126, TotalMeters: 5581,
  StrokeAllocation: true, TotalPar: 72,
  Ratings: [
    { RatingType: 'Total', CourseRating: rating, SlopeRating: slope, BogeyRating: 98 },
    { RatingType: 'Front', CourseRating: 34.6, SlopeRating: 118, BogeyRating: 47.1 },
    { RatingType: 'Back', CourseRating: 34.6, SlopeRating: 120, BogeyRating: 47.9 },
  ],
  Holes: Array.from({ length: 18 }, (_, i) => ({ Number: i + 1, HoleId: 1266518 + i, Length: 339 + i, Par: i % 3 === 0 ? 5 : 4, Allocation: 18 - i })),
  ...over,
});
const COURSE = {
  Facility: { FacilityId: 2964, FacilityStatus: 'Active', FacilityName: 'Chinggis Khaan Golf Course', FacilityNumber: '56390' },
  Season: { SeasonName: 'Active Season', SeasonStartDate: '04/01', SeasonEndDate: '11/14', IsAllYear: false },
  TeeSets: [teeSet(134949, ' WHITE ', 'Male', 69.2, 119), teeSet(134950, 'RED', 'Female', 71.2, 127)],
  CourseId: 29422, CourseName: 'Chinggis Khaan Golf Course', CourseStatus: 'Active', CourseNumber: 123, CourseCity: 'Ulaanbaatar', CourseState: 'MN-1',
};

test('trimTeeSet: the ids, who it is rated for, the ratings, and each hole', () => {
  const t = ghin.trimTeeSet(teeSet(134949, ' WHITE ', 'Male', 69.2, 119));
  assert.deepEqual({ ...t, pars: null, si: null, lengths: null }, {
    id: '134949', name: 'WHITE', gender: 'M', rating: 69.2, slope: 119, bogey: 98, par: 72, holes: 18, yards: 6126, meters: 5581,
    front: { rating: 34.6, slope: 118, bogey: 47.1 }, back: { rating: 34.6, slope: 120, bogey: 47.9 },
    pars: null, si: null, lengths: null,
  });
  assert.deepEqual([t.pars[1], t.pars[2], t.si[1], t.si[18], t.lengths[18], Object.keys(t.pars).length], [5, 4, 18, 1, 356, 18]);
  assert.equal(ghin.trimTeeSet(teeSet(1, 'RED', 'Female', 71.2, 127)).gender, 'F');
  assert.equal(ghin.trimTeeSet(teeSet(1, 'X', 'Mixed', 70, 120)).gender, '');
  // Numbers sent as text; a hole that is not one is passed over; no nine-hole ratings.
  const loose = ghin.trimTeeSet(teeSet(7, 'BLUE', 'male', '71.4', '131', {
    Ratings: [{ RatingType: 'total', CourseRating: '71.4', SlopeRating: '131' }],
    Holes: [{ Number: 1, Par: '4', Allocation: '9' }, { Number: 19, Par: 4 }, { Number: 0, Par: 4 }, { Number: 2.5, Par: 4 }, null, { Par: 3 }],
  }));
  assert.deepEqual([loose.rating, loose.slope, 'bogey' in loose, 'front' in loose, loose.pars, loose.si, loose.lengths], [71.4, 131, false, false, { 1: 4 }, { 1: 9 }, {}]);
  // Not a tee set a score is posted from: no id, or no eighteen-hole rating.
  for (const bad of [null, 'x', {}, teeSet(undefined, 'W', 'Male', 69, 119), teeSet(1, 'W', 'Male', 69, 119, { Ratings: [{ RatingType: 'Front', CourseRating: 34, SlopeRating: 118 }] }),
    teeSet(1, 'W', 'Male', null, 119), teeSet(1, 'W', 'Male', 69, null), teeSet(1, 'W', 'Male', 69, 119, { Ratings: 'none' })]) {
    assert.equal(ghin.trimTeeSet(bad), null);
  }
});

test('trimCourse: the course, its facility, and the tee sets that are rated', () => {
  const c = ghin.trimCourse({ ...COURSE, TeeSets: [...COURSE.TeeSets, { TeeSetRatingId: 9, TeeSetRatingName: 'Unrated', Ratings: [] }, null] }, '29422');
  assert.deepEqual({ ...c, tees: c.tees.map(t => [t.id, t.name, t.gender, t.rating, t.slope]) }, {
    id: '29422', name: 'Chinggis Khaan Golf Course', facility: 'Chinggis Khaan Golf Course', facilityId: '2964',
    city: 'Ulaanbaatar', state: 'MN-1', status: 'Active',
    tees: [['134949', 'WHITE', 'M', 69.2, 119], ['134950', 'RED', 'F', 71.2, 127]],
  });
  // What GHIN leaves out is empty, not a failure; the id asked for stands in for its own.
  assert.deepEqual(ghin.trimCourse({}, '77'), { id: '77', name: '', facility: '', city: '', state: '', status: '', tees: [] });
  assert.deepEqual(ghin.trimCourse(null, '77').tees, []);
});

test('findCourses: GHIN\'s courses under a name, as a pick list', async () => {
  const hit = (id, over = {}) => ({ CourseID: id, CourseStatus: 'Active', CourseName: 'Mt. Bogd Golf & Country Club', FacilityID: 9754, FacilityName: 'Mt. Bogd Golf & Country Club',
    Address: '1 Bogd St', City: 'Ulaanbaatar', State: 'MN-1', Country: 'Mongolia', Telephone: 99119007, Email: 'club@example.mn', Ratings: [{ TeeSetRatingId: 1 }], ...over });
  const w = world([], { ghin: { courseSearch: [hit(30111), hit(555, { CourseName: 'Bogdan Hills', FacilityName: 'Bogdan Hills GC', City: 'Sofia', State: 'BG-22', Country: 'Bulgaria', CourseStatus: 'Inactive' }), { CourseName: 'no id' }, null] } });
  const found = await ghin.findCourses(w.deps.client, '  Bogd ');
  assert.deepEqual(w.fake.state.courseAsks, ['search Bogd offset 0 limit 50']);
  assert.deepEqual(found, [
    { id: '30111', name: 'Mt. Bogd Golf & Country Club', facility: 'Mt. Bogd Golf & Country Club', city: 'Ulaanbaatar', state: 'MN-1', country: 'Mongolia', status: 'Active' },
    { id: '555', name: 'Bogdan Hills', facility: 'Bogdan Hills GC', city: 'Sofia', state: 'BG-22', country: 'Bulgaria', status: 'Inactive' },
  ]);
  assert.deepEqual(await ghin.findCourses(world([]).deps.client, 'Nowhere'), []);
  // What GHIN refuses is told, with its own words.
  const no = world([], { ghin: { courseStatus: 403 } });
  await assert.rejects(ghin.findCourses(no.deps.client, 'Bogd'), (e) => e.ghin === 'GHIN_ERROR' && e.upstream === 403 && /AccessDenied/.test(e.detail));
});

test('courseById: one course with its tee sets — or none', async () => {
  const w = world([], { ghin: { courses: { 29422: COURSE } } });
  const c = await ghin.courseById(w.deps.client, 29422);
  assert.deepEqual([c.id, c.name, c.tees.length, c.tees[0].id], ['29422', 'Chinggis Khaan Golf Course', 2, '134949']);
  assert.equal((await ghin.courseById(w.deps.client, ' 29422 ')).id, '29422');
  assert.equal(await ghin.courseById(w.deps.client, '11111'), null, 'GHIN has none under the id');
  assert.deepEqual(w.fake.state.courseAsks, ['course 29422', 'course 29422', 'course 11111']);
  // Not an id: GHIN is not asked.
  for (const bad of ['', null, undefined, 'abc', '29422/tee_set_ratings', '../golfers/1', '1234567890']) assert.equal(await ghin.courseById(w.deps.client, bad), null);
  assert.equal(w.fake.state.courseAsks.length, 3);
  // A failure is not "no such course".
  const down = world([], { ghin: { courseStatus: 503, courses: { 29422: COURSE } } });
  await assert.rejects(ghin.courseById(down.deps.client, 29422), (e) => e.ghin === 'GHIN_ERROR' && e.upstream === 503);
});

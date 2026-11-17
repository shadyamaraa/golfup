// functions/ghin.js
// GHIN — the USGA's handicap service, which the Mongolian Golf Association
// (MGA) is a member of — read from the server: the logic, apart from Firebase
// so it can be tested (scripts/test-ghin.mjs).
//
// The login is the association's own (MGA, Federation 188) and can read every
// golfer's email, phone and date of birth, so it never reaches the browser:
// it lives in Secret Manager as GHIN_EMAIL / GHIN_PASSWORD, every call goes
// through here, and what leaves this file is trimmed to a name, a club and a
// Handicap Index. Only a signed-in member may ask.
//
//   lookup   — who GHIN has under a number, and their Handicap Index. For
//              checking a number before it is saved; nothing is stored.
//   sync     — one member's Handicap Index, read by the GHIN number on their
//              record and stored under ghin/{memberId}: their own, or anyone's
//              for an admin.
//   syncAll  — every member with a GHIN number, in batches. Admins only.
//   phoneReport — a trial, for admins: can a member be found on GHIN by the
//              phone number they sign in with? Counts, and who was found.
//
// ghin/{memberId} is written only here (the database rules give no client
// write access to it), so what it holds is what GHIN said.
//
// The base URL defaults to GHIN's staging (UAT) environment; GHIN_BASE_URL
// switches to production once the USGA grants it. Spec:
// https://app.swaggerhub.com/apis-docs/GHIN/GHIN2020AllStage/2.0
//
// Reading only. Posting scores (scores/hbh) is a later step with its own
// permission.

const { callerOf } = require('./passwords');
const { mnLocal } = require('./phone-verify');

const UAT_BASE = 'https://api-uat.ghin.com/api/v2';
// A token is good for twelve hours (seen on staging, 2026-11); it is renewed
// a little early, and a 401 before that logs in again.
const TOKEN_TTL_MS = 10 * 60 * 60 * 1000;
// A member checking a number does it a handful of times. This stops the
// lookup being used to walk through the association's golfers.
const LOOKUPS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
// golfers/search takes several GHIN numbers at once and answers a hundred
// rows a page — one row per club a golfer belongs to.
const BATCH = 50;
const PER_PAGE = 100;
const MAX_PAGES = 20;

const fail = (status, code, message, extra) => ({ status, body: { error: { code, message: message || code, ...extra } } });

function baseUrlOf(configured) {
  return String(configured || UAT_BASE).replace(/\/+$/, '');
}

/** 'staging' for GHIN's UAT host, 'production' for anything else. */
function envOf(baseUrl) {
  return /(^|[/.-])uat[.-]/i.test(String(baseUrl)) ? 'staging' : 'production';
}

// A refusal with a code the functions below turn into an answer.
function ghinError(code, upstream, cause) {
  return Object.assign(new Error(code), { ghin: code, upstream: upstream || null, cause: cause || null });
}

async function readJson(res) {
  try { return (await res.json()) || {}; } catch (_) { return {}; }
}

// One login per function instance and account; a cold start logs in again.
const tokens = new Map();

/**
 * A GHIN client: { get(path, query), env }.
 * deps: { fetch, email, password, baseUrl?, now? }
 */
function createClient(deps) {
  const { fetch, email, password } = deps;
  const now = deps.now || Date.now;
  const base = baseUrlOf(deps.baseUrl);
  const key = `${base}|${email}`;

  async function login() {
    if (!email || !password) throw ghinError('NOT_CONFIGURED');
    let res;
    try {
      res = await fetch(`${base}/users/login.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ user: { email, password, remember_me: 'true' } }),
      });
    } catch (e) {
      throw ghinError('GHIN_UNREACHABLE', null, e);
    }
    const data = await readJson(res);
    // A refused login is our configuration, not something a member can fix.
    if (res.status === 401 || res.status === 403 || res.status === 422 || (res.ok && !data.token)) {
      throw ghinError('LOGIN_REFUSED', res.status);
    }
    if (!res.ok) throw ghinError('GHIN_ERROR', res.status);
    tokens.set(key, { token: String(data.token), at: now() });
    return String(data.token);
  }

  async function token() {
    const held = tokens.get(key);
    if (held && now() - held.at < TOKEN_TTL_MS) return held.token;
    return login();
  }

  // GET one JSON endpoint, e.g. get('golfers/search', { golfer_id: '1234567' }).
  async function get(path, query = {}) {
    const qs = new URLSearchParams(query).toString();
    const url = `${base}/${path}.json${qs ? '?' + qs : ''}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const bearer = await token();
      let res;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
      } catch (e) {
        throw ghinError('GHIN_UNREACHABLE', null, e);
      }
      // The token was ended early: log in once more and ask again.
      if (res.status === 401 && attempt === 0) { tokens.delete(key); continue; }
      if (!res.ok) throw ghinError('GHIN_ERROR', res.status);
      return readJson(res);
    }
    throw ghinError('LOGIN_REFUSED', 401);
  }

  return { get, env: envOf(base) };
}

// A GHIN number as the app keeps it: digits only, 7 or 8 of them.
function ghinNumber(value) {
  const d = String(value == null ? '' : value).replace(/\D/g, '');
  return /^\d{7,8}$/.test(d) ? d : null;
}
// For telling two spellings of one number apart from two numbers: GHIN
// answers a number as an integer, so a leading zero is not kept.
const sameKey = (value) => String(value == null ? '' : value).replace(/\D/g, '').replace(/^0+/, '');

/**
 * One row of golfers/search, trimmed to what the app shows. The row also
 * carries the golfer's email, phone, date of birth and address: those stay
 * on the server.
 */
function trimGolfer(row, number) {
  const hi = row.hi_display != null && row.hi_display !== '' ? String(row.hi_display)
    : row.handicap_index != null && row.handicap_index !== '' ? String(row.handicap_index) : null;
  // GHIN writes "no Handicap Index" as 999; a plus handicap as a negative number.
  const value = typeof row.hi_value === 'number' && Number.isFinite(row.hi_value) && row.hi_value < 99
    ? row.hi_value : null;
  const lowHi = row.low_hi_display != null && row.low_hi_display !== '' ? String(row.low_hi_display)
    : row.low_hi != null && row.low_hi !== '' ? String(row.low_hi) : null;
  return {
    number: String(number),
    name: String(row.player_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || ''),
    club: String(row.club_name || ''),
    association: String(row.association_name || ''),
    status: String(row.status || ''),
    hi,
    hiValue: value,
    lowHi,
    revDate: row.rev_date ? String(row.rev_date) : null,
    withdrawn: row.hi_withdrawn === true,
  };
}

// A golfer has one row per club they belong to; the home club's is the one read.
const pickRow = (rows) => rows.find(r => r && r.is_home_club === true) || rows[0] || null;

/**
 * The golfers GHIN has under these numbers: Map(number → trimmed golfer).
 * A number GHIN does not know (or that this login may not see) is absent.
 */
async function golfersByNumber(client, numbers) {
  const rows = await rowsByNumber(client, numbers);
  return new Map([...rows].map(([number, list]) => [number, trimGolfer(pickRow(list), number)]));
}

// The rows GHIN has under these numbers, as it sent them: Map(number → rows).
// They carry the golfer's personal details and are not to leave this file.
async function rowsByNumber(client, numbers) {
  const wanted = [...new Set(numbers.map(ghinNumber).filter(Boolean))];
  const found = new Map();
  for (let i = 0; i < wanted.length; i += BATCH) {
    const chunk = wanted.slice(i, i + BATCH);
    const masked = await searchInto(client, chunk, found);
    // A row for a club this login has no rights to has its number masked
    // ("7*****4"), so among several numbers it cannot be told whose it is.
    // Asked for one number at a time, every row is that golfer's.
    if (masked && chunk.length > 1) {
      for (const number of chunk) {
        if (!found.has(number)) await searchInto(client, [number], found);
      }
    }
  }
  return found;
}

// One search for a chunk of numbers, every page of it; the rows it finds go
// into `found`. Answers whether it met rows it could not tell the owner of.
async function searchInto(client, chunk, found) {
  const byKey = new Map(chunk.map(n => [sameKey(n), n]));
  let masked = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await client.get('golfers/search', { golfer_id: chunk.join(','), per_page: PER_PAGE, page });
    const list = Array.isArray(data.golfers) ? data.golfers : [];
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const number = byKey.get(sameKey(row.ghin)) || (chunk.length === 1 ? chunk[0] : null);
      if (!number) { masked = true; continue; }
      if (!found.has(number)) found.set(number, []);
      found.get(number).push(row);
    }
    if (list.length < PER_PAGE) break;
  }
  return masked;
}

// A phone number as GHIN may hold it — '+976 9911 9007', '99119007',
// 97699119007 — down to the eight digits a Mongolian number is at home.
// Another country's number, or something that is not a number, is ''.
function phoneKey(value) {
  return mnLocal(value == null ? '' : String(value)) || '';
}

/**
 * The golfers GHIN has under a Mongolian phone number (its eight digits):
 * trimmed, one for each GHIN number. GHIN's search may match loosely, and
 * how a number was typed in there is not known, so both spellings are asked
 * and only a row whose own phone is this very number counts.
 */
async function golfersByPhone(client, local) {
  const rows = new Map();   // GHIN number → rows
  for (const spelling of [local, '976' + local]) {
    const data = await client.get('golfers/search', { phone_number: spelling, per_page: 20, page: 1 });
    for (const row of Array.isArray(data.golfers) ? data.golfers : []) {
      if (!row || typeof row !== 'object' || phoneKey(row.phone_number) !== local) continue;
      const number = ghinNumber(row.ghin);   // a masked number is not one
      if (!number) continue;
      if (!rows.has(number)) rows.set(number, []);
      rows.get(number).push(row);
    }
    if (rows.size) break;
  }
  return [...rows].map(([number, list]) => trimGolfer(pickRow(list), number));
}

// A thrown GHIN refusal as an answer. Which is which matters to the admin
// (set the secrets, check the login) and not at all to a member.
function refusal(err) {
  const code = err && err.ghin;
  if (code === 'NOT_CONFIGURED') return fail(500, 'NOT_CONFIGURED', 'GHIN_EMAIL / GHIN_PASSWORD are not set');
  if (code === 'LOGIN_REFUSED') return fail(502, 'LOGIN_REFUSED', 'GHIN refused the login', { upstream: err.upstream });
  if (code === 'GHIN_UNREACHABLE') return fail(502, 'GHIN_UNREACHABLE', 'GHIN could not be reached');
  if (code === 'GHIN_ERROR') return fail(502, 'GHIN_ERROR', 'GHIN answered with an error', { upstream: err.upstream });
  throw err;
}

// What is stored under ghin/{memberId}: what GHIN said, when, and from which
// environment — or that GHIN has no golfer under the member's number.
function recordOf(golfer, number, env, at) {
  return golfer
    ? { ...golfer, found: true, env, syncedAt: at }
    : { number: String(number), found: false, env, syncedAt: at };
}

/**
 * Who GHIN has under a number. Nothing is stored.
 * deps: { client, verifyIdToken, getSecret(id), patchSecret(id, patch), now? }
 */
async function lookup(deps, body) {
  const now = deps.now || Date.now;
  const b = body || {};
  const caller = await callerOf(deps, b.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to look a GHIN number up');
  const number = ghinNumber(b.ghin);
  if (!number) return fail(400, 'BAD_GHIN', 'A GHIN number is 7 or 8 digits');

  // So many an hour for each member, counted where only the server reads.
  const secret = (await deps.getSecret(caller)) || {};
  const fresh = !(now() - Number(secret.ghinFrom) < HOUR_MS);
  const used = fresh ? 0 : Number(secret.ghinCount) || 0;
  if (used >= LOOKUPS_PER_HOUR) {
    const retryAfter = Math.ceil((Number(secret.ghinFrom) + HOUR_MS - now()) / 1000);
    return fail(429, 'TOO_MANY', 'Too many GHIN lookups; try again later', { retryAfter });
  }
  await deps.patchSecret(caller, fresh ? { ghinFrom: now(), ghinCount: 1 } : { ghinCount: used + 1 });

  let golfer;
  try {
    golfer = (await golfersByNumber(deps.client, [number])).get(number) || null;
  } catch (err) {
    return refusal(err);
  }
  if (!golfer) return fail(404, 'NOT_FOUND', 'GHIN has no golfer under this number');
  return { status: 200, body: { ok: true, golfer, env: deps.client.env } };
}

/**
 * Read one member's Handicap Index from GHIN and store it.
 * deps: { client, verifyIdToken, loadUser(id), saveGhin(memberId, record), now? }
 */
async function sync(deps, body) {
  const now = deps.now || Date.now;
  const b = body || {};
  const caller = await callerOf(deps, b.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to do this');
  const target = String(b.memberId || caller);
  if (!/^[\w-]{1,64}$/.test(target)) return fail(404, 'USER_NOT_FOUND', 'No such member');
  if (target !== caller) {
    const me = await deps.loadUser(caller);
    if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Only an admin reads another member\'s Handicap Index');
  }
  const member = await deps.loadUser(target);
  if (!member) return fail(404, 'USER_NOT_FOUND', 'No such member');
  const number = ghinNumber(member.ghinNumber);
  if (!number) return fail(400, 'NO_GHIN', 'This member has no GHIN number');

  let golfer;
  try {
    golfer = (await golfersByNumber(deps.client, [number])).get(number) || null;
  } catch (err) {
    return refusal(err);
  }
  const record = recordOf(golfer, number, deps.client.env, now());
  await deps.saveGhin(target, record);
  return { status: 200, body: { ok: true, ghin: record } };
}

/**
 * Read every member's Handicap Index from GHIN and store them.
 * deps: { client, verifyIdToken, loadUser(id), loadUsers(), saveAllGhin({memberId: record}), now? }
 */
async function syncAll(deps, body) {
  const now = deps.now || Date.now;
  const caller = await callerOf(deps, body && body.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to do this');
  const me = await deps.loadUser(caller);
  if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Admins only');

  const users = (await deps.loadUsers()) || {};
  const numbers = new Map();   // member id → GHIN number
  for (const [key, u] of Object.entries(users)) {
    const number = u && typeof u === 'object' ? ghinNumber(u.ghinNumber) : null;
    if (number) numbers.set(key, number);
  }

  let golfers;
  try {
    golfers = await golfersByNumber(deps.client, [...numbers.values()]);
  } catch (err) {
    return refusal(err);
  }
  const at = now();
  const records = {};
  let found = 0;
  for (const [memberId, number] of numbers) {
    const golfer = golfers.get(number) || null;
    if (golfer) found++;
    records[memberId] = recordOf(golfer, number, deps.client.env, at);
  }
  if (numbers.size) await deps.saveAllGhin(records);
  return { status: 200, body: { ok: true, members: numbers.size, found, notFound: numbers.size - found, env: deps.client.env } };
}

// So many phone searches at once: enough to be done in half a minute, few
// enough to be no burden on GHIN.
const PHONE_SEARCHES_AT_ONCE = 4;

/**
 * A trial, for admins: can members be tied to GHIN by the phone number they
 * sign in with — a number the app has verified by SMS?
 *
 *   linked    — members who have a GHIN number: is the phone GHIN holds for
 *               that golfer the member's own?
 *   unlinked  — members who have none: does GHIN have a golfer under their
 *               phone? Those found, one golfer to a phone, are `candidates`.
 *
 * It only reads, and stores nothing. No phone number is in the answer.
 * deps: { client, verifyIdToken, loadUser(id), loadUsers() (with the private half) }
 */
async function phoneReport(deps, body) {
  const caller = await callerOf(deps, body && body.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to do this');
  const me = await deps.loadUser(caller);
  if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Admins only');

  const users = (await deps.loadUsers()) || {};
  const linked = [];
  const unlinked = [];
  for (const [id, u] of Object.entries(users)) {
    if (!u || typeof u !== 'object' || id === 'admin_uid') continue;
    const number = ghinNumber(u.ghinNumber);
    (number ? linked : unlinked).push({ id, number, phone: mnLocal(u.phone) });
  }

  const linkedOut = { members: linked.length, withPhone: 0, same: 0, different: 0, ghinNoPhone: 0, notOnGhin: 0 };
  const unlinkedOut = { members: unlinked.length, withPhone: 0, one: 0, many: 0, none: 0 };
  const candidates = [];
  const ambiguous = [];
  try {
    const rows = await rowsByNumber(deps.client, linked.map(m => m.number));
    for (const m of linked) {
      if (!m.phone) continue;
      linkedOut.withPhone++;
      const list = rows.get(m.number);
      if (!list) { linkedOut.notOnGhin++; continue; }
      const held = list.map(r => String(r.phone_number == null ? '' : r.phone_number).trim()).filter(Boolean);
      if (!held.length) linkedOut.ghinNoPhone++;
      else if (held.some(p => phoneKey(p) === m.phone)) linkedOut.same++;
      else linkedOut.different++;
    }

    // A golfer found by phone may already be another member's.
    const owner = new Map(linked.map(m => [sameKey(m.number), m.id]));
    const queue = unlinked.filter(m => m.phone);
    unlinkedOut.withPhone = queue.length;
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const m = queue[next++];
        const golfers = await golfersByPhone(deps.client, m.phone);
        if (!golfers.length) unlinkedOut.none++;
        else if (golfers.length > 1) { unlinkedOut.many++; ambiguous.push({ memberId: m.id, count: golfers.length }); }
        else {
          unlinkedOut.one++;
          candidates.push({ memberId: m.id, golfer: golfers[0], linkedTo: owner.get(sameKey(golfers[0].number)) || null });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PHONE_SEARCHES_AT_ONCE, queue.length) }, worker));
  } catch (err) {
    return refusal(err);
  }
  const order = new Map(unlinked.map((m, i) => [m.id, i]));
  candidates.sort((a, b) => order.get(a.memberId) - order.get(b.memberId));
  ambiguous.sort((a, b) => order.get(a.memberId) - order.get(b.memberId));
  return { status: 200, body: { ok: true, env: deps.client.env, linked: linkedOut, unlinked: unlinkedOut, candidates, ambiguous } };
}

module.exports = {
  UAT_BASE, TOKEN_TTL_MS, LOOKUPS_PER_HOUR, BATCH, PER_PAGE,
  baseUrlOf, envOf, createClient, ghinNumber, trimGolfer, golfersByNumber, golfersByPhone, phoneKey,
  lookup, sync, syncAll, phoneReport,
  _resetTokens: () => tokens.clear(),
};

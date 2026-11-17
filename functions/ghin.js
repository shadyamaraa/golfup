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
//   phoneReport — for admins: who can be found on GHIN by the phone number
//              they sign in with? Counts, and who was found.
//   linkByPhone — an admin ties the members found that way to their golfers.
//              The server checks the phone again for each before it writes.
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

// A refusal with a code the functions below turn into an answer. `detail`
// is what GHIN said in refusing — its own error text, cut short.
function ghinError(code, upstream, cause, detail) {
  return Object.assign(new Error(code), { ghin: code, upstream: upstream || null, cause: cause || null, detail: detail || null });
}

// The start of what GHIN answered a refused request with: an error message,
// as text. Never a golfer — it is only read when the request was refused.
async function refusalText(res) {
  try {
    const text = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json());
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch (_) {
    return '';
  }
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
      if (!res.ok) throw ghinError('GHIN_ERROR', res.status, null, await refusalText(res));
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
// `oneByOne: false` leaves out the second asking described below — for a
// long list where a golfer not found is simply passed over.
async function rowsByNumber(client, numbers, { oneByOne = true } = {}) {
  const wanted = [...new Set(numbers.map(ghinNumber).filter(Boolean))];
  const found = new Map();
  for (let i = 0; i < wanted.length; i += BATCH) {
    const chunk = wanted.slice(i, i + BATCH);
    const masked = await searchInto(client, chunk, found);
    // A row for a club this login has no rights to has its number masked
    // ("7*****4"), so among several numbers it cannot be told whose it is.
    // Asked for one number at a time, every row is that golfer's.
    if (oneByOne && masked && chunk.length > 1) {
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

// Every page of a listing (`key` names the list in the answer: 'golfers',
// 'clubs'), as GHIN sent the rows. Golfers' rows carry their personal
// details and are not to leave this file.
async function everyPage(client, path, query, maxPages, key = 'golfers') {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await client.get(path, { ...query, per_page: PER_PAGE, page });
    const list = Array.isArray(data[key]) ? data[key] : [];
    for (const row of list) if (row && typeof row === 'object') rows.push(row);
    if (list.length < PER_PAGE) break;
  }
  return rows;
}

// A thrown GHIN refusal as an answer. Which is which matters to the admin
// (set the secrets, check the login) and not at all to a member. An admin's
// function also passes on what GHIN said (`withDetail`).
function refusal(err, withDetail = false) {
  const code = err && err.ghin;
  if (code === 'NOT_CONFIGURED') return fail(500, 'NOT_CONFIGURED', 'GHIN_EMAIL / GHIN_PASSWORD are not set');
  if (code === 'LOGIN_REFUSED') return fail(502, 'LOGIN_REFUSED', 'GHIN refused the login', { upstream: err.upstream });
  if (code === 'GHIN_UNREACHABLE') return fail(502, 'GHIN_UNREACHABLE', 'GHIN could not be reached');
  if (code === 'GHIN_ERROR') {
    return fail(502, 'GHIN_ERROR', 'GHIN answered with an error',
      { upstream: err.upstream, ...(withDetail && err.detail && { detail: err.detail }) });
  }
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
    return refusal(err, true);
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

// How far the trial below reads: so many clubs of the association, so many
// pages of each roster (a hundred golfers a page).
const ROSTER_CLUBS = 30;
const ROSTER_PAGES = 40;
const CLUB_PAGES = 5;

/**
 * A trial, for admins: can members be tied to GHIN by the phone number they
 * sign in with — a number the app has verified by SMS?
 *
 *   linked    — members who have a GHIN number: is the phone GHIN holds for
 *               that golfer the member's own? `linkedLists` names the members
 *               for whom it is another, or none — a tie to look at again.
 *   unlinked  — members who have none: is there a golfer with their phone?
 *               Those found, one golfer to a phone, are `candidates`.
 *
 * What GHIN allows shapes how (tried against staging, 2026-11-17): it does
 * not search by phone, a wildcard last name needs three letters, and a
 * club's roster comes without phones — but a search by GHIN number has
 * them. So: the association most linked members are in → its clubs
 * (associations/{id}/clubs, or the ones the linked members are in) → each
 * club's roster for the GHIN numbers → those numbers searched, fifty at a
 * time, for the phones. Each step that GHIN refuses is passed over and
 * named in `refused` with what GHIN said; `sources` says what was read.
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

  // The linked members' own rows: this much must work, or there is no answer.
  let rows;
  try {
    rows = await rowsByNumber(deps.client, linked.map(m => m.number));
  } catch (err) {
    return refusal(err, true);
  }
  const linkedOut = { members: linked.length, withPhone: 0, same: 0, different: 0, ghinNoPhone: 0, notOnGhin: 0 };
  const linkedLists = { different: [], ghinNoPhone: [], notOnGhin: [] };
  for (const m of linked) {
    if (!m.phone) continue;
    linkedOut.withPhone++;
    const list = rows.get(m.number);
    const held = (list || []).map(r => String(r.phone_number == null ? '' : r.phone_number).trim()).filter(Boolean);
    const state = !list ? 'notOnGhin' : !held.length ? 'ghinNoPhone' : held.some(p => phoneKey(p) === m.phone) ? 'same' : 'different';
    linkedOut[state]++;
    if (state !== 'same') linkedLists[state].push(m.id);
  }

  const sources = [];
  const refused = [];
  // A step on its own: what GHIN refuses is named and passed over.
  const attempt = async (kind, at, run) => {
    try {
      return await run();
    } catch (err) {
      if (!err || !err.ghin) throw err;
      refused.push({ kind, id: at.id, name: at.name, code: err.ghin, upstream: err.upstream, detail: err.detail || '' });
      return null;
    }
  };

  // The association most linked members are in, by their home club's row. A
  // golfer may also have a row in some other association's club; that is
  // not where the members are looked for.
  const tally = new Map();
  const seenClubs = new Map();   // the clubs the linked members are in: id → { id, name, association }
  for (const list of rows.values()) {
    const home = pickRow(list);
    if (home && home.association_id != null) {
      const key = String(home.association_id);
      const at = tally.get(key) || { id: key, name: String(home.association_name || key), members: 0 };
      at.members++;
      tally.set(key, at);
    }
    for (const r of list) {
      if (r.club_id != null) seenClubs.set(String(r.club_id), { id: String(r.club_id), name: String(r.club_name || r.club_id), association: String(r.association_id) });
    }
  }
  const association = [...tally.values()].sort((a, b) => b.members - a.members)[0] || null;

  let clubs = [];
  if (association) {
    const listed = await attempt('association', association,
      () => everyPage(deps.client, `associations/${encodeURIComponent(association.id)}/clubs`, {}, CLUB_PAGES, 'clubs'));
    clubs = listed
      ? listed.filter(c => c.id != null).map(c => ({ id: String(c.id), name: String(c.club_name || c.short_name || c.id) }))
      : [...seenClubs.values()].filter(c => c.association === association.id);
  }

  // Each club's roster, for the GHIN numbers (a roster calls one `id`).
  const rosters = [];
  for (const club of clubs.slice(0, ROSTER_CLUBS)) {
    const list = await attempt('club', club, () => everyPage(deps.client, `clubs/${encodeURIComponent(club.id)}/golfers`, {}, ROSTER_PAGES));
    if (!list) continue;
    const numbers = [...new Set(list.map(r => ghinNumber(r.ghin != null ? r.ghin : r.id)).filter(Boolean))];
    rosters.push({ club, golfers: list.length, numbers });
  }

  // The phones: a search by GHIN number has them. The golfers already read
  // for the linked members are not asked for again.
  const have = new Set([...rows.keys()].map(sameKey));
  const missing = [...new Set(rosters.flatMap(r => r.numbers))].filter(n => !have.has(sameKey(n)));
  const more = missing.length
    ? await attempt('golfers', { id: '', name: `${missing.length} golfers` }, () => rowsByNumber(deps.client, missing, { oneByOne: false }))
    : new Map();
  const all = new Map([...rows].map(([n, list]) => [sameKey(n), { number: n, list }]));
  for (const [n, list] of more || []) all.set(sameKey(n), { number: n, list });

  const phonesOf = (list) => [...new Set(list.map(r => phoneKey(r.phone_number)).filter(Boolean))];
  const byPhone = new Map();   // phone → Map(GHIN number → rows)
  for (const { number, list } of all.values()) {
    for (const phone of phonesOf(list)) {
      if (!byPhone.has(phone)) byPhone.set(phone, new Map());
      byPhone.get(phone).set(number, list);
    }
  }
  for (const r of rosters) {
    const withPhone = r.numbers.filter(n => all.has(sameKey(n)) && phonesOf(all.get(sameKey(n)).list).length).length;
    sources.push({ kind: 'club', id: r.club.id, name: r.club.name, golfers: r.golfers, withPhone });
  }

  // A golfer found by phone may already be another member's.
  const owner = new Map(linked.map(m => [sameKey(m.number), m.id]));
  const unlinkedOut = { members: unlinked.length, withPhone: 0, one: 0, many: 0, none: 0 };
  const candidates = [];
  const ambiguous = [];
  for (const m of unlinked) {
    if (!m.phone) continue;
    unlinkedOut.withPhone++;
    const golfers = byPhone.get(m.phone);
    if (!golfers) { unlinkedOut.none++; continue; }
    if (golfers.size > 1) { unlinkedOut.many++; ambiguous.push({ memberId: m.id, count: golfers.size }); continue; }
    const [number, list] = [...golfers][0];
    unlinkedOut.one++;
    candidates.push({ memberId: m.id, golfer: trimGolfer(pickRow(list), number), linkedTo: owner.get(sameKey(number)) || null });
  }
  return {
    status: 200,
    body: {
      ok: true, env: deps.client.env, association: association ? { id: association.id, name: association.name } : null,
      linked: linkedOut, linkedLists, unlinked: unlinkedOut, candidates, ambiguous, sources, refused,
    },
  };
}

// So many ties in one request: every member of the club and to spare.
const MAX_LINKS = 300;

/**
 * Tie members to their golfers on the proof of the phone: for each
 * { memberId, number } an admin sends, GHIN must have a golfer under that
 * number whose phone is the member's own — the phone the member signs in
 * with, which the app has verified by SMS. What the admin's screen showed
 * is not taken on trust; the phones are read again here.
 *
 * A tie is refused, with a reason, when the member is not there
 * (NO_MEMBER), already has another GHIN number (HAS_NUMBER), has no
 * Mongolian phone (NO_PHONE), the number is not one (BAD_GHIN), is another
 * member's — or asked for twice here (TAKEN), is not on GHIN (NOT_ON_GHIN),
 * or the phone GHIN holds is not the member's (PHONE_DIFFERS).
 *
 * For each tie made: the GHIN number goes on the member's record, what GHIN
 * said of the golfer under ghin/{memberId} (as a sync would), and how the
 * tie was made under ghinLink/{memberId} — { number, by: 'phone', at, admin }.
 *
 * deps: { client, verifyIdToken, loadUser(id), loadUsers() (with the private half),
 *         saveLink(memberId, { number, ghin, link }), now? }
 */
async function linkByPhone(deps, body) {
  const now = deps.now || Date.now;
  const b = body || {};
  const caller = await callerOf(deps, b.idToken);
  if (!caller) return fail(401, 'UNAUTHENTICATED', 'Sign in again to do this');
  const me = await deps.loadUser(caller);
  if (!me || me.role !== 'admin') return fail(403, 'FORBIDDEN', 'Admins only');
  const asked = Array.isArray(b.links) ? b.links : [];
  if (!asked.length || asked.length > MAX_LINKS) return fail(400, 'BAD_LINKS', `Between 1 and ${MAX_LINKS} ties at a time`);

  const users = (await deps.loadUsers()) || {};
  // The numbers members already have: a golfer is one member's.
  const owner = new Map();
  for (const [id, u] of Object.entries(users)) {
    const n = u && typeof u === 'object' ? ghinNumber(u.ghinNumber) : null;
    if (n) owner.set(sameKey(n), id);
  }

  const refused = [];
  const pending = [];
  const claimed = new Set();   // numbers asked for in this request
  for (const item of asked) {
    const memberId = String((item && item.memberId) || '');
    const number = ghinNumber(item && item.number);
    const no = (reason) => refused.push({ memberId, number: number || String((item && item.number) || ''), reason });
    const member = /^[\w-]{1,64}$/.test(memberId) && memberId !== 'admin_uid' ? users[memberId] : null;
    if (!member || typeof member !== 'object') { no('NO_MEMBER'); continue; }
    if (!number) { no('BAD_GHIN'); continue; }
    const has = ghinNumber(member.ghinNumber);
    if (has && sameKey(has) !== sameKey(number)) { no('HAS_NUMBER'); continue; }
    const phone = mnLocal(member.phone);
    if (!phone) { no('NO_PHONE'); continue; }
    const holder = owner.get(sameKey(number));
    if ((holder && holder !== memberId) || claimed.has(sameKey(number))) { no('TAKEN'); continue; }
    claimed.add(sameKey(number));
    pending.push({ memberId, number, phone });
  }

  const linked = [];
  if (pending.length) {
    let rows;
    try {
      rows = await rowsByNumber(deps.client, pending.map(x => x.number));
    } catch (err) {
      return refusal(err, true);
    }
    const at = now();
    for (const x of pending) {
      const list = rows.get(x.number);
      if (!list) { refused.push({ memberId: x.memberId, number: x.number, reason: 'NOT_ON_GHIN' }); continue; }
      if (!list.some(r => phoneKey(r.phone_number) === x.phone)) {
        refused.push({ memberId: x.memberId, number: x.number, reason: 'PHONE_DIFFERS' });
        continue;
      }
      const golfer = trimGolfer(pickRow(list), x.number);
      await deps.saveLink(x.memberId, {
        number: x.number,
        ghin: recordOf(golfer, x.number, deps.client.env, at),
        link: { number: x.number, by: 'phone', at, admin: caller },
      });
      linked.push({ memberId: x.memberId, number: x.number, name: golfer.name });
    }
  }
  return { status: 200, body: { ok: true, env: deps.client.env, linked, refused } };
}

module.exports = {
  UAT_BASE, TOKEN_TTL_MS, LOOKUPS_PER_HOUR, BATCH, PER_PAGE,
  baseUrlOf, envOf, createClient, ghinNumber, trimGolfer, golfersByNumber, phoneKey,
  lookup, sync, syncAll, phoneReport, linkByPhone, MAX_LINKS,
  _resetTokens: () => tokens.clear(),
};

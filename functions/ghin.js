// GHIN (USGA handicap) API client — server-side only, so the Admin Portal
// login never reaches the browser.
//
// Credentials live in Secret Manager as GHIN_EMAIL / GHIN_PASSWORD. The base
// URL defaults to the GHIN staging (UAT) environment; set GHIN_BASE_URL to the
// production host once GHIN grants it. Spec:
// https://app.swaggerhub.com/apis-docs/GHIN/GHIN2020AllStage/2.0

const UAT_BASE = 'https://api-uat.ghin.com/api/v2';

// Tokens are valid for 24h; refresh a little early. Cached per function
// instance — a cold start simply logs in again.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
let cached = { token: null, at: 0 };

function baseUrl() {
  return (process.env.GHIN_BASE_URL || UAT_BASE).replace(/\/+$/, '');
}

async function login() {
  const email = process.env.GHIN_EMAIL;
  const password = process.env.GHIN_PASSWORD;
  if (!email || !password) throw Object.assign(new Error('GHIN not configured'), { status: 500 });
  const res = await fetch(`${baseUrl()}/users/login.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ user: { email, password, remember_me: 'true' } }),
  });
  const data = await res.json().catch(() => ({}));
  const token = data.token;
  if (!res.ok || !token) throw Object.assign(new Error('GHIN login failed'), { status: 502, upstream: res.status });
  cached = { token, at: Date.now() };
  return token;
}

async function token() {
  if (cached.token && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
  return login();
}

// GET a JSON endpoint, e.g. ghinGet('golfers/search', { golfer_id: 1234567 }).
// A 401 means the cached token was revoked early: log in once more and retry.
async function ghinGet(path, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `${baseUrl()}/${path}.json${qs ? '?' + qs : ''}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}`, Accept: 'application/json' } });
    if (res.status === 401 && attempt === 0) { cached = { token: null, at: 0 }; continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('GHIN request failed'), { status: res.status, upstream: res.status });
    return data;
  }
}

// One golfer by GHIN number, trimmed to what the app shows. The search
// response also carries email, phone, birth date and address — those stay on
// the server.
async function golferByGhin(ghin) {
  const data = await ghinGet('golfers/search', { golfer_id: ghin, per_page: 5, page: 1 });
  const list = Array.isArray(data.golfers) ? data.golfers : [];
  // A golfer appears once per club affiliation; prefer the home club.
  const g = list.find(x => x.is_home_club) || list[0];
  if (!g) return null;
  return {
    ghin: String(g.ghin ?? ghin),
    firstName: g.first_name || '',
    lastName: g.last_name || '',
    gender: g.gender || '',
    status: g.status || '',
    clubName: g.club_name || '',
    associationName: g.association_name || '',
    handicapIndex: g.hi_display ?? g.handicap_index ?? null,
    lowHi: g.low_hi_display ?? g.low_hi ?? null,
    revDate: g.rev_date || null,
  };
}

module.exports = { golferByGhin, ghinGet, baseUrl, _reset: () => { cached = { token: null, at: 0 }; } };

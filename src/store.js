import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, remove, onValue, push, query, limitToLast } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { isFirebaseConfigured, firebaseConfig } from './config.js';
import { samePhone, withoutPassword } from './phone-auth.js';
import {
  splitMember, mergeMember, carriesPrivate, baselineOf, memberWrites,
  SESSION_VERSION, sessionAction,
} from './member-record.js';
import {
  cleanProfile, slotWrites, bookingWrites, cancelWrites, applyWrites,
} from './coaching.js';
import { programWrites, publishWrites, enrollWrites, unenrollWrites, removeProgramWrites } from './coaching-programs.js';

let db = null;
let auth = null;
export let firebaseApp = null;
let useFirebase = false;
// The anonymous-auth uid of this browser, once sign-in resolves; null before
// that, and null again if the SDK signs the browser out (see below).
let deviceUid = null;
// A uid existed this session: a null after that is the SDK signing the
// browser out — its token refresh was refused because the anonymous user is
// gone server-side — not the quiet before the first sign-in.
let hadUid = false;
let anonAttempt = 0;
let anonTimer = null;
let anonInFlight = null;

export async function initStore() {
  if (isFirebaseConfigured()) {
    try {
      firebaseApp = initializeApp(firebaseConfig);
      db = getDatabase(firebaseApp);
      auth = getAuth(firebaseApp);
      useFirebase = true;
      console.log('Firebase connected');
      // Anonymous auth stamps every request from this browser with a stable
      // uid, which is what the database rules look up in mpDevices before
      // letting a device write under tournaments/. The app's own sign-in is
      // untouched. If the Anonymous provider is not enabled in the Firebase
      // console the sign-in rejects and the uid stays null — everything else
      // keeps working.
      onAuthStateChanged(auth, (u) => {
        const uid = u?.uid || null;
        if (!uid && hadUid) {
          // The SDK signed this browser out: a token refresh was refused
          // because the anonymous user no longer exists (a console clean-up,
          // the automatic one). Every tournament write would be refused from
          // here on, so sign in again — a fresh uid, registered afresh.
          setDeviceUid(null);
          lastDeviceAccess = { ok: false, uid: null, want: deviceRoleFor(getUser()), role: null, reason: 'no-auth', at: Date.now() };
          ensureAnonAuth(true);
          return;
        }
        setDeviceUid(uid);
      });
      ensureAnonAuth(true);
      // A sign-in that failed for want of a network is tried again when it returns.
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => { if (!deviceUid) ensureAnonAuth(true); });
      }
    } catch (e) {
      console.warn('Firebase init failed, using localStorage', e);
    }
  }
}

export const ANON_MAX_ATTEMPTS = 8;
// The wait before the next anonymous sign-in attempt: 2 s, 4, 8, 16, 32,
// then a minute, capped — a startup on a dead network keeps trying for a
// few minutes and then leaves it to the `online` event and the retry buttons.
export function nextAuthRetryMs(attempt, base = 2000, cap = 60000) {
  return Math.min(cap, base * 2 ** Math.max(0, Number(attempt) || 0));
}

// The one place anonymous sign-in is asked for. The SDK hands back the
// anonymous user it already has without a network call, so asking again
// never mints a second identity; it signs in only when there is none.
// A member who signed in by SMS is a Firebase Auth user of their own:
// asking for an anonymous one would sign them out, so the identity the
// browser has restored is waited for first and, when there is one, kept.
// Resolves to the uid, or null when the attempt failed (a retry is timed).
export function ensureAnonAuth(reset = false) {
  if (!auth) return Promise.resolve(null);
  if (reset) { anonAttempt = 0; clearTimeout(anonTimer); anonTimer = null; }
  if (anonInFlight) return anonInFlight;
  anonInFlight = Promise.resolve(typeof auth.authStateReady === 'function' ? auth.authStateReady() : null)
    .then(() => (auth.currentUser ? { user: auth.currentUser } : signInAnonymously(auth)))
    .then((cred) => { anonAttempt = 0; setDeviceUid(cred.user.uid); return cred.user.uid; })
    .catch((e) => {
      console.warn('anon auth unavailable:', e?.code || e);
      if (anonAttempt < ANON_MAX_ATTEMPTS && !anonTimer) {
        anonTimer = setTimeout(() => { anonTimer = null; ensureAnonAuth(); }, nextAuthRetryMs(anonAttempt++));
      }
      return null;
    })
    .finally(() => { anonInFlight = null; });
  return anonInFlight;
}

// A new identity means a new registration: the memo is cleared and the
// signed-in member, if any, is registered for it right away. The auth
// observer hears of a sign-in a microtask later, so the credential's uid is
// set here as well rather than waited for.
function setDeviceUid(uid) {
  if (uid === deviceUid) return;
  deviceUid = uid;
  ensuredAccessKey = null;
  if (uid) {
    hadUid = true;
    ensureDeviceAccess(getUser());
  }
}

export function isUsingFirebase() { return useFirebase; }

// The one way a member is named on screen: first name first. Stored fullName
// strings predate that order (they were saved as "Овог Нэр"), so whenever the
// split fields exist they win, and fullName is only the legacy fallback.
export function memberName(u) {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ')
    || u.fullName || u.name || u.username || u.id || '';
}

// ---- User Management ----
export function getUser() {
  const data = localStorage.getItem('golfup_user');
  if (!data) return null;
  const user = JSON.parse(data);
  // A session saved before passwords moved to the server carries the
  // member's own password in this browser's storage: drop it on sight.
  if (user && typeof user === 'object' && 'password' in user) {
    const clean = withoutPassword(user);
    localStorage.setItem('golfup_user', JSON.stringify(clean));
    return clean;
  }
  return user;
}

export function logoutUser() {
  localStorage.removeItem('golfup_user');
  localStorage.removeItem(SESSION_MARK);
  signOutPhoneAuth();
}

// ---- The session's version ----
// A session from before members had a Firebase identity cannot read the
// private half of the member records (below). It is ended once and the
// member signs in again; a browser that already carries that member's
// identity is spared the trip. The mark is set at sign-in.
const SESSION_MARK = 'golfup_session_v';

export function markSession() {
  try { localStorage.setItem(SESSION_MARK, SESSION_VERSION); } catch (_) { /* storage is off: asked again next time */ }
}

// The member this browser's Firebase identity speaks for — the `memberId`
// in its token — or null: signed out, an anonymous device, local mode.
// Throws when the token cannot be read (it had expired and there is no
// network to renew it).
async function memberIdentity() {
  if (!auth) return null;
  if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return null;
  return (await u.getIdTokenResult()).claims.memberId || null;
}

/**
 * Bring the session this browser woke up with up to date: 'keep' (current,
 * or none), 'adopt' (from before, but the browser is already that member —
 * marked current) or 'end' (from before, with no identity — signed out).
 */
export async function settleSession() {
  const user = getUser();
  let marker = null;
  try { marker = localStorage.getItem(SESSION_MARK); } catch (_) { /* as if unmarked */ }
  if (sessionAction({ user, marker, identity: null }) === 'keep') return 'keep';
  let identity = null;
  try {
    identity = await memberIdentity();
  } catch (e) {
    // Could not tell — offline with an expired token. Not a reason to sign
    // anyone out: it is asked again the next time the app opens.
    console.warn('session check put off:', e?.code || e);
    return 'keep';
  }
  const action = sessionAction({ user, marker, identity });
  if (action === 'adopt') markSession();
  if (action === 'end') logoutUser();
  return action;
}

// ---- A member's record, in two places ----
// users/{id} is the public half — anyone reads it, a visitor included.
// userPrivate/{id} is the private half — the phone number, the bank details,
// the club code — and the database rules open it only to a signed-in member
// (src/member-record.js draws the line). The app works with one record per
// member: the two halves are merged when read and split when written, so no
// screen knows there are two. A visitor's copy just has no private fields.

// What this browser last read (or wrote) of each member, in the private and
// the admin-only fields: a save sends only what differs from it.
const seen = new Map();
function remember(user, id = user?.id) {
  if (user && id) seen.set(id, baselineOf(user));
  return user;
}

// How many public records still carry a private field — not yet moved by the
// admin's one-off step. Counted whenever the members are loaded.
let unmovedPrivate = 0;
export function unmovedPrivateCount() { return unmovedPrivate; }

// Whether this browser carries a member's Firebase identity, which is what
// the rules ask for before the private half may be read.
async function hasMemberIdentity() {
  if (!auth) return false;
  try {
    if (typeof auth.authStateReady === 'function') await auth.authStateReady();
  } catch (_) { /* read whatever identity there is */ }
  return !!auth.currentUser && !auth.currentUser.isAnonymous;
}

// The identity the rules last refused the private half to. It is not asked
// again for that identity — a member on hold, or rules that have not been
// deployed yet, would otherwise cost every member list a wasted wait.
let privateRefusedFor = null;

// The private half at `path` ('userPrivate' or 'userPrivate/{id}'): its
// value, null when there is nothing there, or undefined when this browser
// may not read it. Never throws — a member list without phone numbers is
// still a member list.
async function readPrivate(path) {
  if (!(await hasMemberIdentity())) return undefined;
  const uid = auth.currentUser.uid;
  if (privateRefusedFor === uid) return undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const snap = await get(ref(db, path));
      privateRefusedFor = null;
      return snap.exists() ? snap.val() : null;
    } catch (e) {
      const refused = /permission/i.test(String(e?.message || e));
      // Right after a sign-in the connection may still be presenting the
      // identity it had before; one more try a moment later settles it.
      if (refused && attempt === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
      if (refused) privateRefusedFor = uid;
      console.warn('private member data not readable:', e?.message || e);
      return undefined;
    }
  }
  return undefined;
}

// What the session knows of its own member's private half. It stands in
// when the private half cannot be read, so a member whose browser has no
// Firebase identity still has their own phone number and bank details —
// the ones they signed in with — and loses nothing by opening their profile.
function ownPrivate(id, me = getUser()) {
  return me && me.id === id ? splitMember(me).priv : null;
}

// Write a member: the private half first, then the public one. Only what was
// changed is sent to the private half, and role and status only when they
// were changed (memberWrites) — so a copy gone stale cannot put an old phone
// number or an old role back, and a browser that may not write the private
// half is not refused for a save that never touched it. A password is never
// written: passwords live on the server (functions/passwords.js).
async function writeMember(user) {
  const { pub, priv } = memberWrites(user, seen.get(user.id) || null);
  if (Object.keys(priv).length) await update(ref(db, 'userPrivate/' + user.id), priv);
  await update(ref(db, 'users/' + user.id), pub);
  if (seen.has(user.id)) remember(user);
}

// The session, and the member's own record. The session keeps the whole
// record — it is the member's own data in the member's own browser.
export function saveUser(user) {
  const clean = withoutPassword(user);
  localStorage.setItem('golfup_user', JSON.stringify(clean));
  if (useFirebase && clean.id && db) {
    writeMember(clean).catch(console.warn);
  }
}

// A new member has no password: they sign in by SMS. An admin who wants to
// give one calls setMemberPassword afterwards.
export async function adminCreateUser(name, phone, role = 'user', communities = [], extra = {}) {
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const user = {
    id, name, username: '', firstName: '', lastName: '', fullName: '', gender: '', communities, phone, role, status: 'active',
    bankName: '', bankAccount: '', bankIban: '', avatar: '',
    createdAt: Date.now(),
    ...extra
  };
  if (useFirebase && db) {
    const { pub, priv } = splitMember(user);
    const filled = Object.fromEntries(Object.entries(priv).filter(([, v]) => v !== '' && v !== null));
    // The phone first: a member no one can reach by phone cannot sign in, so
    // if it cannot be written (only an admin's identity may) nothing is.
    if (Object.keys(filled).length) await update(ref(db, 'userPrivate/' + id), filled);
    await set(ref(db, 'users/' + id), pub);
  }
  return remember(user);
}

// Save a member an admin edited (or a member, their own profile). What
// differs from the record as it was read is what the save changes; a record
// this browser has not read yet is read first.
export async function adminUpdateUser(user) {
  if (useFirebase && db && user.id) {
    if (!seen.has(user.id)) await loadUserById(user.id);
    await writeMember(withoutPassword(user));
  }
}

export async function loadAllUsers() {
  if (useFirebase && db) {
    try {
      const [snap, privates] = await Promise.all([get(ref(db, 'users')), readPrivate('userPrivate')]);
      if (!snap.exists()) { unmovedPrivate = 0; return []; }
      const data = snap.val();
      unmovedPrivate = Object.values(data).filter(carriesPrivate).length;
      const me = privates === undefined ? getUser() : null;
      return Object.entries(data).map(([key, val]) => {
        const id = val.id || key;
        const priv = privates === undefined ? ownPrivate(id, me) : privates?.[id];
        return remember(mergeMember({ id, ...val }, priv));
      }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (error) {
      console.error('Failed to load users:', error);
      return [];
    }
  }
  // Local mode: the members a developer seeded, if any.
  try {
    const local = JSON.parse(localStorage.getItem('golfup_users') || '[]');
    return (Array.isArray(local) ? local : Object.values(local || {})).map(u => remember(u));
  } catch (_) {
    return [];
  }
}

export async function loadUserById(id) {
  if (!id) return null;
  if (useFirebase && db) {
    try {
      const [snap, priv] = await Promise.all([get(ref(db, 'users/' + id)), readPrivate('userPrivate/' + id)]);
      return snap.exists() ? remember(mergeMember(snap.val(), priv === undefined ? ownPrivate(id) : priv), id) : null;
    } catch (error) {
      console.error('Failed to load user:', error);
      return null;
    }
  }
  // Local mode: the session's own record, or a member a developer seeded.
  const me = getUser();
  if (me && me.id === id) return me;
  return (await loadAllUsers()).find(u => u.id === id) || null;
}

/**
 * The member who has just signed in, as the app will hold them. `phone` is
 * the number they signed in with: it stands in when the private half could
 * not be read (the server could not give this browser the member's
 * identity), so the session still knows whose phone it is.
 */
export async function loadSignedInMember(memberId, phone) {
  const user = await loadUserById(memberId);
  if (!user) return null;
  if (!user.phone && phone) {
    user.phone = phone;
    remember(user, memberId);
  }
  return user;
}

export async function findUserByName(name) {
  const users = await loadAllUsers();
  return users.find(u => u.name && u.name.toLowerCase() === name.toLowerCase());
}

// The member whose phone this is: as stored first, then as the same phone
// written another way ('+976 9911 9007' finds '99119007').
export async function findUserByPhone(phone) {
  const users = await loadAllUsers();
  return users.find(u => u.phone === phone) || users.find(u => samePhone(u.phone, phone));
}

// ---- Sign-in by SMS ----
// Two calls to the sign-in functions (functions/phone-verify.js). The
// provider behind them is verify.mn: the member sends one SMS from their own
// phone, and the server learns that phone sent it. The member record stays
// the app's own (users/{id}); when the server can mint one, a Firebase
// custom token makes this browser that member's Firebase Auth user, and its
// uid is written on the member as `authUid`.
// The functions are called at their own address rather than through a
// hosting rewrite, so the site does not depend on them being deployed.

const SIGN_IN_FUNCTIONS = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

async function callSignIn(name, body) {
  const r = await fetch(`${SIGN_IN_FUNCTIONS}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch (_) { /* not JSON: a missing function answers with a page */ }
  if (!r.ok) {
    throw Object.assign(new Error(data?.error?.message || String(r.status)), {
      status: r.status, code: data?.error?.code || null, retryAfter: data?.error?.retryAfter ?? null,
      // What a service behind the function answered, when the function says: for an admin to read.
      upstream: data?.error?.upstream ?? null, detail: data?.error?.detail ?? null,
    });
  }
  return data || {};
}

/**
 * Open a verification for a member's phone. Resolves to the session: what to
 * show (`shortcode`, `text`, `smsUri`, `displayInstruction`, `expiresAt`)
 * and what checkPhoneVerify sends back (`sessionId`, `memberId`, `phone`,
 * `ticket`). Rejects with an error whose `code` verifyErrorKey reads.
 */
export function startPhoneVerify(phone) {
  return callSignIn('phoneVerifyStart', { phone });
}

/**
 * Ask whether the SMS has arrived: { status: 'PENDING' | 'VERIFIED' |
 * 'EXPIRED', uid }. On VERIFIED the Firebase identity is taken up when the
 * server sent a token; `uid` is null when it could not (the sign-in itself
 * does not depend on it).
 */
export async function checkPhoneVerify(session) {
  const { sessionId, memberId, phone, expiresAt, ticket } = session || {};
  const out = await callSignIn('phoneVerifyCheck', { sessionId, memberId, phone, expiresAt, ticket });
  if (out.status !== 'VERIFIED') return { status: out.status === 'EXPIRED' ? 'EXPIRED' : 'PENDING', uid: null };
  let uid = null;
  if (out.token && auth) {
    try {
      uid = (await signInWithCustomToken(auth, out.token)).user.uid;
    } catch (e) {
      console.warn('custom token sign-in:', e?.code || e);
    }
  }
  if (out.tokenError) console.warn('sign-in token not minted:', out.tokenError);
  return { status: 'VERIFIED', uid };
}

// ---- Passwords (the fallback sign-in) ----
// A member's password is checked, changed and stored by the server only
// (functions/passwords.js). Changing one needs proof of who is asking: the
// Firebase ID token of a member signed in through the functions.

/**
 * Sign in with phone + password. Resolves to { memberId, uid }; rejects with
 * an error whose `code` passwordErrorKey reads (WRONG_PASSWORD, NO_PASSWORD,
 * LOCKED with `retryAfter` seconds, ...).
 */
export async function passwordSignIn(phone, password) {
  const out = await callSignIn('passwordLogin', { phone, password });
  let uid = null;
  if (out.token && auth) {
    try {
      uid = (await signInWithCustomToken(auth, out.token)).user.uid;
    } catch (e) {
      console.warn('custom token sign-in:', e?.code || e);
    }
  }
  if (out.tokenError) console.warn('sign-in token not minted:', out.tokenError);
  // No identity of this member's: one left by another member must not stay.
  if (!uid) signOutPhoneAuth();
  return { memberId: out.memberId, uid };
}

// The signed-in member's Firebase ID token, or null when this browser has
// only an anonymous identity (a session from before, the system admin).
async function memberIdToken() {
  const u = auth?.currentUser;
  if (!u || u.isAnonymous) return null;
  try { return await u.getIdToken(); } catch (_) { return null; }
}

async function callAsMember(name, body) {
  const idToken = await memberIdToken();
  if (!idToken) throw Object.assign(new Error('no member identity in this browser'), { status: 401, code: 'UNAUTHENTICATED' });
  return callSignIn(name, { ...body, idToken });
}

/** Set a member's password: their own, or anyone's for an admin. */
export function setMemberPassword(memberId, password) {
  return callAsMember('setPassword', { memberId, password });
}

/** Admin, once: hash every plain-text password and remove it from the records. → { hashed, kept, removed } */
export function migratePasswords() {
  return callAsMember('migratePasswords', {});
}

/**
 * Admin, once: move every phone number, bank detail and club code off the
 * public member records into the private half. → { moved, kept, cleared }
 */
export function migratePrivateFields() {
  return callAsMember('migratePrivateFields', {});
}

// ---- GHIN: the official Handicap Index ----
// GHIN is read by the server (functions/ghin.js) with the association's
// login, which never reaches the browser; only a signed-in member may ask.
// What the server reads it stores under ghin/{memberId} — a path no client
// can write, so what it holds is what GHIN said — and members read it there.

// Local mode has no server-written path: what the functions answered is
// kept in this browser, so a developer sees the same screens.
function localGhin() {
  try { return JSON.parse(localStorage.getItem('golfup_ghin') || '{}') || {}; } catch (_) { return {}; }
}
function keepLocalGhin(patch) {
  if (useFirebase) return;
  try { localStorage.setItem('golfup_ghin', JSON.stringify({ ...localGhin(), ...patch })); } catch (_) { /* storage is off */ }
}

/**
 * Who GHIN has under a number: { number, name, club, association, status,
 * hi, hiValue, lowHi, revDate, withdrawn, env }. Nothing is stored. Rejects
 * with an error whose `code` ghinErrorKey reads (NOT_FOUND among them).
 */
export async function ghinCheck(number) {
  const out = await callAsMember('ghinGolfer', { ghin: number });
  return { ...out.golfer, env: out.env };
}

/**
 * Read a member's Handicap Index from GHIN and store it: one's own, or any
 * member's for an admin. Resolves to the stored record.
 */
export async function ghinSync(memberId) {
  const out = await callAsMember('ghinSync', memberId ? { memberId } : {});
  const id = memberId || getUser()?.id;
  if (id && out.ghin) keepLocalGhin({ [id]: out.ghin });
  return out.ghin;
}

/** Admin: read every member's Handicap Index from GHIN. → { members, found, notFound, env } */
export function ghinSyncAll() {
  return callAsMember('ghinSyncAll', {});
}

/**
 * Admin, a trial: can members be found on GHIN by the phone they sign in
 * with? → { env, linked: {…counts}, linkedLists: { different, ghinNoPhone,
 * notOnGhin } (member ids), unlinked: {…counts}, candidates:
 * [{ memberId, golfer, linkedTo }], ambiguous: [{ memberId, count }],
 * sources: [{ kind, name, golfers, withPhone }] (the lists that were read),
 * refused: [{ kind, name, upstream, detail }] (the ones GHIN would not give) }.
 * Reads only; nothing is stored.
 */
export function ghinPhoneReport() {
  return callAsMember('ghinPhoneReport', {});
}

/**
 * Admin: tie members to the golfers found by their phone — `links` is
 * [{ memberId, number }]. The server reads each golfer's phone again and
 * ties only where it is the member's own. → { linked: [{ memberId, number,
 * name }], refused: [{ memberId, number, reason }] }
 */
export function ghinLinkByPhone(links) {
  return callAsMember('ghinLinkByPhone', { links });
}

/** What GHIN said of one member, or null: never read, or not this browser's to read. */
export async function loadGhin(memberId) {
  if (!memberId) return null;
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'ghin/' + memberId));
      return snap.exists() ? snap.val() : null;
    } catch (e) {
      console.warn('GHIN record not readable:', e?.message || e);
      return null;
    }
  }
  return localGhin()[memberId] || null;
}

/** What GHIN said of every member: { memberId: record }. Empty when it cannot be read. */
export async function loadAllGhin() {
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'ghin'));
      return snap.exists() ? snap.val() : {};
    } catch (e) {
      console.warn('GHIN records not readable:', e?.message || e);
      return {};
    }
  }
  return localGhin();
}

/**
 * The system admin's sign-in: true when the password was right. The server
 * sends a token that makes this browser the system admin for the database
 * rules; a server from before that sends none, and the admin is then signed
 * in without the private half of the member records.
 */
export async function adminPasswordSignIn(password) {
  const res = await fetch('/api/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  let token = null;
  try { token = (await res.json())?.token || null; } catch (_) { /* an older answer: no token */ }
  let taken = false;
  if (token && auth) {
    try {
      await signInWithCustomToken(auth, token);
      taken = true;
    } catch (e) {
      console.warn('custom token sign-in:', e?.code || e);
    }
  }
  // No identity of the admin's: one left by a member must not stay.
  if (!taken) signOutPhoneAuth();
  return true;
}

// Signing out of the app also signs out the member's Firebase identity; the
// auth observer then puts the browser back on an anonymous one, which is all
// a signed-out browser needs. An anonymous identity is left as it is.
export function signOutPhoneAuth() {
  if (auth?.currentUser && !auth.currentUser.isAnonymous) signOut(auth).catch(() => {});
}

export async function deleteUserFromDB(uid) {
  if (useFirebase && db) {
    await remove(ref(db, 'users/' + uid));
    // The private half goes with the record. A browser that may not write
    // it leaves it behind — closed to the public, and ignored by sign-in,
    // which only knows the members that have a record.
    await remove(ref(db, 'userPrivate/' + uid)).catch(e => console.warn('private half not removed:', e?.message || e));
  }
  seen.delete(uid);
}

// ---- Game Storage ----
function getLocalGames() {
  const data = localStorage.getItem('golfup_games');
  return data ? JSON.parse(data) : {};
}

function setLocalGames(games) {
  localStorage.setItem('golfup_games', JSON.stringify(games));
}

export async function saveGame(game) {
  if (useFirebase && db) {
    // update(), not set(): a whole-record set would silently overwrite a
    // group member's concurrent score tap (scores/scoreAudit/hcp live under
    // the same game, and so do the match play pairing, the hole overrides and
    // the team ball a scramble or foursome plays). Every caller passes the
    // full record, so the named top-level keys are still replaced wholesale —
    // only the scoring branches are spared.
    // bookingLog is append-only (see appendBookingLog); a full-record save
    // from a stale copy must never overwrite it either.
    const { scores, scoreAudit, hcp, pairing, holeOverrides, teamScores, bookingLog, ...rest } = game;
    await update(ref(db, 'games/' + game.id), rest);
  } else {
    const games = getLocalGames();
    games[game.id] = game;
    setLocalGames(games);
  }
}

// One score tap on the casual-game scorecard — strokes for one player on one
// hole, or null to clear it. Mirrors saveTnMatchHole(): path-scoped write plus
// a fire-and-forget audit push, so concurrent scorers in the same group never
// clobber each other and offline taps queue in RTDB.
export async function saveGameScoreHole(gameId, playerId, hole, strokes, by) {
  if (useFirebase && db) {
    const holeRef = ref(db, `games/${gameId}/scores/${playerId}/holes/${hole}`);
    // The previous value is only for the audit trail — offline (where get()
    // rejects without a warm cache) the write itself must still go through.
    let prev = null;
    try { prev = (await get(holeRef)).val() ?? null; } catch (_) { }
    if (strokes === null || strokes === undefined) {
      await remove(holeRef);
    } else {
      await set(holeRef, strokes);
    }
    push(ref(db, `games/${gameId}/scoreAudit`), {
      at: Date.now(), by: by || null, playerId, hole, value: strokes ?? null, prev
    }).catch(console.warn);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.scores = game.scores || {};
  game.scores[playerId] = game.scores[playerId] || { holes: {} };
  game.scores[playerId].holes = game.scores[playerId].holes || {};
  if (strokes === null || strokes === undefined) delete game.scores[playerId].holes[hole];
  else game.scores[playerId].holes[hole] = strokes;
  setLocalGames(games);
  // No listener fires in localStorage mode — the caller repaints from this.
  return game;
}

// A player's playing handicap for ONE game, entered by hand until the GHIN
// connection exists. Path-scoped like score taps; null clears it.
export async function saveGamePlayerHcp(gameId, playerId, hcp) {
  if (useFirebase && db) {
    const r = ref(db, `games/${gameId}/hcp/${playerId}`);
    if (hcp === null || hcp === undefined) await remove(r);
    else await set(r, hcp);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.hcp = game.hcp || {};
  if (hcp === null || hcp === undefined) delete game.hcp[playerId];
  else game.hcp[playerId] = hcp;
  setLocalGames(games);
  return game;
}

// The order a group plays its matches in (see src/game-formats.js): the
// scorer's ⇄ writes it, null clears it. Path-scoped like a score tap.
export async function saveGamePairing(gameId, groupIdx, orderIds) {
  if (useFirebase && db) {
    const r = ref(db, `games/${gameId}/pairing/${groupIdx}`);
    if (!orderIds) await remove(r);
    else await set(r, orderIds);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.pairing = game.pairing || {};
  if (!orderIds) delete game.pairing[groupIdx];
  else game.pairing[groupIdx] = orderIds;
  setLocalGames(games);
  return game;
}

// A hand-set match play hole (a conceded hole): the winner's player id or
// 'h' for halved under the pair's key, null to go back to the derived
// result. Same discipline as saveGameScoreHole — path-scoped, audited.
export async function saveGameHoleOverride(gameId, pairKey, hole, value, by) {
  if (useFirebase && db) {
    const holeRef = ref(db, `games/${gameId}/holeOverrides/${pairKey}/${hole}`);
    let prev = null;
    try { prev = (await get(holeRef)).val() ?? null; } catch (_) { }
    if (value === null || value === undefined || value === '') {
      await remove(holeRef);
    } else {
      await set(holeRef, value);
    }
    push(ref(db, `games/${gameId}/scoreAudit`), {
      at: Date.now(), by: by || null, kind: 'override', pairKey, hole, value: value || null, prev
    }).catch(console.warn);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.holeOverrides = game.holeOverrides || {};
  const pair = (game.holeOverrides[pairKey] = game.holeOverrides[pairKey] || {});
  if (value === null || value === undefined || value === '') delete pair[hole];
  else pair[hole] = value;
  if (!Object.keys(pair).length) delete game.holeOverrides[pairKey];
  setLocalGames(games);
  return game;
}

// One tap on a TEAM row: the strokes a scramble or foursome team's single ball
// took on one hole, or null to clear it. Same discipline as saveGameScoreHole —
// path-scoped and audited — but keyed by the team rather than a player, because
// in a one-ball format no player has a card of their own.
export async function saveGameTeamScoreHole(gameId, teamKey, hole, strokes, by) {
  if (useFirebase && db) {
    const holeRef = ref(db, `games/${gameId}/teamScores/${teamKey}/holes/${hole}`);
    let prev = null;
    try { prev = (await get(holeRef)).val() ?? null; } catch (_) { }
    if (strokes === null || strokes === undefined) {
      await remove(holeRef);
    } else {
      await set(holeRef, strokes);
    }
    push(ref(db, `games/${gameId}/scoreAudit`), {
      at: Date.now(), by: by || null, kind: 'team', teamKey, hole, value: strokes ?? null, prev
    }).catch(console.warn);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.teamScores = game.teamScores || {};
  const team = (game.teamScores[teamKey] = game.teamScores[teamKey] || { holes: {} });
  team.holes = team.holes || {};
  if (strokes === null || strokes === undefined) delete team.holes[hole];
  else team.holes[hole] = strokes;
  setLocalGames(games);
  // No listener fires in localStorage mode — the caller repaints from this.
  return game;
}

// Mark a round finished (or reopen it) — drives the final-results report on
// the scorer. Path-scoped so it never touches scores.
export async function saveGameFinished(gameId, finished) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + gameId), { finishedAt: finished ? Date.now() : null });
    return null;
  }
  const games = getLocalGames();
  if (!games[gameId]) return null;
  if (finished) games[gameId].finishedAt = Date.now();
  else delete games[gameId].finishedAt;
  setLocalGames(games);
  return games[gameId];
}

// Switch a game's scoring mode (normal 18 ↔ competition 9/9) after it has
// started — path-scoped so it never touches scores.
export async function saveGameScoreMode(gameId, mode) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + gameId), { scoreMode: mode });
    return null;
  }
  const games = getLocalGames();
  if (!games[gameId]) return null;
  games[gameId].scoreMode = mode;
  setLocalGames(games);
  return games[gameId];
}

// ---- Handicap rounds ----
// rounds/{ghinNumber}/{gameId} — one finished scorecard per game, keyed by the
// player's GHIN number so a future GHIN API sync posts records as-is. The
// record already carries every field GHIN score posting wants (played_at,
// course rating/slope, 9/18 holes, adjusted gross, hole-by-hole).

function getLocalRounds() {
  const data = localStorage.getItem('golfup_rounds');
  return data ? JSON.parse(data) : {};
}

export async function upsertRound(ghinNumber, round) {
  if (!ghinNumber || !round?.gameId) return;
  if (useFirebase && db) {
    await set(ref(db, `rounds/${ghinNumber}/${round.gameId}`), round);
  } else {
    const rounds = getLocalRounds();
    rounds[ghinNumber] = rounds[ghinNumber] || {};
    rounds[ghinNumber][round.gameId] = round;
    localStorage.setItem('golfup_rounds', JSON.stringify(rounds));
  }
}

export async function loadRounds(ghinNumber) {
  if (!ghinNumber) return [];
  let map = null;
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'rounds/' + ghinNumber));
      map = snap.exists() ? snap.val() : null;
    } catch (error) {
      console.error('Failed to load rounds:', error);
    }
  } else {
    map = getLocalRounds()[ghinNumber] || null;
  }
  if (!map) return [];
  return Object.values(map).sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
}

// The player's handicap index is derived from their rounds; the value is
// cached on users/{id} so lists can show it without reading every round.
export async function saveUserHcp(userId, hcpIndex) {
  if (!useFirebase || !db || !userId) return;
  await update(ref(db, 'users/' + userId), { hcpIndex: hcpIndex ?? null, hcpUpdatedAt: Date.now() });
}

export async function loadGame(gameId) {
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'games/' + gameId));
      return snap.exists() ? snap.val() : null;
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }
  return getLocalGames()[gameId] || null;
}

export async function loadAllGames() {
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'games'));
      if (!snap.exists()) return [];
      const data = snap.val();
      return Object.values(data).filter(g => g.status !== 'deleted').sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to load all games:', error);
      return [];
    }
  }
  const games = getLocalGames();
  return Object.values(games).filter(g => g.status !== 'deleted').sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadAllGamesAdmin() {
  if (useFirebase && db) {
    const snap = await get(ref(db, 'games'));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return Object.values(getLocalGames()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function deleteGame(id) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { status: 'deleted', deletedAt: Date.now() });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].status = 'deleted'; games[id].deletedAt = Date.now(); }
    setLocalGames(games);
  }
}

export async function restoreGame(id) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { status: 'open', deletedAt: null });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].status = 'open'; delete games[id].deletedAt; }
    setLocalGames(games);
  }
}

export function createUser(name, uid = null, role = 'user') {
  const id = uid || ('u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const user = { id, name, role, status: 'active', createdAt: Date.now() };
  saveUser(user);
  return user;
}

export function onAllGamesChanged(callback) {
  if (useFirebase && db) {
    const gamesRef = ref(db, 'games');
    // Return onValue's own unsubscribe: off(ref) with no callback detaches
    // EVERY listener on the path, including another screen's.
    return onValue(gamesRef, (snap) => {
      const data = snap.val();
      if (!data) callback([]);
      else callback(Object.values(data).filter(g => g.status !== 'deleted').sort((a, b) => b.createdAt - a.createdAt));
    });
  }
}

export async function markBookingPaid(id, amount) {
  if (!useFirebase || !db) return;
  await update(ref(db, 'games/' + id), {
    bookingPaid: true,
    paidAt: new Date().toISOString(),
    paidAmount: amount || null,
  });
}

// MTBogd puts a booking that was paid in full back to pending when another
// player joins it — their seat is unpaid. The game's flag follows.
export async function markBookingUnpaid(id) {
  if (!useFirebase || !db) return;
  await update(ref(db, 'games/' + id), { bookingPaid: false, paidAt: null, paidAmount: null });
}

// What MTBogd says a booking costs and who has paid (see bookingQuoteOf in
// src/booking-sync.js), kept on the game so every player's page shows it
// without each of them asking MTBogd.
export async function saveBookingQuote(id, quote) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { bookingQuote: quote });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].bookingQuote = quote; setLocalGames(games); }
  }
}

// ---- MTBogd booking sync (see src/booking-sync.js) ----
// `booking` records how the booking came to be and what the last check
// against MTBogd found; `bookingLog` is the append-only trail of every step.
// Both are path-scoped so a concurrent full-record save cannot clobber them.

export async function saveBookingState(id, partial) {
  const patch = { ...partial, updatedAt: Date.now() };
  if (useFirebase && db) {
    await update(ref(db, `games/${id}/booking`), patch);
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].booking = { ...(games[id].booking || {}), ...patch }; setLocalGames(games); }
  }
}

export async function appendBookingLog(id, entry) {
  if (useFirebase && db) {
    await push(ref(db, `games/${id}/bookingLog`), entry);
  } else {
    const games = getLocalGames();
    if (games[id]) {
      games[id].bookingLog = games[id].bookingLog || {};
      games[id].bookingLog['l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)] = entry;
      setLocalGames(games);
    }
  }
}

// Link an MTBogd booking made elsewhere (by phone, in MTBogd's own app) to a
// game after the fact. Writes the same three fields the create flow writes.
export async function attachBooking(id, { bookingId, bookingCode, bookingSlotId }) {
  const fields = { bookingId: bookingId || null, bookingCode: bookingCode || null, bookingSlotId: bookingSlotId || null };
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), fields);
  } else {
    const games = getLocalGames();
    if (games[id]) { Object.assign(games[id], fields); setLocalGames(games); }
  }
  await saveBookingState(id, { status: 'confirmed', source: 'attached' });
}

// Our own cancel request succeeded — mark it so a check does not have to.
export async function markBookingCancelled(id) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { bookingCancelled: true });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].bookingCancelled = true; setLocalGames(games); }
  }
}

// A hold or confirm that failed BEFORE a game existed has no game to log
// under, so it lands here for the admin's MTBogd tab.
export async function logBookingAttempt(entry) {
  if (useFirebase && db) {
    await push(ref(db, 'bookingAttempts'), entry);
  } else {
    const list = JSON.parse(localStorage.getItem('golfup_bookingAttempts') || '[]');
    list.push(entry);
    localStorage.setItem('golfup_bookingAttempts', JSON.stringify(list.slice(-100)));
  }
}

export async function loadBookingAttempts(limit = 50) {
  if (useFirebase && db) {
    const snap = await get(query(ref(db, 'bookingAttempts'), limitToLast(limit)));
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  return JSON.parse(localStorage.getItem('golfup_bookingAttempts') || '[]').slice(-limit).reverse();
}

export function onGameChanged(id, callback) {
  if (useFirebase && db) {
    const gameRef = ref(db, 'games/' + id);
    return onValue(gameRef, (snap) => {
      callback(snap.val());
    });
  }
}

// ---- Follow System ----
export async function followUser(currentUserId, targetUserId) {
  if (useFirebase && db) {
    await Promise.all([
      set(ref(db, `follows/${currentUserId}/${targetUserId}`), true),
      set(ref(db, `followers/${targetUserId}/${currentUserId}`), true)
    ]);
  }
}

export async function unfollowUser(currentUserId, targetUserId) {
  if (useFirebase && db) {
    await Promise.all([
      remove(ref(db, `follows/${currentUserId}/${targetUserId}`)),
      remove(ref(db, `followers/${targetUserId}/${currentUserId}`))
    ]);
  }
}

export async function loadFollows(userId) {
  if (useFirebase && db) {
    const snap = await get(ref(db, `follows/${userId}`));
    return snap.exists() ? snap.val() : {};
  }
  return {};
}

export async function getFollowerIds(targetUserId) {
  if (useFirebase && db) {
    const snap = await get(ref(db, `followers/${targetUserId}`));
    return snap.exists() ? Object.keys(snap.val()) : [];
  }
  return [];
}

// ---- Notifications ----
export async function saveNotification(targetUserId, notif) {
  if (useFirebase && db) {
    if (notif?.gameId && notif?.type && !['game_updated', 'player_joined', 'player_left', 'game_deleted'].includes(notif.type)) {
      const snap = await get(ref(db, `notifications/${targetUserId}`));
      if (snap.exists()) {
        const duplicate = Object.values(snap.val()).find(n =>
          n &&
          n.gameId === notif.gameId &&
          n.type === notif.type &&
          (n.from || '') === (notif.from || '')
        );
        if (duplicate) return duplicate.id;
      }
    }
    const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await set(ref(db, `notifications/${targetUserId}/${id}`), { ...notif, id, createdAt: Date.now() });
    return id;
  }
}

export async function loadNotifications(userId) {
  if (useFirebase && db) {
    const snap = await get(ref(db, `notifications/${userId}`));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => b.createdAt - a.createdAt);
  }
  return [];
}

export async function deleteNotification(userId, notifId) {
  if (useFirebase && db) {
    await remove(ref(db, `notifications/${userId}/${notifId}`));
  }
}

export function onNotificationsChanged(userId, callback) {
  if (useFirebase && db) {
    const notifRef = ref(db, `notifications/${userId}`);
    // The header bell and the home list both listen here with different
    // lifetimes, so a path-wide off() would let one tear down the other.
    return onValue(notifRef, (snap) => {
      if (!snap.exists()) { callback([]); return; }
      callback(Object.values(snap.val()).sort((a, b) => b.createdAt - a.createdAt));
    });
  }
}

// ---- FCM Token ----
export async function saveFCMToken(userId, token) {
  if (useFirebase && db && userId && token) {
    await set(ref(db, `users/${userId}/fcmToken`), token);
  }
}

// ---- Menu (RTDB) ----
export async function loadMenu() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'menu'));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .filter(item => item && item.id)
    .sort((a, b) => {
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
}

export async function saveMenuItem(item) {
  if (!useFirebase || !db) return;
  if (!item.id) item.id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await set(ref(db, 'menu/' + item.id), item);
  return item.id;
}

export async function deleteMenuItem(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'menu/' + id));
}

// ---- Circles / communities (admin-added, on top of the built-in ones) ----
export async function loadCircles() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'circles'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(c => c && c.id);
}

export async function saveCircle(circle) {
  if (!useFirebase || !db) return;
  await set(ref(db, 'circles/' + circle.id), circle);
}

export async function deleteCircle(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'circles/' + id));
}

// ---- Ranking (admin-uploaded leaderboard) ----
export async function loadRanking() {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'ranking'));
  return snap.exists() ? snap.val() : null;
}

export async function saveRanking(ranking) {
  if (!useFirebase || !db) return;
  await set(ref(db, 'ranking'), ranking);
}

// ---- News / announcements (RTDB) — shown in the home carousel ----
export async function loadNews() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'news'));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .filter(n => n && n.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveNewsItem(item) {
  if (!useFirebase || !db) return;
  if (!item.id) item.id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  if (!item.createdAt) item.createdAt = Date.now();
  await set(ref(db, 'news/' + item.id), item);
  return item.id;
}

export async function deleteNewsItem(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'news/' + id));
}

export function onNewsChanged(callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'news');
  // onValue returns the unsubscribe itself. Handing that value to
  // off(ref, 'value', cb) instead would never match: off compares against the
  // SNAPSHOT callback, so the listener would outlive the screen that made it.
  return onValue(r, (snap) => {
    const val = snap.exists() ? Object.values(snap.val()).filter(n => n && n.id) : [];
    val.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(val);
  });
}

// ---- Sponsor banner (RTDB, single object: { imageUrl, link }) ----
export async function loadSponsor() {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'sponsor'));
  return snap.exists() ? snap.val() : null;
}

export async function saveSponsor(obj) {
  if (!useFirebase || !db) return;
  await set(ref(db, 'sponsor'), obj || {});
}

export function onSponsorChanged(callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'sponsor');
  return onValue(r, (snap) => callback(snap.exists() ? snap.val() : null));
}

// ---- Tournaments (RTDB) ----
// A tournament record carries its own denormalized leaderboard (`entries`),
// the same shape `ranking` uses, so the strip and the leaderboard page need a
// single read. See CHANGELOG_AI.md for the field list.
export async function loadTournaments() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'tournaments'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(tn => tn && tn.id && tn.status !== 'deleted');
}

// The admin tab's read: the same list WITH the soft-deleted records, so a
// tournament deleted by mistake can be found and brought back. Nothing a
// member sees reads this — the strip, the page and the Games list keep
// loadTournaments and never show a deleted one.
export async function loadTournamentsAdmin() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'tournaments'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(tn => tn && tn.id);
}

export async function loadTournament(id) {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'tournaments/' + id));
  if (!snap.exists()) return null;
  const tn = snap.val();
  return tn.status === 'deleted' ? null : tn;
}

// Create-only. This is a whole-record set(): over an existing tournament it
// would erase every hole a scorer has written under sp/ and mp/ since the
// caller's copy was read. Its one caller is the create wizard, which passes
// no id; every edit goes through updateTournament, which writes only the
// keys it is given.
export async function saveTournament(tn) {
  if (!useFirebase || !db) return;
  if (tn.id) throw new Error('saveTournament() is create-only — use updateTournament(id, patch)');
  tn.id = 'tn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const rec = { ...tn, updatedAt: Date.now() };
  await withDeviceAccess(() => set(ref(db, 'tournaments/' + tn.id), rec));
  return tn.id;
}

export async function deleteTournament(id) {
  if (!useFirebase || !db) return;
  await withDeviceAccess(() => update(ref(db, 'tournaments/' + id), { status: 'deleted', deletedAt: Date.now() }));
}

// The soft delete undone. The status goes back to null — read off the dates
// — rather than to a literal: a stored status pins the state against the
// calendar, and whatever was pinned before the delete is not known here. The
// admin row's status select re-pins it if that is wanted. Scores, roster,
// draw and media were never touched by the delete, so nothing else to do.
export async function restoreTournament(id) {
  if (!useFirebase || !db) return;
  await withDeviceAccess(() => update(ref(db, 'tournaments/' + id), { status: null, deletedAt: null }));
}

export function onTournamentsChanged(callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'tournaments');
  return onValue(r, (snap) => {
    const list = snap.exists()
      ? Object.values(snap.val()).filter(tn => tn && tn.id && tn.status !== 'deleted')
      : [];
    callback(list);
  });
}

export function onTournamentChanged(id, callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'tournaments/' + id);
  return onValue(r, (snap) => callback(snap.exists() ? snap.val() : null));
}

// ---- Match play (M Cup) ----
// The match play state lives under tournaments/{id}/mp — see src/matchplay.js
// for the model. Writes here are PARTIAL on purpose: saveTournament() sets the
// whole record, which would silently overwrite a scorer's concurrent hole
// entry, so match play admin edits and scoring go through update() instead.

export async function updateTournament(id, patch) {
  if (!useFirebase || !db || !id) return;
  const rec = { ...patch, updatedAt: Date.now() };
  await withDeviceAccess(() => update(ref(db, 'tournaments/' + id), rec));
}

// A tournament write the rules refused is tried once more after the repair:
// the identity may have dropped mid-session (a token refresh refused) or the
// registration may never have gone through. A second refusal is the answer,
// and the caller's error text (tn-errors.js) says what it means.
async function withDeviceAccess(write) {
  try {
    return await write();
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
    const acc = await repairDeviceAccess();
    if (!acc.ok) throw e;
    return write();
  }
}

// PERMISSION_DENIED as the database reports it: `code` on a refused write,
// «permission_denied at /path» in the message of a refused read.
export function isPermissionDenied(err) {
  return String(err?.code || '').toUpperCase() === 'PERMISSION_DENIED'
    || /permission[_ ]denied/i.test(String(err?.message || (typeof err === 'string' ? err : '')));
}

// One scorer tap (spec §12) — or its undo (spec §13). `value` is the team key
// 'a' | 'b', 'h' for a halved hole, or null to clear the hole entirely. Every
// write leaves an audit entry (who, when, what it replaced), and RTDB queues
// the writes locally while the course has no signal, so nothing is lost to a
// dead spot (spec §21).
export async function saveTnMatchHole(tnId, matchId, hole, value, by) {
  if (!useFirebase || !db) return;
  const base = `tournaments/${tnId}/mp/matches/${matchId}`;
  const holeRef = ref(db, `${base}/holes/${hole}`);
  // The previous value is only for the audit trail — offline (where get()
  // rejects without a warm cache) the write itself must still go through.
  let prev = null;
  try { prev = (await get(holeRef)).val() ?? null; } catch (_) { }
  const audit = { at: Date.now(), by: by || null, matchId, hole, value: value ?? null, prev };
  if (value === null || value === undefined) {
    await remove(holeRef);
    remove(ref(db, `${base}/holeMeta/${hole}`)).catch(console.warn);
  } else {
    await set(holeRef, value);
    // Who entered the hole — what the correction-consent rule reads. Never
    // blocks the score itself.
    if (by) set(ref(db, `${base}/holeMeta/${hole}`), { by }).catch(console.warn);
  }
  push(ref(db, `tournaments/${tnId}/mp/audit`), audit).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// ---- Stroke play scorecard ----
// One hole's strokes on a player's card. Same discipline as the match play
// hole write: each hole is its own path (two people on two cards never
// clobber each other), null clears, RTDB queues the write offline, and an
// audit line records who put what where.
export async function saveTnSpScore(tnId, pid, round, hole, strokes, by) {
  if (!useFirebase || !db) return;
  const holeRef = ref(db, `tournaments/${tnId}/sp/scores/${pid}/${round}/${hole}`);
  if (strokes === null || strokes === undefined) {
    await remove(holeRef);
  } else {
    await set(holeRef, Number(strokes));
  }
  push(ref(db, `tournaments/${tnId}/sp/audit`), {
    at: Date.now(), by: by || null, pid, round, hole, strokes: strokes ?? null
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// ---- Correction consent ----
// A player changing a hole SOMEBODY ELSE entered does not overwrite it: the
// proposal parks under pending/{hole} and only the original enterer (or an
// official) applies or rejects it. `value` is 'a' | 'b' | 'h', or 'clear' to
// propose removing the hole (RTDB cannot store null).

export async function proposeTnHoleChange(tnId, matchId, hole, value, user) {
  if (!useFirebase || !db) return;
  const base = `tournaments/${tnId}/mp/matches/${matchId}`;
  await set(ref(db, `${base}/pending/${hole}`), {
    value,
    by: user?.id || null,
    byName: memberName(user),
    at: Date.now()
  });
  push(ref(db, `tournaments/${tnId}/mp/audit`), {
    at: Date.now(), by: user?.id || null, matchId, hole, action: 'propose', value
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

export async function resolveTnHoleChange(tnId, matchId, hole, approve, user) {
  if (!useFirebase || !db) return;
  const base = `tournaments/${tnId}/mp/matches/${matchId}`;
  const pendingRef = ref(db, `${base}/pending/${hole}`);
  const pending = (await get(pendingRef)).val();
  if (!pending) return;
  if (approve) {
    if (pending.value === 'clear') {
      await remove(ref(db, `${base}/holes/${hole}`));
      remove(ref(db, `${base}/holeMeta/${hole}`)).catch(console.warn);
    } else {
      await set(ref(db, `${base}/holes/${hole}`), pending.value);
      // Ownership passes to the proposer: it is their entry now, and the
      // next correction to it will come back to them for consent.
      if (pending.by) set(ref(db, `${base}/holeMeta/${hole}`), { by: pending.by }).catch(console.warn);
    }
  }
  await remove(pendingRef);
  push(ref(db, `tournaments/${tnId}/mp/audit`), {
    at: Date.now(), by: user?.id || null, matchId, hole,
    action: approve ? 'approve' : 'reject', value: pending.value ?? null, proposedBy: pending.by || null
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// Suspend or resume a match (spec §10) — weather and darkness are the usual
// reasons. Suspension is a human call, so unlike every other match state it
// is stored rather than derived; `suspended: false` clears it and the state
// goes back to whatever the holes say.
export async function setTnMatchSuspended(tnId, matchId, suspended, by) {
  if (!useFirebase || !db) return;
  const r = ref(db, `tournaments/${tnId}/mp/matches/${matchId}/stateOverride`);
  if (suspended) await set(r, 'SUSPENDED');
  else await remove(r);
  push(ref(db, `tournaments/${tnId}/mp/audit`), {
    at: Date.now(), by: by || null, matchId, action: suspended ? 'suspend' : 'resume'
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// ---- Tournament notification subscriptions ----
// tnSubs/{tnId}/{userId}: {at} — who wants a push when a match in this
// tournament finishes. The Cloud Function fans results out to these users
// through the existing /notifications pipeline.

export async function isTnSubscribed(tnId, userId) {
  if (!useFirebase || !db || !tnId || !userId) return false;
  return (await get(ref(db, `tnSubs/${tnId}/${userId}`))).exists();
}

export async function setTnSubscribed(tnId, userId, on) {
  if (!useFirebase || !db || !tnId || !userId) return;
  const r = ref(db, `tnSubs/${tnId}/${userId}`);
  if (on) await set(r, { at: Date.now() });
  else await remove(r);
}

// ---- Device registry (anonymous-auth allowlist) ----
// The database rules let only allowlisted anonymous uids write under
// tournaments/. mpDevices holds the approved devices ({role, name, at} by
// uid, role 'admin'|'scorer' — only admin devices may edit the registry, and
// the FIRST device to claim while the registry is empty becomes admin, which
// is how the owner bootstraps after deploying the rules). mpDeviceRequests
// holds pending requests a device files for itself. With the Anonymous
// provider not enabled or the rules not deployed, none of this gates
// anything — the app behaves exactly as before.

export function getDeviceUid() { return deviceUid; }

// The device role a member's app role maps to. Admins run tournaments,
// marshals (the club's marshal/marker crew) edit scores and everything
// inside a tournament, everyone else may only touch matches they play in
// or are assigned to score — the database rules enforce the same ladder.
export function deviceRoleFor(user) {
  if (!user) return null;
  return user.role === 'admin' ? 'admin' : user.role === 'marshal' ? 'scorer' : 'player';
}

const DEVICE_ROLE_RANK = { admin: 3, scorer: 2, player: 1 };
// The router calls ensureDeviceAccess on every route; this memo keeps that a
// no-op once the registration for this identity+member+role has gone
// through. Keyed by the uid too: a new identity mid-session registers again.
let ensuredAccessKey = null;
// The last registration's outcome, for the admin tab's banner and the
// write-error text: { ok, uid, want, role, reason, error?, at }.
let lastDeviceAccess = null;
export function deviceAccessState() { return lastDeviceAccess; }

// Registers this browser in mpDevices for the logged-in member, so an admin
// or marshal never has to file an access request. The rules verify the
// claimed member's role server-side. The outcome is returned and kept
// (deviceAccessState) — the admin tab shows it, and a refused write repairs
// through it; the manual request/approve flow still exists as the fallback.
export async function ensureDeviceAccess(user) {
  if (!useFirebase || !db) return { ok: true, reason: 'local' };
  if (!user?.id) return (lastDeviceAccess = { ok: false, uid: deviceUid, want: null, role: null, reason: 'no-user', at: Date.now() });
  const want = deviceRoleFor(user);
  if (!deviceUid) return (lastDeviceAccess = { ok: false, uid: null, want, role: null, reason: 'no-auth', at: Date.now() });
  const key = deviceUid + ':' + user.id + ':' + want;
  if (ensuredAccessKey === key && lastDeviceAccess?.ok) return lastDeviceAccess;
  let cur = null;
  try {
    const snap = await get(ref(db, 'mpDevices/' + deviceUid));
    cur = snap.exists() ? snap.val() : null;
    // A device an admin approved by hand may outrank what this member's role
    // maps to — never downgrade that grant.
    const write = !cur || ((DEVICE_ROLE_RANK[cur.role] || 0) <= (DEVICE_ROLE_RANK[want] || 0)
      && (cur.role !== want || cur.userId !== user.id));
    if (write) {
      await set(ref(db, 'mpDevices/' + deviceUid),
        { role: want, userId: user.id, name: user.name || '', at: Date.now() });
    }
    ensuredAccessKey = key;
    return (lastDeviceAccess = { ok: true, uid: deviceUid, want, role: write ? want : cur.role, reason: null, at: Date.now() });
  } catch (e) {
    console.warn('device access:', e?.code || e);
    return (lastDeviceAccess = {
      ok: false, uid: deviceUid, want, role: cur?.role || null,
      reason: isPermissionDenied(e) ? 'denied' : 'error', error: e?.code || String(e), at: Date.now()
    });
  }
}

// Puts this browser's identity and registration back: signs in anonymously
// if the uid is gone, forgets the memo, registers again. The admin tab's
// «Дахин бүртгэх», the device card's reconnect and a refused write use it.
export async function repairDeviceAccess(user = getUser()) {
  if (!deviceUid) await ensureAnonAuth(true);
  ensuredAccessKey = null;
  return ensureDeviceAccess(user);
}

// What a banner should say about a registration outcome, or null when there
// is nothing to say: 'no-auth' (no identity), 'denied' (the rules refused
// the registration), 'error' (it could not be tried).
export function deviceAccessProblem(acc) {
  if (!acc || acc.reason === 'local' || acc.reason === 'no-user') return null;
  if (!acc.uid) return 'no-auth';
  return acc.ok ? null : (acc.reason === 'denied' ? 'denied' : 'error');
}

export async function deviceStatus() {
  const want = deviceRoleFor(getUser());
  if (!useFirebase || !db || !deviceUid) return { uid: null, role: null, userId: null, want, requested: false, registryEmpty: null, access: lastDeviceAccess };
  const [dev, req, reg] = await Promise.all([
    get(ref(db, 'mpDevices/' + deviceUid)),
    get(ref(db, 'mpDeviceRequests/' + deviceUid)),
    get(ref(db, 'mpDevices'))
  ]);
  return {
    uid: deviceUid,
    role: dev.exists() ? (dev.val()?.role || 'scorer') : null,
    userId: dev.exists() ? (dev.val()?.userId || null) : null,
    want,
    requested: req.exists(),
    registryEmpty: !reg.exists(),
    access: lastDeviceAccess
  };
}

export async function requestDeviceAccess(name) {
  if (!useFirebase || !db || !deviceUid) throw new Error('no-device-uid');
  await set(ref(db, 'mpDeviceRequests/' + deviceUid), { name: name || '', at: Date.now() });
}

// Bootstrap: claims this device as admin. The rules only allow it while the
// registry is empty (or from a device that is already admin).
export async function claimAdminDevice(name) {
  if (!useFirebase || !db || !deviceUid) throw new Error('no-device-uid');
  await set(ref(db, 'mpDevices/' + deviceUid), { role: 'admin', name: name || '', at: Date.now() });
}

export async function loadDeviceRegistry() {
  if (!useFirebase || !db) return { devices: {}, requests: {} };
  const [dev, req] = await Promise.all([
    get(ref(db, 'mpDevices')),
    get(ref(db, 'mpDeviceRequests'))
  ]);
  return { devices: dev.exists() ? dev.val() : {}, requests: req.exists() ? req.val() : {} };
}

export async function approveDevice(uid, name, role = 'scorer') {
  if (!useFirebase || !db || !uid) return;
  await set(ref(db, 'mpDevices/' + uid), { role, name: name || '', at: Date.now() });
  remove(ref(db, 'mpDeviceRequests/' + uid)).catch(console.warn);
}

export async function revokeDevice(uid) {
  if (!useFirebase || !db || !uid) return;
  await remove(ref(db, 'mpDevices/' + uid));
}

export async function dismissDeviceRequest(uid) {
  if (!useFirebase || !db || !uid) return;
  await remove(ref(db, 'mpDeviceRequests/' + uid));
}

// ---- Tables (RTDB) ----
export async function loadTables() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'tables'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(t => t && t.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export async function saveTable(table) {
  if (!useFirebase || !db) return;
  if (!table.id) table.id = 'tbl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await set(ref(db, 'tables/' + table.id), table);
  return table.id;
}

export async function deleteTable(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'tables/' + id));
}

// ---- Orders (RTDB) ----
export async function createOrder(order) {
  if (!useFirebase || !db) throw new Error('Firebase not configured');
  const id = 'o_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const record = { ...order, id, notified: false, createdAt: Date.now() };
  await set(ref(db, 'orders/' + id), record);
  return id;
}

export async function updateOrderStatus(id, status) {
  if (!useFirebase || !db) return;
  await update(ref(db, 'orders/' + id), { status });
}

export async function loadOrder(id) {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'orders/' + id));
  return snap.exists() ? { id, ...snap.val() } : null;
}

export function onOrdersChanged(cb) {
  if (!useFirebase || !db) return () => {};
  const ordersRef = ref(db, 'orders');
  return onValue(ordersRef, (snap) => {
    if (!snap.exists()) { cb([]); return; }
    const orders = Object.entries(snap.val()).map(([id, val]) => ({ id, ...val }));
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    cb(orders);
  });
}

export function onOrderChanged(id, cb) {
  if (!useFirebase || !db) return () => {};
  const r = ref(db, 'orders/' + id);
  return onValue(r, (snap) => cb(snap.exists() ? { id, ...snap.val() } : null));
}

// ---- QPay helpers (food orders only; tee-time QPay is owned by MTBogd) ----
export async function createQpayInvoice(orderId) {
  const res = await fetch('/api/qpay/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'QPay invoice failed');
  return data;
}

export async function checkQpayPayment(orderId) {
  const res = await fetch('/api/qpay/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'QPay check failed');
  return data;
}

// Remove an unpaid food order when the user backs out of payment.
// Guarded: only deletes while still 'pending', so a payment that landed in a
// race is never destroyed.
export async function cancelPendingPayment(id) {
  if (!useFirebase || !db) return false;
  const snap = await get(ref(db, `orders/${id}`));
  if (snap.exists() && snap.val().status === 'pending') {
    await remove(ref(db, `orders/${id}`));
    return true;
  }
  return false;
}

// ---- Coaching ----
// A lesson booked with a coach — the shapes and the rules are in
// src/coaching.js and docs/coaching.md. Four nodes: coaches, coachSlots,
// coachBookings, playerLessons. A booking or a cancellation is one write to
// three of them; the database refuses it unless it is whole and comes from
// the right person, so a refusal here is thrown, not swallowed.
//
// Local mode keeps the same tree in localStorage and has no rules: the one
// rule that matters to a single browser — a taken slot is not booked again —
// is checked here.
const LOCAL_COACHING = 'golfup_coaching';
function localCoaching() {
  try { return JSON.parse(localStorage.getItem(LOCAL_COACHING)) || {}; } catch { return {}; }
}
async function coachingWrite(writes) {
  if (useFirebase && db) { await update(ref(db), writes); return; }
  localStorage.setItem(LOCAL_COACHING, JSON.stringify(applyWrites(localCoaching(), writes)));
}
async function coachingRead(path) {
  if (useFirebase && db) {
    const snap = await get(ref(db, path));
    return snap.exists() ? snap.val() : null;
  }
  return path.split('/').filter(Boolean).reduce((n, k) => (n && typeof n === 'object' ? n[k] : null), localCoaching()) ?? null;
}
// A read that may be refused (not signed in as a member): nothing, not a throw.
async function coachingReadOr(path, fallback) {
  try { return (await coachingRead(path)) ?? fallback; }
  catch (e) { console.warn(`${path} not readable:`, e?.message || e); return fallback; }
}

/** Every coach's profile: { memberId: { active, bio, place, price30, price60, … } }. */
export const loadCoaches = () => coachingReadOr('coaches', {});

/** One coach's slots as stored: { slotId: { start, minutes, status, price } }. */
export const loadCoachSlots = (coachId) => coachingReadOr(`coachSlots/${coachId}`, {});

/** Every coach's slots: { coachId: { slotId: slot } }. */
export const loadAllCoachSlots = () => coachingReadOr('coachSlots', {});

/** Who booked a coach's slots: { slotId: { playerId, bookedAt, note } } — the coach's own to read. */
export const loadCoachBookings = (coachId) => coachingReadOr(`coachBookings/${coachId}`, {});

/** A member's own lessons: { key: { coachId, slotId, start, minutes } }. */
export const loadPlayerLessons = (playerId) => coachingReadOr(`playerLessons/${playerId}`, {});

/** An admin makes a member a coach, or switches one off. The profile stays. */
export async function setCoach(coachId, active, adminId) {
  const writes = { [`coaches/${coachId}/active`]: !!active };
  if (active) {
    writes[`coaches/${coachId}/approvedBy`] = String(adminId || '');
    writes[`coaches/${coachId}/approvedAt`] = Date.now();
  }
  await coachingWrite(writes);
}

/** A coach's own words and prices. */
export async function saveCoachProfile(coachId, input) {
  const p = cleanProfile(input);
  await coachingWrite({
    [`coaches/${coachId}/bio`]: p.bio,
    [`coaches/${coachId}/place`]: p.place,
    [`coaches/${coachId}/price30`]: p.price30,
    [`coaches/${coachId}/price60`]: p.price60,
    [`coaches/${coachId}/updatedAt`]: Date.now(),
  });
  return p;
}

/** A coach opens slots (from newSlots). */
export async function addCoachSlots(coachId, slots) {
  if (slots && slots.length) await coachingWrite(slotWrites(coachId, slots));
}

/** A coach takes back a slot no one has booked. */
export async function removeCoachSlot(coachId, id) {
  await coachingWrite({ [`coachSlots/${coachId}/${id}`]: null });
}

/**
 * A member books a slot. Throws when the database refuses — most often
 * because someone else took the slot a moment ago; `err.code === 'TAKEN'`
 * when that is known to be why.
 */
export async function bookCoachSlot(coachId, slot, playerId, note) {
  const taken = () => Object.assign(new Error('This slot was just taken'), { code: 'TAKEN' });
  if (!(useFirebase && db)) {
    const now = (localCoaching().coachSlots || {})[coachId]?.[slot.id];
    if (!now || now.status !== 'open') throw taken();
  }
  try {
    await coachingWrite(bookingWrites(coachId, slot, playerId, note));
  } catch (err) {
    // Refused: is it because the slot is no longer open?
    const now = await coachingReadOr(`coachSlots/${coachId}/${slot.id}`, null);
    if (!now || now.status !== 'open') throw taken();
    throw err;
  }
}

/**
 * A booking undone — by the player (until twelve hours before, the database
 * checks), by the coach, or by an admin. `removeSlot`: the coach withdraws
 * the time itself.
 */
export async function cancelCoachBooking(coachId, id, playerId, { removeSlot = false } = {}) {
  await coachingWrite(cancelWrites(coachId, id, playerId, { removeSlot }));
}

/** A booked slot whose booking is gone (the coach's own repair): open it again. */
export async function reopenCoachSlot(coachId, id) {
  await coachingWrite({ [`coachSlots/${coachId}/${id}/status`]: 'open' });
}

/** A lesson left on a member's list after the coach withdrew the time. */
export async function dropPlayerLesson(playerId, key) {
  await coachingWrite({ [`playerLessons/${playerId}/${key}`]: null });
}

// ---- Coaching: programs ----
// A coach's courses and packages — the shapes are in src/coaching-programs.js,
// who may write what in database.rules.json, the whole in docs/coaching.md.
// Four more nodes: coachPrograms, coachPosters, coachEnrollments,
// playerPrograms. The poster is read on its own, one program at a time.

/** Every coach's programs: { coachId: { programId: program } }. */
export const loadAllCoachPrograms = () => coachingReadOr('coachPrograms', {});

/** One coach's programs, hidden ones included. */
export const loadCoachPrograms = (coachId) => coachingReadOr(`coachPrograms/${coachId}`, {});

/** One program, or null. */
export const loadCoachProgram = (coachId, id) => coachingReadOr(`coachPrograms/${coachId}/${id}`, null);

/** A program's poster — an image data URI — or null. */
export const loadCoachPoster = (coachId, id) => coachingReadOr(`coachPosters/${coachId}/${id}`, null);

/** Who asked to join a coach's programs: { programId: { playerId: request } } — the coach's own to read. */
export const loadCoachEnrollments = (coachId) => coachingReadOr(`coachEnrollments/${coachId}`, {});

/** A member's own request to join one program, or null. */
export const loadMyEnrollment = (coachId, id, playerId) => coachingReadOr(`coachEnrollments/${coachId}/${id}/${playerId}`, null);

/** The programs a member has asked to join: { key: { coachId, programId, at } }. */
export const loadPlayerPrograms = (playerId) => coachingReadOr(`playerPrograms/${playerId}`, {});

/** A coach saves a program. `opts`: { poster, thumb, existing } — see programWrites. */
export async function saveCoachProgram(coachId, id, input, opts) {
  await coachingWrite(programWrites(coachId, id, input, opts));
}

/** A coach shows or hides a program. */
export async function publishCoachProgram(coachId, id, active) {
  await coachingWrite(publishWrites(coachId, id, active));
}

/** A coach removes a program whole: its poster and every request to join go with it. */
export async function removeCoachProgram(coachId, id) {
  const asked = await coachingRead(`coachEnrollments/${coachId}/${id}`);
  await coachingWrite(removeProgramWrites(coachId, id, Object.keys(asked || {})));
}

/** A member asks to join a program at one of its prices. Throws when the database refuses. */
export async function enrollInProgram(coachId, id, playerId, program, index, note) {
  const writes = enrollWrites(coachId, id, playerId, program, index, note);
  if (!writes) throw Object.assign(new Error('This program has no such price'), { code: 'OPTION' });
  await coachingWrite(writes);
}

/** A request to join taken back — by the member, or by the coach. */
export async function leaveProgram(coachId, id, playerId) {
  await coachingWrite(unenrollWrites(coachId, id, playerId));
}


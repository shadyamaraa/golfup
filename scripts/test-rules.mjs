// The database rules for member records, run against the real rules engine
// (the Realtime Database emulator) — who may read the private half of a
// member's record, and who may change a phone number, a role, a status.
//
// Not part of `npm run test:mp`: it needs the emulator (Java, and the
// Firebase CLI through npx). Run it with
//
//   npm run test:rules
//
// which starts the emulator with database.rules.json, runs this file and
// stops it again. Nothing here touches the real project: the project id is
// a `demo-` one, which the CLI never connects to anything.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove } from 'firebase/database';
import { mergeMember, baselineOf, memberWrites } from '../src/member-record.js';
import { slotId, slotWrites, bookingWrites, cancelWrites, lessonKey, CANCEL_MS } from '../src/coaching.js';

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const PROJECT = 'demo-golfup';
const NS = `${PROJECT}-default-rtdb`;

if (!HOST) {
  console.error('No database emulator: run this through `npm run test:rules`.');
  process.exit(1);
}
const [host, port] = HOST.split(':');

const SEED = {
  users: {
    admin1: { id: 'admin1', name: 'Admin', role: 'admin', status: 'active' },
    admin_uid: { id: 'admin_uid', name: 'System Admin', role: 'admin', status: 'active' },
    // m1 has not been moved yet: the phone is still on the public record.
    m1: { id: 'm1', name: 'One', role: 'user', status: 'active', phone: '99110001', bankAccount: '123' },
    m2: { id: 'm2', name: 'Two', role: 'user', status: 'active' },
    held: { id: 'held', name: 'Held', role: 'user', status: 'hold' },
    // For the app's own saves, further down: f1 not moved yet, f2 moved.
    f1: { id: 'f1', name: 'Flow One', role: 'user', status: 'active', phone: '99220001', bankAccount: '111' },
    f2: { id: 'f2', name: 'Flow Two', role: 'user', status: 'active', communities: ['a'] },
  },
  userPrivate: {
    m2: { phone: '99110002', bankAccount: '555' },
    f2: { phone: '99220002', bankAccount: '222' },
  },
  userSecrets: { m2: { pass: 'scrypt$x' } },
  ghin: { m2: { number: '12345678', found: true, name: 'Two', hi: '12.3', syncedAt: 1 } },
  ghinLink: { m2: { number: '12345678', by: 'phone', at: 1, admin: 'admin1' } },
  // What the members hub leaves when it writes to a member (docs/members-hub.md).
  hubSync: { m2: { memberId: 'MB-0002', hash: 'a1b2c3', at: '2026-11-17T00:00:00.000Z' } },
};

// The emulator's own back door ("Bearer owner") — how the test lays its data.
async function seed() {
  const r = await fetch(`http://${HOST}/.json?ns=${NS}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(SEED),
  });
  assert.equal(r.status, 200, 'seeding the emulator');
}

// One browser per identity. `token` is what the rules see as `auth.token`
// (plus `sub`, the uid); null is a browser that has not signed in at all.
const apps = [];
function browser(name, token) {
  const app = initializeApp({ projectId: PROJECT, databaseURL: `http://${HOST}/?ns=${NS}` }, name);
  apps.push(app);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, host, Number(port), token ? { mockUserToken: token } : {});
  return db;
}

const visitor = browser('visitor', null);
const anon = browser('anon', { sub: 'anon-1' });                                  // an anonymous device
const m1 = browser('m1', { sub: 'uid-m1', memberId: 'm1' });
const m2 = browser('m2', { sub: 'uid-m2', memberId: 'm2' });
const admin = browser('admin', { sub: 'uid-admin', memberId: 'admin1' });
const sysAdmin = browser('sys', { sub: 'system-admin', memberId: 'admin_uid' });   // what adminLogin mints
const held = browser('held', { sub: 'uid-held', memberId: 'held' });
const ghost = browser('ghost', { sub: 'uid-gone', memberId: 'gone' });             // a member since deleted
const f1 = browser('f1', { sub: 'uid-f1', memberId: 'f1' });
const f2 = browser('f2', { sub: 'uid-f2', memberId: 'f2' });

const ok = (p, what) => assert.doesNotReject(p, what);
const denied = (p, what) => assert.rejects(p, /permission[ _]denied/i, what);

before(seed);
after(() => Promise.all(apps.map(a => deleteApp(a))));

test('the public half is still anyone\'s to read', async () => {
  const snap = await get(ref(visitor, 'users/m2'));
  assert.equal(snap.val().name, 'Two');
});

test('the private half is closed to anyone who is not a signed-in member', async () => {
  await denied(get(ref(visitor, 'userPrivate')), 'a visitor, the whole of it');
  await denied(get(ref(visitor, 'userPrivate/m2')), 'a visitor, one member');
  await denied(get(ref(visitor, 'userPrivate/m2/phone')), 'a visitor, one phone');
  await denied(get(ref(anon, 'userPrivate')), 'an anonymous device');
  await denied(get(ref(anon, 'userPrivate/m2/phone')), 'an anonymous device, one phone');
});

test('a signed-in member reads it — their own and the other members\'', async () => {
  assert.equal((await get(ref(m1, 'userPrivate/m2'))).val().phone, '99110002');
  assert.equal((await get(ref(m2, 'userPrivate'))).val().m2.bankAccount, '555');
  assert.ok((await get(ref(sysAdmin, 'userPrivate'))).exists(), 'the system admin, signed in');
});

test('a member on hold, and one who has been deleted, do not', async () => {
  await denied(get(ref(held, 'userPrivate')), 'on hold');
  await denied(get(ref(ghost, 'userPrivate')), 'deleted');
});

test('the passwords stay closed to everyone', async () => {
  await denied(get(ref(admin, 'userSecrets/m2')));
  await denied(set(ref(admin, 'userSecrets/m2/pass'), 'x'));
});

test('what GHIN said is read by members and written by no one but the server', async () => {
  assert.equal((await get(ref(m1, 'ghin/m2'))).val().hi, '12.3', 'a member, another member\'s');
  assert.ok((await get(ref(m2, 'ghin'))).exists(), 'a member, the whole of it');
  await denied(get(ref(visitor, 'ghin/m2')), 'a visitor');
  await denied(get(ref(anon, 'ghin')), 'an anonymous device');
  await denied(get(ref(held, 'ghin/m2')), 'a member on hold');
  await denied(set(ref(m2, 'ghin/m2/hi'), '2.0'), 'the member, their own');
  await denied(update(ref(admin, 'ghin/m2'), { hi: '2.0' }), 'an admin');
  await denied(set(ref(sysAdmin, 'ghin/m1'), { number: '1234567', hi: '0.0' }), 'the system admin');
  await denied(remove(ref(admin, 'ghin/m2')), 'removing it');
});

test('how a member was tied to their golfer is the server\'s to write', async () => {
  assert.equal((await get(ref(m1, 'ghinLink/m2'))).val().by, 'phone', 'a member reads it');
  await denied(get(ref(visitor, 'ghinLink/m2')), 'a visitor');
  await denied(get(ref(anon, 'ghinLink')), 'an anonymous device');
  await denied(set(ref(m2, 'ghinLink/m2'), { number: '99999999', by: 'phone', at: 2 }), 'the member, their own');
  await denied(update(ref(admin, 'ghinLink/m1'), { number: '12345678', by: 'admin' }), 'an admin');
  await denied(remove(ref(sysAdmin, 'ghinLink/m2')), 'removing it');
});

// The hub's mark carries a hash made from the member's phone and bank account:
// readable, it would give the phone back to anyone who knows the name. No rule
// names hubSync, and that is what keeps it shut — this pins it.
test('the members hub\'s mark is closed to everyone but the server', async () => {
  await denied(get(ref(visitor, 'hubSync')), 'a visitor, the whole of it');
  await denied(get(ref(visitor, 'hubSync/m2/hash')), 'a visitor, one hash');
  await denied(get(ref(anon, 'hubSync/m2')), 'an anonymous device');
  await denied(get(ref(m2, 'hubSync/m2')), 'the member, their own');
  await denied(get(ref(m1, 'hubSync')), 'another member');
  await denied(get(ref(admin, 'hubSync/m2')), 'an admin');
  await denied(get(ref(sysAdmin, 'hubSync')), 'the system admin');
  await denied(set(ref(m2, 'hubSync/m2/hash'), 'x'), 'the member writes');
  await denied(update(ref(admin, 'hubSync/m1'), { memberId: 'MB-0001', hash: 'x' }), 'an admin writes');
  await denied(remove(ref(sysAdmin, 'hubSync/m2')), 'removing it');
});

test('no one writes a private field onto the public record', async () => {
  await denied(update(ref(m2, 'users/m2'), { phone: '99110002' }), 'the member');
  await denied(update(ref(admin, 'users/m2'), { phone: '99110002' }), 'an admin');
  await denied(set(ref(visitor, 'users/m2/bankAccount'), '1'), 'a visitor');
  await denied(update(ref(m2, 'users/m2'), { bankName: 'khan', bankIban: 'MN1', mtbogdCode: 'c' }));
  await denied(update(ref(m2, 'users/m2'), { phone: '' }), 'not even an empty one');
  // What a tab still running the old app sends: the whole record, phone and all.
  await denied(update(ref(m1, 'users/m1'), { name: 'One', phone: '99110001' }), 'the old app\'s whole-record save');
});

test('a public field is still saved while the record has not been moved yet', async () => {
  // m1's public record still carries a phone; a save that does not send it goes through.
  await ok(update(ref(m1, 'users/m1'), { name: 'One!', hcpIndex: 12.3 }));
  await ok(set(ref(m1, 'users/m1/fcmToken'), 'tok'));
  const rec = (await get(ref(visitor, 'users/m1'))).val();
  assert.equal(rec.name, 'One!');
  assert.equal(rec.phone, '99110001', 'the unmoved phone is untouched');
});

test('a member writes their own private half, and only theirs', async () => {
  await ok(update(ref(m1, 'userPrivate/m1'), { bankName: 'khan', bankAccount: '999', bankIban: 'MN12', mtbogdCode: 'A1' }));
  await ok(update(ref(m2, 'userPrivate/m2'), { bankAccount: '' }), 'clearing a field with an empty string');
  await denied(update(ref(m1, 'userPrivate/m2'), { bankAccount: '1' }), 'another member\'s');
  await denied(remove(ref(m1, 'userPrivate/m2')), 'removing another member\'s');
  await denied(update(ref(visitor, 'userPrivate/m1'), { bankAccount: '1' }), 'a visitor');
  await denied(update(ref(anon, 'userPrivate/m1'), { bankAccount: '1' }), 'an anonymous device');
  await denied(update(ref(m1, 'userPrivate/m1'), { somethingElse: 'x' }), 'a field that is not one of the five');
});

test('a phone number, once there, is only an admin\'s to change', async () => {
  await ok(update(ref(m1, 'userPrivate/m1'), { phone: '99110001' }), 'none there yet: the member may put their own');
  await ok(update(ref(m1, 'userPrivate/m1'), { phone: '99110001', bankAccount: '998' }), 'sending the same number back');
  await denied(update(ref(m1, 'userPrivate/m1'), { phone: '88110001' }), 'the member changing it');
  await denied(update(ref(m2, 'userPrivate/m2'), { phone: '88110002' }), 'the member changing it');
  await ok(update(ref(admin, 'userPrivate/m2'), { phone: '99110022' }), 'an admin');
  await ok(update(ref(sysAdmin, 'userPrivate/m2'), { phone: '99110002' }), 'the system admin');
});

test('a role is only an admin\'s to change', async () => {
  await denied(update(ref(m1, 'users/m1'), { role: 'admin' }), 'a member, their own');
  await denied(set(ref(visitor, 'users/m2/role'), 'admin'), 'a visitor');
  await denied(update(ref(anon, 'users'), { 'm2/role': 'admin' }), 'from the top of the list');
  await ok(update(ref(m1, 'users/m1'), { role: 'user', name: 'One' }), 'sending the same role back');
  await ok(update(ref(admin, 'users/m2'), { role: 'marshal' }), 'an admin');
  await ok(update(ref(sysAdmin, 'users/m2'), { role: 'user' }), 'the system admin');
  // Making oneself an admin is what would open every other member's private half to writing.
  await denied(update(ref(m1, 'userPrivate/m2'), { bankAccount: '1' }));
});

test('removing a role does not open the way to a higher one', async () => {
  await ok(remove(ref(m2, 'users/m2/role')));
  await denied(set(ref(m2, 'users/m2/role'), 'admin'));
  await denied(set(ref(m2, 'users/m2/role'), 'marshal'));
  await ok(set(ref(m2, 'users/m2/role'), 'user'));
});

test('a status is only an admin\'s to change', async () => {
  await denied(update(ref(held, 'users/held'), { status: 'active' }), 'the held member');
  await denied(update(ref(m1, 'users/m2'), { status: 'hold' }), 'a member, another\'s');
  await ok(update(ref(admin, 'users/m2'), { status: 'hold' }), 'an admin');
  await denied(get(ref(m2, 'userPrivate')), 'and the hold closes the private half at once');
  await ok(update(ref(admin, 'users/m2'), { status: 'active' }));
  await ok(get(ref(m2, 'userPrivate')));
});

test('a new member record: an ordinary, active member, under its own id', async () => {
  await ok(set(ref(admin, 'users/n1'), { id: 'n1', name: 'New', role: 'user', status: 'active', createdAt: 1 }));
  await ok(set(ref(admin, 'users/n2'), { id: 'n2', name: 'Marshal', role: 'marshal', status: 'active' }), 'an admin gives any role');
  await ok(update(ref(admin, 'userPrivate/n1'), { phone: '99110009' }), 'and the admin writes the new member\'s phone');
  await denied(set(ref(visitor, 'users/n3'), { id: 'n3', name: 'X', role: 'admin', status: 'active' }), 'not an admin, by a stranger');
  await denied(set(ref(visitor, 'users/n4'), { id: 'n4', name: 'X', role: 'user', status: 'active', phone: '99110004' }), 'not with a phone on it');
  await denied(update(ref(visitor, 'userPrivate/n1'), { phone: '99000000' }), 'and a stranger cannot give it a phone');
});

test('a record cannot pass itself off as another member', async () => {
  // The id is what a sign-in would carry: it must be the record's own key.
  await denied(update(ref(m1, 'users/m1'), { id: 'admin1' }));
  await denied(set(ref(visitor, 'users/n5'), { id: 'admin1', name: 'X', role: 'user', status: 'active' }));
  await ok(update(ref(m1, 'users/m1'), { id: 'm1' }));
});

test('the rest of the database is as it was', async () => {
  await ok(set(ref(visitor, 'games/g1'), { id: 'g1', name: 'A game' }));
  assert.equal((await get(ref(visitor, 'games/g1/name'))).val(), 'A game');
});

// ---- The app's own saves ----
// What src/store.js does with a member record, with the same pure functions
// (src/member-record.js) and the same order of writes, against the rules: a
// save that the rules refuse for the wrong reason would be a member unable
// to save their profile.

// store.loadUserById: the two halves, merged; the private one only where
// this browser may read it.
async function load(db, id) {
  const pub = (await get(ref(db, 'users/' + id))).val();
  let priv = null;
  try { priv = (await get(ref(db, 'userPrivate/' + id))).val(); } catch (_) { /* not this browser's to read */ }
  return mergeMember(pub, priv);
}
// store.writeMember: the private half first, then the public one.
async function save(db, user, base) {
  const { pub, priv } = memberWrites(user, base);
  if (Object.keys(priv).length) await update(ref(db, 'userPrivate/' + user.id), priv);
  await update(ref(db, 'users/' + user.id), pub);
}
const raw = async (path) => (await get(ref(admin, path))).val();

test('a member saves their profile before the move: the bank detail goes to the private half', async () => {
  const rec = await load(f1, 'f1');
  assert.equal(rec.phone, '99220001', 'the unmoved phone is still shown');
  const base = baselineOf(rec);
  await ok(save(f1, { ...rec, name: 'Flow One!', bankAccount: '111999', bankName: 'khan' }, base));
  assert.deepEqual(await raw('userPrivate/f1'), { bankAccount: '111999', bankName: 'khan' });
  const after = await load(f1, 'f1');
  assert.equal(after.name, 'Flow One!');
  assert.equal(after.bankAccount, '111999', 'the private value stands over the stale public copy');
  assert.equal(after.phone, '99220001');
});

test('a member saves their profile after the move', async () => {
  const rec = await load(f2, 'f2');
  assert.equal(rec.phone, '99220002');
  await ok(save(f2, { ...rec, firstName: 'Flow', bankIban: 'MN99', bankAccount: '' }, baselineOf(rec)));
  assert.deepEqual(await raw('userPrivate/f2'), { phone: '99220002', bankAccount: '', bankIban: 'MN99' });
  assert.equal((await raw('users/f2')).firstName, 'Flow');
});

test('a stale session copy is saved without putting an old phone or role back', async () => {
  // What the session held from long ago, saved with no fresh read (a new push token).
  const stale = { id: 'f2', name: 'Flow Two', role: 'admin', status: 'active', phone: '90000000', fcmToken: 'tok-2' };
  await ok(save(f2, stale, null));
  const pub = await raw('users/f2');
  assert.equal(pub.fcmToken, 'tok-2');
  assert.equal(pub.role, 'user');
  assert.equal((await raw('userPrivate/f2')).phone, '99220002');
});

test('an admin edits a member: the phone, the role, the status', async () => {
  const rec = await load(admin, 'f2');
  await ok(save(admin, { ...rec, phone: '99220022', role: 'marshal', status: 'hold' }, baselineOf(rec)));
  assert.equal((await raw('userPrivate/f2')).phone, '99220022');
  assert.equal((await raw('users/f2')).role, 'marshal');
  assert.equal((await raw('users/f2')).status, 'hold');
  const back = await load(admin, 'f2');
  await ok(save(admin, { ...back, status: 'active' }, baselineOf(back)));
});

test('an admin\'s list gone stale does not undo another admin\'s change', async () => {
  const rec = await load(admin, 'f2');                       // opened here …
  const base = baselineOf(rec);
  await ok(update(ref(sysAdmin, 'users/f2'), { role: 'user' }));   // … changed elsewhere since
  await ok(save(admin, { ...rec, communities: ['a', 'b'] }, base));
  const pub = await raw('users/f2');
  assert.deepEqual(pub.communities, ['a', 'b']);
  assert.equal(pub.role, 'user');
});

test('a browser with no member identity still saves what is public — and is refused the rest', async () => {
  // The system admin signed in against a server that sends no token yet: an anonymous device.
  const rec = await load(anon, 'f2');
  assert.equal('phone' in rec, false, 'it does not see the phone');
  const base = baselineOf(rec);
  await ok(save(anon, { ...rec, communities: ['c'], phone: '', bankName: '' }, base), 'a circle change needs no identity');
  assert.deepEqual((await raw('users/f2')).communities, ['c']);
  await denied(save(anon, { ...rec, phone: '90001111' }, base), 'a phone does');
  await denied(save(anon, { ...rec, role: 'admin' }, base), 'and so does a role');
  assert.equal((await raw('userPrivate/f2')).phone, '99220022');
  assert.equal((await raw('users/f2')).role, 'user');
});

// ---- Coaching ----
// m2 is a coach taking bookings; f2 was made one and is switched off. The
// slots are laid afresh before each test, by the clock the rules read (`now`).
const HOUR = 60 * 60 * 1000;
const T0 = Math.floor(Date.now() / 1000) * 1000;
const S = {
  far: T0 + 48 * HOUR,         // open, two days off
  soon: T0 + 2 * HOUR,         // open, in two hours
  taken: T0 + 50 * HOUR,       // m1's, well ahead
  takenSoon: T0 + 3 * HOUR,    // m1's, inside the twelve hours
  past: T0 - 2 * HOUR,         // open, already begun
};
const slotOf = (start, status = 'open') => ({ start, minutes: 60, status, price: 80000, createdAt: T0 });
const COACHING = {
  coaches: {
    m2: { active: true, bio: 'Pro', place: 'Range', price30: 50000, price60: 80000, approvedBy: 'admin1', approvedAt: T0 },
    f2: { active: false, bio: 'Was a coach' },
  },
  coachSlots: {
    m2: {
      [slotId(S.far)]: slotOf(S.far), [slotId(S.soon)]: slotOf(S.soon), [slotId(S.past)]: slotOf(S.past),
      [slotId(S.taken)]: slotOf(S.taken, 'booked'), [slotId(S.takenSoon)]: slotOf(S.takenSoon, 'booked'),
    },
  },
  coachBookings: {
    m2: {
      [slotId(S.taken)]: { playerId: 'm1', bookedAt: T0, note: 'my slice' },
      [slotId(S.takenSoon)]: { playerId: 'm1', bookedAt: T0 },
    },
  },
  playerLessons: {
    m1: {
      [lessonKey('m2', slotId(S.taken))]: { coachId: 'm2', slotId: slotId(S.taken), start: S.taken, minutes: 60 },
      [lessonKey('m2', slotId(S.takenSoon))]: { coachId: 'm2', slotId: slotId(S.takenSoon), start: S.takenSoon, minutes: 60 },
    },
  },
};
async function layCoaching() {
  for (const [node, value] of Object.entries(COACHING)) {
    const r = await fetch(`http://${HOST}/${node}.json?ns=${NS}`, {
      method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    assert.equal(r.status, 200, 'laying ' + node);
  }
}
// What is really there, read through the emulator's back door.
async function stored(path) {
  const r = await fetch(`http://${HOST}/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } });
  return r.json();
}
// Something removed behind the rules' back — a record edited in the console.
async function wipe(path) {
  const r = await fetch(`http://${HOST}/${path}.json?ns=${NS}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  assert.equal(r.status, 200, 'wiping ' + path);
}
const far = { id: slotId(S.far), start: S.far, minutes: 60 };
const soon = { id: slotId(S.soon), start: S.soon, minutes: 60 };
const root = (db) => ref(db);

test('coaching: members read the coaches and their slots; a visitor does not', async () => {
  await layCoaching();
  assert.equal((await get(ref(m1, 'coaches'))).val().m2.bio, 'Pro');
  assert.equal((await get(ref(f1, 'coachSlots/m2'))).val()[slotId(S.far)].status, 'open');
  await denied(get(ref(visitor, 'coaches')), 'a visitor, the coaches');
  await denied(get(ref(anon, 'coachSlots/m2')), 'an anonymous device, the slots');
  await denied(get(ref(held, 'coachSlots')), 'a member on hold');
});

test('coaching: an admin makes a member a coach; no one makes themselves one', async () => {
  await layCoaching();
  await ok(update(ref(admin, 'coaches/f1'), { active: true, approvedBy: 'admin1', approvedAt: T0 }), 'an admin');
  await ok(set(ref(sysAdmin, 'coaches/f2/active'), true), 'the system admin switches one back on');
  await denied(set(ref(m1, 'coaches/m1'), { active: true }), 'a member, themselves');
  await denied(set(ref(m1, 'coaches/m1/active'), true), 'a member, the switch alone');
  await denied(set(ref(m2, 'coaches/m2/active'), false), 'a coach, their own switch');
  await denied(set(ref(m2, 'coaches/m2/approvedBy'), 'm2'), 'a coach, who approved them');
  await denied(update(ref(admin, 'coaches/f1'), { rating: 5 }), 'a field that is not one');
  await denied(set(ref(admin, 'coaches/f1/active'), 'yes'), 'a switch that is not a boolean');
});

test('coaching: a coach writes their own profile — while they are one — and no one else\'s', async () => {
  await layCoaching();
  await ok(update(ref(m2, 'coaches/m2'), { bio: 'PGA', place: 'Mt. Bogd range', price30: 60000, price60: 90000, updatedAt: T0 }), 'their own');
  assert.deepEqual([(await stored('coaches/m2')).bio, (await stored('coaches/m2')).active], ['PGA', true]);
  // As the store writes it: paths from the root, one write.
  await ok(update(root(m2), { 'coaches/m2/bio': 'PGA pro', 'coaches/m2/place': 'Range', 'coaches/m2/price30': 0, 'coaches/m2/price60': 90000, 'coaches/m2/updatedAt': T0 }), 'from the root');
  await denied(update(root(m2), { 'coaches/m2/bio': 'PGA pro', 'coaches/m2/active': false }), 'the switch slipped in with the profile');
  await denied(set(ref(m1, 'coaches/m2/bio'), 'hacked'), 'another member');
  await denied(set(ref(f2, 'coaches/f2/bio'), 'still here'), 'a coach who is switched off');
  await denied(set(ref(m1, 'coaches/m1/bio'), 'me too'), 'a member who is not a coach');
  await denied(set(ref(m2, 'coaches/m2/price60'), '90000'), 'a price that is not a number');
  await denied(set(ref(m2, 'coaches/m2/bio'), 'x'.repeat(601)), 'a bio too long');
});

test('coaching: a coach opens slots — their own, ahead, keyed by the start', async () => {
  await layCoaching();
  const start = T0 + 72 * HOUR;
  const fresh = [{ id: slotId(start), start, minutes: 30, status: 'open', price: 50000, createdAt: T0 }];
  await ok(update(root(m2), slotWrites('m2', fresh)), 'the coach');
  assert.equal((await stored(`coachSlots/m2/${slotId(start)}`)).minutes, 30);
  await denied(update(root(m1), slotWrites('m2', [{ ...fresh[0], id: slotId(start + HOUR), start: start + HOUR }])), 'another member, for the coach');
  await denied(update(root(m1), slotWrites('m1', fresh)), 'a member who is not a coach');
  await denied(update(root(f2), slotWrites('f2', fresh)), 'a coach who is switched off');
  await denied(update(root(m2), slotWrites('m2', [{ ...fresh[0], id: slotId(T0 - HOUR), start: T0 - HOUR }])), 'a slot in the past');
  await denied(update(root(m2), slotWrites('m2', [{ ...fresh[0], id: 's123', start: start + 2 * HOUR }])), 'a key that is not the start');
  await denied(update(root(m2), slotWrites('m2', [{ ...fresh[0], id: slotId(start + 3 * HOUR), start: start + 3 * HOUR, minutes: 45 }])), 'a length that is not 30 or 60');
  await denied(update(root(m2), slotWrites('m2', [{ ...fresh[0], id: slotId(start + 4 * HOUR), start: start + 4 * HOUR, playerId: 'm1' }])), 'a field that is not one');
  await denied(set(ref(m2, `coachSlots/m2/${slotId(S.far)}/start`), S.far + HOUR), 'moving a slot');
  await denied(update(root(m2), slotWrites('m2', [{ ...fresh[0], id: slotId(start + 5 * HOUR), start: start + 5 * HOUR, status: 'booked' }])), 'a slot born taken, with no booking');
  await denied(set(ref(m2, `coachSlots/m2/${slotId(S.far)}/status`), 'booked'), 'the coach marks an open slot taken');
});

test('coaching: a member books an open slot — the slot, the booking and their list, in one write', async () => {
  await layCoaching();
  await ok(update(root(f1), bookingWrites('m2', far, 'f1', 'first lesson', T0)), 'the booking');
  assert.equal((await stored(`coachSlots/m2/${far.id}`)).status, 'booked');
  assert.deepEqual(await stored(`coachBookings/m2/${far.id}`), { playerId: 'f1', bookedAt: T0, note: 'first lesson' });
  assert.equal((await stored(`playerLessons/f1/${lessonKey('m2', far.id)}`)).start, S.far);
  // The slot other members read does not say who.
  assert.equal(JSON.stringify((await get(ref(m1, `coachSlots/m2/${far.id}`))).val()).includes('f1'), false);
});

test('coaching: who booked is the coach\'s and the player\'s to read — no one else\'s', async () => {
  await layCoaching();
  assert.equal((await get(ref(m2, 'coachBookings/m2'))).val()[slotId(S.taken)].playerId, 'm1', 'the coach, all of theirs');
  assert.equal((await get(ref(m1, `coachBookings/m2/${slotId(S.taken)}`))).val().note, 'my slice', 'the player, their own');
  assert.ok((await get(ref(m1, 'playerLessons/m1'))).exists(), 'the player, their own list');
  assert.ok((await get(ref(admin, 'coachBookings/m2'))).exists(), 'an admin');
  await denied(get(ref(f1, `coachBookings/m2/${slotId(S.taken)}`)), 'another member, one booking');
  await denied(get(ref(f1, 'coachBookings/m2')), 'another member, the coach\'s bookings');
  await denied(get(ref(m1, 'coachBookings/m2')), 'the player, the coach\'s other bookings');
  await denied(get(ref(f1, 'playerLessons/m1')), 'another member, the player\'s list');
  await denied(get(ref(m2, 'playerLessons/m1')), 'the coach, the player\'s whole list');
  await denied(get(ref(visitor, `coachBookings/m2/${slotId(S.taken)}`)), 'a visitor');
});

test('coaching: a taken slot is not booked again — the second of two loses', async () => {
  await layCoaching();
  await denied(update(root(f1), bookingWrites('m2', { id: slotId(S.taken), start: S.taken, minutes: 60 }, 'f1', '', T0)), 'a slot m1 holds');
  assert.equal((await stored(`coachBookings/m2/${slotId(S.taken)}`)).playerId, 'm1');
  const both = await Promise.allSettled([
    update(root(f1), bookingWrites('m2', far, 'f1', '', T0)),
    update(root(m1), bookingWrites('m2', far, 'm1', '', T0)),
  ]);
  assert.deepEqual(both.map(r => r.status).sort(), ['fulfilled', 'rejected'], 'one of the two');
  const winner = (await stored(`coachBookings/m2/${far.id}`)).playerId;
  const loser = winner === 'f1' ? 'm1' : 'f1';
  assert.equal(await stored(`playerLessons/${loser}/${lessonKey('m2', far.id)}`), null, 'the loser has no lesson');
});

test('coaching: a booking is whole or it is nothing', async () => {
  await layCoaching();
  const w = bookingWrites('m2', far, 'f1', '', T0);
  const only = (...keys) => Object.fromEntries(Object.entries(w).filter(([p]) => keys.some(k => p.startsWith(k))));
  await denied(update(root(f1), only('coachSlots')), 'the slot taken with no booking');
  await denied(update(root(f1), only('coachBookings')), 'a booking with the slot left open');
  await denied(update(root(f1), only('playerLessons')), 'a lesson on the list with no booking');
  await denied(update(root(f1), only('coachSlots', 'playerLessons')), 'no booking record');
  await denied(update(root(f1), only('coachSlots', 'coachBookings')), 'slot and booking, the lesson left off the player\'s list');
  await denied(update(root(f1), only('coachBookings', 'playerLessons')), 'booking and lesson, the slot left open');
  assert.equal((await stored(`coachSlots/m2/${far.id}`)).status, 'open');
  assert.equal(await stored(`coachBookings/m2/${far.id}`), null);
  await ok(update(root(f1), w), 'all three');
});

test('coaching: who may not book, and what', async () => {
  await layCoaching();
  await denied(update(root(f1), bookingWrites('m2', far, 'm1', '', T0)), 'in another member\'s name');
  await denied(update(root(m2), bookingWrites('m2', far, 'm2', '', T0)), 'the coach, their own slot');
  await denied(update(root(held), bookingWrites('m2', far, 'held', '', T0)), 'a member on hold');
  await denied(update(root(anon), bookingWrites('m2', far, 'm1', '', T0)), 'an anonymous device');
  await denied(update(root(visitor), bookingWrites('m2', far, 'm1', '', T0)), 'a visitor');
  await denied(update(root(f1), bookingWrites('m2', { id: slotId(S.past), start: S.past, minutes: 60 }, 'f1', '', T0)), 'a slot that has begun');
  await denied(update(root(f1), bookingWrites('m2', { id: slotId(T0 + 99 * HOUR), start: T0 + 99 * HOUR, minutes: 60 }, 'f1', '', T0)), 'a slot the coach never opened');
  const extra = bookingWrites('m2', far, 'f1', '', T0);
  extra[`coachBookings/m2/${far.id}`] = { ...extra[`coachBookings/m2/${far.id}`], paid: true };
  await denied(update(root(f1), extra), 'a field that is not one');
  // (bookingWrites trims a note to size itself; this is a write made by hand.)
  const long = bookingWrites('m2', far, 'f1', '', T0);
  long[`coachBookings/m2/${far.id}`] = { ...long[`coachBookings/m2/${far.id}`], note: 'n'.repeat(301) };
  await denied(update(root(f1), long), 'a note too long');
  assert.equal((await stored(`coachSlots/m2/${far.id}`)).status, 'open');
  await ok(update(root(f1), bookingWrites('m2', soon, 'f1', '', T0)), 'a slot two hours off is still open to book');
});

test('coaching: the player cancels until twelve hours before — the slot opens again', async () => {
  await layCoaching();
  assert.ok(S.taken - Date.now() > CANCEL_MS && S.takenSoon - Date.now() < CANCEL_MS);
  await ok(update(root(m1), cancelWrites('m2', slotId(S.taken), 'm1')), 'well ahead');
  assert.equal((await stored(`coachSlots/m2/${slotId(S.taken)}`)).status, 'open');
  assert.equal(await stored(`coachBookings/m2/${slotId(S.taken)}`), null);
  assert.equal(await stored(`playerLessons/m1/${lessonKey('m2', slotId(S.taken))}`), null);
  await denied(update(root(m1), cancelWrites('m2', slotId(S.takenSoon), 'm1')), 'inside the twelve hours');
  assert.equal((await stored(`coachBookings/m2/${slotId(S.takenSoon)}`)).playerId, 'm1');
  // And someone else books the freed slot.
  await ok(update(root(f1), bookingWrites('m2', { id: slotId(S.taken), start: S.taken, minutes: 60 }, 'f1', '', T0)), 'the freed slot');
});

test('coaching: a booking is not another member\'s to cancel, change or half-undo', async () => {
  await layCoaching();
  const id = slotId(S.taken);
  await denied(update(root(f1), cancelWrites('m2', id, 'm1')), 'another member cancels it');
  await denied(set(ref(f1, `coachSlots/m2/${id}/status`), 'open'), 'another member reopens the slot');
  await denied(set(ref(m1, `coachSlots/m2/${id}/status`), 'open'), 'the player reopens the slot and keeps the booking');
  await denied(remove(ref(m1, `coachBookings/m2/${id}`)), 'the player drops the booking and leaves the slot taken');
  await denied(set(ref(m1, `coachBookings/m2/${id}/note`), 'changed'), 'the player rewrites the booking');
  await denied(set(ref(m1, `coachBookings/m2/${id}/playerId`), 'f1'), 'the player hands it to someone else');
  await denied(update(root(m1), cancelWrites('m2', id, 'm1', { removeSlot: true })), 'the player removes the coach\'s slot');
  await denied(remove(ref(f1, `playerLessons/m1/${lessonKey('m2', id)}`)), 'another member, the player\'s list');
  const kept = cancelWrites('m2', id, 'm1');
  delete kept[`playerLessons/m1/${lessonKey('m2', id)}`];
  await denied(update(root(m1), kept), 'the player cancels and keeps the lesson on their list');
  await denied(remove(ref(m1, `playerLessons/m1/${lessonKey('m2', id)}`)), 'the player takes the lesson off their list and keeps the booking');
  assert.equal((await stored(`coachBookings/m2/${id}`)).note, 'my slice');
  assert.equal((await stored(`playerLessons/m1/${lessonKey('m2', id)}`)).start, S.taken);
});

test('coaching: the coach cancels at any time — reopening the slot, or withdrawing it', async () => {
  await layCoaching();
  // Whole, like the player's: not the booking alone, not with the lesson left behind.
  const whole = cancelWrites('m2', slotId(S.taken), 'm1');
  const lesson = `playerLessons/m1/${lessonKey('m2', slotId(S.taken))}`;
  await denied(remove(ref(m2, `coachBookings/m2/${slotId(S.taken)}`)), 'the booking alone, the slot left taken');
  await denied(update(root(m2), Object.fromEntries(Object.entries(whole).filter(([path]) => path !== lesson))), 'the lesson left on the player\'s list');
  await denied(remove(ref(m2, lesson)), 'the lesson taken off the player\'s list, the booking kept');
  await denied(update(root(m2), { [`coachBookings/m2/${slotId(S.taken)}`]: null, [lesson]: null }), 'booking and lesson gone, the slot left taken');
  assert.equal((await stored(`coachBookings/m2/${slotId(S.taken)}`)).playerId, 'm1');
  await ok(update(root(m2), cancelWrites('m2', slotId(S.takenSoon), 'm1')), 'inside the twelve hours, reopened');
  assert.equal((await stored(`coachSlots/m2/${slotId(S.takenSoon)}`)).status, 'open');
  assert.equal(await stored(`playerLessons/m1/${lessonKey('m2', slotId(S.takenSoon))}`), null, 'off the player\'s list');
  await ok(update(root(m2), cancelWrites('m2', slotId(S.taken), 'm1', { removeSlot: true })), 'withdrawn');
  assert.equal(await stored(`coachSlots/m2/${slotId(S.taken)}`), null);
  assert.equal(await stored(`coachBookings/m2/${slotId(S.taken)}`), null);
});

test('coaching: an open slot is the coach\'s to remove; a booked one only with its booking', async () => {
  await layCoaching();
  await ok(remove(ref(m2, `coachSlots/m2/${far.id}`)), 'an open slot');
  await denied(remove(ref(m2, `coachSlots/m2/${slotId(S.taken)}`)), 'a booked slot, the booking left behind');
  assert.equal((await stored(`coachBookings/m2/${slotId(S.taken)}`)).playerId, 'm1');
  await denied(remove(ref(m1, `coachSlots/m2/${soon.id}`)), 'a member, the coach\'s slot');
  await denied(remove(ref(f2, `coachSlots/m2/${soon.id}`)), 'another coach');
});

test('coaching: a slot is not opened again over a booking that is still there', async () => {
  await layCoaching();
  const id = slotId(S.taken);
  await denied(set(ref(m2, `coachSlots/m2/${id}/status`), 'open'), 'the coach, the booking left in place');
  await denied(set(ref(m2, `coachSlots/m2/${id}`), slotOf(S.taken)), 'the whole slot rewritten as open');
  assert.equal((await stored(`coachSlots/m2/${id}`)).status, 'booked');
  // The repair: a booked slot whose booking is gone (a record edited in the
  // console — the rules let no browser leave it so) is the coach's to open.
  await wipe(`coachBookings/m2/${id}`);
  await wipe(`playerLessons/m1/${lessonKey('m2', id)}`);
  await ok(set(ref(m2, `coachSlots/m2/${id}/status`), 'open'), 'the coach opens the slot');
  await ok(update(root(f1), bookingWrites('m2', { id, start: S.taken, minutes: 60 }, 'f1', '', T0)), 'which is then booked again');
});

test('coaching: a lesson left behind on a list is the member\'s to take off — a live one is not', async () => {
  await layCoaching();
  const id = slotId(S.takenSoon);
  await denied(remove(ref(m1, `playerLessons/m1/${lessonKey('m2', id)}`)), 'while the booking stands');
  // The booking went behind the rules' back; the entry is all that is left.
  await wipe(`coachBookings/m2/${id}`);
  await denied(remove(ref(f1, `playerLessons/m1/${lessonKey('m2', id)}`)), 'another member');
  await ok(remove(ref(m1, `playerLessons/m1/${lessonKey('m2', id)}`)), 'their own, with no booking behind it');
});

test('coaching: an admin can step in — cancel a booking, clear a slot', async () => {
  await layCoaching();
  await denied(remove(ref(admin, `coachBookings/m2/${slotId(S.takenSoon)}`)), 'an admin, the booking alone');
  await ok(update(root(admin), cancelWrites('m2', slotId(S.takenSoon), 'm1')), 'an admin cancels');
  assert.equal((await stored(`coachSlots/m2/${slotId(S.takenSoon)}`)).status, 'open');
  await ok(remove(ref(sysAdmin, `coachSlots/m2/${soon.id}`)), 'the system admin clears an open slot');
});

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

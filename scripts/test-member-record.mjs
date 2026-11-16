// scripts/test-member-record.mjs
// The line between the public and the private half of a member's record
// (src/member-record.js): what goes where, how the halves come back
// together, what a save sends, and which sessions are ended.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIVATE_FIELDS, GUARDED_FIELDS, splitMember, mergeMember, carriesPrivate,
  baselineOf, memberWrites, SESSION_VERSION, sessionIsCurrent, sessionAction,
} from '../src/member-record.js';

const bat = {
  id: 'u_a', name: 'Bat', firstName: 'Bat', role: 'user', status: 'active', hcpIndex: 12.4,
  phone: '99119007', bankName: 'khan', bankAccount: '5001234567', bankIban: 'MN12', mtbogdCode: 'M-77',
};

test('the private fields are the phone, the bank details and the club code', () => {
  assert.deepEqual(PRIVATE_FIELDS, ['phone', 'bankName', 'bankAccount', 'bankIban', 'mtbogdCode']);
  assert.deepEqual(GUARDED_FIELDS, ['role', 'status']);
});

test('splitMember: every field goes to exactly one half', () => {
  const { pub, priv } = splitMember(bat);
  assert.deepEqual(pub, { id: 'u_a', name: 'Bat', firstName: 'Bat', role: 'user', status: 'active', hcpIndex: 12.4 });
  assert.deepEqual(priv, { phone: '99119007', bankName: 'khan', bankAccount: '5001234567', bankIban: 'MN12', mtbogdCode: 'M-77' });
  for (const k of PRIVATE_FIELDS) assert.equal(k in pub, false, `${k} must not reach the public half`);
});

test('splitMember: never a password, never an undefined, and a missing field stays missing', () => {
  const { pub, priv } = splitMember({ id: 'u_b', name: 'B', password: 'plain', phone: undefined, avatar: undefined, bankName: null });
  assert.deepEqual(pub, { id: 'u_b', name: 'B' });
  assert.deepEqual(priv, { bankName: null });
  assert.deepEqual(splitMember(null), { pub: {}, priv: {} });
  assert.deepEqual(splitMember('x'), { pub: {}, priv: {} });
});

test('mergeMember: one record again, the private half over the public one', () => {
  const { pub, priv } = splitMember(bat);
  assert.deepEqual(mergeMember(pub, priv), bat);
  // Not moved yet: the public record still carries the phone, and it is used.
  assert.equal(mergeMember({ id: 'u_a', phone: '99119007' }, null).phone, '99119007');
  // Both have it: the private one is the newer.
  assert.equal(mergeMember({ id: 'u_a', phone: '99119007' }, { phone: '88001122' }).phone, '88001122');
  // A field cleared in the private half ('') stands over an old public copy.
  assert.equal(mergeMember({ id: 'u_a', bankAccount: '5001' }, { bankAccount: '' }).bankAccount, '');
});

test('mergeMember: a visitor\'s copy simply has no private fields', () => {
  assert.deepEqual(mergeMember({ id: 'u_a', name: 'Bat' }, null), { id: 'u_a', name: 'Bat' });
  assert.deepEqual(mergeMember({ id: 'u_a', name: 'Bat' }, undefined), { id: 'u_a', name: 'Bat' });
  // Nothing but the private fields is ever taken from the private half.
  assert.deepEqual(mergeMember({ id: 'u_a', role: 'user' }, { role: 'admin', phone: '99119007' }), { id: 'u_a', role: 'user', phone: '99119007' });
});

test('carriesPrivate: a public record that has not been moved yet', () => {
  assert.equal(carriesPrivate({ id: 'u_a', phone: '99119007' }), true);
  assert.equal(carriesPrivate({ id: 'u_a', bankName: '' }), true, 'an empty field is still a field to remove');
  assert.equal(carriesPrivate({ id: 'u_a', name: 'Bat' }), false);
  assert.equal(carriesPrivate({ id: 'u_a', phone: null }), false);
  assert.equal(carriesPrivate(null), false);
});

test('memberWrites: a save that changed nothing private writes nothing private', () => {
  const base = baselineOf(bat);
  const { pub, priv } = memberWrites({ ...bat, name: 'Bat-Erdene', hcpIndex: 11.9 }, base);
  assert.deepEqual(priv, {});
  assert.deepEqual(pub, { id: 'u_a', name: 'Bat-Erdene', firstName: 'Bat', hcpIndex: 11.9 });
});

test('memberWrites: only the private fields that were changed are sent', () => {
  const base = baselineOf(bat);
  const { priv } = memberWrites({ ...bat, bankAccount: '5009999999' }, base);
  assert.deepEqual(priv, { bankAccount: '5009999999' });
  // The phone is not sent back with it: a member may not change one, and an
  // unchanged one must not get the whole save refused.
  assert.equal('phone' in priv, false);
});

test('memberWrites: a cleared field is written as an empty string, not removed', () => {
  const base = baselineOf(bat);
  assert.deepEqual(memberWrites({ ...bat, bankIban: '' }, base).priv, { bankIban: '' });
  assert.deepEqual(memberWrites({ ...bat, bankIban: null }, base).priv, { bankIban: '' });
});

test('memberWrites: an empty box for a field that was never there is no change', () => {
  const bare = { id: 'u_c', name: 'C', role: 'user', status: 'active' };
  const base = baselineOf(bare);
  // The admin's form sends '' for every box the record has no value for.
  const { pub, priv } = memberWrites({ ...bare, phone: '', bankName: '', bankAccount: '', bankIban: '', mtbogdCode: '' }, base);
  assert.deepEqual(priv, {});
  assert.deepEqual(pub, { id: 'u_c', name: 'C' });
});

test('memberWrites: role and status go out only when they were changed here', () => {
  const base = baselineOf(bat);
  assert.equal('role' in memberWrites(bat, base).pub, false);
  assert.equal('status' in memberWrites(bat, base).pub, false);
  assert.equal(memberWrites({ ...bat, role: 'marshal' }, base).pub.role, 'marshal');
  assert.equal(memberWrites({ ...bat, status: 'hold' }, base).pub.status, 'hold');
});

test('memberWrites: without a baseline nothing private or guarded is written', () => {
  // The session copy, saved before this browser read the record: it may be
  // stale, and must not put an old phone or an old role back.
  const { pub, priv } = memberWrites({ ...bat, fcmToken: 'tok' }, null);
  assert.deepEqual(priv, {});
  assert.deepEqual(pub, { id: 'u_a', name: 'Bat', firstName: 'Bat', hcpIndex: 12.4, fcmToken: 'tok' });
});

test('memberWrites: a number and its string are the same value', () => {
  const base = baselineOf({ id: 'u_d', phone: 99119007 });
  assert.deepEqual(memberWrites({ id: 'u_d', phone: '99119007' }, base).priv, {});
});

test('a session is current only when it carries this version\'s mark', () => {
  assert.equal(sessionIsCurrent(SESSION_VERSION), true);
  assert.equal(sessionIsCurrent('1'), false);
  assert.equal(sessionIsCurrent(null), false);
  assert.equal(sessionIsCurrent(undefined), false);
});

test('sessionAction: keep, adopt or end', () => {
  const user = { id: 'u_a' };
  assert.equal(sessionAction({ user: null, marker: null, identity: null }), 'keep', 'no session at all');
  assert.equal(sessionAction({ user, marker: SESSION_VERSION, identity: null }), 'keep', 'signed in since the change');
  assert.equal(sessionAction({ user, marker: null, identity: 'u_a' }), 'adopt', 'from before, but already this member');
  assert.equal(sessionAction({ user, marker: null, identity: null }), 'end', 'from before, no identity');
  assert.equal(sessionAction({ user, marker: null, identity: 'u_b' }), 'end', 'another member\'s identity does not count');
  assert.equal(sessionAction({ user, marker: '1', identity: null }), 'end', 'an older mark');
});

// scripts/test-member-systems.mjs
// The admin's member list by system (src/member-systems.js): which other
// systems a member is in, the filters and their counts, and the orders.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  memberSystems, MEMBER_FILTERS, inMemberFilter, systemsInFilter, memberFilterCounts, MEMBER_ORDERS, memberSortKey, compareMembers,
} from '../src/member-systems.js';

const all3 = { id: 'u_a', name: 'Bat', ghinNumber: '13429465', mtbogdCode: 'P07-7080', createdAt: 30 };
const ghinOnly = { id: 'u_b', name: 'Bold', ghinNumber: '13429448', createdAt: 20 };
const mtbOnly = { id: 'u_c', name: 'Chimeg', mtbogdCode: 'L01-1234', createdAt: 40 };
const ubgolfOnly = { id: 'u_d', name: 'Dorj', createdAt: 10 };
const users = [all3, ghinOnly, mtbOnly, ubgolfOnly];

test('memberSystems: by what is on the record', () => {
  assert.deepEqual(memberSystems(all3), { ghin: true, mtbogd: true });
  assert.deepEqual(memberSystems(ghinOnly), { ghin: true, mtbogd: false });
  assert.deepEqual(memberSystems(mtbOnly), { ghin: false, mtbogd: true });
  assert.deepEqual(memberSystems(ubgolfOnly), { ghin: false, mtbogd: false });
});

test('memberSystems: something that is not a number or a code is not a membership', () => {
  assert.deepEqual(memberSystems({ ghinNumber: '123', mtbogdCode: '   ' }), { ghin: false, mtbogd: false });
  assert.deepEqual(memberSystems({ ghinNumber: '', mtbogdCode: null }), { ghin: false, mtbogd: false });
  assert.deepEqual(memberSystems({ ghinNumber: 13429465 }), { ghin: true, mtbogd: false });
  assert.deepEqual(memberSystems(null), { ghin: false, mtbogd: false });
});

test('the filters: everyone, GHIN, MT Bogd, all three, UB Golf only', () => {
  assert.deepEqual(MEMBER_FILTERS, ['all', 'ghin', 'mtbogd', 'both', 'ubgolf']);
  const shown = (f) => users.filter(u => inMemberFilter(u, f)).map(u => u.id);
  assert.deepEqual(shown('all'), ['u_a', 'u_b', 'u_c', 'u_d']);
  assert.deepEqual(shown('ghin'), ['u_a', 'u_b']);
  assert.deepEqual(shown('mtbogd'), ['u_a', 'u_c']);
  assert.deepEqual(shown('both'), ['u_a']);
  assert.deepEqual(shown('ubgolf'), ['u_d']);
  assert.deepEqual(shown('something else'), ['u_a', 'u_b', 'u_c', 'u_d'], 'an unknown filter hides no one');
});

test('memberFilterCounts: how many each filter shows', () => {
  assert.deepEqual(memberFilterCounts(users), { all: 4, ghin: 2, mtbogd: 2, both: 1, ubgolf: 1 });
  assert.deepEqual(memberFilterCounts([]), { all: 0, ghin: 0, mtbogd: 0, both: 0, ubgolf: 0 });
  assert.deepEqual(memberFilterCounts(null), { all: 0, ghin: 0, mtbogd: 0, both: 0, ubgolf: 0 });
  // GHIN-only and MT-Bogd-only and both and neither add up to everyone.
  const c = memberFilterCounts(users);
  assert.equal((c.ghin - c.both) + (c.mtbogd - c.both) + c.both + c.ubgolf, c.all);
});

test('the orders: newest first, by name, by Handicap Index', () => {
  assert.deepEqual(MEMBER_ORDERS, ['new', 'name', 'hi']);
  const his = { u_a: 12.3, u_b: -1.2, u_c: null, u_d: null };
  const key = (u) => memberSortKey(u, { nameOf: (x) => x.name, hiValue: his[u.id] });
  const sorted = (order) => [...users].sort((a, b) => compareMembers(key(a), key(b), order)).map(u => u.id);
  assert.deepEqual(sorted('new'), ['u_c', 'u_a', 'u_b', 'u_d']);
  assert.deepEqual(sorted('name'), ['u_a', 'u_b', 'u_c', 'u_d']);
  // A plus handicap is the lowest; members GHIN has no index for come last, by name.
  assert.deepEqual(sorted('hi'), ['u_b', 'u_a', 'u_c', 'u_d']);
  assert.deepEqual(sorted(undefined), sorted('new'));
});

test('memberSortKey: names compare without regard to case, a missing index is none', () => {
  assert.deepEqual(memberSortKey({ name: '  Bat ', createdAt: '5' }, {}), { created: 5, name: 'bat', hi: null });
  assert.equal(memberSortKey({ name: 'x' }, { hiValue: NaN }).hi, null);
  assert.equal(memberSortKey({ name: 'x' }, { hiValue: 0 }).hi, 0);
  assert.equal(memberSortKey(null).name, '');
});

test('systemsInFilter: the same answer from the two flags a list row carries', () => {
  for (const u of users) for (const f of MEMBER_FILTERS) {
    assert.equal(systemsInFilter(memberSystems(u), f), inMemberFilter(u, f), `${u.id} ${f}`);
  }
  assert.equal(systemsInFilter(null, 'ubgolf'), true);
  assert.equal(systemsInFilter({ ghin: true }, 'both'), false);
});

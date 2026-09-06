// Tests for src/gender.js — the profile's gender field and the rule the
// one-off backfill fills it in with.
// Pure module — no browser, no Firebase.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { GENDERS, isGender, genderKey, inferGender, isLadiesEvent, WOMEN_CIRCLE } from '../src/gender.js';

test('only the two values are a gender; everything else reads as not set', () => {
  assert.deepEqual(GENDERS, ['male', 'female']);
  assert.ok(isGender('male'));
  assert.ok(isGender('female'));
  // A record written before the field existed, a cleared select, a typo.
  for (const v of ['', null, undefined, 'other', 'Male', 'эрэгтэй', 0]) {
    assert.equal(isGender(v), false, `${JSON.stringify(v)} must not count as a gender`);
  }
  assert.equal(genderKey('male'), 'genderMale');
  assert.equal(genderKey('female'), 'genderFemale');
  assert.equal(genderKey(''), '');
});

test('the women’s circle makes a member female', () => {
  const u = { id: 'u1', communities: ['bulaa', WOMEN_CIRCLE, 'senior'] };
  assert.deepEqual(inferGender(u), { gender: 'female', why: 'circle' });
});

test('so does having played a ladies tournament, circle or no circle', () => {
  const ladies = new Set(['u2']);
  assert.deepEqual(inferGender({ id: 'u2', communities: ['eagle'] }, ladies),
    { gender: 'female', why: 'ladies' });
  // The circle wins the reason when both are true — it is the club's own record.
  assert.equal(inferGender({ id: 'u2', communities: [WOMEN_CIRCLE] }, ladies).why, 'circle');
});

test('everyone else is male, including members with no circles at all', () => {
  assert.deepEqual(inferGender({ id: 'u3', communities: ['eagle'] }, new Set(['u2'])),
    { gender: 'male', why: 'default' });
  assert.deepEqual(inferGender({ id: 'u4' }), { gender: 'male', why: 'default' });
  // 134 of 140 production records carry an array; the other six carry nothing,
  // and a non-array must not throw or be treated as membership.
  assert.equal(inferGender({ id: 'u5', communities: 'women' }).gender, 'male');
  assert.equal(inferGender(null).gender, 'male');
});

test('a ladies event is recognised by its name, in either language', () => {
  assert.ok(isLadiesEvent('Han Bogd Cup 2026 (Ladies)'));
  assert.ok(isLadiesEvent('JCI 2026 Ladies Championship'));
  assert.ok(isLadiesEvent('Эмэгтэйчүүдийн цом'));
  assert.ok(isLadiesEvent('WOMEN’S OPEN'));
  assert.equal(isLadiesEvent('Han Bogd Cup 2026 (Men)'), false);
  assert.equal(isLadiesEvent(''), false);
  assert.equal(isLadiesEvent(undefined), false);
});

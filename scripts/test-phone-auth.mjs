// scripts/test-phone-auth.mjs
// The pure half of signing in by SMS: phone numbers into E.164 and into the
// 8-digit form the provider takes, when two numbers are the same phone, the
// time left on a code, and the words for a refusal.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { toE164, samePhone, mnLocal, leftText, verifyErrorKey, DEFAULT_COUNTRY } from '../src/phone-auth.js';

test('toE164: a Mongolian number, however it is written', () => {
  assert.equal(DEFAULT_COUNTRY, '976');
  assert.equal(toE164('99119007'), '+97699119007');
  assert.equal(toE164(' 9911 9007 '), '+97699119007');
  assert.equal(toE164('9911-9007'), '+97699119007');
  assert.equal(toE164(88112233), '+97688112233');
  assert.equal(toE164('70112233'), '+97670112233', 'a landline-range number is still 8 digits');
  assert.equal(toE164('97699119007'), '+97699119007');
  assert.equal(toE164('976 9911-9007'), '+97699119007');
  assert.equal(toE164('+976 9911 9007'), '+97699119007');
  assert.equal(toE164('0097699119007'), '+97699119007');
});

test('toE164: a Korean mobile, at home and abroad', () => {
  assert.equal(toE164('01012345678'), '+821012345678');
  assert.equal(toE164('010-1234-5678'), '+821012345678');
  assert.equal(toE164('+82 10 1234 5678'), '+821012345678');
  assert.equal(toE164('0111234567'), '+82111234567', 'the older 10-digit form');
});

test('toE164: what is not a number we can send to', () => {
  assert.equal(toE164(''), null);
  assert.equal(toE164(null), null);
  assert.equal(toE164(undefined), null);
  assert.equal(toE164('abc'), null);
  assert.equal(toE164('1234567'), null, 'seven digits');
  assert.equal(toE164('123456789'), null, 'nine digits, no country');
  assert.equal(toE164('+0123456789'), null, 'a country code does not start with 0');
  assert.equal(toE164('+123'), null);
  assert.equal(toE164('+1234567890123456'), null, 'longer than E.164 allows');
});

test('samePhone: the stored number against the one the provider verified', () => {
  assert.equal(samePhone('99119007', '+97699119007'), true);
  assert.equal(samePhone('9911-9007', '976 99119007'), true);
  assert.equal(samePhone('01012345678', '+821012345678'), true);
  assert.equal(samePhone('99119007', '99119008'), false);
  assert.equal(samePhone('99119007', '+82199119007'), false);
  assert.equal(samePhone('', ''), false, 'two blanks are not a phone');
  assert.equal(samePhone(null, '99119007'), false);
  assert.equal(samePhone('junk', 'junk'), false);
});

test('mnLocal: the 8 digits of a Mongolian number, and null for any other', () => {
  assert.equal(mnLocal('99119007'), '99119007');
  assert.equal(mnLocal('+976 9911-9007'), '99119007');
  assert.equal(mnLocal('97699119007'), '99119007');
  assert.equal(mnLocal('01012345678'), null, 'a Korean mobile keeps the password');
  assert.equal(mnLocal('+821012345678'), null);
  assert.equal(mnLocal(''), null);
  assert.equal(mnLocal(null), null);
});

test('mnLocal agrees with the server\'s own reading of a number', () => {
  const server = createRequire(import.meta.url)('../functions/phone-verify.js');
  for (const n of ['99119007', ' 9911-9007 ', '97699119007', '+976 9911 9007', '0097699119007', 88112233,
    '01012345678', '+821012345678', '+97612345', '1234567', '123456789', '', null, 'abc']) {
    assert.equal(mnLocal(n), server.mnLocal(n), String(n));
  }
});

test('leftText: minutes and seconds, never below zero', () => {
  assert.equal(leftText(5 * 60 * 1000), '5:00');
  assert.equal(leftText(299001), '5:00');
  assert.equal(leftText(61000), '1:01');
  assert.equal(leftText(9000), '0:09');
  assert.equal(leftText(1), '0:01');
  assert.equal(leftText(0), '0:00');
  assert.equal(leftText(-5000), '0:00');
  assert.equal(leftText(NaN), '0:00');
});

test('verifyErrorKey: every refusal has words', () => {
  assert.equal(verifyErrorKey({ code: 'USER_NOT_FOUND', status: 404 }), 'userNotFound');
  assert.equal(verifyErrorKey({ code: 'USER_HELD', status: 403 }), 'svErrHeld');
  assert.equal(verifyErrorKey({ code: 'UNSUPPORTED_PHONE', status: 400 }), 'svErrForeign');
  assert.equal(verifyErrorKey({ code: 'NOT_CONFIGURED', status: 500 }), 'svErrNotEnabled');
  assert.equal(verifyErrorKey({ code: 'BAD_TICKET', status: 400 }), 'svErrGeneric');
  assert.equal(verifyErrorKey({ code: 'PROVIDER_ERROR', status: 502 }), 'svErrGeneric');
  assert.equal(verifyErrorKey({ code: null, status: 404 }), 'svErrNotEnabled', 'the function is not deployed');
  assert.equal(verifyErrorKey(new TypeError('Failed to fetch')), 'svErrNetwork');
  assert.equal(verifyErrorKey(new Error('boom')), 'svErrGeneric');
  assert.equal(verifyErrorKey(null), 'svErrGeneric');
});

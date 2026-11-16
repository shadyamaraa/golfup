// scripts/test-phone-auth.mjs
// The pure half of signing in by SMS code: phone numbers into E.164, when
// two numbers are the same phone, and the words for a provider's refusal.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { toE164, samePhone, codeOk, otpErrorKey, DEFAULT_COUNTRY, RESEND_SECONDS } from '../src/phone-auth.js';

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

test('codeOk: six digits', () => {
  assert.equal(codeOk('123456'), true);
  assert.equal(codeOk(' 123456 '), true);
  assert.equal(codeOk(123456), true);
  assert.equal(codeOk('12345'), false);
  assert.equal(codeOk('1234567'), false);
  assert.equal(codeOk('12a456'), false);
  assert.equal(codeOk(''), false);
  assert.equal(codeOk(null), false);
});

test('otpErrorKey: every refusal has words, and an unknown one the general ones', () => {
  assert.equal(otpErrorKey({ code: 'auth/invalid-phone-number' }), 'otpErrInvalidPhone');
  assert.equal(otpErrorKey({ code: 'auth/too-many-requests' }), 'otpErrTooMany');
  assert.equal(otpErrorKey({ code: 'auth/quota-exceeded' }), 'otpErrTooMany');
  assert.equal(otpErrorKey({ code: 'auth/invalid-verification-code' }), 'otpErrBadCode');
  assert.equal(otpErrorKey({ code: 'auth/code-expired' }), 'otpErrExpired');
  assert.equal(otpErrorKey({ code: 'auth/captcha-check-failed' }), 'otpErrCaptcha');
  assert.equal(otpErrorKey({ code: 'auth/unauthorized-domain' }), 'otpErrCaptcha');
  assert.equal(otpErrorKey({ code: 'auth/operation-not-allowed' }), 'otpErrNotEnabled');
  assert.equal(otpErrorKey({ code: 'auth/billing-not-enabled' }), 'otpErrNotEnabled');
  assert.equal(otpErrorKey({ code: 'auth/network-request-failed' }), 'otpErrNetwork');
  assert.equal(otpErrorKey({ code: 'auth/something-new' }), 'otpErrGeneric');
  assert.equal(otpErrorKey(new Error('boom')), 'otpErrGeneric');
  assert.equal(otpErrorKey(null), 'otpErrGeneric');
});

test('the wait before another code', () => {
  assert.equal(RESEND_SECONDS, 60);
});

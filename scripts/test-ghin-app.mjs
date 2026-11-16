// scripts/test-ghin-app.mjs
// GHIN on the app's side (src/ghin.js): who sees it, which stored record is
// a member's, how a Handicap Index reads, when it is read again, what a
// refusal says, and the admin's table.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ghinVisibleTo, ghinDigits, ghinFor, ghinHiText, ghinStale, ghinErrorKey, ghinRoster, toGhinScorePayload,
} from '../src/ghin.js';

const NOW = Date.parse('2026-11-16T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const found = (number, over = {}) => ({ number, found: true, name: 'Bat Bold', club: 'UB Golf Club', hi: '12.3', hiValue: 12.3, revDate: '2026-11-10', env: 'staging', syncedAt: NOW, ...over });

test('ghinVisibleTo: off, the admins\' trial, everyone', () => {
  const admin = { id: 'u_adm', role: 'admin' };
  const member = { id: 'u_a', role: 'user' };
  assert.equal(ghinVisibleTo('off', admin), false);
  assert.equal(ghinVisibleTo('admin', admin), true);
  assert.equal(ghinVisibleTo('admin', member), false);
  assert.equal(ghinVisibleTo('admin', { id: 'u_m', role: 'marshal' }), false);
  assert.equal(ghinVisibleTo('all', member), true);
  assert.equal(ghinVisibleTo('all', null), false, 'a visitor never');
  assert.equal(ghinVisibleTo(undefined, admin), false);
});

test('ghinDigits: seven or eight digits, else nothing', () => {
  assert.equal(ghinDigits('12345678'), '12345678');
  assert.equal(ghinDigits(' 1234-567 '), '1234567');
  assert.equal(ghinDigits(7900344), '7900344');
  for (const bad of ['123456', '123456789', '', null, undefined, 'abc']) assert.equal(ghinDigits(bad), '', String(bad));
});

test('ghinFor: the record counts only for the number the member has now', () => {
  const rec = found('12345678');
  assert.equal(ghinFor({ ghinNumber: '12345678' }, rec), rec);
  assert.equal(ghinFor({ ghinNumber: '1234-5678' }, rec), rec, 'written another way');
  assert.notEqual(ghinFor({ ghinNumber: '01234567' }, found('1234567')), null, 'a leading zero is the same number');
  assert.equal(ghinFor({ ghinNumber: '23456789' }, rec), null, 'the member has since changed their number');
  assert.equal(ghinFor({ ghinNumber: '' }, rec), null, 'or removed it');
  assert.equal(ghinFor({}, rec), null);
  assert.equal(ghinFor({ ghinNumber: '12345678' }, null), null);
  assert.equal(ghinFor(null, rec), null);
});

test('ghinHiText: as GHIN displays it', () => {
  assert.equal(ghinHiText(found('1', { hi: '12.3' })), '12.3');
  assert.equal(ghinHiText(found('1', { hi: '+1.2', hiValue: -1.2 })), '+1.2');
  assert.equal(ghinHiText(found('1', { hi: 'NH', hiValue: null })), 'NH');
  assert.equal(ghinHiText(found('1', { hi: null })), '—');
  assert.equal(ghinHiText({ number: '1', found: false }), '—');
  assert.equal(ghinHiText(null), '—');
  // The lookup's answer has no `found` field: it is a golfer.
  assert.equal(ghinHiText({ number: '1', name: 'Bat', hi: '8.0' }), '8.0');
});

test('ghinStale: read again after a day, or when never read', () => {
  assert.equal(ghinStale(null, NOW), true);
  assert.equal(ghinStale({}, NOW), true);
  assert.equal(ghinStale(found('1', { syncedAt: NOW - 1000 }), NOW), false);
  assert.equal(ghinStale(found('1', { syncedAt: NOW - DAY + 1000 }), NOW), false);
  assert.equal(ghinStale(found('1', { syncedAt: NOW - DAY - 1000 }), NOW), true);
  assert.equal(ghinStale({ number: '1', found: false, syncedAt: NOW - 1000 }, NOW), false, 'a not-found is not asked again at once');
});

test('ghinErrorKey: what each refusal says', () => {
  const key = (code, status) => ghinErrorKey({ code, status });
  assert.equal(key('NOT_FOUND', 404), 'ghinNotFound');
  assert.equal(key('BAD_GHIN', 400), 'gsGhinInvalid');
  assert.equal(key('NO_GHIN', 400), 'ghinErrNoNumber');
  assert.equal(key('TOO_MANY', 429), 'ghinErrTooMany');
  assert.equal(key('UNAUTHENTICATED', 401), 'ghinErrSignIn');
  assert.equal(key('FORBIDDEN', 403), 'pwMigrateAdminOnly');
  assert.equal(key('NOT_CONFIGURED', 500), 'ghinErrNotEnabled');
  assert.equal(key('LOGIN_REFUSED', 502), 'ghinErrNotEnabled');
  assert.equal(key('GHIN_UNREACHABLE', 502), 'ghinErrUnreachable');
  assert.equal(key('GHIN_ERROR', 502), 'ghinErrUnreachable');
  assert.equal(key(null, 404), 'ghinErrNotEnabled', 'the functions are not deployed');
  assert.equal(ghinErrorKey(new TypeError('Failed to fetch')), 'svErrNetwork');
  assert.equal(key('SERVER', 500), 'ghinErrUnreachable');
  assert.equal(ghinErrorKey(undefined), 'ghinErrUnreachable');
});

test('ghinRoster: every member with a number against what GHIN said', () => {
  const users = [
    { id: 'u_a', name: 'Bat', ghinNumber: '12345678' },
    { id: 'u_b', name: 'Bold', ghinNumber: '7900344' },
    { id: 'u_c', name: 'Changed', ghinNumber: '23456789' },
    { id: 'u_u', name: 'Unread', ghinNumber: '34567890' },
    { id: 'u_n', name: 'No number' },
    { id: 'u_x', name: 'Bad number', ghinNumber: '12' },
  ];
  const records = {
    u_a: found('12345678', { syncedAt: NOW - 5000 }),
    u_b: { number: '7900344', found: false, env: 'staging', syncedAt: NOW },
    u_c: found('99999999'),          // read for the number they had before
    u_gone: found('11111111'),       // a member since deleted
  };
  const r = ghinRoster(users, records);
  assert.deepEqual(r.rows.map(x => [x.id, x.number, x.state]), [
    ['u_a', '12345678', 'found'], ['u_b', '7900344', 'missing'], ['u_c', '23456789', 'unread'], ['u_u', '34567890', 'unread'],
  ]);
  assert.deepEqual([r.total, r.found, r.missing, r.unread], [4, 1, 1, 2]);
  assert.equal(r.syncedAt, NOW, 'the latest read');
  assert.equal(r.rows[0].record.hi, '12.3');
  assert.equal(r.rows[2].record, null);
});

test('ghinRoster: nothing read yet, no one with a number', () => {
  const none = ghinRoster([{ id: 'u_a', ghinNumber: '12345678' }], {});
  assert.deepEqual([none.total, none.found, none.missing, none.unread, none.syncedAt], [1, 0, 0, 1, null]);
  const empty = ghinRoster([], null);
  assert.deepEqual([empty.total, empty.rows.length, empty.syncedAt], [0, 0, null]);
  assert.equal(ghinRoster(null, null).total, 0);
});

test('toGhinScorePayload: a stored round in the shape GHIN posts', () => {
  const p = toGhinScorePayload('12345678', {
    playedAt: Date.parse('2026-11-15T03:00:00.000Z'), courseName: 'Chinggis Khaan', courseRating: 69.2, slopeRating: 119,
    holesPlayed: 18, agsTotal: 88, holeScores: { 1: 5, 2: 4 },
  });
  assert.equal(p.golfer_id, '12345678');
  assert.equal(p.played_at, '2026-11-15');
  assert.equal(p.adjusted_gross_score, 88);
  assert.deepEqual(p.hole_details, [{ hole_number: 1, raw_score: 5 }, { hole_number: 2, raw_score: 4 }]);
});

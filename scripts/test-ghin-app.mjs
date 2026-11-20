// scripts/test-ghin-app.mjs
// GHIN on the app's side (src/ghin.js): who sees it, which stored record is
// a member's, how a Handicap Index reads, when it is read again, what a
// refusal says, the admin's table — and a scoring record as a list
// (src/ghin-scores.js).
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ghinVisibleTo, ghinDigits, ghinFor, ghinHiText, ghinStale, ghinErrorKey, ghinRoster, ghinLinkWhyKey, toGhinScorePayload,
  ghinScoreRows, ghinScoreCounts, ghinDiffText, ghinAdjustText,
} from '../src/ghin.js';
import { ghinScoresHTML, ghinHomeStripHTML, ghinHomeBoardHTML } from '../src/ghin-scores.js';

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

test('ghinLinkWhyKey: why a member was not tied', () => {
  assert.equal(ghinLinkWhyKey('PHONE_DIFFERS'), 'ghinWhyPhoneDiffers');
  assert.equal(ghinLinkWhyKey('TAKEN'), 'ghinWhyTaken');
  assert.equal(ghinLinkWhyKey('HAS_NUMBER'), 'ghinWhyHasNumber');
  assert.equal(ghinLinkWhyKey('NOT_ON_GHIN'), 'ghinWhyNotOnGhin');
  assert.equal(ghinLinkWhyKey('NO_PHONE'), 'ghinWhyNoPhone');
  assert.equal(ghinLinkWhyKey('NO_MEMBER'), 'ghinWhyNoMember');
  assert.equal(ghinLinkWhyKey('BAD_GHIN'), 'gsGhinInvalid');
  assert.equal(ghinLinkWhyKey('SOMETHING_NEW'), 'ghinWhyOther');
  assert.equal(ghinLinkWhyKey(undefined), 'ghinWhyOther');
});

// ---- A scoring record ----

const score = (date, n, over = {}) => ({ date, score: n, used: false, diff: n - 72, course: 'Chinggis Khaan Golf Club', tee: 'Blue', rating: 71.2, slope: 128, holes: 18, type: 'H', ...over });
const RECORD = {
  number: '12345678', env: 'staging', syncedAt: NOW, visibility: 'everyone',
  revision: [score('2026-11-01', 88, { used: true }), score('2026-10-20', 94), score('2026-10-02', 85, { used: true })],
  recent: [score('2026-11-14', 90, { used: true })],
};

test('ghinScoreRows: the scores posted since first, then the revision\'s — only those count', () => {
  const rows = ghinScoreRows(RECORD);
  assert.deepEqual(rows.map(r => [r.date, r.pending, r.used]), [
    ['2026-11-14', true, false],      // not in the index yet, whatever it says of itself
    ['2026-11-01', false, true], ['2026-10-20', false, false], ['2026-10-02', false, true],
  ]);
  assert.equal(rows[1].course, 'Chinggis Khaan Golf Club');
  assert.deepEqual(ghinScoreCounts(RECORD), { revision: 3, used: 2, pending: 1 });
});

test('ghinScoreRows: a record as a database gives it back, or none', () => {
  // A list comes back as an object when it has gaps; an empty one not at all.
  const asObject = { revision: { 0: score('2026-11-01', 88, { used: true }), 2: score('2026-10-02', 85) } };
  assert.deepEqual(ghinScoreRows(asObject).map(r => r.score), [88, 85]);
  assert.deepEqual(ghinScoreCounts(asObject), { revision: 2, used: 1, pending: 0 });
  for (const none of [null, undefined, {}, { revision: null, recent: 'x' }, { revision: [null, 'x', {}, { date: '2026-11-01' }, { score: 80 }] }]) {
    assert.deepEqual(ghinScoreRows(none), []);
    assert.deepEqual(ghinScoreCounts(none), { revision: 0, used: 0, pending: 0 });
  }
  // `used` is only what was stored as true.
  assert.equal(ghinScoreRows({ revision: [score('2026-11-01', 88, { used: 'yes' })] })[0].used, false);
});

test('ghinDiffText: one decimal, nothing when GHIN gave none', () => {
  assert.equal(ghinDiffText(15.4), '15.4');
  assert.equal(ghinDiffText(8), '8.0');
  assert.equal(ghinDiffText(-1.25), '-1.3');
  assert.equal(ghinDiffText(0), '0.0');
  for (const none of [null, undefined, '', '12.3', NaN]) assert.equal(ghinDiffText(none), '');
});

test('ghinAdjustText: by how much GHIN adjusted a differential', () => {
  assert.equal(ghinAdjustText({ diff: 7.4, rawDiff: 8.4 }), '−1.0');
  assert.equal(ghinAdjustText({ diff: 2.6, rawDiff: 3.6 }), '−1.0', 'not −1.0000000000000004');
  assert.equal(ghinAdjustText({ diff: 9.5, rawDiff: 8.5 }), '+1.0');
  assert.equal(ghinAdjustText({ diff: 6.4, rawDiff: 8.4 }), '−2.0');
  for (const none of [{ diff: 8.4 }, { diff: 8.4, rawDiff: 8.4 }, { diff: 0.3, rawDiff: 0.1 + 0.2 }, { rawDiff: 8.4 }, { diff: '7.4', rawDiff: 8.4 }, {}, null]) assert.equal(ghinAdjustText(none), '');
});

// The page's helpers, as plain stand-ins.
const H = {
  t: (k) => ({ ghinScoresSub: 'best {used} of {n}', ghinScoresWaiting: '{n} waiting', ghinScoresAll: 'all ({n})', ghinStagingShort: 'trial', ghinScoresNone: 'no scores' }[k] || k),
  esc: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  icon: (name) => `<i-${name}>`,
};
const rowsOf = (html) => html.split('<div class="gs-row').slice(1);

test('ghinScoresHTML: the list, the scores that count marked, the first five shown', () => {
  const many = { ...RECORD, revision: Array.from({ length: 20 }, (_, i) => score(`2026-10-${String(28 - i).padStart(2, '0')}`, 80 + i, { used: i < 8 })) };
  const html = ghinScoresHTML(many, H);
  const rows = rowsOf(html);
  assert.equal(rows.length, 21);
  assert.match(html, /GHIN · trial · best 8 of 20 1 waiting/);
  assert.equal(rows.filter(r => r.startsWith(' used')).length, 8);
  assert.equal(rows.filter(r => r.includes('<i-star>')).length, 8);
  assert.match(rows[0], /^ pending"/);
  assert.match(rows[0], /ghinScoresPending/);
  assert.equal(rows.filter(r => / hidden data-more>/.test(r.split('\n')[0])).length, 16, 'five shown, the rest behind the button');
  assert.match(html, /class="gs-more"[^>]*>all \(21\)</);
  // What a row says: the score, where and when, the tee and its rating, the differential.
  assert.match(rows[1], /gs-score">80</);
  assert.match(rows[1], /2026\.10\.28 · Blue · 71\.2\/128 · H/);
  assert.match(rows[1], /<i-star>8\.0</);
});

test('ghinScoresHTML: few scores need no button; production is not marked a trial', () => {
  const html = ghinScoresHTML({ ...RECORD, env: 'production', recent: [] }, H);
  assert.equal(rowsOf(html).length, 3);
  assert.equal(html.includes('gs-more'), false);
  assert.match(html, /<div class="gs-sub">GHIN · best 2 of 3<\/div>/);
});

test('ghinScoresHTML: what marks a score out — nine holes, the day\'s conditions, no differential', () => {
  const html = ghinScoresHTML({ revision: [score('2026-11-01', 44, { holes: 9, pcc: 1, type: 'C', diff: undefined }), score('2026-10-01', 90, { pcc: -1, tee: '', rating: null })] }, H);
  const [nine, plain] = rowsOf(html);
  assert.match(nine, /2026\.11\.01 · Blue · 71\.2\/128 · ghinScores9 · C · PCC \+1/);
  assert.match(nine, /gs-diff" title="">—</);
  assert.match(plain, /2026\.10\.01 · H · PCC -1/);
});

test('ghinScoresHTML: an exceptional score, a penalty score, an adjusted differential', () => {
  const html = ghinScoresHTML({ revision: [
    score('2026-11-11', 73, { diff: 2.6, rawDiff: 3.6, exceptional: true, used: true }),
    score('2026-11-10', 82, { diff: 11.2, rawDiff: 12.2 }),
    score('2026-11-09', 90, { diff: 18.0, penalty: true }),
  ] }, H);
  const [best, plain, pen] = rowsOf(html);
  assert.match(best, /<span class="gs-tag" title="ghinScoresExceptional">E<\/span>/);
  assert.match(best, /<i-star>2\.6<\/div>\s*<div class="gs-adj" title="ghinScoresAdjusted">−1\.0<\/div>/);
  assert.equal(plain.includes('gs-tag'), false);
  assert.match(plain, /class="gs-adj"[^>]*>−1\.0</);
  assert.match(pen, /<span class="gs-tag" title="ghinScoresPenalty">P<\/span>/);
  assert.equal(pen.includes('gs-adj'), false);
});

test('ghinScoresHTML: no scores — GHIN\'s own words when it gave any; nothing of GHIN\'s is markup', () => {
  assert.match(ghinScoresHTML({ revision: [], recent: [] }, H), /<div class="gs-empty">no scores<\/div>/);
  assert.match(ghinScoresHTML(null, H), /no scores/);
  assert.match(ghinScoresHTML({ message: 'Private <b>record</b>' }, H), /<div class="gs-empty">Private &lt;b&gt;record&lt;\/b&gt;<\/div>/);
  // Scores the server kept back: why — unless GHIN itself said something.
  assert.match(ghinScoresHTML({ revision: [], recent: [], withheld: true }, H), /<div class="gs-empty">ghinScoresUnproven<\/div>/);
  assert.match(ghinScoresHTML({ withheld: true, message: 'Private' }, H), /<div class="gs-empty">Private<\/div>/);
  assert.match(ghinScoresHTML({ withheld: 'true' }, H), /no scores/);
  const html = ghinScoresHTML({ revision: [score('2026-11-01', 88, { course: '<img src=x onerror=alert(1)>', tee: '"><script>', type: '<i>' })] }, H);
  assert.equal(/<img|<script|<i>/.test(html), false);
});

// ---- The home screen: a line under the greeting, a board above «Eagle · Birdie» ----

const HI = found('12345678', { hi: '10.2', lowHi: '9.7', revDate: '2026-11-15' });
const TWENTY = { ...RECORD, recent: [], revision: Array.from({ length: 20 }, (_, i) => score(`2026-10-${String(28 - i).padStart(2, '0')}`, 80 + i, { used: i < 8, diff: 8.4 + i })) };
const NEW = { ...TWENTY, recent: [score('2026-11-14', 76, { diff: 6.5, used: true })] };
const cellsOf = (html) => html.split('<span class="gb-cell').slice(1);
// The strip's items as 'label value'.
const itemsOf = (html) => [...html.matchAll(/<span class="ghs-l">(.*?)<\/span><span class="ghs-v">(.*?)<\/span>/g)].map(m => `${m[1]} ${m[2]}`);

test('ghinHomeStripHTML: one line — the index, the low index, the latest score — leading down to the board', () => {
  const html = ghinHomeStripHTML(HI, TWENTY, H);
  assert.deepEqual(itemsOf(html), ['H.I 10.2', 'ghinLowHi 9.7', 'ghinLastScore 80']);
  assert.match(html, /<a class="ghin-strip" href="#\/profile" data-ghin-board>/);
  assert.match(html, /<i-next>/);
  // The latest score is the one posted since, when there is one.
  assert.deepEqual(itemsOf(ghinHomeStripHTML(HI, NEW, H))[2], 'ghinLastScore 76');
  // Room for the three numbers and no more: no trial mark, no tag.
  assert.equal(/trial|gs-tag|ghinScoresPending/.test(ghinHomeStripHTML(HI, NEW, H)), false);
});

test('ghinHomeStripHTML: either part alone — with no board to lead to, it leads to the full list; with neither, nothing', () => {
  // The index, the scores not read yet (or none, or kept back): two items, and the list.
  for (const sc of [null, undefined, { revision: [], recent: [] }, { revision: [], recent: [], withheld: true }]) {
    const html = ghinHomeStripHTML(HI, sc, H);
    assert.deepEqual(itemsOf(html), ['H.I 10.2', 'ghinLowHi 9.7']);
    assert.match(html, /href="#\/profile" data-ghin-all>/);
  }
  // Only a score posted since, no revision yet: it is the latest score, and there is still no board.
  const fresh = ghinHomeStripHTML(HI, { revision: [], recent: [score('2026-11-14', 76)] }, H);
  assert.deepEqual([itemsOf(fresh)[2], fresh.includes('data-ghin-all'), fresh.includes('data-ghin-board')], ['ghinLastScore 76', true, false]);
  // Scores and no index record (GHIN has no golfer under the number), or one with no low index: dashes.
  for (const none of [null, undefined, { number: '12345678', found: false, env: 'staging' }]) {
    assert.deepEqual(itemsOf(ghinHomeStripHTML(none, TWENTY, H)).slice(0, 2), ['H.I —', 'ghinLowHi —']);
  }
  assert.equal(itemsOf(ghinHomeStripHTML({ ...HI, lowHi: null }, TWENTY, H))[1], 'ghinLowHi —');
  // Neither: no line.
  for (const [hi, sc] of [[null, null], [undefined, undefined], [{ found: false }, null], [null, { revision: [], recent: [] }], [{ found: false }, { withheld: true }]]) {
    assert.equal(ghinHomeStripHTML(hi, sc, H), '');
  }
});

test('ghinHomeBoardHTML: the twenty on a board — day, score, differential — the counted ones filled in', () => {
  const html = ghinHomeBoardHTML(HI, TWENTY, H);
  const cells = cellsOf(html);
  assert.equal(cells.length, 20);
  assert.equal(cells.filter(c => c.startsWith(' used"')).length, 8);
  assert.match(cells[0], /gb-d">10\.28<[\s\S]*gb-s">80<[\s\S]*gb-x">8\.4</);
  assert.match(cells[0], /title="2026\.10\.28 · Chinggis Khaan Golf Club · Blue · ghinScoresUsed"/);
  assert.match(cells[19], /^" title="2026\.10\.09 · Chinggis Khaan Golf Club · Blue">/);
  // Its head: the title and the way to the full list; then the index it is the making of.
  assert.match(html, /<h2>ghinScoresTitle<\/h2>\s*<a href="#\/profile" class="view-all" data-ghin-all>/);
  assert.match(html, /hole-course-name">H\.I 10\.2 · trial</);
  assert.match(html, /hole-course-sub">ghinBoardSub</);
  assert.match(html, /<a class="gs-board" href="#\/profile" data-ghin-all>/);
  assert.equal(html.split('data-ghin-all').length - 1, 2);
  // Production is not marked a trial; no index record is a dash.
  assert.match(ghinHomeBoardHTML({ ...HI, env: 'production' }, { ...TWENTY, env: 'production' }, H), /hole-course-name">H\.I 10\.2</);
  assert.match(ghinHomeBoardHTML(null, { ...TWENTY, env: 'production' }, H), /hole-course-name">H\.I —</);
  // No differential on a score: a dash in its cell.
  assert.match(cellsOf(ghinHomeBoardHTML(HI, { revision: [score('2026-11-01', 88, { diff: undefined })] }, H))[0], /gb-x">—</);
});

test('ghinHomeBoardHTML: a score posted since is not on the board — it is counted in its heading', () => {
  const h = { ...H, t: (k) => ({ ghinBoardSub: '{n} scores · {used} counted', ghinScoresPending: 'new', ghinStagingShort: 'trial' }[k] || k) };
  const html = ghinHomeBoardHTML(HI, NEW, h);
  assert.equal(cellsOf(html).length, 20);
  assert.equal(html.includes('gb-s">76<'), false);
  assert.match(html, /hole-course-sub">20 scores · 8 counted · \+1 new</);
  assert.match(ghinHomeBoardHTML(HI, TWENTY, h), /hole-course-sub">20 scores · 8 counted</);
});

test('ghinHomeBoardHTML: no scores in the revision — no board', () => {
  for (const sc of [null, undefined, {}, { revision: [], recent: [] }, { revision: [], recent: [], withheld: true }, { message: 'Private' }, { revision: [], recent: [score('2026-11-14', 76)] }]) {
    assert.equal(ghinHomeBoardHTML(HI, sc, H), '');
  }
});

test('the home screen: nothing of GHIN\'s is markup', () => {
  const hi = { ...HI, hi: '<b>1</b>', lowHi: '"><i>', revDate: '<u>' };
  const sc = { revision: [score('2026-11-01', 88, { course: '<img src=x onerror=alert(1)>', tee: '"><script>' })] };
  for (const html of [ghinHomeStripHTML(hi, sc, H), ghinHomeBoardHTML(hi, sc, H)]) {
    assert.ok(html.length > 0);
    assert.equal(/<b>|<i>|<u>|<img|<script/.test(html), false);
  }
});

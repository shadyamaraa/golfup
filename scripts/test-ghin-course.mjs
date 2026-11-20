// scripts/test-ghin-course.mjs
// The app's course list against the course as GHIN keeps it
// (src/ghin-course.js): which GHIN tee set stands for an app tee, and what
// differs — a rating, a slope, a par, a stroke index, a tee GHIN lacks.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { teeWanted, matchTee, courseDiff } from '../src/ghin-course.js';
import { COURSE_DATA } from '../src/courses.js';

const PARS = { 1: 5, 2: 4, 3: 4, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 4, 10: 4, 11: 4, 12: 5, 13: 3, 14: 4, 15: 4, 16: 4, 17: 3, 18: 5 };
const SI = { 1: 5, 2: 3, 3: 9, 4: 11, 5: 7, 6: 15, 7: 13, 8: 17, 9: 1, 10: 18, 11: 10, 12: 2, 13: 12, 14: 16, 15: 4, 16: 6, 17: 14, 18: 8 };
const APP = { key: 'sky', par: 72, pars: PARS, si: SI, tees: { blue: { rating: 71.5, slope: 130 }, white: { rating: 69.4, slope: 128 }, goldLadies: { rating: 72.8, slope: 134 }, red: { rating: 69.1, slope: 122 } } };
const tee = (id, name, gender, rating, slope, over = {}) => ({ id: String(id), name, gender, rating, slope, par: 72, pars: { ...PARS }, si: { ...SI }, lengths: {}, ...over });
const GHIN = { id: '30111', name: 'Mt. Bogd Golf & Country Club', tees: [
  tee(1, 'BLUE TEE', 'M', 71.4, 131), tee(2, 'WHITE TEE', 'M', 69.4, 127), tee(3, 'GOLD TEE', 'M', 67.1, 121),
  tee(4, 'GOLD TEE', 'F', 72.8, 134), tee(5, 'RED TEE', 'F', 69.1, 122),
] };

test('teeWanted: an app tee is a men\'s tee of its colour — but for the ones rated for women', () => {
  assert.deepEqual(teeWanted('blue'), { word: 'blue', gender: 'M' });
  assert.deepEqual(teeWanted('gold'), { word: 'gold', gender: 'M' });
  assert.deepEqual(teeWanted('goldLadies'), { word: 'gold', gender: 'F' });
  assert.deepEqual(teeWanted('red'), { word: 'red', gender: 'F' });
  assert.deepEqual(teeWanted('lady'), { word: 'lady', gender: 'F' });
  assert.deepEqual(teeWanted('Black'), { word: 'black', gender: 'M' });
  assert.deepEqual(teeWanted(null), { word: '', gender: 'M' });
  // Every tee of the app's own list has a colour to look for.
  for (const c of Object.values(COURSE_DATA)) for (const key of Object.keys(c.tees)) assert.ok(teeWanted(key).word.length >= 3, key);
});

test('matchTee: the colour in the name, rated for that gender — a rating is not carried across', () => {
  assert.equal(matchTee('blue', GHIN.tees).id, '1');
  assert.equal(matchTee('gold', GHIN.tees).id, '3');
  assert.equal(matchTee('goldLadies', GHIN.tees).id, '4');
  assert.equal(matchTee('red', GHIN.tees).id, '5');
  assert.equal(matchTee('black', GHIN.tees), null, 'GHIN has no black tee');
  assert.equal(matchTee('red', [tee(9, 'Red', 'M', 63, 110)]), null, 'red rated for men only');
  assert.equal(matchTee('white', [tee(9, 'white (men)', 'M', 69, 119)]).id, '9', 'however the name is cased');
  for (const none of [[], null, undefined, [null, {}]]) assert.equal(matchTee('blue', none), null);
  assert.equal(matchTee('', GHIN.tees), null);
});

test('courseDiff: each tee against its GHIN tee set', () => {
  const d = courseDiff(APP, GHIN);
  assert.deepEqual(d.tees, [
    { key: 'blue', app: { rating: 71.5, slope: 130 }, ghin: { id: '1', name: 'BLUE TEE', gender: 'M', rating: 71.4, slope: 131, par: 72 }, same: false },
    { key: 'white', app: { rating: 69.4, slope: 128 }, ghin: { id: '2', name: 'WHITE TEE', gender: 'M', rating: 69.4, slope: 127, par: 72 }, same: false },
    { key: 'goldLadies', app: { rating: 72.8, slope: 134 }, ghin: { id: '4', name: 'GOLD TEE', gender: 'F', rating: 72.8, slope: 134, par: 72 }, same: true },
    { key: 'red', app: { rating: 69.1, slope: 122 }, ghin: { id: '5', name: 'RED TEE', gender: 'F', rating: 69.1, slope: 122, par: 72 }, same: true },
  ]);
  assert.deepEqual(d.unmatched, [{ id: '3', name: 'GOLD TEE', gender: 'M', rating: 67.1, slope: 121, par: 72 }]);
  assert.deepEqual([d.holes, d.par, d.agrees], [[], { app: 72, ghin: [72] }, false]);
});

test('courseDiff: agrees only when every tee is on GHIN with the same numbers and the card is the same', () => {
  const same = { ...APP, tees: { blue: { rating: 71.4, slope: 131 }, white: { rating: 69.4, slope: 127 }, goldLadies: APP.tees.goldLadies, red: APP.tees.red } };
  assert.equal(courseDiff(same, GHIN).agrees, true);
  // The slope alone, the rating alone.
  assert.equal(courseDiff({ ...same, tees: { ...same.tees, blue: { rating: 71.4, slope: 130 } } }, GHIN).agrees, false);
  assert.equal(courseDiff({ ...same, tees: { ...same.tees, blue: { rating: 71.5, slope: 131 } } }, GHIN).agrees, false);
  // A tee GHIN has no rating for.
  const lacking = courseDiff({ ...same, tees: { ...same.tees, black: { rating: 73.8, slope: 132 } } }, GHIN);
  assert.deepEqual([lacking.tees.at(-1).ghin, lacking.tees.at(-1).same, lacking.agrees], [null, false, false]);
  // One hole's stroke index, on a card the tees otherwise agree with.
  const hole = courseDiff({ ...same, si: { ...SI, 3: 7, 5: 9 } }, GHIN);
  assert.deepEqual([hole.tees.every(t => t.same), hole.holes.length > 0, hole.agrees], [true, true, false]);
  // Another par.
  const par = courseDiff({ ...same, par: 71 }, GHIN);
  assert.deepEqual([par.par, par.agrees], [{ app: 71, ghin: [72] }, false]);
  // GHIN not read, or with no tee sets: nothing agrees.
  for (const none of [null, undefined, {}, { tees: [] }]) {
    const d = courseDiff(same, none);
    assert.deepEqual([d.tees.every(t => t.ghin === null), d.unmatched, d.holes, d.par.ghin, d.agrees], [true, [], [], [], false]);
  }
  assert.deepEqual(courseDiff(null, GHIN).tees, []);
});

test('courseDiff: holes whose par or stroke index differ — men and women apart, each different card once', () => {
  const ladies = { pars: { ...PARS, 9: 5 }, si: { ...SI } };
  const whiteCard = { pars: { ...PARS }, si: { ...SI, 3: 7, 5: 9 } };
  const g = { ...GHIN, tees: [tee(1, 'BLUE TEE', 'M', 71.4, 131), tee(2, 'WHITE TEE', 'M', 69.4, 127, whiteCard), tee(4, 'GOLD TEE', 'F', 72.8, 134, ladies), tee(5, 'RED TEE', 'F', 69.1, 122, ladies)] };
  const d = courseDiff(APP, g);
  assert.deepEqual(d.holes, [
    { gender: 'M', hole: 3, si: [9, 7], tees: ['WHITE TEE'] },
    { gender: 'M', hole: 5, si: [7, 9], tees: ['WHITE TEE'] },
    { gender: 'F', hole: 9, par: [4, 5] },          // both women's tee sets share the card: said once, unnamed
  ]);
  assert.equal(d.agrees, false);
  // Par and stroke index on the same hole are one row.
  const both = courseDiff(APP, { tees: [tee(1, 'BLUE TEE', 'M', 71.5, 130, { pars: { ...PARS, 1: 4 }, si: { ...SI, 1: 6 } })] });
  assert.deepEqual(both.holes, [{ gender: 'M', hole: 1, par: [5, 4], si: [5, 6] }]);
  // A hole GHIN has no par for, or the app none, is not a difference; nor is a tee set with no holes.
  const gaps = courseDiff({ ...APP, pars: { ...PARS, 2: undefined } }, { tees: [tee(1, 'BLUE TEE', 'M', 71.5, 130, { pars: { 1: 5, 2: 3 }, si: {} }), tee(2, 'WHITE TEE', 'M', 69.4, 128, { pars: {}, si: {} })] });
  assert.deepEqual(gaps.holes, []);
});

// What GHIN had for the app's two courses — read with scripts/ghin-courses.mjs
// against staging, 2026-11-20. Pars and stroke indexes were the app's own on
// every tee set, so the app's card stands in for GHIN's here.
const ghinTee = (id, name, gender, rating, slope, card) => ({ id: String(id), name, gender, rating, slope, par: 72, pars: { ...card.pars }, si: { ...card.si }, lengths: {} });
const SKY = COURSE_DATA['Sky Resort Golf Club'];
const CK = COURSE_DATA['Chinggis Khaan Golf Course'];
const ON_GHIN = {
  sky: { id: '29423', name: 'Mt. Bogd Golf & Country Club', tees: [
    ghinTee(443315, 'BLACK TEE - MALE', 'M', 73.8, 132, SKY), ghinTee(443352, 'BLUE TEE - MALE', 'M', 71.4, 131, SKY),
    ghinTee(443353, 'WHITE TEE - MALE', 'M', 69.4, 127, SKY), ghinTee(443354, 'GOLD TEE - MALE', 'M', 67, 121, SKY),
    ghinTee(443357, 'RED TEE - MALE', 'M', 64.3, 111, SKY), ghinTee(443360, 'BLUE TEE - FEMALE', 'F', 78.6, 143, SKY),
    ghinTee(443361, 'WHITE TEE - FEMALE', 'F', 75.8, 138, SKY), ghinTee(443362, 'GOLD TEE - FEMALE', 'F', 72.8, 134, SKY),
    ghinTee(443363, 'RED TEE - FEMALE', 'F', 69.1, 122, SKY),
  ] },
  chinggis: { id: '29422', name: 'Chinggis Khaan Golf Course', tees: [
    ghinTee(443285, 'WHITE - FEMALE', 'F', 75.2, 133, CK), ghinTee(443286, 'RED - FEMALE', 'F', 71.2, 127, CK),
    ghinTee(443288, 'WHITE - MALE', 'M', 69.2, 119, CK), ghinTee(443289, 'RED - MALE', 'M', 66.1, 108, CK),
  ] },
};

test('the app\'s courses agree with GHIN: every tee\'s rating and slope, and the ids a posted score names', () => {
  for (const [name, app] of Object.entries(COURSE_DATA)) {
    const ghin = ON_GHIN[app.key];
    assert.ok(ghin, `${name}: what GHIN has is not held here — read it with scripts/ghin-courses.mjs`);
    assert.equal(app.ghinCourseId, ghin.id, name);
    const d = courseDiff(app, ghin);
    assert.equal(d.agrees, true, name);
    for (const t of d.tees) {
      assert.equal(t.same, true, `${name} ${t.key}: app ${t.app.rating}/${t.app.slope}, GHIN ${t.ghin?.rating}/${t.ghin?.slope}`);
      assert.equal(app.tees[t.key].ghinTeeSetId, t.ghin.id, `${name} ${t.key}`);
    }
  }
  // The tee sets GHIN rates that the app does not offer yet.
  assert.deepEqual(courseDiff(SKY, ON_GHIN.sky).unmatched.map(t => `${t.name} ${t.rating}/${t.slope}`),
    ['RED TEE - MALE 64.3/111', 'BLUE TEE - FEMALE 78.6/143', 'WHITE TEE - FEMALE 75.8/138']);
  assert.deepEqual(courseDiff(CK, ON_GHIN.chinggis).unmatched.map(t => `${t.name} ${t.rating}/${t.slope}`),
    ['WHITE - FEMALE 75.2/133', 'RED - MALE 66.1/108']);
});

test('the app\'s own courses are of the shape compared', () => {
  for (const [name, c] of Object.entries(COURSE_DATA)) {
    const d = courseDiff(c, { tees: [] });
    assert.equal(d.tees.length, Object.keys(c.tees).length, name);
    assert.equal(d.par.app, c.par);
  }
});

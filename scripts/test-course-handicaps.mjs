// scripts/test-course-handicaps.mjs
// A member's Course Handicap from each tee (src/course-handicaps.js): the
// strokes their Handicap Index is worth there, the tees rated for them, and
// the profile's block.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { courseHandicaps, strokesText, courseHandicapsHTML } from '../src/course-handicaps.js';
import { COURSE_DATA } from '../src/courses.js';

// Course Handicap = Handicap Index × Slope ÷ 113 + (Course Rating − Par), to a whole stroke.
const strokes = (index, rating, slope, par = 72) => Math.round(index * slope / 113 + (rating - par));
const flat = (list) => list.map(c => [c.key, c.tees.map(t => `${t.label} ${t.strokes}`)]);

test('courseHandicaps: the index on every tee rated for a man', () => {
  const list = courseHandicaps(10.8, 'male');
  assert.deepEqual(flat(list), [
    ['sky', ['Black 14', 'Blue 12', 'White 10', 'Gold 7', 'Red 3']],
    ['chinggis', ['White 9', 'Red 4']],
  ]);
  // Each is the formula, from that tee's own rating and slope.
  const blue = list[0].tees.find(t => t.key === 'blue');
  assert.deepEqual([blue.rating, blue.slope, blue.strokes], [71.4, 131, strokes(10.8, 71.4, 131)]);
  assert.deepEqual([list[0].name, list[0].par, list[1].name], ['Sky Resort Golf Club', 72, 'Chinggis Khaan Golf Course']);
  for (const c of list) for (const t of c.tees) assert.equal(t.strokes, strokes(10.8, t.rating, t.slope, c.par), `${c.key} ${t.key}`);
});

test('courseHandicaps: a woman is shown the tees rated for women — the same colour is another number', () => {
  const list = courseHandicaps(24.3, 'female');
  assert.deepEqual(flat(list), [
    ['sky', ['Blue (L) 37', 'White (L) 33', 'Gold (L) 30', 'Red (L) 23']],
    ['chinggis', ['White (L) 32', 'Red (L) 27']],
  ]);
  const men = courseHandicaps(24.3, 'male')[0].tees.find(t => t.key === 'white').strokes;
  const women = list[0].tees.find(t => t.key === 'whiteLadies').strokes;
  assert.deepEqual([men, women], [strokes(24.3, 69.4, 127), strokes(24.3, 75.8, 138)]);
  assert.notEqual(men, women);
});

test('courseHandicaps: with no gender known, every tee', () => {
  for (const g of ['', undefined, null, 'other']) {
    const list = courseHandicaps(10.8, g);
    assert.deepEqual(list.map(c => c.tees.length), Object.values(COURSE_DATA).map(c => Object.keys(c.tees).length), String(g));
  }
});

test('courseHandicaps: a plus handicap, scratch, the highest index — and no index at all', () => {
  assert.deepEqual(flat(courseHandicaps(-1.5, 'male'))[0][1], ['Black 0', 'Blue -2', 'White -4', 'Gold -7', 'Red -9']);
  assert.equal(courseHandicaps(0, 'male')[0].tees[0].strokes, strokes(0, 73.8, 132), 'scratch is an index, not a missing one');
  assert.equal(courseHandicaps(54, 'male')[0].tees[0].strokes, strokes(54, 73.8, 132));
  for (const none of [null, undefined, NaN, Infinity, '10.8', {}]) assert.deepEqual(courseHandicaps(none, 'male'), []);
});

test('strokesText: as it is written — a plus for one below zero', () => {
  assert.equal(strokesText(12), '12');
  assert.equal(strokesText(0), '0');
  assert.equal(strokesText(-2), '+2');
  for (const none of [null, undefined, NaN, '3']) assert.equal(strokesText(none), '—');
});

const H = {
  t: (k) => ({ ghinChSub: 'off GHIN H.I {hi}', ghinStagingShort: 'trial', ghinChLegend: 'the formula' }[k] || k),
  esc: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};
const HI = { number: '12345678', found: true, hi: '10.8', hiValue: 10.8, env: 'staging' };
const cellsOf = (html) => [...html.matchAll(/<span class="ch-t">(.*?)<\/span>\s*<span class="ch-n">(.*?)<\/span>\s*<span class="ch-r">(.*?)<\/span>/g)].map(m => `${m[1]} ${m[2]} ${m[3]}`);

test('courseHandicapsHTML: each course, a cell for each tee — its name, the strokes, its rating and slope', () => {
  const html = courseHandicapsHTML(HI, 'male', H);
  assert.deepEqual(cellsOf(html), [
    'Black 14 73.8/132', 'Blue 12 71.4/131', 'White 10 69.4/127', 'Gold 7 67/121', 'Red 3 64.3/111',
    'White 9 69.2/119', 'Red 4 66.1/108',
  ]);
  assert.match(html, /<div class="gs-sub">off GHIN H\.I 10\.8 · trial<\/div>/);
  assert.deepEqual([...html.matchAll(/hole-course-name">(.*?)</g)].map(m => m[1]), ['Sky Resort Golf Club', 'Chinggis Khaan Golf Course']);
  assert.equal(html.split('PAR 72').length - 1, 2);
  assert.match(html, /hole-legend">the formula</);
  // Production is not marked a trial; a plus handicap reads with its plus, as GHIN writes the index.
  const plus = courseHandicapsHTML({ ...HI, hi: '+1.5', hiValue: -1.5, env: 'production' }, 'male', H);
  assert.match(plus, /<div class="gs-sub">off GHIN H\.I \+1\.5<\/div>/);
  assert.deepEqual(cellsOf(plus).slice(0, 3), ['Black 0 73.8/132', 'Blue +2 71.4/131', 'White +4 69.4/127']);
});

test('courseHandicapsHTML: no index to work from — no block', () => {
  for (const hi of [null, undefined, {}, { found: false, hiValue: 10.8 }, { found: true, hi: 'NH' }, { found: true, hi: 'NH', hiValue: null }, { found: true, hi: '10.8', hiValue: '10.8' }]) {
    assert.equal(courseHandicapsHTML(hi, 'male', H), '');
  }
  // Nothing of GHIN's is markup.
  assert.equal(/<b>/.test(courseHandicapsHTML({ ...HI, hi: '<b>1</b>' }, 'male', H)), false);
});

// scripts/test-course-map.mjs
// The course map on the scorer (src/course-map.js): who is shown the 2D/3D
// buttons, which courses have a map, and the address a hole opens at — the
// hole on the ground, not the scorer's count of it.
// Run with: npm run test:mp

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { COURSE_MAP_STAGE, courseMapVisibleTo, courseMapUrl, courseMapButtonsHTML } = await import('../src/course-map.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const ADMIN = { id: 'a', role: 'admin' };
const MEMBER = { id: 'm', role: 'member' };
const SKY = { id: 'g1', location: 'Sky Resort Golf Club' };
const MAP = 'https://course.ubgolf.club/';

test('the stage is one of the three the switch knows', () => {
  assert.ok(['admin', 'all', 'off'].includes(COURSE_MAP_STAGE));
});

test('courseMapVisibleTo: off → no one, admin → admins, all → anyone signed in', () => {
  assert.equal(courseMapVisibleTo('off', ADMIN), false);
  assert.equal(courseMapVisibleTo('admin', ADMIN), true);
  assert.equal(courseMapVisibleTo('admin', MEMBER), false);
  assert.equal(courseMapVisibleTo('all', MEMBER), true);
  assert.equal(courseMapVisibleTo('all', null), false);
  assert.equal(courseMapVisibleTo('nonsense', ADMIN), false, 'an unknown stage shows nothing');
});

test('courseMapUrl: the hole and the view, on the course\'s own map', () => {
  assert.equal(courseMapUrl(SKY, 7, '2d'), `${MAP}?hole=7&view=2d`);
  assert.equal(courseMapUrl(SKY, 7, '3d'), `${MAP}?hole=7&view=3d`);
  assert.equal(courseMapUrl(SKY, '12', '3d'), `${MAP}?hole=12&view=3d`, 'a hole read off a data- attribute');
  assert.equal(courseMapUrl({ location: 'sky' }, 1, '2d'), `${MAP}?hole=1&view=2d`, 'the course by its key');
});

test('courseMapUrl: a back nine opens the hole on the ground', () => {
  const back = { ...SKY, holes: 'back9' };
  assert.equal(courseMapUrl(back, 1, '2d'), `${MAP}?hole=10&view=2d`);
  assert.equal(courseMapUrl(back, 9, '3d'), `${MAP}?hole=18&view=3d`);
  assert.equal(courseMapUrl(back, 10, '2d'), null, 'there is no 19th');
});

test('courseMapUrl: nothing to open → null, never a half-built address', () => {
  assert.equal(courseMapUrl({ location: 'Somewhere Else GC' }, 3, '2d'), null, 'a course without a map');
  assert.equal(courseMapUrl({}, 3, '2d'), null);
  assert.equal(courseMapUrl(null, 3, '2d'), null);
  for (const hole of [0, 19, -1, 2.5, 'x', null, undefined]) assert.equal(courseMapUrl(SKY, hole, '2d'), null, String(hole));
  assert.equal(courseMapUrl(SKY, 3, '2d', 'not a url'), null);
});

test('courseMapUrl: the view is 2d or 3d and nothing else reaches the address', () => {
  assert.equal(courseMapUrl(SKY, 3, 'x&evil=1'), `${MAP}?hole=3&view=2d`);
  assert.equal(courseMapUrl(SKY, 3, undefined), `${MAP}?hole=3&view=2d`);
});

test('courseMapButtonsHTML: two buttons for a course with a map, to those the stage lets in', () => {
  const html = courseMapButtonsHTML(SKY, ADMIN, 'admin');
  assert.match(html, /data-gs="map" data-view="2d"/);
  assert.match(html, /data-gs="map" data-view="3d"/);
  assert.match(html, /role="group" aria-label="Hole map"/);
  assert.equal(courseMapButtonsHTML(SKY, MEMBER, 'admin'), '');
  assert.match(courseMapButtonsHTML(SKY, MEMBER, 'all'), /data-view="3d"/);
  assert.equal(courseMapButtonsHTML(SKY, ADMIN, 'off'), '');
  assert.equal(courseMapButtonsHTML({ location: 'Somewhere Else GC' }, ADMIN, 'all'), '', 'no map, no buttons');
  assert.equal(courseMapButtonsHTML(SKY, null, 'all'), '');
});

test('a developer\'s own map is used on localhost only', () => {
  localStorage.setItem('courseMapUrl', 'http://localhost:8000/');
  try {
    globalThis.location = { hostname: 'ubgolf.club' };
    assert.equal(courseMapUrl(SKY, 4, '2d'), `${MAP}?hole=4&view=2d`, 'a published build ignores the override');
    globalThis.location = { hostname: 'localhost' };
    assert.equal(courseMapUrl(SKY, 4, '2d'), 'http://localhost:8000/?hole=4&view=2d');
    assert.equal(courseMapUrl({ location: 'Somewhere Else GC' }, 4, '2d'), null, 'the override gives no map to a course without one');
    localStorage.removeItem('courseMapUrl');
    assert.equal(courseMapUrl(SKY, 4, '2d'), `${MAP}?hole=4&view=2d`, 'localhost with nothing set: the published map');
  } finally {
    localStorage.removeItem('courseMapUrl');
    delete globalThis.location;
  }
});

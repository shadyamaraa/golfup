// scripts/test-stableford.mjs
// Unit tests for the shared Stableford points engine. Run with: npm run test:mp
// Pure module — no browser, no Firebase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PAR_POINTS, holePoints, roundPoints, strokesOverHoles } from '../src/stableford.js';
import { resolveCourse } from '../src/courses.js';

const SKY = resolveCourse('sky');
const PARS = SKY.pars;
const SIS = SKY.si;

// A card that plays every hole in exactly its par.
const levelPar = () => ({ ...PARS });

test('par is worth two points, and every stroke moves the hole by one', () => {
  assert.equal(PAR_POINTS, 2);
  // par 4: albatross … triple bogey
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(s => holePoints(s, 4)), [5, 4, 3, 2, 1, 0, 0]);
  // The floor holds however bad the hole gets.
  assert.equal(holePoints(15, 4), 0);
  // A par 3 and a par 5 read the same way against their own par.
  assert.equal(holePoints(3, 3), 2);
  assert.equal(holePoints(4, 5), 3);
});

test('a handicap stroke is worth exactly one point on the hole it falls', () => {
  assert.equal(holePoints(5, 4, 0), 1);   // bogey
  assert.equal(holePoints(5, 4, 1), 2);   // net par
  assert.equal(holePoints(5, 4, 2), 3);   // net birdie
});

test('a hole that cannot be scored is null, never zero', () => {
  // Zero is a real Stableford score, so an unplayable hole must not fake one.
  assert.equal(holePoints(null, 4), null);
  assert.equal(holePoints(0, 4), null);
  assert.equal(holePoints(4, null), null);
  assert.equal(holePoints(4, 0), null);
  assert.equal(holePoints('x', 4), null);
});

test('a level-par round scores 36 points gross — the benchmark', () => {
  const r = roundPoints(levelPar(), PARS, SIS, null);
  assert.deepEqual(r, { points: 36, holesIn: 18, parsKnown: true });
});

test('playing to your handicap also scores 36 + your handicap off par', () => {
  // The other half of the benchmark: level par off 10 is 46, off 18 is 54.
  assert.equal(roundPoints(levelPar(), PARS, SIS, 10).points, 46);
  assert.equal(roundPoints(levelPar(), PARS, SIS, 18).points, 54);
  // Every hole gets a stroke at 18, so every hole is a net birdie.
  assert.equal(roundPoints(levelPar(), PARS, SIS, 36).points, 72);
});

test('strokes land on the lowest stroke indexes', () => {
  // Sky's SI 1..4 are holes 9, 12, 2, 15.
  const holes = [1, 2, 3, 4].map(si => Number(Object.keys(SIS).find(h => SIS[h] === si)));
  assert.deepEqual(holes, [9, 12, 2, 15]);
  const card = levelPar();
  const gross = roundPoints(card, PARS, SIS, null).points;
  // A handicap of 4 turns exactly those four holes into net birdies.
  assert.equal(roundPoints(card, PARS, SIS, 4).points, gross + 4);
});

test('no handicap and no stroke index both simply play gross', () => {
  const card = levelPar();
  assert.equal(roundPoints(card, PARS, SIS, null).points, 36);
  assert.equal(roundPoints(card, PARS, SIS, 0).points, 36);
  // A course with pars but no stroke index cannot allocate, so it plays gross.
  assert.equal(roundPoints(card, PARS, null, 12).points, 36);
  // A plus handicap gives no strokes back — a known limitation, pinned here.
  assert.equal(roundPoints(card, PARS, SIS, -2).points, 36);
});

test('without per-hole pars a round is not Stableford at all', () => {
  const r = roundPoints(levelPar(), null, null, 10);
  assert.equal(r.parsKnown, false);
  assert.equal(r.holesIn, 18);
  // One missing par is enough to poison the round — a total that quietly
  // skipped a hole would read as a real score.
  const partialPars = { ...PARS };
  delete partialPars[7];
  assert.equal(roundPoints(levelPar(), partialPars, SIS, null).parsKnown, false);
});

test('a round in progress has an honest running total', () => {
  // Five holes at par, off no handicap: two points each.
  const five = { 1: PARS[1], 2: PARS[2], 3: PARS[3], 4: PARS[4], 5: PARS[5] };
  assert.deepEqual(roundPoints(five, PARS, SIS, null), { points: 10, holesIn: 5, parsKnown: true });
});

test('cleared and junk holes are ignored, the way RTDB drops them', () => {
  const card = { 1: PARS[1], 2: 0, 3: null, 4: -3, 5: 'x', 6: PARS[6] };
  const r = roundPoints(card, PARS, SIS, null);
  assert.equal(r.holesIn, 2);
  assert.equal(r.points, 4);
});

test('strokesOverHoles counts the allowance over the card being played', () => {
  const all18 = Array.from({ length: 18 }, (_, i) => i + 1);
  assert.equal(strokesOverHoles(all18, SIS, 7), 7);
  assert.equal(strokesOverHoles(all18, SIS, 20), 20);
  assert.equal(strokesOverHoles(all18, SIS, null), 0);
  assert.equal(strokesOverHoles(all18, null, 12), 0);
  // A nine allocates against the 18-hole SI of the holes actually played.
  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(strokesOverHoles(front, SIS, 5), 3);   // SI 5, 3, 1 → holes 1, 2, 9
});

// scripts/test-ranking.mjs
// The ranking upload's ▲/▼ baseline. Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingKey, isRankingCorrection, mergeRankingUpload, rankingMovement } from '../src/ranking.js';

const list = (...names) => names.map((name, i) => ({ rank: i + 1, name, points: String(100 - i) }));
const ranks = (r) => Object.fromEntries(r.entries.map(e => [e.name, e.rank]));
const prevs = (r) => Object.fromEntries(r.entries.map(e => [e.name, e.prevRank ?? null]));

test('rankingKey folds whitespace, case and unicode form', () => {
  assert.equal(rankingKey('  Bat  Dorj '), 'bat dorj');
  assert.equal(rankingKey('BAT DORJ'), rankingKey('bat dorj'));
  assert.equal(rankingKey('Бат Дорж'), 'бат дорж');
  assert.equal(rankingKey(null), '');
});

test('first upload: no baseline, everyone is new', () => {
  const r = mergeRankingUpload(null, list('A', 'B', 'C'), 1000);
  assert.equal(r.updatedAt, 1000);
  assert.equal('previous' in r, false, 'no previous key when there is nothing to compare');
  assert.deepEqual(prevs(r), { A: null, B: null, C: null });
  assert.deepEqual(rankingMovement(r.entries), { up: 0, down: 0, same: 0, fresh: 3 });
  for (const e of r.entries) assert.equal('prevRank' in e, false, 'no undefined-valued keys');
});

test('a real new ranking: baseline becomes the old one, arrows computed from it', () => {
  const first = mergeRankingUpload(null, list('A', 'B', 'C', 'D'), 1000);
  const second = mergeRankingUpload(first, list('B', 'A', 'D', 'E'), 2000);
  assert.equal(second.previous.updatedAt, 1000);
  assert.deepEqual(second.previous.entries.map(e => e.name), ['A', 'B', 'C', 'D']);
  assert.deepEqual(prevs(second), { B: 2, A: 1, D: 4, E: null });
  assert.deepEqual(rankingMovement(second.entries), { up: 2, down: 1, same: 0, fresh: 1 });
});

test('re-uploading the same standings is a correction: arrows survive', () => {
  const first = mergeRankingUpload(null, list('A', 'B', 'C', 'D'), 1000);
  const second = mergeRankingUpload(first, list('B', 'A', 'D', 'C'), 2000);
  assert.deepEqual(rankingMovement(second.entries), { up: 2, down: 2, same: 0, fresh: 0 });

  const again = mergeRankingUpload(second, list('B', 'A', 'D', 'C'), 3000);
  assert.equal(again.updatedAt, 3000);
  assert.equal(again.previous.updatedAt, 1000, 'baseline did not advance');
  assert.deepEqual(prevs(again), prevs(second), 'every arrow is exactly as before');
  assert.deepEqual(rankingMovement(again.entries), { up: 2, down: 2, same: 0, fresh: 0 });
});

test('the old behaviour is what the fix removes: naive re-upload wiped every arrow', () => {
  // Reproduce the pre-fix computation on the same data, to show the defect.
  const first = list('A', 'B', 'C', 'D');
  const second = list('B', 'A', 'D', 'C');
  const naive = (cur, parsed) => {
    const prev = new Map(cur.map(e => [e.name.toLowerCase(), e.rank]));
    return parsed.map(e => ({ ...e, prevRank: prev.get(e.name.toLowerCase()) }));
  };
  const s = naive(first, second);
  assert.deepEqual(rankingMovement(s), { up: 2, down: 2, same: 0, fresh: 0 });
  const wiped = naive(s, second);
  assert.deepEqual(rankingMovement(wiped), { up: 0, down: 0, same: 4, fresh: 0 }, 'all "–"');
});

test('fixing one name in a re-upload keeps everyone else\'s arrow', () => {
  const first = mergeRankingUpload(null, list('A', 'B', 'C', 'D'), 1000);
  const second = mergeRankingUpload(first, list('B', 'A', 'D', 'C'), 2000);
  // Same standings, but "C" was misspelt and is now "C.Fixed".
  const fixed = mergeRankingUpload(second, list('B', 'A', 'D', 'C.Fixed'), 3000);
  assert.equal(fixed.previous.updatedAt, 1000);
  const p = prevs(fixed);
  assert.deepEqual({ B: p.B, A: p.A, D: p.D }, { B: 2, A: 1, D: 4 });
  assert.equal(p['C.Fixed'], null, 'the renamed player has no history under the new name');
});

test('fixing points only is a correction too', () => {
  const first = mergeRankingUpload(null, list('A', 'B'), 1000);
  const second = mergeRankingUpload(first, list('B', 'A'), 2000);
  const repriced = mergeRankingUpload(second, [
    { rank: 1, name: 'B', points: '999' }, { rank: 2, name: 'A', points: '1' },
  ], 3000);
  assert.equal(repriced.entries[0].points, '999');
  assert.deepEqual(prevs(repriced), { B: 2, A: 1 });
});

test('whitespace and case differences still match the same player', () => {
  const first = mergeRankingUpload(null, list('Bat  Dorj', 'Sara'), 1000);
  const second = mergeRankingUpload(first, list('sara', 'bat dorj'), 2000);
  assert.deepEqual(prevs(second), { sara: 2, 'bat dorj': 1 });
  assert.equal(isRankingCorrection(first.entries, list('BAT DORJ ', ' Sara')), true);
});

test('a correction on data saved before `previous` existed keeps the carried prevRank', () => {
  // The live shape today: prevRank on each entry, no `previous` block.
  const legacy = { updatedAt: 500, entries: [
    { rank: 1, name: 'A', points: '3', prevRank: 2 },
    { rank: 2, name: 'B', points: '2', prevRank: 1 },
    { rank: 3, name: 'C', points: '1' },
  ] };
  const again = mergeRankingUpload(legacy, list('A', 'B', 'C'), 1000);
  assert.equal('previous' in again, false);
  assert.deepEqual(prevs(again), { A: 2, B: 1, C: null }, 'nothing about movement changed');
});

test('recovery path: old file then new file rebuilds the arrows', () => {
  // Today's live data: every prevRank equals rank, movement lost.
  const flat = { updatedAt: 500, entries: list('B', 'A', 'D', 'C').map(e => ({ ...e, prevRank: e.rank })) };
  const old = mergeRankingUpload(flat, list('A', 'B', 'C', 'D'), 1000);   // not a correction
  const now = mergeRankingUpload(old, list('B', 'A', 'D', 'C'), 2000);     // not a correction
  assert.equal(now.previous.updatedAt, 1000);
  assert.deepEqual(rankingMovement(now.entries), { up: 2, down: 2, same: 0, fresh: 0 });
});

test('isRankingCorrection: empty current is never a correction; disjoint sets are not either', () => {
  assert.equal(isRankingCorrection([], list('A')), false);
  assert.equal(isRankingCorrection(list('A', 'B'), list('X', 'Y')), false);
  assert.equal(isRankingCorrection(list('A', 'B'), list('A', 'B', 'X')), true);
  assert.equal(isRankingCorrection(list('A', 'B'), list('B', 'A')), false);
});

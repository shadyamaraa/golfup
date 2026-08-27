// scripts/test-matchplay.mjs
// Unit tests for the match play engine. Run with:
//   npm run test:mp   (node --test scripts/test-matchplay.mjs)
// Pure module, so no browser and no Firebase are involved.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  settleMatch, statusText, matchState, matchPoints,
  teamTotals, sessionTotals, holeTimeline, sortMatchesForDisplay,
  lineupIssues, participation, HALVED
} from '../src/matchplay.js';

// Shorthand: holes('a', 'h', 'b') → {1:'a', 2:'h', 3:'b'}
const holes = (...results) =>
  Object.fromEntries(results.map((r, i) => [i + 1, r]));

test('spec §5 walkthrough: win, halve, loss ends all square', () => {
  let s = settleMatch(holes('a'));
  assert.equal(statusText(s), '1 UP');
  assert.equal(s.leader, 'a');

  s = settleMatch(holes('a', HALVED));
  assert.equal(statusText(s), '1 UP');

  s = settleMatch(holes('a', HALVED, 'b'));
  assert.equal(statusText(s), 'AS');
  assert.equal(s.leader, null);
  assert.equal(s.finished, false);
});

test('spec §6: 4 UP with 3 to play closes out as 4 & 3', () => {
  // 15 holes: a wins 9, halves 2, loses 4 → wins 9-5? Simpler: a wins first
  // 4, halves through 14, wins 15th — margin 4... build explicitly:
  // a wins holes 1-4 (4 UP), halved 5-14 (10 holes, still 4 UP thru 14),
  // then hole 15 win would be 5 up with 3 left; instead check dormie edge:
  const first14 = ['a', 'a', 'a', 'a', ...Array(10).fill(HALVED)];
  let s = settleMatch(holes(...first14));
  // 4 UP with 4 to play: alive, dormie is margin===remaining
  assert.equal(s.finished, false);
  assert.equal(s.dormie, true);

  s = settleMatch(holes(...first14, HALVED)); // thru 15, 4 UP, 3 remain
  assert.equal(s.finished, true);
  assert.equal(s.closedOut, true);
  assert.equal(s.result, '4 & 3');
  assert.equal(s.winner, 'a');
  assert.equal(statusText(s), '4 & 3');
});

test('spec §6: full 18 decided 1 UP is "1 UP", not a close-out', () => {
  const seq = ['a', ...Array(17).fill(HALVED)];
  const s = settleMatch(holes(...seq));
  assert.equal(s.finished, true);
  assert.equal(s.closedOut, false);
  assert.equal(s.result, '1 UP');
  assert.equal(s.winner, 'a');
});

test('spec §6: full 18 all square is HALVED', () => {
  const s = settleMatch(holes(...Array(18).fill(HALVED)));
  assert.equal(s.finished, true);
  assert.equal(s.winner, null);
  assert.equal(statusText(s), 'HALVED');
});

test('entries after a close-out never change the result', () => {
  const seq = [...Array(10).fill('a'), 'b', 'b', 'b', 'b'];
  const s = settleMatch(holes(...seq));
  // a is 10 up after 10, 8 remain → closed out at hole 10 (10 & 8);
  // the four b holes after it are stray writes and must not count.
  assert.equal(s.thru, 10);
  assert.equal(s.result, '10 & 8');
});

test('correcting an early hole brings later entries back into play', () => {
  const h = holes(...Array(10).fill('a'), 'b', 'b', 'b', 'b');
  h[1] = 'b'; // correction: hole 1 was actually won by b
  const s = settleMatch(h);
  // No longer closed out at hole 10, so the four b holes now count.
  assert.equal(s.thru, 14);
  assert.equal(statusText(s), '4 UP');
  assert.equal(s.dormie, true);
});

test('a gap in the sequence stops the count', () => {
  const s = settleMatch({ 1: 'a', 3: 'b' });
  assert.equal(s.thru, 1);
  assert.equal(statusText(s), '1 UP');
});

test('match state derives from holes; suspension overrides', () => {
  assert.equal(matchState({ holes: {} }), 'UPCOMING');
  assert.equal(matchState({}), 'UPCOMING');
  assert.equal(matchState({ holes: holes('a') }), 'LIVE');
  assert.equal(matchState({ holes: holes(...Array(18).fill(HALVED)) }), 'COMPLETED');
  assert.equal(matchState({ holes: holes('a'), stateOverride: 'SUSPENDED' }), 'SUSPENDED');
});

test('spec §7: points are 1 / 0.5 / 0 and only for completed matches', () => {
  const win = { holes: holes(...Array(10).fill('b')) };        // b closes out
  const halve = { holes: holes(...Array(18).fill(HALVED)) };
  const live = { holes: holes('a') };
  assert.deepEqual(matchPoints(win), { a: 0, b: 1 });
  assert.deepEqual(matchPoints(halve), { a: 0.5, b: 0.5 });
  assert.deepEqual(matchPoints(live), { a: 0, b: 0 });
  assert.deepEqual(teamTotals([win, halve, live]), { a: 0.5, b: 1.5 });
});

test('spec §24: session totals group by sessionId', () => {
  const m = (sessionId, seq) => ({ sessionId, holes: holes(...seq) });
  const totals = sessionTotals([
    m('s1', Array(10).fill('a')),
    m('s1', Array(18).fill(HALVED)),
    m('s2', Array(10).fill('b'))
  ]);
  assert.deepEqual(totals.s1, { a: 1.5, b: 0.5 });
  assert.deepEqual(totals.s2, { a: 0, b: 1 });
});

test('spec §11: hole timeline carries per-hole result and running status', () => {
  const rows = holeTimeline({ holes: holes('a', HALVED, 'b') });
  assert.equal(rows.length, 18);
  assert.deepEqual(rows[0], { hole: 1, result: 'a', status: '1 UP' });
  assert.deepEqual(rows[1], { hole: 2, result: HALVED, status: '1 UP' });
  assert.deepEqual(rows[2], { hole: 3, result: 'b', status: 'AS' });
  assert.deepEqual(rows[3], { hole: 4, result: null, status: '' });
});

test('spec §10: display order is LIVE, UPCOMING by tee time, COMPLETED', () => {
  const done = { id: 'done', number: 1, holes: holes(...Array(10).fill('a')) };
  const live = { id: 'live', number: 2, holes: holes('a') };
  const up1 = { id: 'up1', number: 3, teeTime: '09:10', holes: {} };
  const up2 = { id: 'up2', number: 4, teeTime: '08:50', holes: {} };
  const order = sortMatchesForDisplay([done, up1, live, up2]).map(x => x.match.id);
  assert.deepEqual(order, ['live', 'up2', 'up1', 'done']);
});

test('spec §26: lineup validation', () => {
  const roster = {
    p1: { teamId: 'a' }, p2: { teamId: 'a' },
    q1: { teamId: 'b' }, q2: { teamId: 'b' }
  };
  const m1 = { id: 'm1', format: 'FOURSOMES', players: { a: ['p1', 'p2'], b: ['q1', 'q2'] } };
  // Clean lineup, only the 12-per-team rule fires (we field 2).
  let issues = lineupIssues([m1], roster);
  assert.deepEqual(issues.map(i => i.kind).sort(), ['player-count', 'player-count']);
  // With the requirement matched to the fielded count, no issues at all.
  assert.deepEqual(lineupIssues([m1], roster, { required: 2 }), []);

  // p1 plays twice in one session; m2 is also one player short.
  const m2 = { id: 'm2', format: 'FOURSOMES', players: { a: ['p1'], b: ['q1', 'q2'] } };
  issues = lineupIssues([m1, m2], roster, { required: 0 });
  assert.ok(issues.some(i => i.kind === 'duplicate-player' && i.playerId === 'p1'));
  assert.ok(issues.some(i => i.kind === 'duplicate-player' && i.playerId === 'q1'));
  assert.ok(issues.some(i => i.kind === 'match-size' && i.matchId === 'm2' && i.teamId === 'a'));

  // A player fielded for the wrong team, and one not on the roster.
  const m3 = { id: 'm3', format: 'SINGLES', players: { a: ['q1'], b: ['ghost'] } };
  issues = lineupIssues([m3], roster, { required: 0 });
  assert.ok(issues.some(i => i.kind === 'wrong-team' && i.playerId === 'q1'));
  assert.ok(issues.some(i => i.kind === 'unknown-player' && i.playerId === 'ghost'));
});

test('spec §26: participation counts every roster player who ever played', () => {
  const roster = {
    p1: { teamId: 'a' }, p2: { teamId: 'a' }, p3: { teamId: 'a' },
    q1: { teamId: 'b' }, q2: { teamId: 'b' }
  };
  const matches = [
    { players: { a: ['p1', 'p2'], b: ['q1', 'q2'] } },
    { players: { a: ['p1'], b: ['q1'] } }
  ];
  const part = participation(roster, matches);
  assert.equal(part.a.used, 2);
  assert.equal(part.a.total, 3);
  assert.deepEqual(part.a.unused, ['p3']);
  assert.equal(part.b.used, 2);
  assert.deepEqual(part.b.unused, []);
});

test('holes stored as an RTDB array (index 0 empty) settle identically', () => {
  // RTDB turns {1:'a',2:'h'} into [null,'a','h'] on read.
  const s = settleMatch([null, 'a', HALVED, 'b']);
  assert.equal(s.thru, 3);
  assert.equal(statusText(s), 'AS');
});

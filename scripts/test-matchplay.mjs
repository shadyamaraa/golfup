// scripts/test-matchplay.mjs
// Unit tests for the match play engine. Run with:
//   npm run test:mp   (node --test scripts/test-matchplay.mjs)
// Pure module, so no browser and no Firebase are involved.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  settleMatch, statusText, matchState, matchPoints,
  teamTotals, sessionTotals, holeTimeline, sortMatchesForDisplay,
  lineupIssues, participation, HALVED, UNGROUPED, playerStats, pairStats, tournamentComplete, holeChangeAction, canResolveHoleChange, tnKind,
  addMinutesHHMM, cascadeTeeTimes, mpSchedule, sessionDate, rosterPid, mpNextMatch,
  matchOpensAt, matchLocked
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
  // A wins the first four, then ten halves: 4 up thru 14 with 4 to play.
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

test('match state derives from holes; suspension holds an unfinished one', () => {
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

test('sortMatchesForDisplay: within a state the sessions keep their day and number before the clock', () => {
  const sessions = {
    d1: { id: 'd1', day: 1, number: 1, startTime: '09:30' },
    d1b: { id: 'd1b', day: 1, number: 2, startTime: '13:00' },
    d2: { id: 'd2', day: 2, number: 1, startTime: '08:00' }
  };
  const ms = [
    { id: 'b1', sessionId: 'd2', number: 1, teeTime: '08:00' },
    { id: 'a2', sessionId: 'd1', number: 2, teeTime: '09:40' },
    { id: 'c1', sessionId: 'd1b', number: 1, teeTime: '' },          // untimed, alone in its session
    { id: 'a1', sessionId: 'd1', number: 1, teeTime: '09:30' },
    { id: 'live', sessionId: 'd2', number: 2, teeTime: '08:10', holes: holes('a') }
  ];
  // Day 2's 08:00 no longer lands ahead of day 1's 09:30.
  assert.deepEqual(sortMatchesForDisplay(ms, sessions).map(x => x.match.id), ['live', 'a1', 'a2', 'c1', 'b1']);
  // Without sessions: the plain clock, as before.
  assert.deepEqual(sortMatchesForDisplay(ms).map(x => x.match.id), ['live', 'b1', 'a1', 'a2', 'c1']);
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

// ---- Regressions found in review ----

test('a decided match is COMPLETED even with a stale suspension flag', () => {
  // Play is suspended at dusk, resumes next morning, and nobody presses
  // Resume. The match still has to finish and still has to pay its point.
  const m = { holes: holes(...Array(10).fill('a')), stateOverride: 'SUSPENDED' };
  assert.equal(matchState(m), 'COMPLETED');
  assert.deepEqual(matchPoints(m), { a: 1, b: 0 });
  assert.deepEqual(teamTotals([m]), { a: 1, b: 0 });
});

test('a suspension still holds an unfinished match', () => {
  const m = { holes: holes('a', HALVED), stateOverride: 'SUSPENDED' };
  assert.equal(matchState(m), 'SUSPENDED');
  assert.deepEqual(matchPoints(m), { a: 0, b: 0 });
});

test('totalHoles arriving as a string still finishes the match', () => {
  const s = settleMatch(holes(...Array(18).fill(HALVED)), '18');
  assert.equal(s.finished, true);
  assert.equal(statusText(s), 'HALVED');
});

test('an unrecognized format still catches uneven sides', () => {
  const roster = { p1: { teamId: 'a' }, q1: { teamId: 'b' }, q2: { teamId: 'b' } };
  const m = { id: 'm1', players: { a: ['p1'], b: ['q1', 'q2'] } }; // no format
  const issues = lineupIssues([m], roster, { required: 0 });
  assert.ok(issues.some(i => i.kind === 'match-size' && i.teamId === 'a' && i.count === 1),
    'one against two must be reported even with no format');
});

test('a wrong-team player counts against the side they were fielded on', () => {
  const roster = {
    p1: { teamId: 'a' }, p2: { teamId: 'a' },
    q1: { teamId: 'b' }, q2: { teamId: 'b' }
  };
  // q1 is fielded for team a: one wrong-team issue, and no phantom shortfall
  // for team b, which fielded its full two.
  const m = { id: 'm1', format: 'FOURSOMES', players: { a: ['p1', 'q1'], b: ['q2', 'p2'] } };
  const issues = lineupIssues([m], roster, { required: 2 });
  assert.equal(issues.filter(i => i.kind === 'player-count').length, 0);
  assert.equal(issues.filter(i => i.kind === 'wrong-team').length, 2);
});

test('the same player in both slots of one match is its own issue', () => {
  const roster = { p1: { teamId: 'a' }, q1: { teamId: 'b' }, q2: { teamId: 'b' } };
  const m = { id: 'm1', format: 'FOURSOMES', players: { a: ['p1', 'p1'], b: ['q1', 'q2'] } };
  const issues = lineupIssues([m], roster, { required: 0 });
  const dup = issues.find(i => i.kind === 'duplicate-in-match');
  assert.ok(dup, 'must be reported as a same-match duplicate');
  assert.deepEqual(dup.matches, ['m1']);
  assert.ok(!issues.some(i => i.kind === 'duplicate-player'), 'not a cross-match duplicate');
});

test('a player twice in one session is still a cross-match duplicate', () => {
  const roster = { p1: { teamId: 'a' }, q1: { teamId: 'b' } };
  const ms = [
    { id: 'm1', format: 'SINGLES', players: { a: ['p1'], b: ['q1'] } },
    { id: 'm2', format: 'SINGLES', players: { a: ['p1'], b: ['q1'] } }
  ];
  const issues = lineupIssues(ms, roster, { required: 0 });
  assert.equal(issues.filter(i => i.kind === 'duplicate-player').length, 2);
});

test('a match with no session still reaches the breakdown', () => {
  // Its points are in the overall, so they must appear in a row too or the
  // rows silently disagree with the total.
  const stray = { id: 'x', holes: holes(...Array(10).fill('a')) };
  const totals = sessionTotals([{ sessionId: 's1', holes: holes(...Array(10).fill('b')) }, stray]);
  assert.deepEqual(totals[UNGROUPED], { a: 1, b: 0 });
  const sum = Object.values(totals).reduce((acc, v) => ({ a: acc.a + v.a, b: acc.b + v.b }), { a: 0, b: 0 });
  assert.deepEqual(sum, teamTotals([{ sessionId: 's1', holes: holes(...Array(10).fill('b')) }, stray]));
});

// ---- Phase 2: statistics ----

test('spec §25: player stats count completed matches only', () => {
  const mp = {
    matches: {
      m1: { id: 'm1', players: { a: ['p1', 'p2'], b: ['q1', 'q2'] }, holes: holes(...Array(10).fill('a')) },
      m2: { id: 'm2', players: { a: ['p1'], b: ['q1'] }, holes: holes(...Array(18).fill(HALVED)) },
      m3: { id: 'm3', players: { a: ['p2'], b: ['q2'] }, holes: holes('a') } // live
    }
  };
  const s = playerStats(mp);
  assert.deepEqual(s.p1, { played: 2, w: 1, l: 0, h: 1, points: 1.5 });
  assert.deepEqual(s.p2, { played: 1, w: 1, l: 0, h: 0, points: 1 });
  assert.deepEqual(s.q1, { played: 2, w: 0, l: 1, h: 1, points: 0.5 });
  assert.deepEqual(s.q2, { played: 1, w: 0, l: 1, h: 0, points: 0 });
});

test('spec §25: pair records key the sorted pair, singles excluded', () => {
  const mp = {
    matches: {
      m1: { id: 'm1', players: { a: ['p2', 'p1'], b: ['q1', 'q2'] }, holes: holes(...Array(10).fill('a')) },
      m2: { id: 'm2', players: { a: ['p1', 'p2'], b: ['q1', 'q2'] }, holes: holes(...Array(18).fill(HALVED)) },
      m3: { id: 'm3', players: { a: ['p1'], b: ['q1'] }, holes: holes(...Array(10).fill('a')) }
    }
  };
  const s = pairStats(mp);
  // Slot order must not split the pair: m1 fields p2,p1 and m2 fields p1,p2.
  assert.deepEqual(s['p1+p2'], { teamId: 'a', players: ['p1', 'p2'], played: 2, w: 1, l: 0, h: 1 });
  assert.deepEqual(s['q1+q2'], { teamId: 'b', players: ['q1', 'q2'], played: 2, w: 0, l: 1, h: 1 });
  assert.equal(Object.keys(s).length, 2, 'the singles match forms no pair');
});

test('tournamentComplete: every match decided, and never vacuously', () => {
  const done = { id: 'x', holes: holes(...Array(10).fill('a')) };
  const live = { id: 'y', holes: holes('a') };
  assert.equal(tournamentComplete({ matches: { m1: done } }), true);
  assert.equal(tournamentComplete({ matches: { m1: done, m2: live } }), false);
  assert.equal(tournamentComplete({ matches: {} }), false);
  assert.equal(tournamentComplete(null), false);
});

// ---- Correction consent ----

test('consent: who writes directly and who must propose', () => {
  const me = { id: 'u1', role: 'user' };
  const other = { id: 'u2', role: 'user' };
  const admin = { id: 'boss', role: 'admin' };
  const match = {
    holes: { 1: 'a', 2: 'b' },
    holeMeta: { 1: { by: 'u1' } } // hole 2 predates ownership
  };
  // An empty hole is open to anyone.
  assert.equal(holeChangeAction(me, match, 3), 'direct');
  // Your own entry stays yours to correct.
  assert.equal(holeChangeAction(me, match, 1), 'direct');
  // Somebody else's entry needs their consent…
  assert.equal(holeChangeAction(other, match, 1), 'propose');
  // …unless you are an official.
  assert.equal(holeChangeAction(admin, match, 1), 'direct');
  // A hole with no recorded owner is open (legacy data).
  assert.equal(holeChangeAction(other, match, 2), 'direct');
});

test('consent: who may settle a pending change', () => {
  const match = { holeMeta: { 5: { by: 'u1' } } };
  assert.equal(canResolveHoleChange({ id: 'u1', role: 'user' }, match, 5), true);
  assert.equal(canResolveHoleChange({ id: 'u2', role: 'user' }, match, 5), false);
  assert.equal(canResolveHoleChange({ id: 'm', role: 'marshal' }, match, 5), true);
  assert.equal(canResolveHoleChange(null, match, 5), false);
});

// ---- Tournament kind ----

test('tnKind: ryder, plain match, legacy match-with-teams, stroke', () => {
  assert.equal(tnKind({ format: 'ryder' }), 'ryder');
  assert.equal(tnKind({ format: 'match' }), 'match');
  assert.equal(tnKind({ format: 'match', mp: { roster: {}, matches: {} } }), 'match');
  // Records from before 'ryder' existed: format 'match' but team-shaped.
  assert.equal(tnKind({ format: 'match', mp: { teams: { a: {} } } }), 'ryder');
  assert.equal(tnKind({ format: 'match', mp: { sessions: { s1: {} } } }), 'ryder');
  assert.equal(tnKind({ format: 'stroke' }), 'stroke');
  assert.equal(tnKind({ format: 'scramble' }), 'stroke');
  assert.equal(tnKind(null), 'stroke');
});

// ---- Tee times ----

test('addMinutesHHMM: plain add, midnight wrap, bad input', () => {
  assert.equal(addMinutesHHMM('09:40', 10), '09:50');
  assert.equal(addMinutesHHMM('9:55', 10), '10:05');
  assert.equal(addMinutesHHMM('23:55', 10), '00:05');
  assert.equal(addMinutesHHMM('', 10), '');
  assert.equal(addMinutesHHMM('morning', 10), '');
  assert.equal(addMinutesHHMM(null, 10), '');
});

test('cascadeTeeTimes: empty later matches follow at 10-minute steps', () => {
  const ms = [
    { id: 'm1', number: 1, teeTime: '09:40' },
    { id: 'm2', number: 2, teeTime: '' },
    { id: 'm3', number: 3 }
  ];
  assert.deepEqual(cascadeTeeTimes(ms, 'm1'), [
    { id: 'm2', teeTime: '09:50' },
    { id: 'm3', teeTime: '10:00' }
  ]);
  // Pure: the inputs were not touched.
  assert.equal(ms[1].teeTime, '');
});

test('cascadeTeeTimes: a hand-set time is kept and becomes the new base', () => {
  const ms = [
    { id: 'm1', number: 1, teeTime: '09:00' },
    { id: 'm2', number: 2, teeTime: '10:30' },
    { id: 'm3', number: 3, teeTime: '' }
  ];
  assert.deepEqual(cascadeTeeTimes(ms, 'm1'), [{ id: 'm3', teeTime: '10:40' }]);
});

test('cascadeTeeTimes: no base time, or matches before the edit, change nothing', () => {
  const ms = [
    { id: 'm1', number: 1, teeTime: '' },
    { id: 'm2', number: 2, teeTime: '' }
  ];
  assert.deepEqual(cascadeTeeTimes(ms, 'm1'), []);
  const later = [
    { id: 'm1', number: 1, teeTime: '' },
    { id: 'm2', number: 2, teeTime: '11:00' },
    { id: 'm3', number: 3, teeTime: '' }
  ];
  // Editing m2 fills only m3; m1 above it stays untouched.
  assert.deepEqual(cascadeTeeTimes(later, 'm2'), [{ id: 'm3', teeTime: '11:10' }]);
  assert.deepEqual(cascadeTeeTimes(later, 'ghost'), []);
});

// ---- Schedule ----

const SCHED = {
  roster: {
    a1: { teamId: 'a', name: 'Бат' }, a2: { teamId: 'a', name: 'Дорж', userId: 'u_dorj' },
    b1: { teamId: 'b', name: 'Сараа' }, b2: { teamId: 'b', name: 'Тулга' }
  },
  sessions: {
    s2: { id: 's2', day: 1, number: 2, format: 'FOURBALL', startTime: '13:00' },
    s1: { id: 's1', day: 1, number: 1, format: 'FOURSOMES', startTime: '08:00' },
    s3: { id: 's3', day: 2, number: 1, format: 'SINGLES', startTime: '08:00' }
  },
  matches: {
    // m2 tees off before m1 and is already decided (10 up with 8 to play).
    m2: { id: 'm2', sessionId: 's1', number: 2, teeTime: '08:00', players: { a: ['a1', 'a2'], b: ['b1', 'b2'] }, holes: holes(...Array(10).fill('a')) },
    m1: { id: 'm1', sessionId: 's1', number: 1, teeTime: '08:10', players: { a: ['a1', 'a2'], b: ['b1', 'b2'] }, holes: holes('a', 'h') },
    m3: { id: 'm3', sessionId: 's2', number: 1, teeTime: '', players: { a: ['a1'], b: ['b1'] } },
    m4: { id: 'm4', sessionId: 's3', number: 1, teeTime: '08:00', players: { a: ['a2'], b: ['b2'] } },
    m5: { id: 'm5', number: 9, teeTime: '', players: { a: ['a1'], b: ['b2'] } }
  }
};

test('mpSchedule: sessions by day and number, matches by tee time, loose ones last', () => {
  const blocks = mpSchedule(SCHED);
  assert.deepEqual(blocks.map(b => b.session?.id ?? null), ['s1', 's2', 's3', null]);
  assert.deepEqual(blocks[0].matches.map(m => m.id), ['m2', 'm1']);
  assert.deepEqual(blocks[1].matches.map(m => m.id), ['m3']);
  assert.deepEqual(blocks[3].matches.map(m => m.id), ['m5']);
  // No sessions at all: one block, every match, by tee time then number.
  const flat = mpSchedule({ matches: SCHED.matches });
  assert.equal(flat.length, 1);
  assert.equal(flat[0].session, null);
  assert.deepEqual(flat[0].matches.map(m => m.id), ['m4', 'm2', 'm1', 'm3', 'm5']);
  assert.deepEqual(mpSchedule({}), []);
  assert.deepEqual(mpSchedule(null), []);
  // A match with no tee time of its own comes after the timed ones, by number.
  const mixed = mpSchedule({
    sessions: { s1: { id: 's1', day: 1, number: 1, startTime: '09:30' } },
    matches: {
      x: { id: 'x', sessionId: 's1', number: 1, teeTime: '' },
      y: { id: 'y', sessionId: 's1', number: 2, teeTime: '09:20' },
      z: { id: 'z', sessionId: 's1', number: 3, teeTime: '09:40' }
    }
  });
  assert.deepEqual(mixed[0].matches.map(m => m.id), ['y', 'z', 'x']);
});

test('mpSchedule: with doneLast a session whose every match is decided moves to the end', () => {
  const mp = {
    sessions: {
      s1: { id: 's1', day: 1, number: 1, startTime: '09:30' },
      s2: { id: 's2', day: 1, number: 2, startTime: '13:00' },
      s3: { id: 's3', day: 2, number: 1, startTime: '08:00' },
      s4: { id: 's4', day: 2, number: 2, startTime: '13:00' }
    },
    matches: {
      a: { id: 'a', sessionId: 's1', number: 1, holes: holes(...Array(10).fill('a')) },   // decided
      b: { id: 'b', sessionId: 's1', number: 2, holes: holes(...Array(10).fill('b')) },   // decided
      c: { id: 'c', sessionId: 's2', number: 1, holes: holes(...Array(10).fill('a')) },   // decided
      d: { id: 'd', sessionId: 's2', number: 2, holes: holes('a', 'h') },                  // under way
      e: { id: 'e', sessionId: 's3', number: 1 }                                           // upcoming
    }
  };
  const plain = mpSchedule(mp);
  assert.deepEqual(plain.map(b => b.session.id), ['s1', 's2', 's3', 's4']);
  assert.deepEqual(plain.map(b => b.finished), [true, false, false, false]);
  // s1 drops to the end; s2 stays up while d is on the course; the empty s4 is not "finished".
  assert.deepEqual(mpSchedule(mp, { doneLast: true }).map(b => b.session.id), ['s2', 's3', 's4', 's1']);
  // The last match of s2 decided → s2 follows s1 to the end, in day order.
  mp.matches.d.holes = holes(...Array(10).fill('b'));
  assert.deepEqual(mpSchedule(mp, { doneLast: true }).map(b => b.session.id), ['s3', 's4', 's1', 's2']);
});

test('sessionDate: day 1 is the start date, later days count on, bad input is empty', () => {
  assert.equal(sessionDate('2026-09-12', 1), '2026-09-12');
  assert.equal(sessionDate('2026-09-12', 2), '2026-09-13');
  assert.equal(sessionDate('2026-09-30', 2), '2026-10-01');
  assert.equal(sessionDate('2026-12-31', 3), '2027-01-02');
  assert.equal(sessionDate('', 1), '');
  assert.equal(sessionDate('2026-09-12', 0), '');
  assert.equal(sessionDate('2026-09-12', undefined), '');
  assert.equal(sessionDate('12.09.2026', 1), '');
});

test('rosterPid: keyed by userId, or carried in the record', () => {
  assert.equal(rosterPid(SCHED.roster, 'a1'), 'a1');
  assert.equal(rosterPid(SCHED.roster, 'u_dorj'), 'a2');
  assert.equal(rosterPid(SCHED.roster, 'nobody'), null);
  assert.equal(rosterPid(null, 'a1'), null);
  assert.equal(rosterPid(SCHED.roster, null), null);
});

test('mpNextMatch: the earliest unfinished match the member is fielded in', () => {
  const next = mpNextMatch(SCHED, 'a1', { startDate: '2026-09-12' });
  // m2 is decided, m1 is under way (counts), m3 and m5 come later or undated.
  assert.equal(next.match.id, 'm1');
  assert.equal(next.session.id, 's1');
  assert.deepEqual([next.date, next.time, next.side, next.pid], ['2026-09-12', '08:10', 'a', 'a1']);
  assert.equal(next.ms, new Date('2026-09-12T08:10').getTime());
  // A member on side b, via the userId in their record.
  const b = mpNextMatch(SCHED, 'u_dorj', { startDate: '2026-09-12' });
  assert.equal(b.match.id, 'm1');
  assert.equal(b.side, 'a');
  // The session's start time stands in for a missing match tee time.
  const only3 = { ...SCHED, matches: { m3: SCHED.matches.m3 } };
  assert.deepEqual([mpNextMatch(only3, 'a1', { startDate: '2026-09-12' }).time, mpNextMatch(only3, 'a1', { startDate: '2026-09-12' }).date], ['13:00', '2026-09-12']);
  // Day 2 lands on the next calendar date.
  const only4 = { ...SCHED, matches: { m4: SCHED.matches.m4 } };
  assert.equal(mpNextMatch(only4, 'b2', { startDate: '2026-09-12' }).date, '2026-09-13');
  // No start date: undated matches fall back to day, session, match order.
  assert.equal(mpNextMatch(SCHED, 'a2').match.id, 'm1');
  assert.equal(mpNextMatch(SCHED, 'a2').ms, Infinity);
  // Not on the roster, or everything decided → nothing.
  assert.equal(mpNextMatch(SCHED, 'nobody', { startDate: '2026-09-12' }), null);
  assert.equal(mpNextMatch({ ...SCHED, matches: { m2: SCHED.matches.m2 } }, 'a1', { startDate: '2026-09-12' }), null);
  assert.equal(mpNextMatch(null, 'a1'), null);
});

// ---- The tee-time gate ----

const GATE = { id: 'tn1', startDate: '2026-09-12', mp: {
  sessions: {
    s1: { id: 's1', day: 1, number: 1, format: 'FOURSOMES', startTime: '09:30' },
    s3: { id: 's3', day: 2, number: 1, format: 'SINGLES', startTime: '8:00' }
  },
  matches: {
    m1: { id: 'm1', sessionId: 's1', number: 1, teeTime: '09:40', players: { a: ['a1'], b: ['b1'] } },
    m2: { id: 'm2', sessionId: 's1', number: 2, teeTime: '', players: { a: ['a2'], b: ['b2'] } },
    m4: { id: 'm4', sessionId: 's3', number: 1, teeTime: '8:10', players: { a: ['a1'], b: ['b2'] } },
    m5: { id: 'm5', number: 9, teeTime: '', players: { a: ['a1'], b: ['b2'] } }
  }
} };
const at = (s) => new Date(s).getTime();

test('matchOpensAt: the match tee time, else the session start, on the session day', () => {
  assert.deepEqual(matchOpensAt(GATE, GATE.mp.matches.m1), { ms: at('2026-09-12T09:40'), date: '2026-09-12', time: '09:40' });
  assert.deepEqual(matchOpensAt(GATE, GATE.mp.matches.m2), { ms: at('2026-09-12T09:30'), date: '2026-09-12', time: '09:30' });
  assert.deepEqual(matchOpensAt(GATE, GATE.mp.matches.m4), { ms: at('2026-09-13T08:10'), date: '2026-09-13', time: '08:10' });
  // No session and no time, or no start date: nothing to wait for.
  assert.equal(matchOpensAt(GATE, GATE.mp.matches.m5), null);
  assert.equal(matchOpensAt({ ...GATE, startDate: '' }, GATE.mp.matches.m1), null);
  assert.equal(matchOpensAt(null, GATE.mp.matches.m1), null);
});

test('matchLocked: held before the tee time for players and scorers, never for officials', () => {
  const player = { id: 'a1' }, scorer = { id: 'sk' }, marshal = { id: 'm', role: 'marshal' }, admin = { id: 'x', role: 'admin' };
  const before = at('2026-09-12T09:39'), after = at('2026-09-12T09:40');
  assert.deepEqual(matchLocked(GATE, GATE.mp.matches.m1, player, before), { ms: at('2026-09-12T09:40'), date: '2026-09-12', time: '09:40' });
  assert.ok(matchLocked(GATE, GATE.mp.matches.m1, scorer, before));
  assert.equal(matchLocked(GATE, GATE.mp.matches.m1, player, after), null);
  assert.equal(matchLocked(GATE, GATE.mp.matches.m1, marshal, before), null);
  assert.equal(matchLocked(GATE, GATE.mp.matches.m1, admin, before), null);
  // The session start stands in, the next day counts on, an undated draw is open.
  assert.equal(matchLocked(GATE, GATE.mp.matches.m2, player, at('2026-09-12T09:29')).time, '09:30');
  assert.equal(matchLocked(GATE, GATE.mp.matches.m4, player, at('2026-09-12T23:00')).date, '2026-09-13');
  assert.equal(matchLocked(GATE, GATE.mp.matches.m5, player, before), null);
  assert.equal(matchLocked({ ...GATE, startDate: '' }, GATE.mp.matches.m1, player, before), null);
  assert.equal(matchLocked(GATE, GATE.mp.matches.m1, null, before)?.time, '09:40');
});

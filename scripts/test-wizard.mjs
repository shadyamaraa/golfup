// scripts/test-wizard.mjs
// The tournament wizard's pure half: the record each type's draft becomes.
// One wizard creates every type, and a cup leaves it with its draw laid out
// — these pin what is written, and what is deliberately not.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';

// The wizard pulls i18n, which reads localStorage at import time — the stub
// has to be in place before the dynamic import below.
globalThis.localStorage ??= {
  _v: {}, getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; }
};
const { tnWizardRecord, tnWizardDraft } = await import('../src/tournament-wizard.js');
const { tnKind, TEAM_COLORS } = await import('../src/matchplay.js');
const { tnIsTeam, tnTeamSize, tnTeamRank, tnScoring, tnHasDivisions, spActive } = await import('../src/strokeplay.js');
const { courseTees } = await import('../src/courses.js');

// A course with registry tees, and one of them, so rating and slope resolve.
const COURSE = 'sky';
const TEE = courseTees(COURSE)[0];
assert.ok(TEE, 'the sky course carries tees in the registry');

const common = { name: '  Cup  ', startDate: '2026-09-12', endDate: '2026-09-13', venue: 'MTBogd', city: 'UB', course: COURSE, tee: TEE.key, par: '71' };

test('every type carries the course, its tee and PAR', () => {
  for (const format of ['stroke', 'scramble', 'fourball', 'foursome', 'match', 'ryder']) {
    const rec = tnWizardRecord(tnWizardDraft({ ...common, format }));
    assert.equal(rec.name, 'Cup', format);
    assert.equal(rec.format, format);
    assert.equal(rec.course, COURSE, format);
    assert.equal(rec.tee, TEE.key, format);
    assert.equal(rec.rating, TEE.rating, format);
    assert.equal(rec.slope, TEE.slope, format);
    assert.equal(rec.par, 71, format);
    assert.deepEqual(rec.entries, []);
    assert.ok(Number.isFinite(rec.createdAt));
    assert.ok(!('id' in rec), 'the store mints the id');
  }
});

test('stroke play writes what it always did — rounds, cut, scoring, divisions', () => {
  const rec = tnWizardRecord(tnWizardDraft({
    ...common, format: 'stroke', rounds: '2', cutAfterRound: '1', cutSize: '60',
    spScoring: 'stableford', spDivisions: 'gender', womenTee: TEE.key
  }));
  assert.equal(rec.rounds, 2);
  assert.equal(rec.currentRound, 1);
  assert.equal(rec.cutAfterRound, 1);
  assert.equal(rec.cutSize, 60);
  assert.equal(tnScoring(rec), 'stableford');
  assert.equal(tnHasDivisions(rec), true);
  assert.equal(rec.womenTee, TEE.key);
  assert.equal(rec.womenRating, TEE.rating);
  assert.equal(rec.womenSlope, TEE.slope);
  assert.ok(!('mp' in rec) && !('sp' in rec), 'no match play node, and the roster is the editor\'s');
  assert.equal(spActive(rec), false);
  assert.ok(!('spTeamSize' in rec) && !('spTeamRank' in rec), 'a stroke event has no team shape');
  // Blanks mean the main tee and no cut, exactly as the edit form stores them.
  const plain = tnWizardRecord(tnWizardDraft({ ...common, format: 'stroke', tee: '' }));
  assert.equal(plain.tee, null);
  assert.equal(plain.rating, null);
  assert.equal(plain.cutAfterRound, null);
  assert.equal(plain.womenTee, null);
  assert.equal(plain.spDivisions, '');
});

test('team types keep their team shape', () => {
  const four = tnWizardRecord(tnWizardDraft({ ...common, format: 'scramble', spTeamSize: '4' }));
  assert.equal(tnIsTeam(four), true);
  assert.equal(tnTeamSize(four), 4);
  assert.equal(tnTeamRank(four), 'board');
  const two = tnWizardRecord(tnWizardDraft({ ...common, format: 'scramble', spTeamSize: '2', spTeamRank: 'match' }));
  assert.equal(tnTeamSize(two), 2);
  assert.equal(tnTeamRank(two), 'match');
  const fb = tnWizardRecord(tnWizardDraft({ ...common, format: 'fourball', spTeamSize: '4', spTeamRank: 'match' }));
  assert.equal(tnTeamSize(fb), 2, 'fourball is pairs whatever the scramble size says');
  assert.equal(tnTeamRank(fb), 'match');
});

test('a ryder cup leaves the wizard with teams, colours and the whole draw', () => {
  const rec = tnWizardRecord(tnWizardDraft({
    ...common, format: 'ryder',
    teamAName: ' Altai Eagles ', teamAShort: 'ALTAI', teamAColor: '#112233',
    teamBName: 'Wellcom Diesels', teamBShort: 'WELLCOM', teamBColor: 'not-a-colour'
  }));
  assert.equal(tnKind(rec), 'ryder');
  assert.deepEqual(rec.mp.teams.a, { name: 'Altai Eagles', short: 'ALTAI', color: '#112233' });
  assert.equal(rec.mp.teams.b.color, TEAM_COLORS.b, 'a bad colour falls back to the team default');
  const sessions = Object.values(rec.mp.sessions);
  const matches = Object.values(rec.mp.matches);
  assert.equal(sessions.length, 3, 'the M Cup plan is the default');
  assert.equal(matches.length, 24);
  assert.deepEqual(sessions.map(s => [s.day, s.format, s.startTime]),
    [[1, 'FOURSOMES', '09:30'], [1, 'FOURBALL', '14:00'], [2, 'SINGLES', '10:00']]);
  assert.ok(matches.every(m => m.sessionId in rec.mp.sessions && m.teeTime));
  assert.ok(!('roster' in rec.mp), 'the roster is picked in the editor');
  assert.ok(!('rounds' in rec) && !('spScoring' in rec), 'no stroke play settings on a cup');
  // A page reads it as a match play tournament from the first paint.
  assert.equal(Object.keys(rec.mp.matches).length > 0, true);
});

test('an edited plan is honoured; empty rows drop out', () => {
  const rec = tnWizardRecord(tnWizardDraft({
    ...common, format: 'ryder', teamAName: 'A', teamBName: 'B',
    mpPlan: [
      { day: 1, format: 'FOURBALL', matches: 4, startTime: '08:00' },
      { day: 1, format: 'SINGLES', matches: 0, startTime: '' },
      { day: 3, format: 'SINGLES', matches: 8, startTime: '' }
    ]
  }));
  const sessions = Object.values(rec.mp.sessions);
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map(s => [s.day, s.number, s.format]), [[1, 1, 'FOURBALL'], [3, 2, 'SINGLES']]);
  assert.equal(Object.keys(rec.mp.matches).length, 12);
});

test('a singles draw is a flat match list and nothing that reads as a cup', () => {
  const rec = tnWizardRecord(tnWizardDraft({ ...common, format: 'match', mpSingles: '5', mpSinglesStart: '07:30' }));
  assert.equal(tnKind(rec), 'match');
  assert.deepEqual(Object.keys(rec.mp), ['matches'], 'no teams, no sessions — the kind test would flip');
  const ms = Object.values(rec.mp.matches);
  assert.equal(ms.length, 5);
  assert.ok(ms.every(m => m.format === 'SINGLES' && !('sessionId' in m)));
  assert.deepEqual(ms.map(m => m.teeTime), ['07:30', '07:40', '07:50', '08:00', '08:10']);
  // Nonsense counts still give one match — the page needs one to be a draw.
  const one = tnWizardRecord(tnWizardDraft({ ...common, format: 'match', mpSingles: '' }));
  assert.equal(Object.keys(one.mp.matches).length, 1);
});

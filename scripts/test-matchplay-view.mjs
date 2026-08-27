// scripts/test-matchplay-view.mjs
// Tests for the Live Match Center's own decisions — which session a viewer is
// shown, and what the home strip summarizes. Run with: npm run test:mp
//
// The view module pulls in i18n.js, which reads localStorage at import time,
// so a two-method stub stands in for the browser. Nothing else here touches
// the DOM.

// Pinned to English so the assertions can name the strings they expect;
// i18n reads the language once at import time, hence the pre-seeded value.
globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }
};

const { currentSession, stripSummary, teamShort, formatPoints } =
  await import('../src/matchplay-view.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const HALVED = 'h';
const holes = (...r) => Object.fromEntries(r.map((v, i) => [i + 1, v]));

const mpWith = (sessions, matches) => ({
  teams: { a: { name: 'Altai Eagles', short: 'ALTAI' }, b: { name: 'Wellcom Diesels', short: 'WELLCOM' } },
  roster: {},
  sessions: Object.fromEntries(sessions.map(s => [s.id, s])),
  matches: Object.fromEntries(matches.map(m => [m.id, m]))
});

const S1 = { id: 's1', day: 1, number: 1, format: 'FOURSOMES' };
const S2 = { id: 's2', day: 1, number: 2, format: 'FOURBALL' };
const S3 = { id: 's3', day: 2, number: 1, format: 'SINGLES' };

test('points print as 8.5 and 8, never 8.50', () => {
  assert.equal(formatPoints(8.5), '8.5');
  assert.equal(formatPoints(8), '8');
  assert.equal(formatPoints(0), '0');
});

test('the session shown is the one with matches under way', () => {
  const mp = mpWith([S1, S2, S3], [
    { id: 'm1', sessionId: 's1', holes: holes(...Array(10).fill('a')) }, // done
    { id: 'm2', sessionId: 's2', holes: holes('a') },                    // live
    { id: 'm3', sessionId: 's3', holes: {} }                             // upcoming
  ]);
  assert.equal(currentSession(mp).id, 's2');
});

test('with nothing live, the earliest unfinished session is shown', () => {
  const mp = mpWith([S1, S2, S3], [
    { id: 'm1', sessionId: 's1', holes: holes(...Array(10).fill('a')) },
    { id: 'm2', sessionId: 's2', holes: {} },
    { id: 'm3', sessionId: 's3', holes: {} }
  ]);
  assert.equal(currentSession(mp).id, 's2');
});

test('once everything is complete the last session stays on screen', () => {
  const done = Array(18).fill(HALVED);
  const mp = mpWith([S1, S2], [
    { id: 'm1', sessionId: 's1', holes: holes(...done) },
    { id: 'm2', sessionId: 's2', holes: holes(...done) }
  ]);
  assert.equal(currentSession(mp).id, 's2');
});

test('a suspended match still counts as the running session', () => {
  const mp = mpWith([S1, S2], [
    { id: 'm1', sessionId: 's1', holes: holes('a'), stateOverride: 'SUSPENDED' },
    { id: 'm2', sessionId: 's2', holes: {} }
  ]);
  assert.equal(currentSession(mp).id, 's1');
});

test('strip summary carries team points, live count and the session', () => {
  const mp = mpWith([S1], [
    { id: 'm1', sessionId: 's1', holes: holes(...Array(10).fill('a')) },  // ALTAI 1
    { id: 'm2', sessionId: 's1', holes: holes(...Array(18).fill(HALVED)) }, // ½ each
    { id: 'm3', sessionId: 's1', holes: holes('b') }                       // live
  ]);
  const s = stripSummary({ mp });
  assert.equal(s.a.name, 'ALTAI');
  assert.equal(s.a.points, 1.5);
  assert.equal(s.b.points, 0.5);
  assert.equal(s.liveCount, 1);
  assert.equal(s.session, 'Day 1 — FOURSOMES');
});

test('a tournament with no matches has no strip summary', () => {
  assert.equal(stripSummary({ mp: mpWith([S1], []) }), null);
  assert.equal(stripSummary({}), null);
});

test('team short name falls back to the full name, then to a default', () => {
  assert.equal(teamShort({ teams: { a: { name: 'Altai Eagles' } } }, 'a'), 'Altai Eagles');
  assert.equal(teamShort({}, 'b'), 'Team B');
});

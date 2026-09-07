// scripts/test-backup.mjs
// Tournament backup, layer A — the pure half: what a roster save writes and
// never writes, and the save-time count of what a removal would take off the
// board. Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';

// strokeplay-admin pulls i18n, which reads localStorage at import time — the
// stub has to be in place before the dynamic import below.
globalThis.localStorage ??= {
  _v: {}, getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }, removeItem(k) { delete this._v[k]; }
};
const { spDraftPatch } = await import('../src/strokeplay-admin.js');
const { spScoredRemovals, SP_HOLES } = await import('../src/strokeplay.js');
const { mpScoredRemovals } = await import('../src/matchplay.js');

const fullRound = (avg) => Object.fromEntries(
  Array.from({ length: SP_HOLES }, (_, i) => [i + 1, avg]));

// A roster draft as the editor holds it: players, the draw, and the set of
// pids this editor took off. `u3` is being removed; the team `a1+a2` is being
// disbanded.
const DRAFT = () => ({
  players: {
    u1: { name: 'Бат', userId: 'u1', hcp: '4', status: '', division: 'male' },
    u2: { name: 'Дорж', userId: 'u2', hcp: '', status: 'WD' },
    p_guest: { name: 'Гуест', hcp: 12 },
    'b1+b2': { kind: 'team', name: 'Сараа / Хулан', members: { b1: true, b2: true }, hcp: '3' },
    b1: { name: 'Сараа', userId: 'b1' },
    b2: { name: 'Хулан', userId: 'b2' },
  },
  groups: { 1: { g1: { number: 1, teeTime: '08:00', players: { u1: true, u2: true, 'b1+b2': true } } }, 2: {} },
  removed: new Set(['u3', 'a1+a2']),
  dirty: true
});

test('a removal takes the entry off the roster and NEVER touches its scores', () => {
  const patch = spDraftPatch(DRAFT());
  assert.equal(patch['sp/players/u3'], null);
  assert.equal(patch['sp/players/a1+a2'], null, 'a disbanded team goes the same way');
  // The whole point of layer A: no key under sp/scores, for anybody.
  assert.deepEqual(Object.keys(patch).filter(k => k.startsWith('sp/scores')), []);
});

test('the surviving records keep exactly the shape a save wrote before', () => {
  const patch = spDraftPatch(DRAFT());
  assert.deepEqual(patch['sp/players/u1'], { name: 'Бат', userId: 'u1', hcp: 4, division: 'male', groups: { 1: 'g1' } });
  // A blank HCP is omitted, a status is kept, a manual player has no userId.
  assert.deepEqual(patch['sp/players/u2'], { name: 'Дорж', userId: 'u2', status: 'WD', groups: { 1: 'g1' } });
  assert.deepEqual(patch['sp/players/p_guest'], { name: 'Гуест', hcp: 12 });
  // A team carries its kind and members; its members carry ITS flight pointer.
  assert.deepEqual(patch['sp/players/b1+b2'], { name: 'Сараа / Хулан', kind: 'team', members: { b1: true, b2: true }, hcp: 3, groups: { 1: 'g1' } });
  assert.deepEqual(patch['sp/players/b1'].groups, { 1: 'g1' });
  assert.deepEqual(patch['sp/players/b2'].groups, { 1: 'g1' });
  // The draw is written per round; an empty round is cleared.
  assert.deepEqual(patch['sp/groups/1'], DRAFT().groups[1]);
  assert.equal(patch['sp/groups/2'], null);
});

test('spScoredRemovals counts holes over every round, off whatever record it is handed', () => {
  const tn = {
    sp: {
      players: { u1: { name: 'Бат' }, u2: { name: 'Дорж' }, 'b1+b2': { kind: 'team', name: 'Сараа / Хулан' } },
      scores: {
        u1: { 1: fullRound(4), 2: { 1: 4, 2: 5, 3: 4 } },
        u2: { 1: {} },
        'b1+b2': { 1: { 1: 5, 2: 4 } },
      }
    }
  };
  const out = spScoredRemovals(tn, new Set(['u1', 'u2', 'b1+b2', 'nobody']));
  assert.deepEqual(out, [
    { pid: 'u1', name: 'Бат', holes: 21 },
    { pid: 'b1+b2', name: 'Сараа / Хулан', holes: 2 },
  ]);
  // Arrays work as well as Sets; nothing to remove is nothing to say.
  assert.deepEqual(spScoredRemovals(tn, ['u2']), []);
  assert.deepEqual(spScoredRemovals(tn, []), []);
  assert.deepEqual(spScoredRemovals(null, ['u1']), []);
  // A cleared hole (null) and a zero are not holes.
  assert.deepEqual(spScoredRemovals({ sp: { scores: { x: { 1: { 1: null, 2: 0, 3: '' } } } } }, ['x']), []);
});

test('the fresh read is what makes the count honest', () => {
  // The editor opened on a card with nothing on it …
  const stale = { sp: { players: { u1: { name: 'Бат' } }, scores: {} } };
  assert.deepEqual(spScoredRemovals(stale, ['u1']), []);
  // … and by save time the player has 14 holes.
  const fresh = { sp: { players: { u1: { name: 'Бат' } }, scores: { u1: { 1: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, 4])) } } } };
  assert.deepEqual(spScoredRemovals(fresh, ['u1']), [{ pid: 'u1', name: 'Бат', holes: 14 }]);
});

test('mpScoredRemovals names the match and counts its holes', () => {
  const mp = {
    roster: { a1: { name: 'Бат' }, a2: { name: 'Дорж' }, b1: { name: 'Сараа' }, b2: { name: 'Хулан' } },
    matches: {
      m1: { id: 'm1', number: 3, players: { a: ['a1', 'a2'], b: ['b1', 'b2'] }, holes: { 1: 'a', 2: 'h', 3: 'b' } },
      m2: { id: 'm2', number: 4, players: { a: ['a1'], b: ['b1'] }, holes: {} },
      m3: { id: 'm3', players: { a: ['a2'], b: ['b2'] }, holes: { 1: 'a', 2: null } },
    }
  };
  assert.deepEqual(mpScoredRemovals(mp, new Set(['m1', 'm2', 'm3', 'nope'])), [
    { id: 'm1', number: 3, label: '#3 Бат / Дорж – Сараа / Хулан', holes: 3 },
    { id: 'm3', number: null, label: 'Дорж – Хулан', holes: 1 },
  ]);
  assert.deepEqual(mpScoredRemovals(null, ['m1']), []);
  assert.deepEqual(mpScoredRemovals(mp, []), []);
});

// scripts/test-tee-function.mjs
// The deployed half of the tee-time notifications: functions/index.js is
// loaded into a vm sandbox with firebase-admin and firebase-functions
// stubbed — an in-memory database tree and a builder that captures the
// trigger handlers — and spScheduleChanged is driven end to end: the
// ledger, the compare-and-set, the guards, the fan-out and the records.
// The debounce is set to zero through TEE_DEBOUNCE_MS. Nothing here
// touches Firebase. Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

process.env.TEE_DEBOUNCE_MS = '0';

// An in-memory RTDB: paths as slash strings, values deep-copied on the way
// in and out, push keys numbered, a one-pass transaction.
function fakeDb() {
  const tree = {};
  const segs = (p) => String(p).split('/').filter(Boolean);
  const get = (p) => segs(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), tree);
  const set = (p, v) => {
    const ks = segs(p);
    let o = tree;
    ks.slice(0, -1).forEach(k => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    if (v === null || v === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = JSON.parse(JSON.stringify(v));
  };
  let n = 0;
  const ref = (p) => ({
    key: segs(p).at(-1),
    once: async () => ({
      val: () => { const v = get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); },
      exists: () => get(p) !== undefined
    }),
    transaction: async (fn) => {
      const cur = get(p);
      const next = fn(cur === undefined ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return { committed: false };
      set(p, next);
      return { committed: true };
    },
    push: () => ref(`${p}/n${++n}`),
    set: async (v) => set(p, v),
    update: async (v) => Object.entries(v).forEach(([k, val]) => set(`${p}/${k}`, val))
  });
  return { ref, get, set, tree };
}

// Load functions/index.js with its two Firebase modules stubbed. The
// functions builder is a proxy that swallows any chain and records the
// handler given to onWrite/onCreate under its ref path.
function loadFunctions(db) {
  const handlers = {};
  const chain = () => new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'ref') return (path) => ({ onWrite: (h) => { handlers[path] = h; }, onCreate: (h) => { handlers[path] = h; } });
      return chain();
    },
    apply() { return chain(); }
  });
  const nodeRequire = createRequire(import.meta.url);
  const require = (name) => {
    if (name === 'firebase-admin') return { initializeApp() {}, database: () => db, messaging: () => ({ send: async () => {} }) };
    if (name === 'firebase-functions/v1') return chain();
    if (name === 'crypto') return nodeRequire('crypto');
    if (name === './qpay') return {};
    throw new Error('unexpected require: ' + name);
  };
  const src = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(src, {
    require, module, exports: module.exports, process, setTimeout, Buffer, URL, URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    fetch: async () => { throw new Error('no network in the sandbox'); }
  });
  return handlers;
}

const TEE_PATH = '/tournaments/{tnId}/sp/groups/{round}';
const ubDay = (offsetDays) => new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);

const PLAYERS = () => ({
  u1: { name: 'A', userId: 'u1' }, u2: { name: 'B', userId: 'u2' }, u3: { name: 'C', userId: 'u3' },
  p_g: { name: 'Guest' }
});
const DRAW = () => ({
  g1: { number: 1, teeTime: '08:00', players: { u1: true, p_g: true } },
  g2: { number: 2, teeTime: '08:10', players: { u2: true, u3: true } }
});
const change = (before, after) => ({ before: { val: () => before }, after: { val: () => after } });
const ctx = (round = '1') => ({ params: { tnId: 't1', round } });
const notifs = (db, uid) => Object.values(db.get(`notifications/${uid}`) || {});

function setup({ startOffset = 1, status } = {}) {
  const db = fakeDb();
  db.set('tournaments/t1', {
    id: 't1', name: 'CUP', startDate: ubDay(startOffset), endDate: ubDay(startOffset), rounds: 1,
    ...(status ? { status } : {}),
    sp: { players: PLAYERS(), groups: { 1: DRAW() } }
  });
  // u2 is both drawn and subscribed; u7 only subscribed.
  db.set('tnSubs/t1', { u2: { at: 1 }, u7: { at: 1 } });
  const handlers = loadFunctions(db);
  assert.ok(handlers[TEE_PATH], 'spScheduleChanged is registered on the round path');
  return { db, fire: handlers[TEE_PATH] };
}

test('first publish: every member drawn is told once, subscribers hear of the draw, the ledger is written', async () => {
  const { db, fire } = setup();
  await fire(change(null, DRAW()), ctx());
  const u1 = notifs(db, 'u1');
  assert.equal(u1.length, 1);
  assert.equal(u1[0].type, 'tn_tee');
  assert.equal(u1[0].id, 'n1', 'the record carries its own key');
  assert.equal(u1[0].title, 'CUP — Таны tee time');
  assert.equal(u1[0].body, 'R1 · 08:00 · Флайт 1');
  assert.equal(u1[0].gameId, 'tn:t1:tee:1');
  assert.equal(u1[0].gameDate, ubDay(1));
  assert.equal(u1[0].gameTime, '08:00');
  assert.equal(u1[0].tag, 'tn:t1:tee:1');
  assert.equal(notifs(db, 'u2').length, 1, 'a drawn subscriber gets their own time only');
  assert.equal(notifs(db, 'u2')[0].type, 'tn_tee');
  assert.equal(notifs(db, 'u3').length, 1);
  assert.equal(notifs(db, 'p_g').length, 0, 'a hand-added guest has no account to reach');
  const sub = notifs(db, 'u7');
  assert.equal(sub.length, 1);
  assert.equal(sub[0].type, 'tn_sched');
  assert.equal(sub[0].title, 'CUP: R1-ийн хуваарь зарлагдлаа');
  assert.equal(sub[0].body, '2 флайт · 08:00–08:10');
  const ledger = db.get('tournaments/t1/sp/notified/1');
  // The ledger records everyone instructed, the guest included — only the
  // push needs an account.
  assert.deepEqual(ledger.p, { u1: '08:00|', p_g: '08:00|', u2: '08:10|', u3: '08:10|' });
  assert.ok(ledger.subsAt > 0);
});

test('an unchanged write exits early; a renumber commits nothing new and sends nothing', async () => {
  const { db, fire } = setup();
  await fire(change(null, DRAW()), ctx());
  const before = Object.keys(db.tree.notifications).length;
  await fire(change(DRAW(), DRAW()), ctx());
  const renumbered = DRAW(); renumbered.g1.number = 5; renumbered.g2.number = 6;
  db.set('tournaments/t1/sp/groups/1', renumbered);
  await fire(change(DRAW(), renumbered), ctx());
  assert.equal(Object.keys(db.tree.notifications).length, before);
  assert.ok(notifs(db, 'u1').length === 1 && notifs(db, 'u2').length === 1 && notifs(db, 'u7').length === 1);
});

test('a moved tee time tells the people it moved, with the old time, and the subscribers nothing more', async () => {
  const { db, fire } = setup();
  await fire(change(null, DRAW()), ctx());
  const moved = DRAW(); moved.g2.teeTime = '09:00';
  db.set('tournaments/t1/sp/groups/1', moved);
  await fire(change(DRAW(), moved), ctx());
  assert.equal(notifs(db, 'u1').length, 1, 'u1 kept their time');
  const u2 = notifs(db, 'u2');
  assert.equal(u2.length, 2);
  assert.equal(u2[1].title, 'CUP — Tee time өөрчлөгдлөө');
  assert.equal(u2[1].body, 'R1 · 08:10 → 09:00 · Флайт 2');
  assert.equal(u2[1].kind, 'moved');
  assert.equal(u2[1].gameId, u2[0].gameId, 'the two collapse onto one bell row');
  assert.equal(notifs(db, 'u7').length, 1, 'the draw is announced once');
  assert.deepEqual(db.get('tournaments/t1/sp/notified/1').p, { u1: '08:00|', p_g: '08:00|', u2: '09:00|', u3: '09:00|' });
});

test('the settled draw is what is read: the event may carry a stale round', async () => {
  const { db, fire } = setup();
  const stale = DRAW(); stale.g1.teeTime = '07:00';
  // The record already holds the final draw (08:00); the event still says 07:00.
  await fire(change(null, stale), ctx());
  assert.equal(notifs(db, 'u1')[0].body, 'R1 · 08:00 · Флайт 1');
});

test('a round published before the ledger existed is not re-announced whole on its first edit', async () => {
  const { db, fire } = setup();
  const moved = DRAW(); moved.g1.teeTime = '08:30';
  db.set('tournaments/t1/sp/groups/1', moved);
  await fire(change(DRAW(), moved), ctx());
  assert.equal(notifs(db, 'u1').length, 1);
  assert.equal(notifs(db, 'u1')[0].body, 'R1 · 08:00 → 08:30 · Флайт 1');
  assert.equal(notifs(db, 'u2').length, 0);
  assert.equal(notifs(db, 'u7').length, 0, 'no first publish, no announcement');
  assert.equal(db.get('tournaments/t1/sp/notified/1').subsAt, 0, 'the round is claimed as already out');
});

test('guards: a finished tournament, a round already played, a bad round key, a round past the count', async () => {
  let s = setup({ status: 'final' });
  await s.fire(change(null, DRAW()), ctx());
  assert.equal(s.db.tree.notifications, undefined);
  s = setup({ startOffset: -3 });
  await s.fire(change(null, DRAW()), ctx());
  assert.equal(s.db.tree.notifications, undefined);
  s = setup();
  await s.fire(change(null, DRAW()), ctx('x'));
  await s.fire(change(null, DRAW()), ctx('2'));
  assert.equal(s.db.tree.notifications, undefined);
});

test('the M Cup result fan-out stores the record id too', async () => {
  const db = fakeDb();
  const holes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 'a']));
  db.set('tournaments/c1', {
    id: 'c1', name: 'M Cup', format: 'ryder',
    mp: { teams: { a: { short: 'A' }, b: { short: 'B' } }, roster: { u1: { name: 'A1', teamId: 'a' }, u2: { name: 'B1', teamId: 'b' } },
      matches: { m1: { id: 'm1', number: 1, players: { a: ['u1'], b: ['u2'] }, holes } } }
  });
  db.set('tnSubs/c1', { u9: { at: 1 } });
  const handlers = loadFunctions(db);
  await handlers['/tournaments/{tnId}/mp/matches/{matchId}/holes']({ after: { val: () => holes } }, { params: { tnId: 'c1', matchId: 'm1' } });
  const n = notifs(db, 'u9');
  assert.equal(n.length, 1);
  assert.equal(n[0].type, 'mcup');
  assert.equal(n[0].id, 'n1');
});

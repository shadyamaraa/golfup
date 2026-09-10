// scripts/test-messaging-sw.mjs
// The push service worker: a message the FCM SDK already displayed (one
// carrying a `notification` block) is not shown a second time; a data-only
// message is shown once with the brand icon, its tag and the link a tap
// opens. The worker source runs in a vm sandbox with the SDK stubbed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8');

function loadWorker({ windows = [] } = {}) {
  const calls = { shown: [], opened: [], navigated: [], focused: 0, closed: 0, listeners: {} };
  let handler = null;
  const win = (url) => ({
    url,
    navigate: async (u) => { calls.navigated.push(u); return null; },
    focus: async () => { calls.focused++; }
  });
  const sandbox = {
    importScripts() {},
    firebase: {
      initializeApp() {},
      messaging: () => ({ onBackgroundMessage: (fn) => { handler = fn; } })
    },
    clients: {
      matchAll: async () => windows.map(win),
      openWindow: async (u) => { calls.opened.push(u); }
    },
    location: { origin: 'https://ubgolf.club' },
    // Copied out of the sandbox realm: strict deepEqual compares prototypes.
    registration: { showNotification: async (title, opts) => { calls.shown.push(JSON.parse(JSON.stringify({ title, ...opts }))); } },
    addEventListener: (type, fn) => { calls.listeners[type] = fn; }
  };
  sandbox.self = sandbox;
  vm.runInNewContext(SRC, sandbox);
  const click = async (data) => {
    let pending = null;
    calls.listeners.notificationclick({
      notification: { data, close: () => { calls.closed++; } },
      waitUntil: (p) => { pending = p; }
    });
    await pending;
  };
  return { calls, push: (payload) => handler(payload), click };
}

test('a message the SDK displayed is not shown again', async () => {
  const w = loadWorker();
  const out = w.push({
    notification: { title: 'M Cup 2026: Match №1 — Тэнцэв', body: 'Эцсийн дүн: Eagles 0.5 — 0.5 Diesels' },
    data: { title: 'M Cup 2026: Match №1 — Тэнцэв', body: '…', gameId: '' }
  });
  assert.equal(out, undefined);
  await out;
  assert.equal(w.calls.shown.length, 0);
});

test('a data-only message is shown once, with icon, badge, tag and link', async () => {
  const w = loadWorker();
  const out = w.push({ data: {
    title: 'M Cup 2026: Match №1 — Diesels 3 & 2', body: 'Эцсийн дүн: Eagles 0 — 1 Diesels',
    link: 'https://ubgolf.club/#/tournament/tn_mcup', gameId: '', tag: 'n_1'
  } });
  assert.equal(typeof out.then, 'function', 'the display promise is returned for waitUntil');
  await out;
  assert.deepEqual(w.calls.shown, [{
    title: 'M Cup 2026: Match №1 — Diesels 3 & 2',
    body: 'Эцсийн дүн: Eagles 0 — 1 Diesels',
    icon: '/icon-192.png', badge: '/favicon-48.png', tag: 'n_1',
    data: { link: 'https://ubgolf.club/#/tournament/tn_mcup' }
  }]);
});

test('an older function naming only a game id still lands on the game; nothing → the app', async () => {
  const w = loadWorker();
  await w.push({ data: { title: 'UB Golf: Бат тоглолтод нэгдлээ!', body: '2026-09-12 09:00 - Sky', gameId: 'g1' } });
  await w.push({ data: { title: 'UB Golf', body: '' } });
  await w.push({});
  assert.equal(w.calls.shown.length, 3);
  assert.equal(w.calls.shown[0].data.link, 'https://ubgolf.club/#/game/g1');
  assert.equal(w.calls.shown[0].tag, undefined);
  assert.equal(w.calls.shown[1].data.link, 'https://ubgolf.club/');
  assert.equal(w.calls.shown[2].title, 'UB Golf');
});

test('a tap steers an open window, else opens one; the SDK’s own notifications are left alone', async () => {
  const open = loadWorker({ windows: ['https://ubgolf.club/#/games'] });
  await open.click({ link: 'https://ubgolf.club/#/tournament/tn_mcup' });
  assert.deepEqual(open.calls.navigated, ['https://ubgolf.club/#/tournament/tn_mcup']);
  assert.equal(open.calls.focused, 1);
  assert.deepEqual(open.calls.opened, []);
  assert.equal(open.calls.closed, 1);

  const none = loadWorker({ windows: ['https://example.com/'] });
  await none.click({ link: 'https://ubgolf.club/#/game/g1' });
  assert.deepEqual(none.calls.opened, ['https://ubgolf.club/#/game/g1']);
  assert.deepEqual(none.calls.navigated, []);

  const sdk = loadWorker({ windows: ['https://ubgolf.club/'] });
  await sdk.click({ FCM_MSG: { notification: {} } });
  await sdk.click(undefined);
  assert.equal(sdk.calls.closed, 0);
  assert.deepEqual(sdk.calls.opened, []);
  assert.deepEqual(sdk.calls.navigated, []);
});

// scripts/test-name-picker.mjs
// The admin editors' type-to-search dropdown (src/name-picker.js), driven
// through fake elements: when the list opens, that a row is picked on a
// completed tap and never on the finger landing, that the keyboard going
// away under a finger on the list does not close it, and what does close
// it — a tap outside, Escape, a blur with the list untouched. Run with:
// npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';

// A DOM element with just what the picker touches. Rows are read out of
// innerHTML by their data attribute, the way the real list is queried.
function el(name) {
  const handlers = {};
  return {
    name, hidden: true, innerHTML: '', value: '', attached: true, items: [],
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, ev = {}) {
      const e = { preventDefault() { e.prevented = true; }, stopPropagation() { e.stopped = true; }, ...ev };
      (handlers[type] || []).forEach(fn => fn(e));
      return e;
    },
    contains(node) { return node === this || node?.parent === this; },
    querySelectorAll(sel) {
      const attr = /\[data-([a-z-]+)\]/.exec(sel)[1];
      const key = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.items = [...this.innerHTML.matchAll(new RegExp(`data-${attr}="([^"]+)"`, 'g'))]
        .map(m => ({ dataset: { [key]: m[1] }, parent: this, onclick: null }));
      return this.items;
    }
  };
}

const doc = {
  listeners: [],
  body: { contains: (node) => node?.attached !== false },
  addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); },
  removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => l.fn !== fn); },
  fire(type, ev) { [...this.listeners].filter(l => l.type === type).forEach(l => l.fn(ev)); }
};
globalThis.document = doc;

const { wireNamePicker, TOUCH_GRACE_MS } = await import('../src/name-picker.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function picker() {
  const input = el('input');
  const list = el('list');
  const log = [];
  wireNamePicker({
    input, list, itemSelector: '[data-pid]',
    fill: () => { log.push('fill:' + input.value); list.innerHTML = ['u1', 'u2', 'u3'].map(p => `<div data-pid="${p}">${p}</div>`).join(''); },
    pick: (item) => { log.push('pick:' + item.dataset.pid); input.attached = false; },
    reset: () => { log.push('reset'); input.value = ''; }
  });
  return { input, list, log };
}

test('focus and typing fill and open the list; a row is picked on click, never on pointerdown', () => {
  const { input, list, log } = picker();
  assert.equal(list.hidden, true);
  input.fire('focus');
  assert.equal(list.hidden, false);
  assert.deepEqual(log, ['fill:']);
  input.value = 'u2'; input.fire('input');
  assert.deepEqual(log, ['fill:', 'fill:u2']);
  assert.equal(list.items.length, 3);
  // The finger lands on a row to scroll: nothing is picked.
  list.fire('pointerdown', { target: list.items[1] });
  assert.ok(!log.some(x => x.startsWith('pick')));
  // A completed tap picks.
  const e = { preventDefault() { e.prevented = true; } };
  list.items[1].onclick(e);
  assert.ok(log.includes('pick:u2') && e.prevented);
});

test('a blur right after the list was touched leaves it open; an untouched blur closes and resets', async () => {
  const a = picker();
  a.input.fire('focus');
  a.list.fire('pointerdown', { target: a.list.items[0] });
  a.input.fire('blur');
  await sleep(220);
  assert.equal(a.list.hidden, false, 'the keyboard went away under a finger on the list');
  assert.ok(!a.log.includes('reset'));

  const b = picker();
  b.input.fire('focus'); b.input.value = 'x';
  b.input.fire('blur');
  await sleep(220);
  assert.equal(b.list.hidden, true);
  assert.ok(b.log.includes('reset') && b.input.value === '');
  assert.ok(TOUCH_GRACE_MS >= 300, 'long enough for a tap to complete');
});

test('a pointerdown outside the input and the list closes it; inside does not; Escape closes', () => {
  const { input, list, log } = picker();
  input.fire('focus');
  doc.fire('pointerdown', { target: { parent: input } });
  assert.equal(list.hidden, false, 'a tap on the input');
  doc.fire('pointerdown', { target: list.items[2] });
  assert.equal(list.hidden, false, 'a tap on a row');
  doc.fire('pointerdown', { target: { parent: null } });
  assert.equal(list.hidden, true, 'a tap elsewhere');
  assert.equal(log.filter(x => x === 'reset').length, 1);
  input.fire('focus');
  assert.equal(list.hidden, false);
  input.fire('keydown', { key: 'a' });
  assert.equal(list.hidden, false);
  input.fire('keydown', { key: 'Escape' });
  assert.equal(list.hidden, true);
});

test('a touch on the list does not reach the page; a detached input lets its document listener go', () => {
  const before = doc.listeners.length;
  const { input, list } = picker();
  assert.equal(doc.listeners.length, before + 1);
  assert.equal(doc.listeners.at(-1).capture, true);
  const e = list.fire('touchstart', { target: list });
  assert.equal(e.stopped, true, 'pull-to-refresh never sees it');
  input.fire('focus');
  input.attached = false;                       // the editor repainted
  doc.fire('pointerdown', { target: { parent: null } });
  assert.equal(doc.listeners.length, before, 'the listener removed itself');
  assert.equal(list.hidden, false, 'and touched nothing on the way out');
});

test('a blur after the input is gone does nothing', async () => {
  const { input, list, log } = picker();
  input.fire('focus');
  input.attached = false;
  input.fire('blur');
  await sleep(220);
  assert.equal(list.hidden, false);
  assert.ok(!log.includes('reset'));
});

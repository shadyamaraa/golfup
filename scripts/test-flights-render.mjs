// scripts/test-flights-render.mjs
// Smoke tests for the Флайтууд tab — stroke play's Match Center: a drawn
// tournament goes in and the HTML is checked for what a spectator reads —
// the LIVE / Удахгүй / Дууссан groups, the viewer's own flight first, the
// card's scores, and the grid the modal opens. A host stub stands in for
// the DOM, the way the Match Center's tests do.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); }
};
globalThis.document = { querySelector: () => null };

const { renderSpFlights } = await import('../src/strokeplay-flights.js');
const { SP_HOLES } = await import('../src/strokeplay.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const full = (n) => Object.fromEntries(Array.from({ length: SP_HOLES }, (_, i) => [i + 1, n]));
const part = (k, n) => Object.fromEntries(Array.from({ length: k }, (_, i) => [i + 1, n]));

function hostStub() {
  const host = { innerHTML: '', handlers: [] };
  host.querySelectorAll = (sel) => {
    if (sel !== 'button[data-spf="open"]') return [];
    // Hand back one fake button per card so the click wiring can be driven.
    const cards = [...host.innerHTML.matchAll(/data-spf="open" data-round="(\d+)" data-gid="([^"]+)"/g)];
    return cards.map(m => { const b = { dataset: { round: m[1], gid: m[2] } }; host.handlers.push(b); return b; });
  };
  return host;
}

const TN = () => ({
  id: 't', format: 'stroke', course: 'sky', rounds: 1, currentRound: 1, par: 72, startDate: '2026-09-19',
  sp: {
    players: {
      u1: { name: 'Bat', userId: 'u1', groups: { 1: 'g1' } },
      u2: { name: 'Dorj', userId: 'u2', groups: { 1: 'g1' } },
      u3: { name: 'Saraa', userId: 'u3', groups: { 1: 'g2' } },
      u4: { name: 'Tuya', userId: 'u4', groups: { 1: 'g3' } }
    },
    groups: { 1: {
      g1: { number: 1, teeTime: '08:00', players: { u1: true, u2: true } },
      g2: { number: 2, teeTime: '08:10', players: { u3: true } },
      g3: { number: 3, teeTime: '08:20', players: { u4: true } }
    } },
    scores: { u1: { 1: full(4) }, u2: { 1: full(5) }, u3: { 1: part(6, 3) } }
  }
});

test('the three groups, the scores on the cards, the finished round folded', () => {
  const host = hostStub();
  renderSpFlights(host, TN(), {});
  const html = host.innerHTML;
  const at = (s) => html.indexOf(s);
  assert.ok(at('>LIVE <') < at('>UPCOMING <') && at('>UPCOMING <') < at('>Final <'), 'LIVE, then upcoming, then final');
  assert.ok(html.includes('Saraa') && html.includes('>−7<'), 'the live card reads seven under (18 on a par-25 stretch)');
  assert.ok(html.includes('Thru 6'));
  assert.ok(html.includes('Bat') && html.includes('>E<') && html.includes('>+18<'), 'the finished cards read level and +18');
  assert.ok(!html.includes('data-spf-fold'), 'a round with flights still out does not fold');
  assert.equal((html.match(/data-spf="open"/g) || []).length, 3);
});

test('the viewer\'s own flight comes first and carries the pill; the scorer link follows the rule', () => {
  const host = hostStub();
  // A second upcoming flight drawn ahead of the viewer's: theirs still leads its round.
  const tn = TN();
  tn.sp.players.u5 = { name: 'Oyun', userId: 'u5', groups: { 1: 'g0' } };
  tn.sp.groups[1].g0 = { number: 0, teeTime: '07:50', players: { u5: true } };
  renderSpFlights(host, tn, { user: { id: 'u4', role: 'member' } });
  const html = host.innerHTML;
  assert.ok(html.includes('My flight'));
  const mine = html.indexOf('data-gid="g3"');
  assert.ok(mine >= 0 && mine < html.indexOf('data-gid="g0"'), 'the viewer\'s flight before the draw\'s first');
  // The link goes only with the viewer's flight (u4 is in g3, upcoming).
  assert.equal((html.match(/#\/spgroup\/t\/1\/g3/g) || []).length, 1);
  assert.ok(!html.includes('#/spgroup/t/1/g2'), 'not for a flight the viewer is not in');
  const admin = hostStub();
  renderSpFlights(admin, TN(), { user: { id: 'x', role: 'admin' } });
  assert.ok(admin.innerHTML.includes('#/spgroup/t/1/g2') && admin.innerHTML.includes('#/spgroup/t/1/g3'), 'an admin gets every unfinished flight');
  assert.ok(!admin.innerHTML.includes('#/spgroup/t/1/g1'), 'never a finished one');
});

test('a tap opens the flight grid; the open grid follows a repaint', () => {
  const host = hostStub();
  let opened = null;
  const ctx = { showModal: (title, html, id) => { opened = { title, html, id }; }, refreshModal: (render) => { ctx.render = render; } };
  renderSpFlights(host, TN(), ctx);
  host.handlers.find(b => b.dataset.gid === 'g2').onclick();
  assert.equal(opened.title, 'Group 2');
  assert.equal(opened.id, 'spf:1:g2');
  assert.ok(opened.html.includes('class="spg"') && opened.html.includes('Saraa'), 'the grid, with the player');
  assert.ok(opened.html.includes('>OUT<') && opened.html.includes('>TOT<'));
  const again = ctx.render('spf:1:g2');
  assert.ok(again.includes('Saraa'));
  assert.equal(ctx.render('spf:1:nope'), null, 'a flight gone closes the modal');
  assert.equal(ctx.render('m1'), undefined, 'a match id is not ours');
});

test('no draw yet: the empty state', () => {
  const host = hostStub();
  renderSpFlights(host, { id: 't', format: 'stroke', sp: { players: { u1: { name: 'A' } } } }, {});
  assert.ok(host.innerHTML.includes('No groups assigned yet'));
});

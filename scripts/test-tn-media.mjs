// scripts/test-tn-media.mjs
// The tournament page's sponsor block: one partner is a plaque, two or more
// are a carousel — a slide and a dot each, the first dot lit.

globalThis.localStorage = {
  _v: { golfup_lang: 'en' },
  getItem(k) { return this._v[k] ?? null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

const { tnSponsorsHTML } = await import('../src/tournament-media.js');

import test from 'node:test';
import assert from 'node:assert/strict';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const count = (html, needle) => html.split(needle).length - 1;

test('no sponsors: nothing', () => {
  assert.equal(tnSponsorsHTML({}), '');
  assert.equal(tnSponsorsHTML({ sponsors: [] }), '');
  assert.equal(tnSponsorsHTML(null), '');
});

test('one sponsor: the plaque alone, its link, the mark sized to the card', () => {
  const html = tnSponsorsHTML({ sponsors: [{ name: 'Mobicom', logo: PNG, link: 'https://mobicom.mn/golf' }] });
  assert.ok(!html.includes('data-tn-spc'));
  assert.equal(count(html, 'tn-spc-slide'), 0);
  assert.ok(html.includes('href="https://mobicom.mn/golf"'));
  assert.ok(html.includes('max-height:120px'));
  assert.ok(html.includes('max-width:100%'));
  assert.ok(html.includes('alt="Mobicom"'));
});

test('several: a slide and a dot each, the first dot lit, a name-only partner as text', () => {
  const html = tnSponsorsHTML({ sponsors: {
    a: { name: 'Mobicom', logo: PNG, link: 'https://mobicom.mn/golf' },
    b: { name: 'Хаан банк', logo: PNG },
    c: { name: 'Тэтгэгч' }
  } });
  assert.ok(html.includes('data-tn-spc'));
  assert.equal(count(html, 'class="tn-spc-slide"'), 3);
  assert.equal(count(html, 'data-spc-go='), 3);
  assert.equal(count(html, 'tn-spc-dot active'), 1);
  assert.ok(html.includes('data-spc-go="0"') && html.includes('data-spc-go="2"'));
  assert.ok(html.includes('>Тэтгэгч</span>'));
  assert.equal(count(html, 'href="https://mobicom.mn/golf"'), 1);
  assert.equal(count(html, '<img '), 2);
});

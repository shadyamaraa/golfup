// scripts/test-flight-grid.mjs
// The shared on-screen group grid: its markup from a model, the paging, and
// the hooks the scorers patch through. No DOM, no i18n. Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import { gridHTML, gridPages, pageOfHole, cellInner, segInner } from '../src/flight-grid.js';

const seg = (gross, holesIn, toPar = null, par = null) => ({ gross, holesIn, toPar, par });
const row = (pid, name, strokes, kind = 'player') => ({
  pid, name, kind, link: false,
  holes: strokes.map((s, i) => ({ hole: i + 1, par: 4, strokes: s, cls: s === null ? null : s < 4 ? 'birdie' : s === 4 ? 'par' : 'bogey', points: null })),
  front: seg(strokes.slice(0, 9).reduce((a, b) => a + (b || 0), 0), strokes.slice(0, 9).filter(Boolean).length),
  back: seg(strokes.slice(9).reduce((a, b) => a + (b || 0), 0), strokes.slice(9).filter(Boolean).length),
  total: seg(strokes.reduce((a, b) => a + (b || 0), 0), strokes.filter(Boolean).length, 1, 72),
  thru: ''
});
const model = (holeCount, rows) => ({
  holeCount, hasPars: true, pars: Object.fromEntries(Array.from({ length: holeCount }, (_, i) => [i + 1, 4])),
  rows, hole: 1, complete: false, full: Array.from({ length: holeCount }, () => false)
});
const OPTS = {
  hole: 11,
  labels: { hole: 'HOLE', par: 'PAR', out: 'OUT', in: 'IN', tot: 'TOT' },
  headerAttrs: (n) => `data-x="${n}"`,
  linkOf: (r) => (r.pid === 'a' ? '#/card/a' : null)
};

test('pages and the page a hole is on', () => {
  assert.equal(gridPages(18), 2);
  assert.equal(gridPages(9), 1);
  assert.equal(gridPages(0), 1);
  assert.deepEqual([1, 9, 10, 18].map(pageOfHole), [0, 0, 1, 1]);
});

test('an 18-hole grid is two pages with OUT, IN and TOT, a pager, and a hook on every cell', () => {
  const html = gridHTML(model(18, [row('a', 'Бат', Array(18).fill(4)), row('b', 'Дорж', [3, 5, ...Array(16).fill(null)])]), OPTS);
  assert.equal((html.match(/class="spg-page"/g) || []).length, 2);
  assert.equal((html.match(/data-spg-dot=/g) || []).length, 2);
  assert.ok(html.includes('>OUT<') && html.includes('>IN<') && html.includes('>TOT<'));
  // The second page carries both the IN and the TOT columns.
  assert.ok(html.includes('spg-grid spg-grid-tot'));
  // Every hole of every row is addressable, and the header wears the scorer's own attributes.
  for (let n = 1; n <= 18; n++) assert.ok(html.includes(`data-spg-cell="a:${n}"`) && html.includes(`data-x="${n}"`));
  assert.ok(html.includes('data-spg-seg="a:front"') && html.includes('data-spg-seg="a:back"') && html.includes('data-spg-seg="a:total"'));
  // The hole on screen is a column; a name links only where the scorer says so.
  assert.ok(html.includes('data-spg-col="11" class="spg-h spg-cur"'));
  assert.ok(html.includes('href="#/card/a"'));
  assert.ok(!html.includes('href="#/card/b"'));
  // Notation and blanks.
  assert.ok(html.includes('<i class="spc-n is-birdie">3</i>') && html.includes('<i class="spc-n is-bogey">5</i>'));
  assert.ok(html.includes('data-spg-cell="b:3"></span>'));
  // TOT reads gross with the to-par beneath.
  assert.ok(html.includes('<b>72</b><small class="tn-sc-over">+1</small>'));
});

test('a nine-hole grid is one page with TOT only and no pager; a back nine can label its holes', () => {
  const html = gridHTML(model(9, [row('a', 'Бат', Array(9).fill(4))]), { ...OPTS, hole: 2, holeLabel: (n) => n + 9 });
  assert.equal((html.match(/class="spg-page"/g) || []).length, 1);
  assert.ok(!html.includes('spg-pager') && !html.includes('data-spg-dot'));
  assert.ok(!html.includes('>OUT<') && !html.includes('>IN<') && html.includes('>TOT<'));
  assert.ok(!html.includes('spg-grid-tot'), 'a single page has eleven columns, not twelve');
  assert.ok(html.includes('data-spg-col="1" class="spg-h">10</button>'), 'the header reads the course hole');
  assert.ok(html.includes('data-spg-cell="a:1"'), 'the cells stay on the card index');
});

test('nothing to show is nothing at all', () => {
  assert.equal(gridHTML(model(18, []), OPTS), '');
  assert.equal(gridHTML(null, OPTS), '');
  assert.equal(cellInner({ strokes: null }), '');
  assert.equal(segInner({ holesIn: 0, gross: 0 }), '');
});

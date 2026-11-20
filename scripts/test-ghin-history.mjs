// scripts/test-ghin-history.mjs
// A member's Handicap Index over the last year as a chart
// (src/ghin-history.js): what of a record's history can be drawn, which
// points are marked, where everything goes at a width, and the markup.
// Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  indexText, ghinHistoryPoints, ghinHistoryMarks, niceTicks, ghinHistoryLayout, ghinHistoryNearest,
  ghinHistoryPlotHTML, ghinHistoryHTML,
} from '../src/ghin-history.js';

const H = {
  t: (k) => ({
    ghinHistSub: '{from} to {to}, {n} changes', ghinHistLow: 'Low', ghinHistHigh: 'High', ghinHistList: 'list ({n})',
    ghinHistAbout: 'now {now}, lowest {low}, highest {high}', ghinStagingShort: 'trial',
    ghinHistMonths: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
  }[k] || k),
  esc: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
};
const rev = (date, value, hi = value.toFixed(1)) => ({ date, hi, value });
const at = (y, m, d, h = 0) => Date.UTC(y, m - 1, d, h);

// Down two strokes, then back up one: 12.0 → 10.0 → 11.0, read on the 31st.
const HISTORY = [rev('2026-01-01', 12), rev('2026-01-11', 10), rev('2026-01-21', 11)];
const RECORD = { number: '12345678', env: 'staging', syncedAt: at(2026, 1, 31, 15), history: HISTORY };
const POINTS = ghinHistoryPoints(RECORD);
// 370 wide: thirty days over 300px — ten to a day; 104px from the highest to the lowest.
const LAYOUT = ghinHistoryLayout(POINTS, { width: 370, until: RECORD.syncedAt });

test('indexText: a whole number, a half, a plus handicap', () => {
  assert.deepEqual([12, 10.5, 0, -1, -2.5, 9.96].map(indexText), ['12', '10.5', '0', '+1', '+2.5', '10']);
});

test('ghinHistoryPoints: oldest first, with the day in milliseconds; what has no day, or nothing written, is left out', () => {
  const points = ghinHistoryPoints({ history: [
    rev('2026-03-05', 11.2), rev('2026-01-20', 12.4),
    { date: '', hi: '9.0', value: 9 }, { date: 'soon', hi: '9.0', value: 9 }, { hi: '9.0', value: 9 },
    { date: '2026-02-10' }, { date: '2026-02-11', hi: '', value: NaN }, null, 'x',
  ] });
  assert.deepEqual(points, [
    { date: '2026-01-20', hi: '12.4', value: 12.4, at: at(2026, 1, 20) },
    { date: '2026-03-05', hi: '11.2', value: 11.2, at: at(2026, 3, 5) },
  ]);
  // The list as a database gives it back, the day with a time, a plus handicap as GHIN writes it.
  assert.deepEqual(ghinHistoryPoints({ history: { 0: rev('2026-01-20T05:00:00', -1.2, '+1.2'), 1: rev('2026-03-05', 0.4) } })
    .map(p => [p.date, p.hi, p.value]), [['2026-01-20', '+1.2', -1.2], ['2026-03-05', '0.4', 0.4]]);
  // No index written: the number as it is written.
  assert.deepEqual(ghinHistoryPoints({ history: [{ date: '2026-01-20', value: -0.5 }, { date: '2026-01-21', hi: '', value: 3 }] })
    .map(p => p.hi), ['+0.5', '3']);
  for (const none of [null, undefined, {}, { history: null }, { history: 'x' }, { history: [] }]) assert.deepEqual(ghinHistoryPoints(none), []);
});

// No index for a while: GHIN writes «NH», with no number behind it.
const nh = (date) => ({ date, hi: 'NH' });

test('ghinHistoryPoints: a time with no index stays, as a break — not before the first index, and not alone', () => {
  const points = ghinHistoryPoints({ history: [nh('2025-12-01'), rev('2026-01-01', 12), nh('2026-01-11'), { date: '2026-01-15', hi: 'NH', value: 'x' }, rev('2026-01-21', 11), nh('2026-02-01')] });
  assert.deepEqual(points.map(p => [p.date, p.hi, p.value]), [
    ['2026-01-01', '12.0', 12], ['2026-01-11', 'NH', null], ['2026-01-15', 'NH', null], ['2026-01-21', '11.0', 11], ['2026-02-01', 'NH', null],
  ]);
  assert.deepEqual(ghinHistoryPoints({ history: [nh('2026-01-01'), nh('2026-02-01')] }), []);
});

test('ghinHistoryMarks: the last, the lowest and the highest — the latest of each', () => {
  assert.deepEqual(ghinHistoryMarks(POINTS), { now: 2, low: 1, high: 0 });
  const twice = ghinHistoryPoints({ history: [rev('2026-01-01', 10), rev('2026-01-02', 13), rev('2026-01-03', 10), rev('2026-01-04', 13), rev('2026-01-05', 12)] });
  assert.deepEqual(ghinHistoryMarks(twice), { now: 4, low: 2, high: 3 });
  // A time with no index is neither the lowest nor the highest — and, last, there is no index now.
  const gaps = ghinHistoryPoints({ history: [rev('2026-01-01', 12), nh('2026-01-05'), rev('2026-01-11', 10), rev('2026-01-21', 11), nh('2026-01-25')] });
  assert.deepEqual(ghinHistoryMarks(gaps), { now: null, low: 2, high: 0 });
  assert.deepEqual(ghinHistoryMarks(gaps.slice(0, 4)), { now: 3, low: 2, high: 0 });
  assert.deepEqual(ghinHistoryMarks([]), { now: null, low: null, high: null });
});

test('niceTicks: round numbers, four at most', () => {
  assert.deepEqual(niceTicks(9.58, 12.42), [10, 11, 12]);
  assert.deepEqual(niceTicks(10.2, 11.7), [10.5, 11, 11.5]);
  assert.deepEqual(niceTicks(10, 11.5), [10, 10.5, 11, 11.5], 'the ends themselves count');
  assert.deepEqual(niceTicks(9.1, 14.2), [10, 12, 14]);
  assert.deepEqual(niceTicks(-2.3, 1.2), [-2, -1, 0, 1]);
  assert.deepEqual(niceTicks(3, 31), [10, 20, 30]);
  assert.deepEqual(niceTicks(10.1, 10.4), []);
});

test('ghinHistoryLayout: the frame, and each point where its day and its index put it', () => {
  const L = LAYOUT;
  assert.deepEqual([L.width, L.height, L.left, L.right, L.top, L.bottom], [370, 176, 30, 330, 6, 154]);
  assert.deepEqual(L.xs, [30, 130, 230]);
  // A higher index is higher up; room is kept over the highest and under the lowest.
  assert.deepEqual(L.ys, [28, 132, 80]);
  // Across by the day, not by the count: a change three days on is three days along.
  const uneven = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 12), rev('2026-01-04', 10), rev('2026-01-21', 11)] }), { width: 370, until: at(2026, 1, 31) });
  assert.deepEqual(uneven.xs, [30, 60, 230]);
  // A width is a whole number of pixels, and never under 240; with none, 320.
  assert.equal(ghinHistoryLayout(POINTS, { width: 300.6 }).width, 301);
  assert.equal(ghinHistoryLayout(POINTS, { width: 120 }).width, 240);
  assert.equal(ghinHistoryLayout(POINTS).width, 320);
  assert.equal(ghinHistoryLayout(POINTS, { width: 370, height: 200 }).bottom, 178);
});

test('ghinHistoryLayout: the line is a step — flat until the day the index was revised, and on to the day it was read', () => {
  assert.equal(LAYOUT.path, 'M30,28H130V132H230V80H330');
  assert.deepEqual(LAYOUT.end, { x: 330, y: 80 });
  // Read on the day of the last change, before it, or never: the line ends at the last change.
  for (const until of [at(2026, 1, 21, 23), at(2026, 1, 5), undefined, 'x']) {
    const L = ghinHistoryLayout(POINTS, { width: 370, until });
    assert.equal(L.path, 'M30,28H180V132H330V80', String(until));
    assert.deepEqual([L.xs, L.end], [[30, 180, 330], { x: 330, y: 80 }]);
  }
});

test('ghinHistoryLayout: a time with no index is a break — the line stops there and starts again at the next index', () => {
  const gap = ghinHistoryPoints({ history: [rev('2026-01-01', 12), nh('2026-01-11'), rev('2026-01-21', 11)] });
  const L = ghinHistoryLayout(gap, { width: 370, until: at(2026, 1, 31) });
  // No riser from 12 to 11: nothing is drawn from the 11th to the 21st.
  assert.equal(L.path, 'M30,28H130M230,132H330');
  assert.deepEqual([L.xs, L.ys], [[30, 130, 230], [28, null, 132]]);
  assert.deepEqual([L.marks, L.end], [{ now: 2, low: null, high: 0 }, { x: 330, y: 132 }]);
  // Two in a row are one break; the scale is the numbers' alone.
  const two = ghinHistoryPoints({ history: [rev('2026-01-01', 12), nh('2026-01-06'), { date: '2026-01-11', hi: 'WD' }, rev('2026-01-21', 11)] });
  assert.equal(ghinHistoryLayout(two, { width: 370, until: at(2026, 1, 31) }).path, 'M30,28H80M230,132H330');
});

test('ghinHistoryLayout: a history that ends with no index — the line ends there, and nothing is the index now', () => {
  const ended = ghinHistoryPoints({ history: [rev('2026-01-01', 12), rev('2026-01-11', 11), nh('2026-01-21')] });
  const L = ghinHistoryLayout(ended, { width: 370, until: at(2026, 1, 31) });
  // Not on to the day it was read: 11.0 stopped being the index on the 21st.
  assert.equal(L.path, 'M30,28H130V132H230');
  assert.deepEqual([L.marks, L.end], [{ now: null, low: 1, high: 0 }, null]);
  const html = ghinHistoryPlotHTML(L, ended, H);
  assert.deepEqual([/gh-now/.test(html), html.split('class="gh-dot').length - 1, /High <tspan class="gh-lab-v">12\.0</.test(html), /Low <tspan class="gh-lab-v">11\.0</.test(html)], [false, 2, true, true]);
  assert.match(ghinHistoryHTML({ syncedAt: at(2026, 1, 31), history: [rev('2026-01-01', 12), rev('2026-01-11', 11), nh('2026-01-21')] }, H),
    /<div class="gs-sub">GHIN · 2026\.01\.01 to 2026\.01\.21, 3 changes<\/div>\s*<div class="gh-card">\s*<div class="gh-plot" tabindex="0" role="img" aria-label="now NH, lowest 11\.0, highest 12\.0">/);
  // The time with no index is in the list, and can be pointed at.
  assert.match(ghinHistoryHTML({ history: [rev('2026-01-01', 12), rev('2026-01-11', 11), nh('2026-01-21')] }, H), /<span>2026\.01\.21<\/span><span class="gh-row-v">NH<\/span>/);
  assert.equal(ghinHistoryNearest(L, 240), 2);
});

test('ghinHistoryLayout: nothing to draw from one point, or from none, or with no time between them', () => {
  assert.equal(ghinHistoryLayout([], { width: 370 }), null);
  assert.equal(ghinHistoryLayout(null, { width: 370 }), null);
  assert.equal(ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 12)] }), { width: 370, until: at(2026, 3, 1) }), null);
  assert.equal(ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 12), rev('2026-01-01', 11)] }), { width: 370 }), null);
  // One index and a time with none is still one index.
  assert.equal(ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 12), nh('2026-02-01')] }), { width: 370, until: at(2026, 3, 1) }), null);
});

test('ghinHistoryLayout: the lowest and the highest are marked — unless that is where the line ends', () => {
  assert.deepEqual(LAYOUT.marks, { now: 2, low: 1, high: 0 });
  const down = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 12), rev('2026-01-11', 11), rev('2026-01-21', 10)] }), { width: 370 });
  assert.deepEqual(down.marks, { now: 2, low: null, high: 0 });
  const up = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 10), rev('2026-01-11', 12)] }), { width: 370 });
  assert.deepEqual(up.marks, { now: 1, low: 0, high: null });
});

test('ghinHistoryLayout: an index that barely moved is not blown up — the scale spans a stroke at least', () => {
  const L = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 10.4), rev('2026-01-11', 10.2)] }), { width: 370 });
  // 104px to a stroke: 0.2 apart is 20.8px, about the middle of the frame.
  assert.deepEqual(L.ys, [69.6, 90.4]);
  assert.deepEqual(L.yTicks, [{ y: 111.2, text: '10' }, { y: 59.2, text: '10.5' }, { y: 7.2, text: '11' }]);
});

test('ghinHistoryLayout: the figures down the side are round numbers inside the frame', () => {
  assert.deepEqual(LAYOUT.yTicks, [{ y: 132, text: '10' }, { y: 80, text: '11' }, { y: 28, text: '12' }]);
  const plus = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-01-01', 1), rev('2026-01-11', -1, '+1.0')] }), { width: 370 });
  assert.deepEqual(plus.yTicks.map(k => k.text), ['+1', '0', '1']);
  for (const k of [...LAYOUT.yTicks, ...plus.yTicks]) assert.ok(k.y >= 6 && k.y <= 154, String(k.y));
  // None at the foot of the frame, where its rule would double the one under the chart: 17.5 is left out.
  const foot = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-11-03', 18.4), rev('2026-11-09', 17.9), rev('2026-11-15', 18.1)] }), { width: 370 });
  assert.deepEqual(foot.yTicks, [{ y: 95.6, text: '18' }, { y: 43.6, text: '18.5' }]);
  // … but one that stands clear of it stays.
  const clear = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-11-03', 18.3), rev('2026-11-09', 17.9)] }), { width: 370 });
  assert.deepEqual(clear.yTicks, [{ y: 142.4, text: '17.5' }, { y: 90.4, text: '18' }, { y: 38.4, text: '18.5' }]);
});

test('ghinHistoryLayout: the months under it — as many as there is room to name, January always', () => {
  const year = ghinHistoryPoints({ history: [rev('2025-10-09', 13.6), rev('2026-06-01', 9.7), rev('2026-11-11', 10.8)] });
  const until = at(2026, 11, 20, 9);
  // 300px for 407 days: a month is 22px — every second month has room.
  const wide = ghinHistoryLayout(year, { width: 370, until });
  assert.deepEqual(wide.xTicks.map(k => `${k.year}-${k.month}`), ['2025-11', '2026-1', '2026-3', '2026-5', '2026-7', '2026-9', '2026-11']);
  assert.equal(wide.xTicks[0].x, 47);                 // 1 November: 23 days in
  // A narrow phone: every quarter.
  const narrow = ghinHistoryLayout(year, { width: 282, until });
  assert.deepEqual(narrow.xTicks.map(k => `${k.year}-${k.month}`), ['2026-1', '2026-4', '2026-7', '2026-10']);
  // The narrowest: twice a year.
  assert.deepEqual(ghinHistoryLayout(year, { width: 240, until }).xTicks.map(k => k.month), [1, 7]);
  // A month that begins on the first day, or the last, is named too.
  const whole = ghinHistoryLayout(ghinHistoryPoints({ history: [rev('2026-03-01', 12), rev('2026-04-10', 11)] }), { width: 370, until: at(2026, 5, 1) });
  assert.deepEqual(whole.xTicks.map(k => [k.month, k.x]), [[3, 30], [4, 182.5], [5, 330]]);
});

test('ghinHistoryLayout: too short a time to name two months — the first day and the last', () => {
  assert.deepEqual(LAYOUT.xTicks, [{ x: 30, day: '01.01', anchor: 'start' }, { x: 330, day: '01.31', anchor: 'end' }]);
});

test('ghinHistoryNearest: the revision nearest across the chart', () => {
  assert.deepEqual([-50, 30, 79, 81, 130, 185, 229, 300, 999].map(px => ghinHistoryNearest(LAYOUT, px)), [0, 0, 0, 1, 1, 2, 2, 2, 2]);
  // Half way between two: the earlier.
  assert.deepEqual([80, 180].map(px => ghinHistoryNearest(LAYOUT, px)), [0, 1]);
});

test('ghinHistoryPlotHTML: the line, a dot and a word at the highest and the lowest, the index now at the end', () => {
  const html = ghinHistoryPlotHTML(LAYOUT, POINTS, H);
  assert.match(html, /<svg class="gh-svg" width="370" height="176" viewBox="0 0 370 176"/);
  assert.match(html, /<path class="gh-line" d="M30,28H130V132H230V80H330"\/>/);
  // Over the highest — at the left edge, so written from there on; under the lowest.
  assert.match(html, /<circle class="gh-dot" cx="30" cy="28" r="4"\/><text class="gh-lab" x="30" y="18" text-anchor="start">High <tspan class="gh-lab-v">12\.0<\/tspan><\/text>/);
  assert.match(html, /<circle class="gh-dot" cx="130" cy="132" r="4"\/><text class="gh-lab" x="130" y="149" text-anchor="middle">Low <tspan class="gh-lab-v">10\.0<\/tspan><\/text>/);
  assert.match(html, /<circle class="gh-dot gh-now" cx="330" cy="80" r="4\.5"\/>\s*<text class="gh-lab gh-lab-now" x="339" y="84">11\.0<\/text>/);
  assert.equal(html.split('class="gh-dot').length - 1, 3);
  // The figures, the days under it, and what follows the pointer.
  assert.match(html, /<text class="gh-tick" x="23" y="135\.5" text-anchor="end">10<\/text>/);
  assert.match(html, /<text class="gh-tick" x="30" y="169" text-anchor="start">01\.01<\/text><text class="gh-tick" x="330" y="169" text-anchor="end">01\.31<\/text>/);
  assert.match(html, /<line class="gh-cross" x1="0" x2="0" y1="6" y2="154"\/>/);
  assert.match(html, /<circle class="gh-focus"[^>]*\/>\s*<\/svg>\s*<div class="gh-tip" role="status">/);
});

test('ghinHistoryPlotHTML: a mark at the right edge is written back from it; where the line ends needs no second mark', () => {
  const late = ghinHistoryPoints({ history: [rev('2026-01-01', 11), rev('2026-01-29', 12), rev('2026-01-31', 11.5)] });
  const html = ghinHistoryPlotHTML(ghinHistoryLayout(late, { width: 370 }), late, H);
  assert.match(html, /<text class="gh-lab" x="310" y="18" text-anchor="end">High <tspan class="gh-lab-v">12\.0<\/tspan>/);
  const down = ghinHistoryPoints({ history: [rev('2026-01-01', 12), rev('2026-01-21', 10)] });
  const one = ghinHistoryPlotHTML(ghinHistoryLayout(down, { width: 370 }), down, H);
  assert.equal(/Low/.test(one), false);
  assert.equal(one.split('class="gh-dot').length - 1, 2);
  const up = ghinHistoryPoints({ history: [rev('2026-01-01', 10), rev('2026-01-21', 12)] });
  const other = ghinHistoryPlotHTML(ghinHistoryLayout(up, { width: 370 }), up, H);
  assert.deepEqual([/High/.test(other), /Low <tspan class="gh-lab-v">10\.0</.test(other), other.split('class="gh-dot').length - 1], [false, true, 2]);
});

test('ghinHistoryPlotHTML: a month by its name, and the year where a year begins', () => {
  const year = ghinHistoryPoints({ history: [rev('2025-10-09', 13.6), rev('2026-06-01', 9.7), rev('2026-11-11', 10.8)] });
  const html = ghinHistoryPlotHTML(ghinHistoryLayout(year, { width: 282, until: at(2026, 11, 20) }), year, H);
  assert.deepEqual([...html.matchAll(/<text class="gh-tick" x="[\d.]+" y="169" text-anchor="middle">([^<]*)</g)].map(m => m[1]), ['2026', 'Apr', 'Jul', 'Oct']);
});

test('ghinHistoryHTML: the time it covers, the chart\'s place, and every change as a list — the latest first', () => {
  const html = ghinHistoryHTML(RECORD, H);
  assert.match(html, /<div class="gs-sub">GHIN · trial · 2026\.01\.01 to 2026\.01\.21, 3 changes<\/div>/);
  assert.match(html, /<div class="gh-plot" tabindex="0" role="img" aria-label="now 11\.0, lowest 10\.0, highest 12\.0"><\/div>/);
  assert.match(html, /<summary>list \(3\)<\/summary>/);
  assert.deepEqual([...html.matchAll(/<div class="gh-row"><span>([^<]*)<\/span><span class="gh-row-v">([^<]*)<\/span>/g)].map(m => [m[1], m[2]]),
    [['2026.01.21', '11.0'], ['2026.01.11', '10.0'], ['2026.01.01', '12.0']]);
  // GHIN's own, not its trial copy: not marked as one.
  assert.match(ghinHistoryHTML({ ...RECORD, env: 'production' }, H), /<div class="gs-sub">GHIN · 2026/);
});

test('ghinHistoryHTML: nothing when there is no history to draw', () => {
  for (const none of [null, {}, { history: [] }, { history: [rev('2026-01-01', 12)] }, { history: [{ date: '2026-01-01', hi: 'NH' }, rev('2026-02-01', 12)] },
    { history: [rev('2026-01-01', 12), nh('2026-02-01')] }, { history: [nh('2026-01-01'), nh('2026-02-01')] },
    { withheld: true, revision: [], recent: [] }]) assert.equal(ghinHistoryHTML(none, H), '');
});

test('the chart: nothing of GHIN\'s is markup', () => {
  const record = { ...RECORD, history: [rev('2026-01-01', 12, '<b>12</b>'), rev('2026-01-11', 10, '"><script>'), rev('2026-01-21', 11, '<img src=x>')] };
  const points = ghinHistoryPoints(record);
  for (const html of [ghinHistoryHTML(record, H), ghinHistoryPlotHTML(ghinHistoryLayout(points, { width: 370 }), points, H)]) {
    assert.ok(html.length > 0);
    assert.equal(/<b>|<script|<img/.test(html), false);
  }
});

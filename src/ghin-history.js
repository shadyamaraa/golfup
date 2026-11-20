// src/ghin-history.js
// A member's Handicap Index over the last year, as a chart (docs/ghin.md).
// The data is the scoring record's `history`: one entry each time the index
// changed, oldest first. The index holds from one revision to the next, so
// the line is a step — flat until the day it was revised, and on to the day
// the record was read. Marked on it: the index now (the end of the line), the
// lowest and the highest of the year. Pointing at the chart shows the day and
// the index of the nearest revision; every value is also in the list under
// it. Down to ghinHistoryNearest the functions are pure (no DOM);
// ghinHistoryHTML and ghinHistoryPlotHTML build markup; mountGhinHistory
// draws at the host's width and wires it.

const DAY = 86400000;

// '2026-11-01' → that day, in milliseconds (UTC); NaN for anything else.
const dayAt = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
};
// '2026-11-01' → '2026.11.01'
const dateText = (d) => String(d || '').slice(0, 10).replace(/-/g, '.');
const round1 = (n) => Math.round(n * 10) / 10;
// A list as stored: an array, or the object a database makes of one.
const items = (v) => (Array.isArray(v) ? v : Object.values(v && typeof v === 'object' ? v : {}));

/** A number on the index's scale as it is written: 12, 10.5, and «+1» for one below zero. */
export function indexText(v) {
  const n = round1(v);
  return n < 0 ? `+${-n}` : String(n);
}

/**
 * What can be drawn of a record's history: [{ date, hi, value, at }], oldest
 * first — the day, the index as GHIN displays it, the number behind it and
 * the day in milliseconds. An entry with no day or no number («NH») is left out.
 */
export function ghinHistoryPoints(record) {
  return items(record?.history)
    .map(r => ({ date: String(r?.date || '').slice(0, 10), value: r?.value, at: dayAt(r?.date), hi: r?.hi }))
    .filter(p => Number.isFinite(p.at) && typeof p.value === 'number' && Number.isFinite(p.value))
    .map(p => ({ ...p, hi: p.hi == null || p.hi === '' ? indexText(p.value) : String(p.hi) }))
    .sort((a, b) => a.at - b.at);
}

/**
 * Which points are marked: { now, low, high } — the last, and the lowest and
 * the highest index (the latest of each, when it was reached more than once).
 */
export function ghinHistoryMarks(points) {
  let low = 0;
  let high = 0;
  points.forEach((p, i) => {
    if (p.value <= points[low].value) low = i;
    if (p.value >= points[high].value) high = i;
  });
  return { now: points.length - 1, low, high };
}

/** Round numbers from `lo` to `hi` — the widest set of at most `most`. */
export function niceTicks(lo, hi, most = 4) {
  for (const step of [0.5, 1, 2, 5, 10, 20, 50]) {
    const out = [];
    for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(round1(k * step));
    if (out.length <= most) return out;
  }
  return [];
}

// So far apart, at least, are two months named under the chart (px).
const MONTH_GAP = 40;

/**
 * Where everything goes at a width. `opts`: { width, height?, until? } —
 * `until` is when the record was read (ms): the line runs on to that day.
 * null when there is nothing to draw: fewer than two points, or no time
 * between them.
 *
 * → { width, height, left, right, top, bottom,     the plot's frame
 *     xs, ys,                                     a point's place, by its index
 *     path,                                       the step line
 *     marks: { now, low, high },                  indexes; low/high null when it is the last
 *     end: { x, y },                              the end of the line — the index now
 *     yTicks: [{ y, text }], xTicks: [{ x, month, year } | { x, day, anchor }] }
 */
export function ghinHistoryLayout(points, opts = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const last = points[points.length - 1];
  const from = points[0].at;
  const until = Math.floor(Number(opts.until) / DAY) * DAY;
  const to = Math.max(last.at, Number.isFinite(until) ? until : 0);
  if (!(to > from)) return null;

  const width = Math.max(240, Math.round(Number(opts.width) || 320));
  const height = Math.round(Number(opts.height) || 176);
  // The frame: figures down the left, the index now past the right end, the months under it.
  const left = 30;
  const right = width - 40;
  const top = 6;
  const bottom = height - 22;
  const x = (at) => round1(left + (at - from) / (to - from) * (right - left));

  // The line keeps clear of the frame: room over the highest and under the
  // lowest for what is written there. An index that barely moved is not
  // blown up to fill the height: the scale spans a stroke at least.
  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const ceiling = (max + min) / 2 + span / 2;
  const yHigh = top + 22;
  const yLow = bottom - 22;
  const perPx = span / (yLow - yHigh);
  const y = (v) => round1(yHigh + (ceiling - v) / perPx);

  const xs = points.map(p => x(p.at));
  const ys = points.map(p => y(p.value));
  let path = `M${xs[0]},${ys[0]}`;
  for (let i = 1; i < points.length; i++) path += `H${xs[i]}V${ys[i]}`;
  if (to > last.at) path += `H${right}`;

  const m = ghinHistoryMarks(points);
  const marks = { now: m.now, low: m.low === m.now ? null : m.low, high: m.high === m.now ? null : m.high };

  // Round numbers down the side — none so near the foot of the frame that
  // its rule would read as a second one.
  const yTicks = niceTicks(ceiling - (bottom - yHigh) * perPx, ceiling + (yHigh - top) * perPx)
    .map(v => ({ y: y(v), text: indexText(v) }))
    .filter(k => k.y <= bottom - 8);

  // The months: each one's first day, as many as there is room to name —
  // every month, every second, every quarter… January always among them.
  const perMonth = (right - left) / ((to - from) / (DAY * 30.44));
  const every = [1, 2, 3, 6].find(n => n * perMonth >= MONTH_GAP) || 12;
  let xTicks = [];
  const start = new Date(from);
  for (let yr = start.getUTCFullYear(), mo = start.getUTCMonth(); ; mo++) {
    if (mo > 11) { mo = 0; yr++; }
    const at = Date.UTC(yr, mo, 1);
    if (at > to) break;
    if (at >= from && mo % every === 0) xTicks.push({ x: x(at), month: mo + 1, year: yr });
  }
  // Too short a time to name two months: the first day and the last instead.
  if (xTicks.length < 2) {
    const md = (at) => new Date(at).toISOString().slice(5, 10).replace('-', '.');
    xTicks = [{ x: left, day: md(from), anchor: 'start' }, { x: right, day: md(to), anchor: 'end' }];
  }

  return { width, height, left, right, top, bottom, xs, ys, path, marks, end: { x: to > last.at ? right : xs[m.now], y: ys[m.now] }, yTicks, xTicks };
}

/** The point nearest to `px` across the chart: its index — the earlier of two as near. */
export function ghinHistoryNearest(layout, px) {
  let best = 0;
  layout.xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(layout.xs[best] - px)) best = i; });
  return best;
}

// A month under the chart: its name — and the year where a year begins.
function monthText(tick, t) {
  if (tick.day) return tick.day;
  if (tick.month === 1) return String(tick.year);
  return String(t('ghinHistMonths')).split(',')[tick.month - 1] || String(tick.month);
}

/**
 * The chart itself, for a layout: an <svg> and, over it, the note that
 * follows the pointer. `h`: { t, esc }. Colours and type come from the
 * stylesheet (.gh-*), so the same markup serves the light and the dark theme.
 */
export function ghinHistoryPlotHTML(layout, points, h) {
  const { t, esc } = h;
  const L = layout;
  // Written at a marked point: over the highest, under the lowest — and kept inside the frame.
  const label = (i, word, dy) => {
    const px = L.xs[i];
    const anchor = px < L.left + 40 ? 'start' : px > L.right - 40 ? 'end' : 'middle';
    return `<text class="gh-lab" x="${px}" y="${round1(L.ys[i] + dy)}" text-anchor="${anchor}">${esc(word)} <tspan class="gh-lab-v">${esc(points[i].hi)}</tspan></text>`;
  };
  const dot = (i) => `<circle class="gh-dot" cx="${L.xs[i]}" cy="${L.ys[i]}" r="4"/>`;
  return `
    <svg class="gh-svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" aria-hidden="true" focusable="false">
      ${L.yTicks.map(k => `<line class="gh-grid" x1="${L.left}" x2="${L.right}" y1="${k.y}" y2="${k.y}"/><text class="gh-tick" x="${L.left - 7}" y="${round1(k.y + 3.5)}" text-anchor="end">${esc(k.text)}</text>`).join('')}
      <line class="gh-grid" x1="${L.left}" x2="${L.right}" y1="${L.bottom}" y2="${L.bottom}"/>
      ${L.xTicks.map(k => `<text class="gh-tick" x="${k.x}" y="${L.bottom + 15}" text-anchor="${k.anchor || 'middle'}">${esc(monthText(k, t))}</text>`).join('')}
      <path class="gh-line" d="${L.path}"/>
      <line class="gh-cross" x1="0" x2="0" y1="${L.top}" y2="${L.bottom}"/>
      ${L.marks.high != null ? dot(L.marks.high) + label(L.marks.high, t('ghinHistHigh'), -10) : ''}
      ${L.marks.low != null ? dot(L.marks.low) + label(L.marks.low, t('ghinHistLow'), 17) : ''}
      <circle class="gh-dot gh-now" cx="${L.end.x}" cy="${L.end.y}" r="4.5"/>
      <text class="gh-lab gh-lab-now" x="${L.end.x + 9}" y="${round1(L.end.y + 4)}">${esc(points[L.marks.now].hi)}</text>
      <circle class="gh-focus" cx="0" cy="0" r="5"/>
    </svg>
    <div class="gh-tip" role="status"><span class="gh-tip-v"></span><span class="gh-tip-d"></span></div>`;
}

/**
 * The profile's block for a stored scoring record: a line saying what time
 * it covers, the chart's place (drawn by mountGhinHistory, at the width it
 * finds there) and, folded under it, every change as a list — the latest
 * first. `h`: { t, esc }. '' when the record has no history to draw.
 */
export function ghinHistoryHTML(record, h) {
  const { t, esc } = h;
  const points = ghinHistoryPoints(record);
  if (!ghinHistoryLayout(points, { until: record?.syncedAt })) return '';
  const m = ghinHistoryMarks(points);
  const trial = record?.env === 'staging' ? ` · ${t('ghinStagingShort')}` : '';
  const sub = t('ghinHistSub')
    .replace('{from}', dateText(points[0].date)).replace('{to}', dateText(points[m.now].date)).replace('{n}', points.length);
  const about = t('ghinHistAbout')
    .replace('{now}', points[m.now].hi).replace('{low}', points[m.low].hi).replace('{high}', points[m.high].hi);
  return `
    <div class="gs-sub">GHIN${esc(trial)} · ${esc(sub)}</div>
    <div class="gh-card">
      <div class="gh-plot" tabindex="0" role="img" aria-label="${esc(about)}"></div>
      <details class="gh-more">
        <summary>${esc(t('ghinHistList').replace('{n}', points.length))}</summary>
        <div class="gh-rows">${points.slice().reverse().map(p => `
          <div class="gh-row"><span>${esc(dateText(p.date))}</span><span class="gh-row-v">${esc(p.hi)}</span></div>`).join('')}
        </div>
      </details>
    </div>`;
}

// The observer watching each host's width, so a second draw replaces the first.
const watching = new WeakMap();

/**
 * Draw a record's history into `host` — `head` (the section's heading) over
 * it — or empty it when there is none. The chart is drawn at the width found
 * there and again when that changes. Pointing, touching or the arrow keys
 * show a revision: a line down the chart at its day, a dot on it, and the
 * index and the day in a note at the top.
 */
export function mountGhinHistory(host, record, h, head = '') {
  if (!host) return;
  watching.get(host)?.disconnect();
  watching.delete(host);
  const html = ghinHistoryHTML(record, h);
  host.innerHTML = html ? head + html : '';
  const plot = host.querySelector('.gh-plot');
  if (!plot) return;

  const points = ghinHistoryPoints(record);
  let layout = null;
  let drawnAt = 0;      // the width the chart was last drawn at
  let shown = -1;
  const show = (i) => {
    if (!layout || i < 0 || i >= points.length) return;
    shown = i;
    const px = layout.xs[i];
    const cross = plot.querySelector('.gh-cross');
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    const focus = plot.querySelector('.gh-focus');
    focus.setAttribute('cx', px);
    focus.setAttribute('cy', layout.ys[i]);
    const tip = plot.querySelector('.gh-tip');
    tip.querySelector('.gh-tip-v').textContent = points[i].hi;
    tip.querySelector('.gh-tip-d').textContent = dateText(points[i].date);
    plot.classList.add('on');
    // Over the revision, but never past the chart's edge.
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(px, half), layout.width - half)}px`;
  };
  const hide = () => { shown = -1; plot.classList.remove('on'); };
  const draw = () => {
    drawnAt = plot.clientWidth;
    layout = ghinHistoryLayout(points, { width: drawnAt, until: record?.syncedAt });
    plot.innerHTML = layout ? ghinHistoryPlotHTML(layout, points, h) : '';
    if (shown >= 0) show(shown);
  };
  draw();

  const at = (e) => ghinHistoryNearest(layout, e.clientX - plot.getBoundingClientRect().left);
  plot.addEventListener('pointerdown', (e) => show(at(e)));
  plot.addEventListener('pointermove', (e) => show(at(e)));
  // A mouse that leaves takes the note with it; a finger lifted leaves it to be read.
  plot.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  plot.addEventListener('focus', () => { if (shown < 0) show(points.length - 1); });
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (e.key === 'Escape') hide();
    if (!step) return;
    e.preventDefault();
    show(Math.min(points.length - 1, Math.max(0, (shown < 0 ? points.length - 1 : shown) + step)));
  });

  if (typeof ResizeObserver !== 'function') return;
  const ro = new ResizeObserver(() => {
    if (!plot.isConnected) { ro.disconnect(); return; }
    if (plot.clientWidth && plot.clientWidth !== drawnAt) draw();
  });
  ro.observe(plot);
  watching.set(host, ro);
}

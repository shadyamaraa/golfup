// src/flight-grid.js
// The on-screen group scorecard — the PGA Tour-style grid under both scorers:
// HOLE and PAR rows, one row per competitor, nine holes a page with OUT on the
// front and IN + TOT on the back (or one page with TOT for a nine-hole game),
// birdies ringed and bogeys boxed in the card page's notation, the hole being
// scored picked out as a column, and every cell carrying a hook so a score
// landing anywhere in the group is patched in place, never rebuilt.
//
// Shared by the tournament flight scorer and the casual game scorer for the
// same reason scorecard-grid.js is shared by the two printed cards: one grid,
// so the two cannot drift apart. Everything that differs between the two
// sides comes in through `opts` — the header buttons' attributes (each scorer
// has its own jump contract), the hole label (a back-nine casual game numbers
// its card 1..9 but plays 10..18), the name link, the TOT cell's sub-line and
// the labels — and the grid itself is a MODEL (spFlightGrid / gameGroupGrid),
// never a record. No i18n import, so the module stays importable under node.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const HOLES_PER_PAGE = 9;
export const gridPages = (holeCount) => Math.max(1, Math.ceil((Number(holeCount) || 0) / HOLES_PER_PAGE));
export const pageOfHole = (hole) => Math.floor((Math.max(1, Number(hole) || 1) - 1) / HOLES_PER_PAGE);

// One hole of one row, in the card page's notation; blank until entered.
export const cellInner = (h) => (h && h.strokes !== null && h.strokes !== undefined
  ? `<i class="spc-n${h.cls ? ` is-${h.cls}` : ''}">${h.strokes}</i>` : '');
// A nine's gross, blank until a hole of it is in.
export const segInner = (seg) => (seg?.holesIn ? `<i class="spc-n">${seg.gross}</i>` : '');
// The default TOT cell: gross with the to-par reading beneath.
export const totInnerDefault = (r, fmt) => {
  if (!r.total.holesIn) return '';
  const tp = r.total.toPar;
  const cls = tp === null ? '' : tp < 0 ? 'tn-sc-under' : tp > 0 ? 'tn-sc-over' : 'tn-sc-even';
  return `<b>${r.total.gross}</b>${tp === null ? '' : `<small class="${cls}">${fmt(tp)}</small>`}`;
};

const parSum = (grid, nos) => {
  if (!grid.hasPars) return '';
  let sum = 0;
  for (const n of nos) { const p = Number(grid.pars?.[n]); if (!(p > 0)) return ''; sum += p; }
  return String(sum);
};

// One page: the holes `from..to`, a segment column (OUT / IN) when the grid
// has more than one page, and the TOT column on the last page.
export function gridPageHTML(grid, page, opts) {
  const pages = gridPages(grid.holeCount);
  const from = page * HOLES_PER_PAGE + 1;
  const to = Math.min(grid.holeCount, from + HOLES_PER_PAGE - 1);
  const nos = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const all = Array.from({ length: grid.holeCount }, (_, i) => i + 1);
  const last = page === pages - 1;
  const segKey = pages > 1 ? (page === 0 ? 'front' : 'back') : null;
  const segLabel = segKey === 'front' ? opts.labels.out : opts.labels.in;
  const cur = (n) => (n === opts.hole ? ' spg-cur' : '');
  const holeLabel = opts.holeLabel || ((n) => n);
  const nameCell = (r) => {
    const href = opts.linkOf ? opts.linkOf(r) : null;
    const cls = `spg-name${r.kind === 'pair' ? ' spg-pair' : ''}`;
    return href
      ? `<a class="${cls}" href="${esc(href)}" title="${esc(r.name)}">${esc(r.name)}</a>`
      : `<span class="${cls}" title="${esc(r.name)}">${esc(r.name)}</span>`;
  };
  const totInner = opts.totInner || ((r) => totInnerDefault(r, (v) => (v > 0 ? `+${v}` : v === 0 ? 'E' : String(v))));
  const cols = (segKey ? 1 : 0) + (last ? 1 : 0);
  return `
        <div class="spg-page">
          <div class="spg-grid${cols === 2 ? ' spg-grid-tot' : ''}">
            <span class="spg-lbl">${esc(opts.labels.hole)}</span>
            ${nos.map(n => `<button ${opts.headerAttrs(n)} data-spg-col="${n}" class="spg-h${cur(n)}${grid.full[n - 1] ? ' spg-full' : ''}">${esc(holeLabel(n))}</button>`).join('')}
            ${segKey ? `<span class="spg-h spg-seg">${esc(segLabel)}</span>` : ''}
            ${last ? `<span class="spg-h spg-seg">${esc(opts.labels.tot)}</span>` : ''}
            ${grid.hasPars ? `
            <span class="spg-lbl">${esc(opts.labels.par)}</span>
            ${nos.map(n => `<span class="spg-p${cur(n)}" data-spg-col="${n}">${grid.pars[n] ?? ''}</span>`).join('')}
            ${segKey ? `<span class="spg-p spg-seg">${parSum(grid, nos)}</span>` : ''}
            ${last ? `<span class="spg-p spg-seg">${parSum(grid, all)}</span>` : ''}` : ''}
            ${grid.rows.map(r => `
            ${nameCell(r)}
            ${nos.map(n => `<span class="spg-s${cur(n)}" data-spg-col="${n}" data-spg-cell="${esc(r.pid)}:${n}">${cellInner(r.holes[n - 1])}</span>`).join('')}
            ${segKey ? `<span class="spg-s spg-seg" data-spg-seg="${esc(r.pid)}:${segKey}">${segInner(r[segKey])}</span>` : ''}
            ${last ? `<span class="spg-s spg-seg spg-tot" data-spg-seg="${esc(r.pid)}:total">${totInner(r)}</span>` : ''}`).join('')}
          </div>
        </div>`;
}

// The grid: its pages side by side in a snap scroller, and — with more than
// one page — the ‹ · · › pager beneath.
export function gridHTML(grid, opts) {
  if (!grid || !grid.rows?.length) return '';
  const pages = gridPages(grid.holeCount);
  return `
      <div class="spg" data-spg>
        <div class="spg-pages" data-spg-pages>
          ${Array.from({ length: pages }, (_, i) => gridPageHTML(grid, i, opts)).join('')}
        </div>
        ${pages > 1 ? `
        <div class="spg-pager">
          <button data-spg-page="-1" aria-label="${esc(opts.labels.out)}">‹</button>
          <span class="spg-dots">${Array.from({ length: pages }, (_, i) => `<i data-spg-dot="${i}"></i>`).join('')}</span>
          <button data-spg-page="1" aria-label="${esc(opts.labels.in)}">›</button>
        </div>` : ''}
      </div>`;
}

// Refresh a mounted grid from a fresh model, touching only what changed: the
// cells, the segments, the header's gold, the highlighted column — and the
// page, which follows the hole on screen.
export function patchGrid(host, grid, opts) {
  if (!host || !grid) return;
  const set = (sel, html) => {
    const el = host.querySelector(sel);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  };
  const totInner = opts.totInner || ((r) => totInnerDefault(r, (v) => (v > 0 ? `+${v}` : v === 0 ? 'E' : String(v))));
  grid.rows.forEach(r => {
    const pid = CSS.escape(r.pid);
    r.holes.forEach(h => set(`[data-spg-cell="${pid}:${h.hole}"]`, cellInner(h)));
    set(`[data-spg-seg="${pid}:front"]`, segInner(r.front));
    set(`[data-spg-seg="${pid}:back"]`, segInner(r.back));
    set(`[data-spg-seg="${pid}:total"]`, totInner(r));
  });
  host.querySelectorAll('.spg-h[data-spg-col]').forEach(b => {
    b.classList.toggle('spg-full', !!grid.full[Number(b.dataset.spgCol) - 1]);
  });
  host.querySelectorAll('[data-spg-col]').forEach(el => {
    el.classList.toggle('spg-cur', Number(el.dataset.spgCol) === Number(opts.hole));
  });
  const pages = host.querySelector('[data-spg-pages]');
  if (pages && pages.clientWidth) {
    const want = pageOfHole(opts.hole);
    const at = Math.round(pages.scrollLeft / pages.clientWidth);
    if (want !== at) pages.scrollTo({ left: want * pages.clientWidth, behavior: 'smooth' });
  }
}

// The pages: opened on the page of the hole being scored, swiped or stepped
// between, the dots following the scroll. Called once per full render.
export function wirePager(host, page) {
  const pages = host?.querySelector('[data-spg-pages]');
  if (!pages) return;
  const count = pages.querySelectorAll('.spg-page').length;
  const dots = host.querySelectorAll('[data-spg-dot]');
  const pageOf = () => (pages.clientWidth ? Math.round(pages.scrollLeft / pages.clientWidth) : 0);
  const showDots = () => {
    const on = pageOf();
    dots.forEach(d => d.classList.toggle('on', Number(d.dataset.spgDot) === on));
    host.querySelectorAll('button[data-spg-page]').forEach(b => {
      const next = on + Number(b.dataset.spgPage);
      b.disabled = next < 0 || next > count - 1;
    });
  };
  pages.scrollLeft = Math.min(count - 1, Math.max(0, page || 0)) * pages.clientWidth;
  showDots();
  pages.addEventListener('scroll', showDots, { passive: true });
  host.querySelectorAll('button[data-spg-page]').forEach(b => b.onclick = () => {
    const next = Math.min(count - 1, Math.max(0, pageOf() + Number(b.dataset.spgPage)));
    pages.scrollTo({ left: next * pages.clientWidth, behavior: 'smooth' });
  });
}

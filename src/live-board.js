// src/live-board.js
// The leaderboard as a sheet over the scorer — the marker's glance at the
// board without leaving the flight's card. The whole board, every division
// with its own positions, the flight's own rows marked and scrolled into
// view; a link to the full board page at the bottom. It stays live: the
// scorer hands it every change through update(), and the rows slide to
// their new places (FLIP — measure, repaint, invert, play) rather than
// jumping, so a score landing anywhere in the field reads as movement.
//
//   openLiveBoard({ tn, pids, fullHref, title, onClose })
//     tn        the tournament record
//     pids      the flight's entries — marked «this flight»
//     fullHref  where «full leaderboard» goes
//     title     the line under the heading (tournament · round)
//     onClose   told when the sheet is dismissed
//   → { update(tn), close } — or null when a sheet is already open.

import { t } from './i18n.js';
import { spLiveStandings } from './strokeplay.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The board's own reading of a total: E, −2, +5 — or points as they are.
export function scoreText(v, points = false) {
  if (v === undefined || v === null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (points) return String(n);
  if (n === 0) return 'E';
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

export function scoreClass(v, points = false) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || isNaN(n)) return 'tn-sc-none';
  if (points) return 'tn-sc-over';
  if (n < 0) return 'tn-sc-under';
  if (n > 0) return 'tn-sc-over';
  return 'tn-sc-even';
}

const thruText = (r) => (/^(WD|DQ|CUT)$/i.test(r.status) ? String(r.status).toUpperCase() : (r.thru || '–'));
const divisionLabel = (d) => (d === 'female' ? t('genderFemale') : t('genderMale'));

// A row carries a signature of what it shows, so a repaint can tell a row
// that changed (it flashes) from one that only moved.
const rowHTML = (r, points) => `
  <div class="lb-row${r.mine ? ' lb-mine' : ''}${r.rank <= 3 ? ' lb-top' : ''}"
       data-lb-pid="${esc(r.pid)}" data-lb-sig="${esc(`${r.posLabel}|${r.total}|${r.thru}|${r.status}`)}">
    <span class="lb-pos">${r.rank === 1 ? '🏆 ' : ''}${esc(r.posLabel)}</span>
    <span class="tn-c-name">
      <span class="tn-n">${esc(r.name)}</span>
      ${r.mine ? `<span class="tn-sub">⛳ ${esc(t('spThisFlight'))}</span>` : ''}
    </span>
    <span class="tn-c-tot tn-sc ${scoreClass(r.total, points)}">${scoreText(r.total, points)}</span>
    <span class="tn-c-thru">${esc(thruText(r))}</span>
  </div>`;

export function listHTML({ points, boards }) {
  return boards.map(b => `
    ${b.division && boards.length > 1 ? `<div class="lb-div">${esc(divisionLabel(b.division))} · ${b.rows.length}</div>` : ''}
    <div class="lb-row lb-head">
      <span>${esc(t('tnPos'))}</span><span>${esc(t('tnPlayer'))}</span>
      <span class="tn-c-tot">${esc(points ? t('spPoints') : t('tnTotal'))}</span>
      <span class="tn-c-thru">${esc(t('tnThru'))}</span>
    </div>
    ${b.rows.map(r => rowHTML(r, points)).join('')}`).join('');
}

export function openLiveBoard({ tn, pids = [], fullHref = '', title = '', onClose = null } = {}) {
  if (document.querySelector('.modal-overlay[data-lb]')) return null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay shs-overlay fade-in';
  overlay.setAttribute('data-lb', '1');
  overlay.innerHTML = `
    <div class="shs-sheet lb-sheet" role="dialog" aria-label="${esc(t('tnLeaderboard'))}">
      <div class="shs-head">
        <span class="lb-live"><span class="lb-live-dot"></span>LIVE</span>
        <h3>🏆 ${esc(t('tnLeaderboard'))}</h3>
        <button type="button" class="btn btn-outline btn-sm" data-lb="close" aria-label="${esc(t('close'))}">✕</button>
      </div>
      ${title ? `<div class="lb-sub">${esc(title)}</div>` : ''}
      <div data-lb="list"></div>
      <a href="${esc(fullHref)}" class="btn btn-primary btn-sm lb-full" data-lb="full">${esc(t('spFullBoard'))} →</a>
    </div>`;
  document.body.appendChild(overlay);
  const sheet = overlay.querySelector('.lb-sheet');
  const list = overlay.querySelector('[data-lb="list"]');

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-lb="close"]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  // The link navigates; the sheet must not linger over the page it opens.
  overlay.querySelector('[data-lb="full"]').addEventListener('click', () => setTimeout(close, 0));

  const update = (live) => {
    if (!overlay.isConnected) return;
    const before = new Map();
    list.querySelectorAll('[data-lb-pid]').forEach(el =>
      before.set(el.dataset.lbPid, { top: el.getBoundingClientRect().top, sig: el.dataset.lbSig }));
    list.innerHTML = listHTML(spLiveStandings(live, pids));
    if (!before.size) return;                     // the first paint: nothing to move from
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const moved = [];
    list.querySelectorAll('[data-lb-pid]').forEach(el => {
      const was = before.get(el.dataset.lbPid);
      if (!was) return;
      if (was.sig !== el.dataset.lbSig) {
        el.classList.add('lb-flash');
        el.addEventListener('animationend', () => el.classList.remove('lb-flash'), { once: true });
      }
      const dy = was.top - el.getBoundingClientRect().top;
      if (dy && !still) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        moved.push(el);
      }
    });
    if (!moved.length) return;
    void list.offsetHeight;                       // the inverted positions land before they play
    moved.forEach(el => {
      el.style.transition = 'transform .45s cubic-bezier(.2,.7,.2,1)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    });
  };

  update(tn);
  // Open on the flight: its first row mid-sheet, the leaders a scroll up.
  const first = list.querySelector('.lb-mine');
  if (first) {
    const r = first.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    sheet.scrollTop += r.top - s.top - (s.height - r.height) / 2;
  }
  return { update, close };
}

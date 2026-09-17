// src/strokeplay-flights.js
// The Флайтууд tab — stroke play's Match Center. Where the cup shows its
// matches as cards under LIVE, Удахгүй and Дууссан, a stroke event shows
// its flights the same way: who is on the course, how far they are and how
// they stand, the finished rounds folded, the viewer's own flight first. A
// tap opens the flight's 18-hole grid (flight-grid.js, the one under the
// scorers) to read, and whoever the scorer would let in gets its link.
//
// Same division of labour as matchplay-view.js: the model is pure
// (spFlightCards / spFlightGrid in strokeplay.js), this file only draws it,
// and app.js owns the modal and the live feed.

import { t } from './i18n.js';
import { spFlightCards, spFlightGrid, spPlayerGroup, tnScoring, spRoundDate } from './strokeplay.js';
import { gridHTML, wirePager, pageOfHole } from './flight-grid.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The board's own reading of a score: E, −n, +n.
const fmtToPar = (n) => (n === null || n === undefined ? '' : n === 0 ? 'E' : n < 0 ? `−${Math.abs(n)}` : `+${n}`);
const toParClass = (n) => (n === null || n === undefined ? '' : n < 0 ? 'tn-sc-under' : n > 0 ? 'tn-sc-over' : 'tn-sc-even');

const MODAL_PREFIX = 'spf:';
const modalId = (round, gid) => `${MODAL_PREFIX}${round}:${gid}`;
const parseModalId = (id) => {
  const m = /^spf:(\d+):(.+)$/.exec(String(id || ''));
  return m ? { round: Number(m[1]), gid: m[2] } : null;
};

// The viewer's own roster entry: a member's pid is their userId, an older
// entry carries it.
function viewerPid(players, userId) {
  if (!userId || !players) return null;
  if (players[userId]) return userId;
  return Object.keys(players).find(pid => players[pid]?.userId === userId) || null;
}

// The scorer link's rule, the schedule tab's: admins and marshals always, a
// member for the flight they stand in.
function canEnter(user, mine) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  return !!mine;
}

function cardHTML(tn, card, { mine, canIn, pts }) {
  const stateText = { LIVE: t('mpLive'), COMPLETED: t('mpFinal') }[card.state] || t('mpUpcoming');
  const head = [
    `${t('spGroup')} ${card.number ?? ''}`,
    card.teeTime,
    card.startHole ? `${card.startHole}-${t('spStartHoleSuffix')}` : ''
  ].filter(Boolean).join(' · ');
  const rowHTML = (r) => {
    const score = !r.holesIn ? '' : pts ? `${r.points} ${t('spPoints')}` : fmtToPar(r.toPar);
    const cls = pts ? '' : toParClass(r.toPar);
    return `
      <div style="display:flex;gap:8px;align-items:baseline;margin-top:3px;${r.kind === 'pair' ? 'color:var(--text-secondary);' : ''}">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.86rem;${r.kind === 'team' ? 'font-weight:700;' : ''}">${esc(r.name)}</span>
        <b class="tn-sc ${cls}" style="font-size:0.9rem;min-width:34px;text-align:right;">${esc(score || '–')}</b>
        <span style="font-size:0.7rem;color:var(--text-secondary);min-width:22px;text-align:right;">${esc(r.thru || '')}</span>
      </div>`;
  };
  return `
    <button data-spf="open" data-round="${card.round}" data-gid="${esc(card.gid)}" class="surface-card"
      style="display:block;width:100%;text-align:left;padding:12px;margin-top:8px;cursor:pointer;
             border:1px solid var(--border-color);font-family:var(--font);color:var(--text-primary);
             ${card.state === 'LIVE' ? 'border-left:3px solid var(--mpv-live,#d7263d);' : ''}${mine ? 'background:var(--accent-soft);' : ''}">
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:800;color:var(--text-secondary);">${esc(head)}</span>
        ${mine ? `<span class="pill-soft" style="font-size:0.62rem;font-weight:800;">${t('spMyFlight')}</span>` : ''}
        <span class="pill-soft" style="margin-left:auto;font-size:0.66rem;font-weight:800;">${esc(stateText)}</span>
      </div>
      <div style="margin-top:6px;">${card.rows.map(rowHTML).join('')}</div>
      ${card.state !== 'UPCOMING' && card.state !== 'COMPLETED' ? `
      <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:6px;">${t('mpThru')} ${card.thru}</div>` : ''}
    </button>
    ${canIn && card.state !== 'COMPLETED' ? `
    <a href="#/spgroup/${esc(tn.id)}/${card.round}/${esc(card.gid)}" class="btn btn-primary btn-sm"
       style="display:block;text-align:center;text-decoration:none;margin-top:4px;">${t('mpEnterScore')}</a>` : ''}`;
}

// The flight's grid to read: the scorer's own, without its header taps.
function detailHTML(tn, round, gid, { canIn }) {
  const grid = spFlightGrid(tn, round, gid);
  if (!grid) return null;
  const g = tn.sp.groups[round][gid];
  const pts = tnScoring(tn) === 'stableford';
  const head = [`${t('spGroup')} ${g.number ?? ''}`, `R${round}`, g.teeTime, g.startHole ? `${g.startHole}-${t('spStartHoleSuffix')}` : '']
    .filter(Boolean).join(' · ');
  return `
    <div style="padding:4px 2px;">
      <div style="font-size:0.74rem;color:var(--text-secondary);font-weight:700;">${esc(head)}</div>
      ${gridHTML(grid, {
        hole: grid.hole,
        labels: { hole: t('spHoleRow'), par: t('gsPar'), out: t('spOut'), in: t('spIn'), tot: t('tnTotal') },
        headerAttrs: () => '',
        linkOf: (r) => (r.link ? `#/spcard/${esc(tn.id)}/${esc(r.pid)}` : null),
        totInner: (r) => {
          if (!r.total.holesIn) return '';
          const sub = pts
            ? `${r.holes.reduce((n, x) => n + (x.points ?? 0), 0)} ${t('spPoints')}`
            : fmtToPar(r.total.toPar);
          return `<b>${r.total.gross}</b>${sub ? `<small class="${pts ? '' : toParClass(r.total.toPar)}">${sub}</small>` : ''}`;
        }
      })}
      ${grid.complete ? `<div class="pill-soft" style="display:inline-block;margin-top:8px;font-size:0.7rem;font-weight:800;">${t('spRoundComplete')}</div>` : ''}
      ${canIn && !grid.complete ? `
      <a href="#/spgroup/${esc(tn.id)}/${round}/${esc(gid)}" data-mpv-go="1" class="btn btn-primary btn-sm"
         style="display:block;text-align:center;text-decoration:none;margin-top:10px;">${t('mpEnterScore')}</a>` : ''}
    </div>`;
}

/**
 * Render the flights into `host`.
 * ctx: { user, userId, showModal(title, html, id), refreshModal(render),
 *        roundLabel(round) — the round's line, «R1 · 9-р сар 19» }
 */
export function renderSpFlights(host, tn, ctx = {}) {
  if (!host || !tn) return;
  const cards = spFlightCards(tn);
  if (!cards.length) {
    host.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><p>${t('spNoGroups')}</p></div>`;
    return;
  }
  const players = tn.sp?.players || {};
  const user = ctx.user || (ctx.userId ? { id: ctx.userId } : null);
  const myPid = viewerPid(players, user?.id);
  const myGid = (round) => (myPid ? spPlayerGroup(players, myPid, round) : null);
  const isMine = (c) => !!myPid && c.gid === myGid(c.round);
  const pts = tnScoring(tn) === 'stableford';
  const roundLabel = (r) => ctx.roundLabel?.(r) || `R${r}`;

  // A finished round the viewer unfolded stays open across the live repaints.
  const foldsOpen = new Set([...(host.querySelectorAll?.('details[data-spf-fold][open]') || [])]
    .map(d => d.getAttribute('data-spf-fold')));

  const roundDone = (round) => cards.some(c => c.round === round)
    && cards.every(c => c.round !== round || c.state === 'COMPLETED');

  const group = (label, states, { fold = false } = {}) => {
    const items = cards.filter(c => states.includes(c.state));
    if (!items.length) return '';
    // Rounds in order, each under its own line; within a round the viewer's
    // own flight first, then the draw's order.
    items.sort((a, b) => (a.round - b.round) || (isMine(b) - isMine(a)) || ((a.number ?? 0) - (b.number ?? 0)));
    const chunks = [];
    items.forEach(c => {
      const last = chunks[chunks.length - 1];
      if (last && last.round === c.round) last.items.push(c);
      else chunks.push({ round: c.round, items: [c] });
    });
    const body = chunks.map(ch => {
      const html = ch.items.map(c => cardHTML(tn, c, { mine: isMine(c), canIn: canEnter(user, isMine(c)), pts })).join('');
      if (fold && roundDone(ch.round)) {
        const key = String(ch.round);
        return `
      <details class="mpv-fold" data-spf-fold="${key}"${foldsOpen.has(key) ? ' open' : ''}>
        <summary class="mpv-day mpv-fold-sum"><span>${esc(roundLabel(ch.round))}</span><span class="mpv-fold-score">${ch.items.length} ${t('spFlightsShort')}</span></summary>
        ${html}
      </details>`;
      }
      return `<div class="mpv-day" style="font-size:0.72rem;font-weight:800;color:var(--text-secondary);margin:12px 0 -2px;">${esc(roundLabel(ch.round))}</div>${html}`;
    });
    return `
      <div class="section-head" style="margin-top:14px;">
        <h2 style="font-size:0.86rem;">${esc(label)} <span style="color:var(--text-secondary);font-weight:500;">(${items.length})</span></h2>
      </div>
      ${body.join('')}`;
  };

  host.innerHTML = [
    group(t('mpLive'), ['LIVE']),
    group(t('mpUpcoming'), ['UPCOMING']),
    group(t('mpFinal'), ['COMPLETED'], { fold: true })
  ].join('');

  const openModal = (round, gid) => {
    const html = detailHTML(tn, round, gid, { canIn: canEnter(user, gid === myGid(round)) });
    if (!html) return;
    const g = tn.sp.groups[round][gid];
    ctx.showModal?.(`${t('spGroup')} ${g.number ?? ''}`, html, modalId(round, gid));
    const grid = spFlightGrid(tn, round, gid);
    const modal = document.querySelector?.(`.modal-overlay[data-mp-match="${modalId(round, gid)}"]`);
    if (modal && grid) wirePager(modal, pageOfHole(grid.hole));
  };
  host.querySelectorAll?.('button[data-spf="open"]').forEach(b => b.onclick = () => openModal(Number(b.dataset.round), b.dataset.gid));

  // This runs on every repaint, so a grid left open follows the flight.
  ctx.refreshModal?.((id) => {
    const at = parseModalId(id);
    if (!at) return undefined;
    const html = detailHTML(tn, at.round, at.gid, { canIn: canEnter(user, at.gid === myGid(at.round)) });
    if (html === null) return null;
    const grid = spFlightGrid(tn, at.round, at.gid);
    queueMicrotask(() => {
      const modal = document.querySelector?.(`.modal-overlay[data-mp-match="${id}"]`);
      if (modal && grid) wirePager(modal, pageOfHole(grid.hole));
    });
    return html;
  });
}

export { viewerPid as spViewerPid, spRoundDate };

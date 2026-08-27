// src/matchplay-score.js
// Scorer interface (spec §12/§13): #/score/:tnId/:matchId
//
// Built for one thing — a scorer standing on a green with a phone, entering
// one hole in under ten seconds. The whole screen is three buttons; everything
// else is context. The current hole advances by itself, and UNDO steps back
// to the last hole entered.
//
// No local scoring state at all: every tap writes the hole and the RTDB
// listener paints what came back. That makes the screen correct by
// construction when two scorers open the same match, and offline it still
// feels instant because RTDB answers its own listener from the pending write
// before the network ever sees it (spec §21).

import * as store from './store.js';
import { t } from './i18n.js';
import {
  settleMatch, statusText, matchState, holeTimeline, DEFAULT_HOLES, HALVED
} from './matchplay.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Which hole the scorer is looking at. null = follow the match (the next
// unplayed hole); a number means they stepped back to correct one.
let viewHole = null;
let saving = false;

export function resetScorerView() {
  viewHole = null;
  saving = false;
}

// ---- Access (spec §14) ----

// Super Admin edits anything; a Scorer only the matches assigned to them.
// Marshals run the day on the course, so they score too.
export function canScore(user, match) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  return !!match?.scorerIds?.[user.id];
}

// ---- Rendering ----

const teamLabel = (mp, k) => mp?.teams?.[k]?.short || mp?.teams?.[k]?.name || k.toUpperCase();
const teamColor = (mp, k) => {
  const c = mp?.teams?.[k]?.color;
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : (k === 'a' ? '#1f6f43' : '#b3382c');
};

function playerNames(mp, match, k) {
  return (match?.players?.[k] || [])
    .map(pid => mp?.roster?.[pid]?.name || '')
    .filter(Boolean)
    .join(' / ') || '—';
}

// The three big buttons. Team names are on them, never colour alone (§23).
function keypadHTML(mp, hole, current) {
  const key = (value, label, color) => `
    <button data-sc="hole" data-value="${value}"
      style="flex:1;min-width:96px;padding:22px 10px;border-radius:14px;cursor:pointer;
             border:3px solid ${color};background:${current === value ? color : 'transparent'};
             color:${current === value ? '#fff' : 'var(--text-primary)'};
             font-size:1.05rem;font-weight:800;font-family:var(--font);line-height:1.25;">
      ${esc(label)}${current === value ? '<div style="font-size:0.7rem;font-weight:600;opacity:0.85;">✓</div>' : ''}
    </button>`;
  return `
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      ${key('a', teamLabel(mp, 'a'), teamColor(mp, 'a'))}
      ${key(HALVED, t('mpHalved'), 'var(--text-secondary)')}
      ${key('b', teamLabel(mp, 'b'), teamColor(mp, 'b'))}
    </div>`;
}

// A compact strip of every hole — the correction affordance (§13): tapping a
// played hole jumps back to it, and the keypad then edits that hole.
function stripHTML(match, hole) {
  const rows = holeTimeline(match);
  const cell = (r) => {
    const on = r.hole === hole;
    const bg = r.result === 'a' ? 'var(--mp-a)' : r.result === 'b' ? 'var(--mp-b)' : 'transparent';
    const fg = r.result === 'a' || r.result === 'b' ? '#fff' : 'var(--text-secondary)';
    const mark = r.result === 'a' ? 'A' : r.result === 'b' ? 'W' : r.result === HALVED ? '–' : '';
    return `
      <button data-sc="goto" data-hole="${r.hole}"
        style="min-width:30px;padding:5px 0;border-radius:6px;cursor:pointer;font-family:var(--font);
               border:${on ? '2px solid var(--text-primary)' : '1px solid var(--border-color)'};
               background:${bg};color:${fg};font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.58rem;opacity:0.75;">${r.hole}</div>${mark || '·'}
      </button>`;
  };
  return `<div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:12px;">${rows.map(cell).join('')}</div>`;
}

function screenHTML(tn, match) {
  const mp = tn.mp || {};
  const total = match.totalHoles || DEFAULT_HOLES;
  const settled = settleMatch(match.holes, total);
  const state = matchState(match);
  const done = state === 'COMPLETED';
  // Follow the match unless the scorer stepped back to a specific hole.
  const hole = Math.min(viewHole ?? (settled.thru + 1), total);
  const current = match.holes?.[hole] ?? null;
  const session = mp.sessions?.[match.sessionId] || {};
  const lead = settled.leader ? teamLabel(mp, settled.leader) : '';

  return `
    <div class="detail-container fade-in" style="--mp-a:${teamColor(mp, 'a')};--mp-b:${teamColor(mp, 'b')};max-width:560px;">
      <a href="#/tournament/${esc(tn.id)}" class="back-link">${t('back')}</a>

      <div style="margin-top:8px;">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:700;">
          ${t('mpMatchNo')}${esc(match.number ?? '')} · ${esc(session.format || '')} · ${esc(session.startTime || match.teeTime || '')}
        </div>
        <div style="display:flex;gap:8px;align-items:baseline;margin-top:6px;">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--mp-a);display:inline-block;"></span>
          <b>${esc(playerNames(mp, match, 'a'))}</b>
        </div>
        <div style="display:flex;gap:8px;align-items:baseline;margin-top:3px;">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--mp-b);display:inline-block;"></span>
          <b>${esc(playerNames(mp, match, 'b'))}</b>
        </div>
      </div>

      <div style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:14px;margin-top:12px;text-align:center;">
        <div style="font-size:1.5rem;font-weight:800;">
          ${lead ? esc(lead) + ' ' : ''}${esc(statusText(settled))}
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">
          ${done ? t('mpFinal') : `${t('mpThru')} ${settled.thru}`}
          ${settled.dormie && !done ? ` · ${t('mpDormie')}` : ''}
        </div>
      </div>

      ${done ? `
        <div style="text-align:center;margin-top:14px;font-size:0.85rem;color:var(--text-secondary);">
          ${t('mpMatchDone')}
        </div>` : `
        <div style="margin-top:16px;">
          <div style="text-align:center;font-size:1.15rem;font-weight:800;letter-spacing:0.04em;">
            ${t('mpHole')} ${hole}${current ? ` · ${t('mpEditing')}` : ''}
          </div>
          ${keypadHTML(mp, hole, current)}
        </div>`}

      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
        <button data-sc="undo" class="btn btn-outline btn-sm" ${settled.thru ? '' : 'disabled'} style="flex:1;">
          ${t('mpUndo')}
        </button>
        ${viewHole !== null ? `<button data-sc="follow" class="btn btn-outline btn-sm" style="flex:1;">${t('mpFollowLive')}</button>` : ''}
        ${done ? '' : `<button data-sc="suspend" class="btn btn-outline btn-sm" style="flex:1;">
          ${state === 'SUSPENDED' ? t('mpResume') : t('mpSuspend')}
        </button>`}
      </div>
      ${state === 'SUSPENDED' ? `
        <div style="text-align:center;margin-top:8px;font-size:0.78rem;font-weight:700;color:var(--amber);">
          ${t('mpSuspended')}
        </div>` : ''}

      ${stripHTML(match, hole)}
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;text-align:center;">
        A = ${esc(teamLabel(mp, 'a'))} · W = ${esc(teamLabel(mp, 'b'))} · – = ${t('mpHalved')}
      </div>
      <div id="sc-note" style="font-size:0.75rem;color:var(--text-secondary);margin-top:10px;text-align:center;min-height:1.2em;"></div>
    </div>`;
}

// ---- Mount ----

/**
 * Render the scorer screen.
 * ctx: { main() → the page element, user, showToast(msg, type),
 *        onUnsub(fn) — register a listener teardown }
 */
export async function renderScorerPage(tnId, matchId, ctx) {
  const host = ctx.main();
  resetScorerView();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let tn = null;
  try { tn = await store.loadTournament(tnId); } catch (_) { }
  const match = tn?.mp?.matches?.[matchId];

  if (!tn || !match) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${t('tnNotFound')}</p></div></div>`;
    return;
  }
  if (!canScore(ctx.user, match)) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/tournament/${esc(tn.id)}" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${t('mpNoScorerAccess')}</p></div></div>`;
    return;
  }

  let data = tn;

  const paint = () => {
    const m = data?.mp?.matches?.[matchId];
    if (!m) return;
    host.innerHTML = screenHTML(data, m);
    wire(m);
  };

  // One tap: write the hole, let the listener paint the result. `saving`
  // only guards against a double-tap racing itself, never against a slow
  // network — the RTDB write resolves locally while offline.
  const write = async (hole, value) => {
    if (saving) return;
    saving = true;
    const note = document.getElementById('sc-note');
    try {
      await store.saveTnMatchHole(tnId, matchId, hole, value, ctx.user?.id);
      // Entering a hole means moving on; a correction stays where it was so
      // the scorer can see what they just changed.
      if (viewHole !== null && value !== null) viewHole = null;
      if (note) note.textContent = '';
    } catch (err) {
      console.error('[scorer]', err);
      if (note) note.textContent = '⚠ ' + (err?.message || t('mpSaveFailed'));
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  const wire = (m) => {
    host.querySelectorAll('button[data-sc]').forEach(b => b.onclick = () => {
      const kind = b.dataset.sc;
      const settled = settleMatch(m.holes, m.totalHoles || DEFAULT_HOLES);
      if (kind === 'hole') {
        const hole = Math.min(viewHole ?? (settled.thru + 1), m.totalHoles || DEFAULT_HOLES);
        write(hole, b.dataset.value);
      } else if (kind === 'undo') {
        // Clearing the last hole entered rolls the status back; the engine
        // re-derives everything from what remains.
        if (settled.thru) { viewHole = null; write(settled.thru, null); }
      } else if (kind === 'suspend') {
        const now = matchState(m) === 'SUSPENDED';
        store.setTnMatchSuspended(tnId, matchId, !now, ctx.user?.id)
          .catch(err => {
            console.error('[scorer]', err);
            ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
          });
      } else if (kind === 'goto') {
        const h = Number(b.dataset.hole);
        // Only holes already played (or the next one) are worth opening —
        // holes cannot be entered out of order.
        viewHole = h <= settled.thru + 1 ? h : null;
        paint();
      } else if (kind === 'follow') {
        viewHole = null;
        paint();
      }
    });
  };

  paint();

  if (store.isUsingFirebase()) {
    const unsub = store.onTournamentChanged(tnId, (fresh) => {
      if (!fresh || fresh.status === 'deleted') return;
      data = fresh;
      // Never repaint over a tap in flight; the write's own listener
      // callback lands right after and paints the settled truth.
      paint();
    });
    if (unsub) ctx.onUnsub?.(unsub);
  }
}

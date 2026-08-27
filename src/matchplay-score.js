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
  settleMatch, statusText, matchState, holeTimeline, DEFAULT_HOLES, HALVED,
  holeChangeAction, canResolveHoleChange
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

// Admin and marshal edit anything; an assigned scorer their matches; and the
// players IN a match score their own match — modern roster entries are keyed
// by the member's userId, older ones carry it in the record.
export function isFielded(userId, match, roster) {
  if (!userId || !match) return false;
  return ['a', 'b'].some(k => (match.players?.[k] || [])
    .some(pid => pid === userId || roster?.[pid]?.userId === userId));
}

export function canScore(user, match, roster) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  if (match?.scorerIds?.[user.id]) return true;
  return isFielded(user.id, match, roster);
}

// ---- Rendering ----

const teamLabel = (mp, k) => mp?.teams?.[k]?.short || mp?.teams?.[k]?.name || k.toUpperCase();
const teamColor = (mp, k) => {
  const c = mp?.teams?.[k]?.color;
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : (k === 'a' ? '#1f6f43' : '#b3382c');
};
// Same acceptance rule as the public board: an image data URI or nothing.
const teamLogo = (mp, k) => {
  const l = mp?.teams?.[k]?.logo;
  return typeof l === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(l)
    ? l : null;
};
const teamMark = (mp, k) => {
  const logo = teamLogo(mp, k);
  return logo
    ? `<img src="${logo}" alt="" style="width:17px;height:17px;object-fit:contain;border-radius:4px;vertical-align:-3px;" />`
    : `<span style="width:9px;height:9px;border-radius:50%;background:var(--mp-${k});display:inline-block;"></span>`;
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
    // A pending correction marks its hole, whoever it is waiting on.
    const pend = !!match.pending?.[r.hole];
    const mark = pend ? '⏳' : r.result === 'a' ? 'A' : r.result === 'b' ? 'W' : r.result === HALVED ? '–' : '';
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

// The label a proposal shows for each side of "W → A".
function valueLabel(mp, v) {
  if (v === 'a' || v === 'b') return teamLabel(mp, v);
  if (v === HALVED) return t('mpHalved');
  if (v === 'clear') return t('mpPendingClear');
  return '—';
}

// Pending corrections, split by what this user can do about them: the ones
// waiting on THEIR consent get approve/reject buttons; their own outgoing
// proposals just show as waiting.
function pendingHTML(mp, match, user) {
  const entries = Object.entries(match.pending || {})
    .map(([hole, p]) => ({ hole: Number(hole), ...p }))
    .filter(p => p && p.value)
    .sort((x, y) => x.hole - y.hole);
  if (!entries.length) return '';

  const row = (p) => {
    const from = valueLabel(mp, match.holes?.[p.hole] ?? null);
    const to = valueLabel(mp, p.value);
    const mine = p.by === user?.id;
    const canResolve = !mine && canResolveHoleChange(user, match, p.hole);
    return `
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;font-size:0.8rem;flex-wrap:wrap;">
        <span><b>${esc(p.byName || '?')}</b> · ${t('mpHole')} ${p.hole}: ${esc(from)} → <b>${esc(to)}</b></span>
        ${canResolve ? `
          <span style="margin-left:auto;display:flex;gap:6px;">
            <button data-sc="resolve" data-hole="${p.hole}" data-ok="1" class="btn btn-primary btn-sm">${t('mpApprove')}</button>
            <button data-sc="resolve" data-hole="${p.hole}" data-ok="0" class="btn btn-outline-danger btn-sm">${t('mpReject')}</button>
          </span>`
        : `<span style="margin-left:auto;font-size:0.72rem;color:var(--amber);">⏳ ${mine ? t('mpProposeSent') : t('mpPendingWaiting')}</span>`}
      </div>`;
  };

  return `
    <div style="background:rgba(221,137,16,0.10);border:1px solid var(--amber);border-radius:10px;padding:10px;margin-top:12px;">
      <b style="font-size:0.76rem;">${t('mpPendingTitle')}</b>
      ${entries.map(row).join('')}
    </div>`;
}

function screenHTML(tn, match, demo, user) {
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
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
          ${teamMark(mp, 'a')}
          <b>${esc(playerNames(mp, match, 'a'))}</b>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:3px;">
          ${teamMark(mp, 'b')}
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

      ${pendingHTML(mp, match, user)}
      ${done && viewHole === null ? `
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
      <div id="sc-device" style="min-height:0;"></div>
      <div id="sc-note" style="font-size:0.75rem;color:var(--text-secondary);margin-top:10px;text-align:center;min-height:1.2em;"></div>
      ${demo ? `<p class="tn-demo-note">${t('tnDemoNote')}</p>` : ''}
    </div>`;
}

// ---- Mount ----

/**
 * Render the scorer screen.
 * ctx: { main() → the page element, user, showToast(msg, type),
 *        onUnsub(fn) — register a listener teardown,
 *        demo — the sample tournament: taps mutate a local copy and nothing
 *               is written anywhere, so the screen can be tried on a preview
 *               channel against the demo data }
 */
export async function renderScorerPage(tnId, matchId, ctx) {
  const host = ctx.main();
  resetScorerView();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  const demoMode = !!ctx.demo;

  // A one-shot read rejects on a cold cache with no signal, which is exactly
  // where a scorer opening this screen is most likely to be standing. The
  // listener below answers from whatever the client has and again when the
  // network returns, so a failed read is a reason to wait, not to give up.
  let tn = null;
  if (demoMode) tn = JSON.parse(JSON.stringify(ctx.demo));
  else try { tn = await store.loadTournament(tnId); } catch (_) { }

  let data = tn;
  let denied = false;

  const notFound = (msg, back) => {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="${back}" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${msg}</p></div></div>`;
  };

  const paint = () => {
    const m = data?.mp?.matches?.[matchId];
    if (!m) {
      // Still nothing to show. With a listener attached this is a waiting
      // state, not a verdict — it repaints the moment the match arrives.
      if (!store.isUsingFirebase()) notFound(t('tnNotFound'), '#/');
      return;
    }
    if (!canScore(ctx.user, m, data?.mp?.roster)) {
      denied = true;
      notFound(t('mpNoScorerAccess'), `#/tournament/${esc(tnId)}`);
      return;
    }
    denied = false;
    host.innerHTML = screenHTML(data, m, demoMode, ctx.user);
    wire();
    // Repainted every time because the screen was just replaced wholesale.
    paintDeviceBanner();
  };

  // One tap: write the hole, let the listener paint the result. `saving`
  // only guards against a double-tap racing itself, never against a slow
  // network — the RTDB write resolves locally while offline.
  const write = async (hole, value) => {
    if (saving) return;
    // Demo: the tap lands on the local copy only — nothing reaches the
    // database, which is the whole point of trying this on a preview.
    if (demoMode) {
      const m = data.mp.matches[matchId];
      if (value === null) delete m.holes[hole];
      else { m.holes = m.holes || {}; m.holes[hole] = value; }
      if (viewHole !== null) viewHole = null;
      paint();
      return;
    }
    saving = true;
    const note = document.getElementById('sc-note');
    try {
      // Correction consent: changing a hole somebody else entered does not
      // overwrite it — it files a proposal the original enterer approves.
      // Officials, your own entries, and unowned holes write straight through.
      const m = data?.mp?.matches?.[matchId];
      if (holeChangeAction(ctx.user, m, hole) === 'propose') {
        await store.proposeTnHoleChange(tnId, matchId, hole,
          value === null ? 'clear' : value, ctx.user);
        ctx.showToast?.('⏳ ' + t('mpProposeSent'), 'info');
      } else {
        await store.saveTnMatchHole(tnId, matchId, hole, value, ctx.user?.id);
      }
      // Any entry — a new hole or a correction to an old one — puts the
      // scorer back on the hole being played. The strip below carries the
      // change they just made, so nothing is lost by moving on. Repainting
      // here rather than leaving it to the listener is what actually moves
      // the screen: the listener already fired while viewHole still pointed
      // at the corrected hole.
      if (viewHole !== null) { viewHole = null; paint(); }
      if (note) note.textContent = '';
    } catch (err) {
      console.error('[scorer]', err);
      if (note) note.textContent = '⚠ ' + (err?.message || t('mpSaveFailed'));
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  const wire = () => {
    host.querySelectorAll('button[data-sc]').forEach(b => b.onclick = () => {
      const kind = b.dataset.sc;
      // Read the match at click time rather than closing over the one this
      // handler was wired against. A second scorer's tap arrives through the
      // listener, and acting on a stale copy is how an Undo could delete a
      // hole that is no longer the last one — which, since the engine treats
      // a gap as the end of play, would discard every hole after it.
      const m = data?.mp?.matches?.[matchId];
      if (!m) return;
      const total = m.totalHoles || DEFAULT_HOLES;
      const settled = settleMatch(m.holes, total);
      if (kind === 'hole') {
        const hole = Math.min(viewHole ?? (settled.thru + 1), total);
        write(hole, b.dataset.value);
      } else if (kind === 'undo') {
        // Only ever the last hole played: clearing any earlier one would
        // strand the holes after it.
        if (settled.thru) { viewHole = null; write(settled.thru, null); }
      } else if (kind === 'suspend') {
        const now = matchState(m) === 'SUSPENDED';
        if (demoMode) {
          if (now) delete m.stateOverride; else m.stateOverride = 'SUSPENDED';
          paint();
          return;
        }
        store.setTnMatchSuspended(tnId, matchId, !now, ctx.user?.id)
          .catch(err => {
            console.error('[scorer]', err);
            ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
          });
      } else if (kind === 'resolve') {
        const h = Number(b.dataset.hole);
        const ok = b.dataset.ok === '1';
        store.resolveTnHoleChange(tnId, matchId, h, ok, ctx.user)
          .then(() => ctx.showToast?.(ok ? '✅ ' + t('mpApproved') : t('mpRejected'), ok ? 'success' : 'info'))
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

  // Device check: the database only accepts score writes from allowlisted
  // devices, so an unapproved phone finds out HERE, before the first tap on
  // the course — not from a failed write at hole one. Silent when anonymous
  // auth is not running (nothing is gating writes then) and on the demo.
  const paintDeviceBanner = async () => {
    if (demoMode || !store.isUsingFirebase()) return;
    let status = null;
    try { status = await store.deviceStatus(); } catch (_) { return; }
    if (!status?.uid || status.role || status.registryEmpty) return;
    const el = document.getElementById('sc-device');
    if (!el) return;
    el.innerHTML = `
      <div style="background:rgba(221,137,16,0.12);border:1px solid var(--amber);border-radius:9px;padding:10px;margin-top:12px;font-size:0.78rem;">
        ${status.requested ? t('mpDevRequested') : t('mpDevBanner')}
        ${status.requested ? '' : `<button id="sc-dev-req" class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;">${t('mpDevRequest')}</button>`}
      </div>`;
    const btn = document.getElementById('sc-dev-req');
    if (btn) btn.onclick = async () => {
      try {
        await store.requestDeviceAccess(ctx.user?.fullName || ctx.user?.name || ctx.user?.username || '');
        ctx.showToast?.('✅ ' + t('mpDevRequestSent'), 'success');
      } catch (err) {
        console.error('[scorer]', err);
        ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
      }
      paintDeviceBanner();
    };
  };

  // Waiting rather than a blank screen, for the case where the read failed
  // and the listener has not answered yet.
  if (!data?.mp?.matches?.[matchId] && store.isUsingFirebase()) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/tournament/${esc(tnId)}" class="back-link">${t('back')}</a>
      <div class="loading-spinner" style="margin:40px auto;"></div></div>`;
  }
  paint();

  if (!demoMode && store.isUsingFirebase()) {
    const unsub = store.onTournamentChanged(tnId, (fresh) => {
      if (!fresh || fresh.status === 'deleted') return;
      data = fresh;
      // A repaint must not silently reinstate a screen access was refused
      // on — paint() re-checks, so this only guards the ordering.
      if (!denied || canScore(ctx.user, fresh.mp?.matches?.[matchId], fresh.mp?.roster)) paint();
    });
    if (unsub) ctx.onUnsub?.(unsub);
  }
}

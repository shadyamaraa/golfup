// src/strokeplay-score.js
// The stroke play scorecard: one player, one round, eighteen holes. Built
// for a phone on the course — plain number inputs (the native numeric pad),
// a live running total, and per-hole writes that queue offline exactly like
// the match play scorer's. Who may write is the same ladder canScoreSp and
// the database rules enforce: the player themself, and admin/marshal.

import * as store from './store.js';
import { t } from './i18n.js';
import { SP_HOLES, roundGross, canScoreSp } from './strokeplay.js';
import { coursePars, courseSIs } from './courses.js';
import { roundFromTournament, handicapIndex } from './handicap.js';
import { fmtToPar } from './game-score.js';

// Which hole each open group card is on, per tournament+group.
const viewHole = new Map();

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Which round each open card is looking at, per tournament+player, so a
// live repaint doesn't yank the scorer back to the current round.
const viewRound = new Map();

// The scorecard's stroke coloring, same reading as the game scorer's:
// under par red, par muted, over par plain.
function strokeColor(strokes, par) {
  if (!strokes || !par) return 'var(--text-primary)';
  if (strokes < par) return 'var(--red)';
  if (strokes === par) return 'var(--text-secondary)';
  return 'var(--text-primary)';
}

// `toPar` is the running score over exactly the holes entered — known only
// when the course's per-hole pars are in the registry. Without it a partial
// round can show nothing more honest than its hole count.
function totalsHTML(gross, holesIn, par, toPar = null) {
  const score = toPar !== null && holesIn ? fmtToPar(toPar)
    : holesIn >= SP_HOLES ? fmtToPar(gross - par) : null;
  return `
    <b style="font-size:1.1rem;">${t('spTotal')}: ${holesIn ? gross : '–'}</b>
    <span style="font-size:0.8rem;color:var(--text-secondary);">
      ${holesIn >= SP_HOLES
        ? `${t('spHoleOut')} · ${score}`
        : score !== null ? `${score} · ${holesIn}/${SP_HOLES}` : `${holesIn}/${SP_HOLES}`}
    </span>`;
}

// Once a member's 18 holes for a round are all in (and the tournament knows
// its tee's rating/slope), the round posts to rounds/{ghin} and the player's
// WHS index recomputes — the exact mirror of the casual game's
// finalizeRoundIfComplete, so tournament golf counts toward the handicap
// the same way an evening game does. Corrections re-post the same key.
async function finalizeSpRoundIfComplete(tn, tnId, pid, round) {
  try {
    if (!tn?.rating || !tn?.slope) return;
    const holes = tn.sp?.scores?.[pid]?.[round];
    if (roundGross(holes).holesIn < SP_HOLES) return;
    const userId = tn.sp?.players?.[pid]?.userId
      || (String(pid).startsWith('p_') ? null : pid);
    if (!userId) return;
    const u = await store.loadUserById(userId);
    if (!u?.ghinNumber) return;
    const rec = roundFromTournament({ ...tn, id: tnId }, userId, round, holes);
    if (!rec) return;
    await store.upsertRound(u.ghinNumber, rec);
    const rounds = await store.loadRounds(u.ghinNumber);
    const diffs = rounds.map(r => r.differential).filter(d => typeof d === 'number');
    await store.saveUserHcp(userId, handicapIndex(diffs));
  } catch (err) {
    console.warn('[sp-score] round finalize failed', err);
  }
}

function cardHTML(tn, pid, round, editable) {
  const p = tn.sp?.players?.[pid] || {};
  const holes = tn.sp?.scores?.[pid]?.[round] || {};
  const pars = coursePars(tn.course);
  const { gross, holesIn, toPar } = roundGross(holes, pars);
  const par = Number(tn.par) || 72;
  const roundCount = Math.max(1, Number(tn.rounds) || 1);

  const holeCell = (h) => {
    const hp = pars?.[h] || null;
    return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      <span style="font-size:0.62rem;color:var(--text-muted);font-weight:700;">${h}${hp ? `<span style="font-weight:400;"> · ${hp}</span>` : ''}</span>
      <input data-sps-hole="${h}" type="number" inputmode="numeric" min="1" max="19"
        value="${esc(holes[h] ?? '')}" ${editable ? '' : 'disabled'} placeholder="${hp ?? ''}"
        style="width:100%;box-sizing:border-box;text-align:center;padding:8px 2px;border-radius:7px;
               border:1px solid var(--border-color);background:var(--bg-color);
               color:${strokeColor(Number(holes[h]) || null, hp)};font-family:var(--font);font-size:1rem;font-weight:700;" />
    </div>`;
  };

  const nine = (from) => `
    <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:8px;">
      ${Array.from({ length: 9 }, (_, i) => holeCell(from + i)).join('')}
    </div>`;

  return `
    <div class="surface-card" style="padding:14px;">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
        <b style="font-size:1.05rem;">${esc(p.name || pid)}</b>
        ${Number.isFinite(Number(p.hcp)) ? `<span class="pill-soft" style="font-size:0.68rem;">${t('spHcp')} ${esc(p.hcp)}</span>` : ''}
        <span style="margin-left:auto;font-size:0.74rem;color:var(--text-secondary);">${esc(tn.name || '')}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        ${Array.from({ length: roundCount }, (_, i) => `
          <button data-sps-round="${i + 1}" class="btn ${round === i + 1 ? 'btn-primary' : 'btn-outline'} btn-sm">
            R${i + 1}
          </button>`).join('')}
      </div>
      ${nine(1)}
      ${nine(10)}
      <div data-sps-total style="display:flex;gap:12px;align-items:baseline;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-color);">
        ${totalsHTML(gross, holesIn, par, toPar)}
      </div>
      ${editable ? '' : `<p style="font-size:0.76rem;color:var(--amber);margin:10px 0 0;">${t('spReadOnly')}</p>`}
    </div>`;
}

/**
 * Render the scorecard for tournament `tnId`, player `pid` into `host`.
 * ctx: { user, showToast, backHash } — subscribes to the tournament for
 * live updates and returns the unsubscribe function.
 */
export function renderSpScorer(host, tnId, pid, ctx = {}) {
  if (!host) return () => { };
  const key = `${tnId}/${pid}`;
  let tnLive = null;

  const paint = () => {
    const tn = tnLive;
    if (!tn?.sp?.players?.[pid]) {
      host.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><p>${t('spNoPlayers')}</p></div>`;
      return;
    }
    // A remote update mid-typing must not eat the keystrokes; the next
    // commit repaints anyway.
    if (host.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT') return;

    const roundCount = Math.max(1, Number(tn.rounds) || 1);
    const round = Math.min(roundCount,
      viewRound.get(key) || Number(tn.currentRound) || 1);
    // Flight-mates may edit each other's cards for the round they share.
    const editable = canScoreSp(ctx.user, pid, tn.sp.players, round);

    host.innerHTML = `
      <div class="detail-container fade-in">
        <a href="${ctx.backHash || `#/tournament/${esc(tnId)}`}" class="back-link">← ${t('back')}</a>
        <h2 class="detail-title" style="margin:8px 0 10px;">${t('spCardOf')}</h2>
        ${cardHTML(tn, pid, round, editable)}
      </div>`;

    host.querySelectorAll('button[data-sps-round]').forEach(b => b.onclick = () => {
      viewRound.set(key, Number(b.dataset.spsRound));
      paint();
    });

    host.querySelectorAll('input[data-sps-hole]').forEach(inp => {
      inp.onchange = async () => {
        const hole = Number(inp.dataset.spsHole);
        const raw = inp.value.trim();
        const n = Number(raw);
        const value = raw === '' || !Number.isFinite(n) || n < 1 ? null : Math.min(19, Math.round(n));
        let saved = true;
        try {
          await store.saveTnSpScore(tnId, pid, round, hole, value, ctx.user?.id || null);
        } catch (err) {
          saved = false;
          console.error('[sp-score]', err);
          ctx.showToast?.('⚠️ ' + (err?.message || t('mpSaveFailed')), 'error');
        }
        // Local echo so the totals track even before the listener fires.
        if (tnLive?.sp) {
          const scores = (tnLive.sp.scores = tnLive.sp.scores || {});
          const rounds = (scores[pid] = scores[pid] || {});
          const holes = (rounds[round] = rounds[round] || {});
          if (value === null) delete holes[hole]; else holes[hole] = value;
          // The full repaint skips while a hole input keeps focus (it must
          // not eat keystrokes), so the totals line updates in place.
          const pars = coursePars(tnLive.course);
          inp.style.color = strokeColor(value, pars?.[hole] || null);
          const box = host.querySelector('[data-sps-total]');
          if (box) {
            const { gross, holesIn, toPar } = roundGross(holes, pars);
            box.innerHTML = totalsHTML(gross, holesIn, Number(tnLive.par) || 72, toPar);
          }
          if (saved) finalizeSpRoundIfComplete(tnLive, tnId, pid, round);
        }
        paint();
      };
    });
  };

  const off = store.onTournamentChanged?.(tnId, (tn) => { tnLive = tn; paint(); });
  // No live store (local mode): render once from what the caller loaded.
  if (!off && ctx.tn) { tnLive = ctx.tn; paint(); }
  return off || (() => { });
}

// ---- Group card (one flight, hole by hole) ----
// The marker practice: any member of the flight walks the round entering
// everyone's strokes one hole at a time. Writes go to exactly the same
// per-hole paths as the individual card, and the database rules allow them
// because the players share a group pointer for this round.

/**
 * Render the group scorecard for `gid` of `round` into `host`.
 * ctx: { user, showToast, tn?, backHash? } — subscribes live, returns the
 * unsubscribe function.
 */
export function renderSpGroupScorer(host, tnId, round, gid, ctx = {}) {
  if (!host) return () => { };
  const key = `${tnId}/${gid}`;
  let tnLive = null;

  const paint = () => {
    const tn = tnLive;
    const g = tn?.sp?.groups?.[round]?.[gid];
    if (!g) {
      host.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><p>${t('spNoGroups')}</p></div>`;
      return;
    }
    if (host.contains(document.activeElement) && document.activeElement?.tagName === 'INPUT') return;

    const players = tn.sp.players || {};
    const pids = Object.keys(g.players || {})
      .filter(pid => players[pid])
      .sort((a, b) => String(players[a].name || '').localeCompare(String(players[b].name || '')));
    const pars = coursePars(tn.course);
    const sis = courseSIs(tn.course);
    const editable = pids.some(pid => canScoreSp(ctx.user, pid, players, round));

    // Open on the first hole any of the flight still has empty — scanning
    // from the flight's STARTING hole (a shotgun group at hole 12 plays
    // 12..18 then 1..11), wrapping the course.
    let hole = viewHole.get(key);
    if (!hole) {
      const start = Number(g.startHole) >= 1 && Number(g.startHole) <= SP_HOLES
        ? Number(g.startHole) : 1;
      hole = ((start + SP_HOLES - 2) % SP_HOLES) + 1; // the hole before start
      for (let k = 0; k < SP_HOLES; k++) {
        const h = ((start - 1 + k) % SP_HOLES) + 1;
        if (pids.some(pid => !tn.sp.scores?.[pid]?.[round]?.[h])) { hole = h; break; }
      }
      viewHole.set(key, hole);
    }

    // The running tally beside each name: to-par when the course's per-hole
    // pars are known (what a marker actually wants to see mid-round), the
    // raw gross otherwise.
    const tallyText = (holes) => {
      const { gross, holesIn, toPar } = roundGross(holes, pars);
      if (!holesIn) return '–';
      return toPar !== null
        ? `${fmtToPar(toPar)} · ${holesIn}/${SP_HOLES}`
        : `${gross} · ${holesIn}/${SP_HOLES}`;
    };

    const row = (pid) => {
      const holes = tn.sp.scores?.[pid]?.[round] || {};
      return `
        <div style="display:flex;gap:10px;align-items:center;margin-top:8px;">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">
            ${esc(players[pid].name || pid)}
          </span>
          <input data-spgs-pid="${esc(pid)}" type="number" inputmode="numeric" min="1" max="19"
            value="${esc(holes[hole] ?? '')}" ${editable ? '' : 'disabled'} placeholder="${pars?.[hole] ?? ''}"
            style="width:64px;text-align:center;padding:10px 2px;border-radius:8px;
                   border:1px solid var(--border-color);background:var(--bg-color);
                   color:${strokeColor(Number(holes[hole]) || null, pars?.[hole] || null)};font-family:var(--font);font-size:1.15rem;font-weight:800;" />
          <span data-spgs-total="${esc(pid)}" style="width:70px;text-align:right;font-size:0.8rem;color:var(--text-secondary);">
            ${tallyText(holes)}
          </span>
        </div>`;
    };

    host.innerHTML = `
      <div class="detail-container fade-in">
        <a href="${ctx.backHash || `#/tournament/${esc(tnId)}`}" class="back-link">← ${t('back')}</a>
        <h2 class="detail-title" style="margin:8px 0 10px;">${t('spGroupCard')} ${esc(g.number ?? '')}</h2>
        <div class="surface-card" style="padding:14px;">
          <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;">
            <b>R${esc(round)}</b>
            ${g.teeTime ? `<span class="pill-soft" style="font-size:0.7rem;">${t('mpTee')} ${esc(g.teeTime)}</span>` : ''}
            ${g.startHole ? `<span class="pill-soft" style="font-size:0.7rem;">${t('spStartHole')} ${esc(g.startHole)}</span>` : ''}
            <span style="margin-left:auto;font-size:0.74rem;color:var(--text-secondary);">${esc(tn.name || '')}</span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px;">
            <button data-spgs-nav="-1" class="btn btn-outline btn-sm" ${hole <= 1 ? 'disabled' : ''}>←</button>
            <div style="min-width:90px;text-align:center;">
              <b style="font-size:1.3rem;">${hole} / ${SP_HOLES}</b>
              ${pars?.[hole] ? `<div style="font-size:0.72rem;color:var(--text-secondary);">${t('gsPar')} ${pars[hole]}${sis?.[hole] ? ` · SI ${sis[hole]}` : ''}</div>` : ''}
            </div>
            <button data-spgs-nav="1" class="btn btn-outline btn-sm" ${hole >= SP_HOLES ? 'disabled' : ''}>→</button>
          </div>
          ${pids.map(row).join('')}
          ${editable ? '' : `<p style="font-size:0.76rem;color:var(--amber);margin:10px 0 0;">${t('spReadOnly')}</p>`}
        </div>
      </div>`;

    host.querySelectorAll('button[data-spgs-nav]').forEach(b => b.onclick = () => {
      viewHole.set(key, Math.min(SP_HOLES, Math.max(1, hole + Number(b.dataset.spgsNav))));
      paint();
    });

    host.querySelectorAll('input[data-spgs-pid]').forEach(inp => {
      inp.onchange = async () => {
        const pid = inp.dataset.spgsPid;
        const raw = inp.value.trim();
        const n = Number(raw);
        const value = raw === '' || !Number.isFinite(n) || n < 1 ? null : Math.min(19, Math.round(n));
        let saved = true;
        try {
          await store.saveTnSpScore(tnId, pid, round, hole, value, ctx.user?.id || null);
        } catch (err) {
          saved = false;
          console.error('[sp-group-score]', err);
          ctx.showToast?.('⚠️ ' + (err?.message || t('mpSaveFailed')), 'error');
        }
        if (tnLive?.sp) {
          const scores = (tnLive.sp.scores = tnLive.sp.scores || {});
          const rounds = (scores[pid] = scores[pid] || {});
          const holes = (rounds[round] = rounds[round] || {});
          if (value === null) delete holes[hole]; else holes[hole] = value;
          inp.style.color = strokeColor(value, pars?.[hole] || null);
          const box = host.querySelector(`[data-spgs-total="${CSS.escape(pid)}"]`);
          if (box) box.textContent = tallyText(holes);
          if (saved) finalizeSpRoundIfComplete(tnLive, tnId, pid, round);
        }
      };
    });
  };

  const off = store.onTournamentChanged?.(tnId, (tn) => { tnLive = tn; paint(); });
  if (!off && ctx.tn) { tnLive = ctx.tn; paint(); }
  return off || (() => { });
}

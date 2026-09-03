// src/strokeplay-score.js
// The stroke play scorecard: one player, one round, eighteen holes. Built
// for a phone on the course — plain number inputs (the native numeric pad),
// a live running total, and per-hole writes that queue offline exactly like
// the match play scorer's. Who may write is the same ladder canScoreSp and
// the database rules enforce: the player themself, and admin/marshal.

import * as store from './store.js';
import { t } from './i18n.js';
import { SP_HOLES, roundGross, canScoreSp, tnPars, tnSIs, tnScoring, tnIsTeam } from './strokeplay.js';
import { roundPoints } from './stableford.js';
import { roundFromTournament, handicapIndex } from './handicap.js';
import { fmtToPar } from './game-score.js';

// Which hole each open group card is PINNED to, per tournament+group — set
// by a score tap or manual navigation; while unset the card follows the
// round to the first hole the flight still has open. Same clamp as the
// game scorer's stepper.
const viewHole = new Map();
const MAX_GS_STROKES = 15;

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
function totalsHTML(gross, holesIn, par, toPar = null, points = null) {
  const score = toPar !== null && holesIn ? fmtToPar(toPar)
    : holesIn >= SP_HOLES ? fmtToPar(gross - par) : null;
  return `
    <b style="font-size:1.1rem;">${t('spTotal')}: ${holesIn ? gross : '–'}</b>
    <span style="font-size:0.8rem;color:var(--text-secondary);">
      ${holesIn >= SP_HOLES
        ? `${t('spHoleOut')} · ${score}`
        : score !== null ? `${score} · ${holesIn}/${SP_HOLES}` : `${holesIn}/${SP_HOLES}`}
    </span>
    ${points !== null && holesIn
      // The strokes are still what is entered; the points are the contest.
      ? `<b style="font-size:0.95rem;margin-left:auto;">${points} ${t('spPoints')}</b>` : ''}`;
}

// The running points for one card, or null when this tournament is not
// scored in points (or the course has no card to score against).
function cardPoints(tn, holes, hcp) {
  if (tnScoring(tn) !== 'stableford') return null;
  const r = roundPoints(holes, tnPars(tn), tnSIs(tn), Number(hcp));
  return r.parsKnown ? r.points : null;
}

// Once a member's 18 holes for a round are all in (and the tournament knows
// its tee's rating/slope), the round posts to rounds/{ghin} and the player's
// WHS index recomputes — the exact mirror of the casual game's
// finalizeRoundIfComplete, so tournament golf counts toward the handicap
// the same way an evening game does. Corrections re-post the same key.
async function finalizeSpRoundIfComplete(tn, tnId, pid, round) {
  // A team event plays one ball a team, so no player has a card of their own
  // and nothing may post — a "complete" round there would be partly somebody
  // else's shots, and would corrupt the WHS index it landed on. The casual
  // scorer guards the same way (isOneBallFormat in game-score.js).
  if (tnIsTeam(tn)) return;
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
  const pars = tnPars(tn);
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
        ${totalsHTML(gross, holesIn, par, toPar, cardPoints(tn, holes, p?.hcp))}
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
    // Hole writes are awaited, so a member who scores and immediately leaves
    // would otherwise have this repaint land on the page they moved to.
    if (ctx.alive?.() === false) return;
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
          const pars = tnPars(tnLive);
          inp.style.color = strokeColor(value, pars?.[hole] || null);
          const box = host.querySelector('[data-sps-total]');
          if (box) {
            const { gross, holesIn, toPar } = roundGross(holes, pars);
            box.innerHTML = totalsHTML(gross, holesIn, Number(tnLive.par) || 72, toPar,
              cardPoints(tnLive, holes, tnLive?.sp?.players?.[pid]?.hcp));
          }
          if (saved) finalizeSpRoundIfComplete(tnLive, tnId, pid, round);
        }
        paint();
      };
    });
  };

  // The router hands down `alive`; a repaint after this screen was torn down
  // would land on whatever page replaced it.
  const off = store.onTournamentChanged?.(tnId, (tn) => {
    if (ctx.alive?.() === false) return;
    tnLive = tn;
    paint();
  });
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
  // A fresh mount starts in follow mode — the pin only lives for one visit,
  // exactly like the game scorer's resetGameScorerView().
  viewHole.delete(key);
  let tnLive = null;
  let saving = false;

  // The first hole any of the flight still has empty — scanning from the
  // flight's STARTING hole (a shotgun group at hole 12 plays 12..18 then
  // 1..11), wrapping the course. Recomputed on every paint while nobody has
  // pinned a hole, so the screen follows the round on its own.
  const followHole = (tn, g, pids) => {
    const start = Number(g.startHole) >= 1 && Number(g.startHole) <= SP_HOLES
      ? Number(g.startHole) : 1;
    let hole = ((start + SP_HOLES - 2) % SP_HOLES) + 1; // the hole before start
    for (let k = 0; k < SP_HOLES; k++) {
      const h = ((start - 1 + k) % SP_HOLES) + 1;
      if (pids.some(pid => !tn.sp.scores?.[pid]?.[round]?.[h])) { hole = h; break; }
    }
    return hole;
  };

  const paint = () => {
    // Step taps await their write, so a member who scores and immediately
    // leaves would otherwise have this repaint land on the page they moved to.
    if (ctx.alive?.() === false) return;
    const tn = tnLive;
    const g = tn?.sp?.groups?.[round]?.[gid];
    if (!g) {
      host.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><p>${t('spNoGroups')}</p></div>`;
      return;
    }

    const players = tn.sp.players || {};
    const pids = Object.keys(g.players || {})
      .filter(pid => players[pid])
      .sort((a, b) => String(players[a].name || '').localeCompare(String(players[b].name || '')));
    const pars = tnPars(tn);
    const sis = tnSIs(tn);
    const anyEditable = pids.some(pid => canScoreSp(ctx.user, pid, players, round));

    // A pinned hole (any score tap or nav) wins; otherwise follow the round.
    const hole = viewHole.get(key) || followHole(tn, g, pids);

    // The running tally beside each name: to-par when the course's per-hole
    // pars are known (what a marker actually wants to see mid-round), the
    // raw gross otherwise.
    const tallyText = (holes, pid) => {
      const { gross, holesIn, toPar } = roundGross(holes, pars);
      if (!holesIn) return '–';
      const base = toPar !== null
        ? `${fmtToPar(toPar)} · ${holesIn}/${SP_HOLES}`
        : `${gross} · ${holesIn}/${SP_HOLES}`;
      const pts = cardPoints(tn, holes, players[pid]?.hcp);
      return pts === null ? base : `${base} · ${pts} ${t('spPoints')}`;
    };

    // Same stepper the game scorer taps all day: − / value / +. The + on an
    // empty hole seeds the hole's par, so most scores are one or two taps.
    const stepBtn = (kind, pid, label, disabled) => `
      <button data-spgs-step="${kind}" data-pid="${esc(pid)}" ${disabled ? 'disabled' : ''}
        style="width:52px;height:52px;border-radius:12px;cursor:pointer;font-family:var(--font);
               border:2px solid var(--border-color);background:var(--bg-card-hover);
               color:var(--text-primary);font-size:1.35rem;font-weight:800;
               ${disabled ? 'opacity:0.35;cursor:default;' : ''}">${label}</button>`;

    const row = (pid) => {
      const holes = tn.sp.scores?.[pid]?.[round] || {};
      const strokes = holes[hole] ?? null;
      const canEdit = canScoreSp(ctx.user, pid, players, round);
      return `
        <div style="display:flex;gap:10px;align-items:center;margin-top:10px;">
          <span style="flex:1;min-width:0;">
            <span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">
              ${esc(players[pid].name || pid)}
            </span>
            <span data-spgs-total="${esc(pid)}" style="font-size:0.74rem;color:var(--text-secondary);">
              ${tallyText(holes, pid)}
            </span>
          </span>
          ${canEdit ? stepBtn('minus', pid, '−', strokes === null) : ''}
          <div data-spgs-val="${esc(pid)}" style="width:44px;text-align:center;font-size:1.5rem;font-weight:800;color:${strokeColor(strokes, pars?.[hole] || null)};">
            ${strokes ?? '·'}
          </div>
          ${canEdit ? stepBtn('plus', pid, '+', strokes !== null && strokes >= MAX_GS_STROKES) : ''}
        </div>`;
    };

    // 18 holes at a glance: the big figure is the hole's par (entered count
    // without a course card), gold fill once the whole flight is in, a 2px
    // ring on the hole being viewed. Tapping jumps (and pins).
    const stripHTML = () => `
      <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:14px;">
        ${Array.from({ length: SP_HOLES }, (_, i) => {
          const n = i + 1;
          const entered = pids.filter(pid => tn.sp.scores?.[pid]?.[round]?.[n]).length;
          const full = pids.length > 0 && entered >= pids.length;
          const on = n === hole;
          return `
          <button data-spgs-goto="${n}"
            style="min-width:30px;padding:5px 0;border-radius:6px;cursor:pointer;font-family:var(--font);
                   border:${on ? '2px solid var(--text-primary)' : '1px solid var(--border-color)'};
                   background:${full ? 'var(--gold)' : 'transparent'};
                   color:${full ? '#0C3051' : 'var(--text-secondary)'};font-size:0.7rem;font-weight:700;">
            <div style="font-size:0.58rem;opacity:0.75;">${n}</div>${pars?.[n] ?? (entered || '·')}
          </button>`;
        }).join('')}
      </div>`;

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
            <button data-spgs-nav="-1" class="btn btn-outline btn-sm" style="width:52px;" ${hole <= 1 ? 'disabled' : ''}>‹</button>
            <div data-spgs-head style="flex:1;min-width:90px;text-align:center;">
              <b style="font-size:1.3rem;">${hole} / ${SP_HOLES}</b>
              ${pars?.[hole] ? `<div style="font-size:0.72rem;color:var(--text-secondary);">${t('gsPar')} ${pars[hole]}${sis?.[hole] ? ` · SI ${sis[hole]}` : ''}</div>` : ''}
            </div>
            <button data-spgs-nav="1" class="btn btn-outline btn-sm" style="width:52px;" ${hole >= SP_HOLES ? 'disabled' : ''}>›</button>
          </div>
          ${pids.map(row).join('')}
          ${stripHTML()}
          ${anyEditable ? '' : `<p style="font-size:0.76rem;color:var(--amber);margin:10px 0 0;">${t('spReadOnly')}</p>`}
        </div>
      </div>`;

    host.querySelectorAll('button[data-spgs-nav]').forEach(b => b.onclick = () => {
      viewHole.set(key, Math.min(SP_HOLES, Math.max(1, hole + Number(b.dataset.spgsNav))));
      paint();
    });
    host.querySelectorAll('button[data-spgs-goto]').forEach(b => b.onclick = () => {
      viewHole.set(key, Number(b.dataset.spgsGoto));
      paint();
    });

    // One tap = one write, updated in place so rapid taps never fight a
    // repaint. The tap also pins the hole: the last player's seeded score
    // must stay correctable instead of the screen following on.
    const updateRow = (pid) => {
      const holes = tnLive.sp.scores?.[pid]?.[round] || {};
      const strokes = holes[hole] ?? null;
      const val = host.querySelector(`[data-spgs-val="${CSS.escape(pid)}"]`);
      if (val) {
        val.textContent = strokes ?? '·';
        val.style.color = strokeColor(strokes, pars?.[hole] || null);
      }
      const tot = host.querySelector(`[data-spgs-total="${CSS.escape(pid)}"]`);
      if (tot) tot.textContent = tallyText(holes, pid);
      const setStep = (kind, disabled) => {
        const btn = host.querySelector(`[data-spgs-step="${kind}"][data-pid="${CSS.escape(pid)}"]`);
        if (!btn) return;
        btn.disabled = disabled;
        btn.style.opacity = disabled ? '0.35' : '';
        btn.style.cursor = disabled ? 'default' : 'pointer';
      };
      setStep('minus', strokes === null);
      setStep('plus', strokes !== null && strokes >= MAX_GS_STROKES);
      const cell = host.querySelector(`button[data-spgs-goto="${hole}"]`);
      if (cell) {
        const entered = pids.filter(p => tnLive.sp.scores?.[p]?.[round]?.[hole]).length;
        const full = pids.length > 0 && entered >= pids.length;
        cell.style.background = full ? 'var(--gold)' : 'transparent';
        cell.style.color = full ? '#0C3051' : 'var(--text-secondary)';
      }
    };

    host.querySelectorAll('button[data-spgs-step]').forEach(b => b.onclick = async () => {
      if (saving) return;
      const pid = b.dataset.pid;
      if (!canScoreSp(ctx.user, pid, tnLive?.sp?.players || {}, round)) return;
      viewHole.set(key, hole);
      const cur = tnLive?.sp?.scores?.[pid]?.[round]?.[hole] ?? null;
      let next;
      if (b.dataset.spgsStep === 'plus') {
        next = cur === null ? (pars?.[hole] ?? 4) : Math.min(MAX_GS_STROKES, cur + 1);
      } else {
        next = cur === null ? null : (cur <= 1 ? null : cur - 1);
      }
      if (next === cur) return;
      saving = true;
      let saved = true;
      try {
        await store.saveTnSpScore(tnId, pid, round, hole, next, ctx.user?.id || null);
      } catch (err) {
        saved = false;
        console.error('[sp-group-score]', err);
        ctx.showToast?.('⚠️ ' + (err?.message || t('mpSaveFailed')), 'error');
      } finally {
        saving = false;
      }
      if (tnLive?.sp) {
        const scores = (tnLive.sp.scores = tnLive.sp.scores || {});
        const rounds = (scores[pid] = scores[pid] || {});
        const holes = (rounds[round] = rounds[round] || {});
        if (next === null) delete holes[hole]; else holes[hole] = next;
        // The write is awaited, so this may resume on another screen. Skip the
        // DOM touch-up then — but still post the round: a round completed on
        // this very tap must reach the member's handicap either way.
        if (ctx.alive?.() !== false) updateRow(pid);
        if (saved) finalizeSpRoundIfComplete(tnLive, tnId, pid, round);
      }
    });
  };

  // The router hands down `alive`; a repaint after this screen was torn down
  // would land on whatever page replaced it.
  const off = store.onTournamentChanged?.(tnId, (tn) => {
    if (ctx.alive?.() === false) return;
    tnLive = tn;
    paint();
  });
  if (!off && ctx.tn) { tnLive = ctx.tn; paint(); }
  return off || (() => { });
}

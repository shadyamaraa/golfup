// src/game-score.js
// Casual-game scorecard: #/gscore/:gameId/:groupIdx
//
// The M Cup scorer's little sibling — a group standing on a green, one phone
// or four, entering everyone's strokes for the hole in seconds. Same
// construction as matchplay-score.js: no local scoring state, every tap is a
// path-scoped write and the RTDB listener paints what came back, so several
// markers in one group never diverge and offline taps still feel instant.
//
// Scores are keyed by the member's user id (group entries are the members
// themselves), so regrouping players never detaches a scorecard. When a
// player's round completes, a GHIN-shaped record lands under
// rounds/{ghinNumber}/{gameId} and their WHS handicap index is recomputed —
// see src/handicap.js and src/ghin.js.

import * as store from './store.js';
import { t, getLang } from './i18n.js';
import { gameHoleCount, roundFromGame, handicapIndex, courseHandicap } from './handicap.js';
import { holePar, holeSI } from './courses.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MAX_STROKES = 15;
const DEFAULT_STROKES = 4;

// Which hole the group is looking at. null = follow the round (the first hole
// somebody in the group still has open); a number means they stepped back.
let viewHole = null;
let saving = false;

export function resetGameScorerView() {
  viewHole = null;
  saving = false;
}

// ---- Group helpers (same array/object tolerance as app.js ensureGroups) ----

function groupsOf(game) {
  const g = game?.groups;
  if (!g) return [[]];
  const arr = Array.isArray(g) ? g : Object.values(g);
  return arr.map(grp => (Array.isArray(grp) ? grp : Object.values(grp || {})).filter(Boolean));
}

// ---- Access ----

// Admin and marshal edit anything; the game's creator their game; and group
// members mark each other — a player's own group is their scoring area, which
// is how paper scorecards work too.
export function canScoreGamePlayer(user, game, playerId) {
  if (!user || !game || !playerId) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  if (game.createdBy === user.id) return true;
  if (user.id === playerId) return true;
  return groupsOf(game).some(players => {
    const ids = players.map(p => p.id);
    return ids.includes(user.id) && ids.includes(playerId);
  });
}

// ---- Derived scoring ----

// "3-р Нүх" / "Hole #3" / "3번 홀" — each language shapes the phrase
// differently, so this is a function rather than an i18n key.
function holeTitle(n) {
  const l = getLang();
  if (l === 'en') return `Hole #${n}`;
  if (l === 'kr') return `${n}번 홀`;
  return `${n}-р Нүх`;
}

// "+4" / "E" / "−2" — golf's to-par notation.
export function fmtToPar(d) {
  if (d === 0) return 'E';
  return d > 0 ? `+${d}` : `−${-d}`;
}

// The playing handicap in force for a player in this game: the hand-entered
// per-game value wins; otherwise it is derived from the player's cached WHS
// index and the game's course rating/slope/par. null = no handicap known.
export function gamePlayingHcp(game, playerId, userRec) {
  const manual = game?.hcp?.[playerId];
  if (typeof manual === 'number') return manual;
  const c = game?.course || {};
  return courseHandicap(userRec?.hcpIndex, c.slope, c.rating, c.par);
}

// Gross total, holes entered, to-par (null without course pars), and net
// (null without a handicap). Net subtracts the FULL playing handicap up
// front — an HCP 12 player opening with a par stands at "Нет −12" and each
// bogey walks it up one — the reading the club asked for. (WHS's per-hole SI
// allocation — strokesReceived in handicap.js — is kept for the handicap
// engine, but not for this display; both meet at the same number on 18.)
export function gameScoreLine(game, playerId, hcp) {
  const holeCount = gameHoleCount(game);
  const holes = game?.scores?.[playerId]?.holes || {};
  let total = 0, thru = 0, parSum = 0, parHoles = 0;
  for (let n = 1; n <= holeCount; n++) {
    const s = holes[n];
    if (!s) continue;
    total += s;
    thru++;
    const par = holePar(game, n);
    if (par) { parSum += par; parHoles++; }
  }
  const toPar = thru && parHoles === thru ? total - parSum : null;
  const net = thru && typeof hcp === 'number' ? total - hcp : null;
  return {
    total, thru, toPar, net,
    // Net against par — "Нет −6" — only possible where every entered hole
    // has a known par.
    netToPar: toPar !== null && typeof hcp === 'number' ? toPar - hcp : null,
  };
}

// The first hole somebody in the group has not entered yet — where a group
// arriving on the next tee wants to be without tapping anything.
function followHole(game, players) {
  const holeCount = gameHoleCount(game);
  for (let n = 1; n <= holeCount; n++) {
    if (players.some(p => !game?.scores?.[p.id]?.holes?.[n])) return n;
  }
  return holeCount;
}

// ---- Rendering ----

// Golf reading for one hole's score against par: under par red, par muted,
// over par plain ink (same convention as the tournament board's tn-sc-*).
function strokeColor(strokes, par) {
  if (!strokes || !par) return 'var(--text-primary)';
  if (strokes < par) return 'var(--red)';
  if (strokes === par) return 'var(--text-secondary)';
  return 'var(--text-primary)';
}

function totalsLineText(game, pid, hcp) {
  const line = gameScoreLine(game, pid, hcp);
  if (!line.thru) return '—';
  let s = `${t('gsTotal')} ${line.total}`;
  if (line.toPar !== null) s += ` (${fmtToPar(line.toPar)})`;
  if (line.net !== null) s += ` · ${t('gsNet')} ${line.netToPar !== null ? fmtToPar(line.netToPar) : line.net}`;
  return s + ` · ${t('mpThru')} ${line.thru}`;
}

function hcpChipLabel(game, pid, userRec) {
  const hcp = gamePlayingHcp(game, pid, userRec);
  return typeof hcp === 'number' ? `HCP ${hcp}` : 'HCP —';
}

// First name only — the row also carries the running score, HCP chip, and
// stepper, so the full "Овог Нэр" doesn't fit on a phone.
function shortName(p, userRec) {
  return userRec?.firstName || p.name || '?';
}

// The score the player is "walking on" right now, shown beside their name:
// to-par where the course card is known ("+4"/"E"/"−2"), gross otherwise.
function runningScore(game, pid, hcp) {
  const line = gameScoreLine(game, pid, hcp);
  if (!line.thru) return { text: '', color: 'var(--text-secondary)' };
  if (line.toPar !== null) {
    return {
      text: fmtToPar(line.toPar),
      color: line.toPar < 0 ? 'var(--red)' : line.toPar === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
    };
  }
  return { text: String(line.total), color: 'var(--text-primary)' };
}

function playerRowHTML(game, p, hole, editable, userRec) {
  const strokes = game?.scores?.[p.id]?.holes?.[hole] ?? null;
  const hcp = gamePlayingHcp(game, p.id, userRec);
  const run = runningScore(game, p.id, hcp);
  const stepBtn = (kind, label, disabled) => `
    <button data-gs="${kind}" data-pid="${esc(p.id)}" ${disabled ? 'disabled' : ''}
      style="width:52px;height:52px;border-radius:12px;cursor:pointer;font-family:var(--font);
             border:2px solid var(--border-color);background:var(--bg-card-hover);
             color:var(--text-primary);font-size:1.35rem;font-weight:800;
             ${disabled ? 'opacity:0.35;cursor:default;' : ''}">${label}</button>`;
  // The hand-entered per-game handicap chip; markers tap it to set or fix a
  // player's playing handicap until GHIN can supply one.
  const hcpChip = editable ? `
    <button data-gs="hcp" data-pid="${esc(p.id)}"
      style="border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);
             border-radius:999px;padding:1px 8px;font-size:0.66rem;font-weight:700;cursor:pointer;
             font-family:var(--font);flex-shrink:0;">${hcpChipLabel(game, p.id, userRec)}</button>`
    : (typeof hcp === 'number' ? `<span style="font-size:0.66rem;color:var(--text-secondary);flex-shrink:0;">HCP ${hcp}</span>` : '');
  return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color);">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
          <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(shortName(p, userRec))}</span>
          <b data-gs-run="${esc(p.id)}" style="font-size:0.9rem;flex-shrink:0;color:${run.color};">${run.text}</b>
          ${hcpChip}
        </div>
        <div data-gs-tot="${esc(p.id)}" style="font-size:0.72rem;color:var(--text-secondary);">
          ${totalsLineText(game, p.id, hcp)}
        </div>
      </div>
      ${editable ? stepBtn('minus', '−', strokes === null) : ''}
      <div data-gs-val="${esc(p.id)}" style="width:44px;text-align:center;font-size:1.5rem;font-weight:800;color:${strokeColor(strokes, holePar(game, hole))};">
        ${strokes ?? '·'}
      </div>
      ${editable ? stepBtn('plus', '+', strokes !== null && strokes >= MAX_STROKES) : ''}
    </div>`;
}

// A compact strip of every hole: the number and how many of the group have it
// entered. Tapping a hole jumps to it — that is the correction affordance.
function stripHTML(game, players, hole) {
  const holeCount = gameHoleCount(game);
  const cells = [];
  for (let n = 1; n <= holeCount; n++) {
    const entered = players.filter(p => game?.scores?.[p.id]?.holes?.[n]).length;
    const full = players.length > 0 && entered >= players.length;
    const on = n === hole;
    // Gold bg + navy ink for a completed hole — the app's on-gold convention
    // (.filter-tab.active), legible in both themes; #fff would wash out on
    // the cream light theme.
    cells.push(`
      <button data-gs="goto" data-hole="${n}"
        style="min-width:30px;padding:5px 0;border-radius:6px;cursor:pointer;font-family:var(--font);
               border:${on ? '2px solid var(--text-primary)' : '1px solid var(--border-color)'};
               background:${full ? 'var(--gold)' : 'transparent'};
               color:${full ? '#0C3051' : 'var(--text-secondary)'};font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.58rem;opacity:0.75;">${n}</div>${entered || '·'}
      </button>`);
  }
  return `<div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:14px;">${cells.join('')}</div>`;
}

// The hole header: "3-р Нүх · Пар 4 · SI 9" over a small "3 / 18" where the
// course card is known; the plain "НҮХ 3 / 18" otherwise.
function holeHeaderHTML(game, hole, holeCount) {
  const par = holePar(game, hole);
  const si = holeSI(game, hole);
  if (!par) return `${t('mpHole')} ${hole} / ${holeCount}`;
  return `${holeTitle(hole)} · ${t('gsPar')} ${par}${si ? ` · SI ${si}` : ''}
    <div style="font-size:0.68rem;font-weight:700;color:var(--text-secondary);letter-spacing:0.06em;">${hole} / ${holeCount}</div>`;
}

function screenHTML(game, groupIdx, user, fade, usersById) {
  const players = groupsOf(game)[groupIdx] || [];
  const holeCount = gameHoleCount(game);
  const hole = Math.min(viewHole ?? followHole(game, players), holeCount);
  return `
    <div class="detail-container${fade ? ' fade-in' : ''}" style="max-width:560px;">
      <a href="#/game/${esc(game.id)}" class="back-link">${t('back')}</a>

      <div style="margin-top:8px;">
        <div style="font-size:0.75rem;color:var(--text-secondary);font-weight:700;">
          ⛳ ${t('gsTitle')} · ${esc(game.location || '')}
        </div>
        <div style="font-size:1.15rem;font-weight:800;margin-top:2px;">
          ${t('group')} ${groupIdx + 1}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-top:14px;">
        <button data-gs="prev" ${hole <= 1 ? 'disabled' : ''} class="btn btn-outline btn-sm" style="width:52px;">‹</button>
        <div id="gs-hole-label" style="flex:1;text-align:center;font-size:1.15rem;font-weight:800;letter-spacing:0.04em;">
          ${holeHeaderHTML(game, hole, holeCount)}
        </div>
        <button data-gs="next" ${hole >= holeCount ? 'disabled' : ''} class="btn btn-outline btn-sm" style="width:52px;">›</button>
      </div>

      <div style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:12px;padding:4px 14px;margin-top:10px;">
        ${players.map(p => playerRowHTML(game, p, hole, canScoreGamePlayer(user, game, p.id), usersById?.[p.id])).join('')
          || `<div style="padding:14px 0;color:var(--text-secondary);">${t('emptySlot')}</div>`}
      </div>

      ${stripHTML(game, players, hole)}
      <div id="gs-note" style="font-size:0.75rem;color:var(--text-secondary);margin-top:10px;text-align:center;min-height:1.2em;"></div>
    </div>`;
}

// ---- Round completion → handicap ----

// Once a player's card is full, mirror it into rounds/{ghinNumber}/{gameId}
// and refresh their cached WHS index. Fire-and-forget: nothing here may block
// or fail the score entry itself. Players without a GHIN number simply keep
// their in-game scores.
async function finalizeRoundIfComplete(game, playerId) {
  try {
    const round = roundFromGame(game, playerId);
    if (!round) return;
    const u = await store.loadUserById(playerId);
    const ghin = u?.ghinNumber;
    if (!ghin) return;
    await store.upsertRound(ghin, round);
    const rounds = await store.loadRounds(ghin);   // newest first
    const diffs = rounds.map(r => r.differential).filter(d => typeof d === 'number');
    await store.saveUserHcp(playerId, handicapIndex(diffs));
  } catch (err) {
    console.warn('[gscore] round finalize failed', err);
  }
}

// ---- Mount ----

/**
 * Render the group scorecard.
 * ctx: { main() → the page element, user, showToast(msg, type),
 *        onUnsub(fn) — register a listener teardown }
 */
export async function renderGameScorePage(gameId, groupIdx, ctx) {
  const host = ctx.main();
  resetGameScorerView();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let data = null;
  try { data = await store.loadGame(gameId); } catch (_) { }
  let denied = false;
  // User records back the profile-index → course-handicap fallback for
  // players with no hand-entered game handicap. Loaded once; best-effort.
  let usersById = {};
  try {
    usersById = Object.fromEntries((await store.loadAllUsers()).map(u => [u.id, u]));
  } catch (_) { }
  // What the current DOM was built for. While it matches, paints update the
  // existing elements in place instead of replacing the whole screen —
  // replacing it re-ran the fade-in animation on every tap and listener
  // event, which read as the page "refreshing" mid-round.
  let paintedKey = null;

  const structureKey = (players) =>
    groupIdx + '|' + players.map(p => p.id + (canScoreGamePlayer(ctx.user, data, p.id) ? '+' : '-')).join(',');

  const notFound = (msg, back) => {
    paintedKey = null;
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="${back}" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${msg}</p></div></div>`;
  };

  const setStep = (btn, disabled) => {
    if (!btn) return;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.35' : '1';
    btn.style.cursor = disabled ? 'default' : 'pointer';
  };

  // Refresh only what a score or hole change touches: the hole header, each
  // row's value/total/stepper state, and the hole strip. Buttons are never
  // replaced, so their listeners survive and nothing flashes or reflows.
  const updateInPlace = (players) => {
    const holeCount = gameHoleCount(data);
    const hole = Math.min(viewHole ?? followHole(data, players), holeCount);
    const label = host.querySelector('#gs-hole-label');
    if (label) label.innerHTML = holeHeaderHTML(data, hole, holeCount);
    const prev = host.querySelector('button[data-gs="prev"]');
    if (prev) prev.disabled = hole <= 1;
    const next = host.querySelector('button[data-gs="next"]');
    if (next) next.disabled = hole >= holeCount;
    for (const p of players) {
      const strokes = data.scores?.[p.id]?.holes?.[hole] ?? null;
      const val = host.querySelector(`[data-gs-val="${p.id}"]`);
      if (val) {
        val.textContent = strokes ?? '·';
        val.style.color = strokeColor(strokes, holePar(data, hole));
      }
      const hcp = gamePlayingHcp(data, p.id, usersById[p.id]);
      const tot = host.querySelector(`[data-gs-tot="${p.id}"]`);
      if (tot) tot.textContent = totalsLineText(data, p.id, hcp);
      const run = host.querySelector(`[data-gs-run="${p.id}"]`);
      if (run) {
        const rs = runningScore(data, p.id, hcp);
        run.textContent = rs.text;
        run.style.color = rs.color;
      }
      const chip = host.querySelector(`button[data-gs="hcp"][data-pid="${p.id}"]`);
      if (chip) chip.textContent = hcpChipLabel(data, p.id, usersById[p.id]);
      setStep(host.querySelector(`button[data-gs="minus"][data-pid="${p.id}"]`), strokes === null);
      setStep(host.querySelector(`button[data-gs="plus"][data-pid="${p.id}"]`), strokes !== null && strokes >= MAX_STROKES);
    }
    for (let n = 1; n <= holeCount; n++) {
      const cell = host.querySelector(`button[data-gs="goto"][data-hole="${n}"]`);
      if (!cell) continue;
      const entered = players.filter(p => data.scores?.[p.id]?.holes?.[n]).length;
      const full = players.length > 0 && entered >= players.length;
      cell.style.border = n === hole ? '2px solid var(--text-primary)' : '1px solid var(--border-color)';
      cell.style.background = full ? 'var(--gold)' : 'transparent';
      cell.style.color = full ? '#0C3051' : 'var(--text-secondary)';
      cell.innerHTML = `<div style="font-size:0.58rem;opacity:0.75;">${n}</div>${entered || '·'}`;
    }
  };

  const paint = () => {
    if (!data || data.status === 'deleted') {
      if (!store.isUsingFirebase()) notFound(t('gsGameNotFound'), '#/');
      return;
    }
    const players = groupsOf(data)[groupIdx] || [];
    // The screen is for entering scores: a viewer who may not mark anyone in
    // this group reads the game page's summary instead.
    if (!players.some(p => canScoreGamePlayer(ctx.user, data, p.id))) {
      denied = true;
      notFound(t('gsNoAccess'), `#/game/${esc(gameId)}`);
      return;
    }
    denied = false;
    const key = structureKey(players);
    if (key === paintedKey && host.querySelector('#gs-hole-label')) {
      updateInPlace(players);
      return;
    }
    // Full render only when the screen's structure changed (first paint, or
    // the group's members/permissions did); fade-in only the very first time.
    host.innerHTML = screenHTML(data, groupIdx, ctx.user, paintedKey === null, usersById);
    paintedKey = key;
    wire();
  };

  // One tap: write the hole, let the listener paint the result. `saving` only
  // guards a double-tap racing itself — offline the write resolves locally.
  const write = async (playerId, hole, strokes) => {
    if (saving) return;
    saving = true;
    const note = document.getElementById('gs-note');
    try {
      const local = await store.saveGameScoreHole(gameId, playerId, hole, strokes, ctx.user?.id);
      if (local) {
        // localStorage mode has no listener — repaint from the returned game.
        data = local;
        paint();
      } else {
        // Optimistic mirror so the completion check below sees this tap even
        // if the listener has not fired yet; the listener overwrites `data`
        // wholesale anyway.
        data.scores = data.scores || {};
        data.scores[playerId] = data.scores[playerId] || {};
        data.scores[playerId].holes = data.scores[playerId].holes || {};
        if (strokes === null) delete data.scores[playerId].holes[hole];
        else data.scores[playerId].holes[hole] = strokes;
        paint();
      }
      if (note) note.textContent = '';
      finalizeRoundIfComplete(data, playerId);
    } catch (err) {
      console.error('[gscore]', err);
      if (note) note.textContent = '⚠ ' + (err?.message || t('mpSaveFailed'));
      ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
    } finally {
      saving = false;
    }
  };

  const wire = () => {
    host.querySelectorAll('button[data-gs]').forEach(b => b.onclick = () => {
      const kind = b.dataset.gs;
      // Read the game at click time, never from a render-time closure — a
      // group-mate's tap arrives through the listener between paints.
      if (!data) return;
      const players = groupsOf(data)[groupIdx] || [];
      const holeCount = gameHoleCount(data);
      const hole = Math.min(viewHole ?? followHole(data, players), holeCount);
      if (kind === 'plus' || kind === 'minus') {
        const pid = b.dataset.pid;
        if (!canScoreGamePlayer(ctx.user, data, pid)) return;
        const cur = data.scores?.[pid]?.holes?.[hole] ?? null;
        let next;
        if (kind === 'plus') next = cur === null ? DEFAULT_STROKES : Math.min(MAX_STROKES, cur + 1);
        else next = cur === null ? null : (cur <= 1 ? null : cur - 1);
        if (next !== cur) write(pid, hole, next);
      } else if (kind === 'hcp') {
        const pid = b.dataset.pid;
        if (!canScoreGamePlayer(ctx.user, data, pid)) return;
        const cur = data.hcp?.[pid];
        const raw = prompt(t('gsHcpPrompt'), typeof cur === 'number' ? String(cur) : '');
        if (raw === null) return;                      // cancelled
        const trimmed = raw.trim();
        const next = trimmed === '' ? null : parseInt(trimmed, 10);
        if (next !== null && (isNaN(next) || next < 0 || next > 54)) {
          ctx.showToast?.('⚠️ ' + t('gsHcpPrompt'), 'error');
          return;
        }
        store.saveGamePlayerHcp(gameId, pid, next).then(local => {
          if (local) data = local;
          else {
            data.hcp = data.hcp || {};
            if (next === null) delete data.hcp[pid];
            else data.hcp[pid] = next;
          }
          paint();
        }).catch(err => {
          console.error('[gscore]', err);
          ctx.showToast?.('⚠️ ' + t('mpSaveFailed'), 'error');
        });
      } else if (kind === 'prev') {
        viewHole = Math.max(1, hole - 1);
        paint();
      } else if (kind === 'next') {
        viewHole = Math.min(holeCount, hole + 1);
        paint();
      } else if (kind === 'goto') {
        viewHole = Number(b.dataset.hole);
        paint();
      }
    });
  };

  if (!data && store.isUsingFirebase()) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/game/${esc(gameId)}" class="back-link">${t('back')}</a>
      <div class="loading-spinner" style="margin:40px auto;"></div></div>`;
  }
  paint();

  if (store.isUsingFirebase()) {
    const unsub = store.onGameChanged(gameId, (fresh) => {
      if (!fresh || fresh.status === 'deleted') return;
      data = fresh;
      const players = groupsOf(fresh)[groupIdx] || [];
      // A repaint must not silently reinstate a screen access was refused on.
      if (!denied || players.some(p => canScoreGamePlayer(ctx.user, fresh, p.id))) paint();
    });
    if (unsub) ctx.onUnsub?.(unsub);
  }
}

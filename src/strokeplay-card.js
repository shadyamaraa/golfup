// src/strokeplay-card.js
// A player's tournament card, read only — what they shot on every hole and
// what their numbers say, laid out the way a golf broadcast lays it out:
// HOLE / PAR / SCORE with the score running underneath, birdies ringed and
// bogeys boxed, OUT · IN · TOT beneath. Nothing here writes: scoring lives
// in strokeplay-score.js and this module never touches those paths.

import * as store from './store.js';
import { t } from './i18n.js';
import {
  SP_HOLES, spActive, spEntries, spPlayerGroup, spGroupList, canScoreSp,
  spPlayerCard, spPlayerStats
} from './strokeplay.js';
import { rankEntries, activeRound } from './tournament-sheet.js';
import { fmtToPar } from './game-score.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Which round and which tab each open card is showing, per tournament+player,
// so a live score landing mid-read doesn't yank the page out from under it.
const viewRound = new Map();
const viewTab = new Map();

// The board's own colour vocabulary, so a figure here reads exactly as the
// same figure does on the leaderboard.
const scoreClass = (v) => {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return 'tn-sc-none';
  const n = Number(v);
  return n < 0 ? 'tn-sc-under' : n > 0 ? 'tn-sc-over' : 'tn-sc-even';
};
const scoreText = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v))
  ? '–' : fmtToPar(Number(v)));

const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';
const oneDp = (n) => (Math.round(n * 10) / 10).toFixed(1);
const twoDp = (n) => (Math.round(n * 100) / 100).toFixed(2);

// ---- Scorecard tab ----

function nineHTML(card, from, to, segLabel, seg) {
  const holes = card.holes.slice(from - 1, to);
  const cell = (h) => {
    const cls = h.cls ? ` is-${h.cls}` : '';
    return `<span class="spc-s">${h.strokes !== null
      ? `<i class="spc-n${cls}">${h.strokes}</i>` : ''}</span>`;
  };
  return `
    <div class="spc-grid" style="margin-top:10px;">
      <span class="spc-lbl">${t('spHoleRow')}</span>
      ${holes.map(h => `<span class="spc-h">${h.hole}</span>`).join('')}
      <span class="spc-h spc-seg">${segLabel}</span>

      ${card.hasPars ? `
        <span class="spc-lbl">${t('gsPar')}</span>
        ${holes.map(h => `<span class="spc-p">${h.par ?? ''}</span>`).join('')}
        <span class="spc-p spc-seg">${seg.par ?? ''}</span>` : ''}

      <span class="spc-lbl">${t('spScoreRow')}</span>
      ${holes.map(cell).join('')}
      <span class="spc-s spc-seg">${seg.holesIn ? `<i class="spc-n">${seg.gross}</i>` : ''}</span>

      ${card.hasPars ? `
        <span class="spc-lbl">${t('spToPar')}</span>
        ${holes.map(h => `<span class="spc-r ${scoreClass(h.running)}">${h.running === null ? '' : fmtToPar(h.running)}</span>`).join('')}
        <span class="spc-r spc-seg ${scoreClass(holes[holes.length - 1]?.running)}">${
          holes[holes.length - 1]?.running === null || holes[holes.length - 1]?.running === undefined
            ? '' : fmtToPar(holes[holes.length - 1].running)}</span>` : ''}
    </div>`;
}

function cardTabHTML(card) {
  const sum = (cap, seg) => `
    <div class="spc-sum-cell">
      <span class="spc-sum-cap">${cap}</span>
      <span class="spc-sum-v">${seg.holesIn ? seg.gross : '–'}</span>
      ${card.hasPars ? `<span class="spc-sum-sub ${scoreClass(seg.toPar)}">${scoreText(seg.toPar)}</span>` : ''}
    </div>`;
  return `
    ${nineHTML(card, 1, 9, t('spOut'), card.front)}
    ${nineHTML(card, 10, SP_HOLES, t('spIn'), card.back)}
    <div class="spc-sum">
      ${sum(t('spOut'), card.front)}
      ${sum(t('spIn'), card.back)}
      ${sum(t('tnTotal'), card.total)}
    </div>`;
}

// ---- Stats tab ----

// How each hole reading is labelled; 'par' has no sp* key of its own and
// reuses the scorecard's.
const CLS_KEY = { eagle: 'spEagle', birdie: 'spBirdie', par: 'gsPar', bogey: 'spBogey', double: 'spDouble' };

function statsTabHTML(stats) {
  if (!stats.holesPlayed) {
    return `<p style="font-size:0.82rem;color:var(--text-secondary);margin:16px 0 0;">${t('spNoStats')}</p>`;
  }
  const block = (title, body) => `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color);">
      <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-muted);">${title}</div>
      ${body}
    </div>`;

  // Round by round — the list a player checks first.
  const roundsBody = stats.rounds.map(r => `
    <button data-spc-goto="${r.round}" style="display:flex;width:100%;gap:10px;align-items:baseline;margin-top:6px;
      background:none;border:none;padding:4px 0;cursor:pointer;font-family:var(--font);color:var(--text-primary);text-align:left;">
      <b style="width:34px;font-size:0.8rem;">${t('tnRoundShort')}${r.round}</b>
      <span style="width:44px;font-weight:800;font-size:0.9rem;">${r.holesIn ? r.gross : '–'}</span>
      <span class="${scoreClass(r.toPar)}" style="width:44px;font-weight:700;font-size:0.82rem;">${scoreText(r.toPar)}</span>
      <span style="margin-left:auto;font-size:0.74rem;color:var(--text-secondary);">${r.thru ? `${t('tnThru')} ${esc(r.thru)}` : '–'}</span>
    </button>`).join('');

  // Scoring spread — bars scaled to the biggest bucket.
  let distBody = '';
  if (stats.dist) {
    const rows = [
      ['eagle', 'var(--red)'], ['birdie', 'var(--red)'], ['par', 'var(--text-muted)'],
      ['bogey', 'var(--text-primary)'], ['double', 'var(--text-primary)']
    ].map(([cls, colour]) => [CLS_KEY[cls], stats.dist[cls], colour]);
    const max = Math.max(1, ...rows.map(r => r[1]));
    distBody = rows.map(([key, n, colour]) => `
      <div class="spc-stat-row">
        <span style="color:var(--text-secondary);">${t(key)}</span>
        <b style="text-align:right;">${n}</b>
        <span class="spc-bar"><span style="width:${(n / max) * 100}%;background:${colour};"></span></span>
      </div>`).join('');
  }

  // By par type — where the round was won or lost.
  let byParBody = '';
  if (stats.byPar) {
    const rows = [3, 4, 5].filter(k => stats.byPar[k].count).map(k => `
      <div class="spc-stat-row" style="grid-template-columns:74px 40px 1fr;">
        <span style="color:var(--text-secondary);">${t('gsPar')} ${k}</span>
        <b style="text-align:right;">${twoDp(stats.byPar[k].avg)}</b>
        <span class="${scoreClass(stats.byPar[k].toPar)}" style="font-size:0.74rem;font-weight:700;">
          ${Math.abs(stats.byPar[k].toPar) < 0.005 ? 'E'
            : `${stats.byPar[k].toPar > 0 ? '+' : '−'}${twoDp(Math.abs(stats.byPar[k].toPar))}`}
          <span style="color:var(--text-muted);font-weight:600;"> · ${stats.byPar[k].count} ${t('tnHolesShort')}</span>
        </span>
      </div>`).join('');
    byParBody = rows;
  }

  const nine = (cap, seg) => `
    <div class="spc-sum-cell">
      <span class="spc-sum-cap">${cap}</span>
      <span class="spc-sum-v">${seg.holesIn ? seg.gross : '–'}</span>
      ${stats.hasPars ? `<span class="spc-sum-sub ${scoreClass(seg.toPar)}">${scoreText(seg.toPar)}</span>` : ''}
    </div>`;

  const holeLine = (h) => (h
    ? `${t('spHoleRow')} ${h.hole} · ${t('gsPar')} ${h.par} · <b>${h.strokes}</b>
       <span class="${scoreClass(h.diff)}" style="font-weight:700;">${t(CLS_KEY[h.cls] || 'gsPar')}</span>
       ${stats.scope === 'all' ? `<span style="color:var(--text-muted);"> · ${t('tnRoundShort')}${h.round}</span>` : ''}`
    : '–');

  const avgRow = (label, value, sub = '') => `
    <div style="display:flex;gap:10px;align-items:baseline;margin-top:6px;font-size:0.82rem;">
      <span style="color:var(--text-secondary);">${label}</span>
      <b style="margin-left:auto;font-size:0.9rem;">${value}</b>
      ${sub ? `<span style="font-size:0.72rem;color:var(--text-muted);width:74px;text-align:right;">${sub}</span>` : ''}
    </div>`;

  return `
    ${block(t('spRoundsPlayed'), roundsBody)}
    ${distBody ? block(t('spScoreDist'), distBody) : ''}
    ${byParBody ? block(t('spByPar'), byParBody) : ''}
    ${block(`${t('spFront9')} · ${t('spBack9')}`, `
      <div class="spc-sum" style="margin-top:8px;">
        ${nine(t('spFront9'), stats.front)}
        ${nine(t('spBack9'), stats.back)}
      </div>`)}
    ${stats.best ? block(`${t('spBestHole')} · ${t('spWorstHole')}`, `
      <div style="margin-top:6px;font-size:0.8rem;">${holeLine(stats.best)}</div>
      <div style="margin-top:4px;font-size:0.8rem;">${holeLine(stats.worst)}</div>`) : ''}
    ${block(t('spScoringAvg'), `
      ${stats.scoringAvg !== null ? avgRow(t('spScoringAvg'), oneDp(stats.scoringAvg),
        stats.fieldAvg !== null ? `${t('spFieldAvg')} ${oneDp(stats.fieldAvg)}` : '') : ''}
      ${avgRow(t('spPerHole'), twoDp(stats.holeAvg))}
      ${avgRow(t('spGross'), stats.gross)}
      ${stats.net !== null ? avgRow(t('spNet'), stats.net, `${t('spHcp')} ${stats.hcp}`) : ''}`)}
    ${!stats.hasPars ? `<p style="font-size:0.74rem;color:var(--text-muted);margin:14px 0 0;">${t('spNoPars')}</p>` : ''}`;
}

// ---- Header ----

function headerHTML(tn, tnId, pid, card, entry, round, may, gid) {
  const group = gid ? spGroupList(tn, round).find(g => g.gid === gid) : null;
  const flight = group
    ? [`${t('spGroup')} ${group.number ?? ''}`,
       group.teeTime ? `${t('spTeeTime')} ${group.teeTime}` : '',
       group.startHole ? `${t('spStartHole')} ${group.startHole}` : ''].filter(Boolean).join(' · ')
    : '';
  const roundCount = Math.max(1, Number(tn.rounds) || 1);
  return `
    <div class="surface-card" style="padding:14px;">
      <div style="display:flex;gap:12px;align-items:center;">
        <span style="width:44px;height:44px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;
          justify-content:center;background:var(--accent-soft);color:var(--text-primary);
          font-weight:800;font-size:1.1rem;">${esc(initialOf(card.name))}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:1.05rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${esc(card.name)}
          </div>
          <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-top:2px;font-size:0.76rem;color:var(--text-secondary);">
            ${entry ? `<span>${t('tnPos')} <b style="color:var(--text-primary);">${esc(entry.posLabel)}</b></span>` : ''}
            ${card.hcp !== null ? `<span class="pill-soft" style="font-size:0.66rem;">${t('spHcp')} ${esc(card.hcp)}</span>` : ''}
            <span>${t('tnRoundShort')}${round}
              <b class="${scoreClass(card.total.toPar)}">${scoreText(card.total.toPar)}</b></span>
            ${card.thru ? `<span>${t('tnThru')} ${esc(card.thru)}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="spc-sum-cap">${t('tnTotal')}</div>
          <div class="${scoreClass(entry?.total)}" style="font-size:1.5rem;font-weight:800;">
            ${scoreText(entry?.total ?? null)}
          </div>
        </div>
      </div>
      ${flight ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);font-size:0.76rem;color:var(--text-secondary);">${esc(flight)}</div>` : ''}
      ${may ? `
        <div style="display:flex;gap:8px;margin-top:10px;">
          <a href="#/spscore/${esc(tnId)}/${esc(pid)}" class="btn btn-primary btn-sm" style="flex:1;text-align:center;">${t('mpEnterScore')}</a>
          ${gid ? `<a href="#/spgroup/${esc(tnId)}/${round}/${esc(gid)}" class="btn btn-outline btn-sm" style="flex:1;text-align:center;">${t('spGroupCard')}</a>` : ''}
        </div>` : ''}
      ${roundCount > 1 ? `
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
          ${Array.from({ length: roundCount }, (_, i) => `
            <button data-spc-round="${i + 1}" class="btn ${round === i + 1 ? 'btn-primary' : 'btn-outline'} btn-sm">
              ${t('tnRoundShort')}${i + 1}
            </button>`).join('')}
        </div>` : ''}
    </div>`;
}

// ---- Mount ----

/**
 * Render the read-only player card for `pid` into `host`.
 * ctx: { user, tn?, metric?, backHash? } — subscribes to the tournament for
 * live updates and returns the unsubscribe function.
 */
export function renderSpPlayerCard(host, tnId, pid, ctx = {}) {
  if (!host) return () => { };
  const key = `${tnId}/${pid}`;
  // A fresh visit starts on the player's live round, card tab first.
  viewRound.delete(key);
  viewTab.delete(key);
  let tnLive = null;

  const empty = (msg) => {
    host.innerHTML = `
      <div class="detail-container fade-in">
        <a href="${ctx.backHash || `#/tournament/${esc(tnId)}`}" class="back-link">← ${t('back')}</a>
        <div class="empty-state" style="padding:30px 20px;"><p>${msg}</p></div>
      </div>`;
  };

  const paint = () => {
    const tn = tnLive;
    if (!tn) { empty(t('tnNotFound')); return; }
    if (!spActive(tn) || !tn.sp.players[pid]) { empty(t('spNoPlayers')); return; }

    const roundCount = Math.max(1, Number(tn.rounds) || 1);
    const entries = spEntries(tn, ctx.metric === 'net' ? 'net' : 'gross');
    // The round this player is actually on: their latest with a score, else
    // whatever round the field is playing.
    let live = 0;
    for (let r = roundCount; r >= 1 && !live; r--) {
      if (Object.keys(tn.sp.scores?.[pid]?.[r] || {}).length) live = r;
    }
    if (!live) live = Math.min(roundCount, activeRound(entries, tn.currentRound) || 1);
    const stored = viewRound.get(key);
    const round = Math.min(roundCount, Math.max(1, Number(stored === 'all' ? live : stored) || live));
    const tab = viewTab.get(key) || 'card';
    const scope = stored === 'all' ? null : round;

    const card = spPlayerCard(tn, pid, round);
    const entry = rankEntries(entries, { cutAfterRound: tn.cutAfterRound, cutSize: tn.cutSize })
      .find(e => e.pid === pid) || null;
    const may = canScoreSp(ctx.user, pid, tn.sp.players, round);
    const gid = spPlayerGroup(tn.sp.players, pid, round);

    host.innerHTML = `
      <div class="detail-container fade-in">
        <a href="${ctx.backHash || `#/tournament/${esc(tnId)}`}" class="back-link">← ${t('back')}</a>
        <h2 class="detail-title" style="margin:8px 0 10px;">${t('spPlayerCard')}</h2>
        ${headerHTML(tn, tnId, pid, card, entry, round, may, gid)}
        <div class="seg-tabs" style="margin-top:12px;">
          <button class="seg-tab${tab === 'card' ? ' active' : ''}" data-spc-tab="card">${t('spScorecard')}</button>
          <button class="seg-tab${tab === 'stats' ? ' active' : ''}" data-spc-tab="stats">${t('statsTab')}</button>
        </div>
        <div class="surface-card" style="padding:12px;margin-top:10px;">
          ${tab === 'card'
            ? cardTabHTML(card)
            : `${roundCount > 1 ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                  ${Array.from({ length: roundCount }, (_, i) => `
                    <button data-spc-scope="${i + 1}" class="btn ${stored !== 'all' && round === i + 1 ? 'btn-primary' : 'btn-outline'} btn-sm">
                      ${t('tnRoundShort')}${i + 1}
                    </button>`).join('')}
                  <button data-spc-scope="all" class="btn ${stored === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm">${t('spAllRounds')}</button>
                </div>` : ''}
              ${statsTabHTML(spPlayerStats(tn, pid, scope))}`}
        </div>
      </div>`;

    host.querySelectorAll('button[data-spc-round]').forEach(b => b.onclick = () => {
      viewRound.set(key, Number(b.dataset.spcRound));
      paint();
    });
    host.querySelectorAll('button[data-spc-tab]').forEach(b => b.onclick = () => {
      viewTab.set(key, b.dataset.spcTab);
      paint();
    });
    host.querySelectorAll('button[data-spc-scope]').forEach(b => b.onclick = () => {
      const v = b.dataset.spcScope;
      viewRound.set(key, v === 'all' ? 'all' : Number(v));
      paint();
    });
    // A round in the stats list jumps to that round's card.
    host.querySelectorAll('button[data-spc-goto]').forEach(b => b.onclick = () => {
      viewRound.set(key, Number(b.dataset.spcGoto));
      viewTab.set(key, 'card');
      paint();
    });
  };

  const off = store.onTournamentChanged?.(tnId, (tn) => { tnLive = tn; paint(); });
  // No live store (local mode): render once from what the caller loaded.
  if (!off && ctx.tn !== undefined) { tnLive = ctx.tn; paint(); }
  return off || (() => { });
}

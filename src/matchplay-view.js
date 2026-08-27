// src/matchplay-view.js
// The public Live Match Center (spec §8–§11, §22, §24).
//
// Everything on screen is derived from hole results by src/matchplay.js, so
// this module only decides what a viewer sees first. The spec's own priority
// is the layout: team score → current session → LIVE matches → completed →
// upcoming, and a viewer should answer "who's winning, how many holes left"
// in two seconds without reading a table.
//
// Team colour is never the only carrier of meaning — every status line names
// the team it belongs to (spec §23).

import { t } from './i18n.js';
import {
  settleMatch, statusText, matchState, matchPoints, teamTotals, sessionTotals,
  holeTimeline, sortMatchesForDisplay, DEFAULT_HOLES, HALVED, TEAM_KEYS
} from './matchplay.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Points print as 8.5, never 8.50 or 8.
const pts = (n) => (Number(n) % 1 ? Number(n).toFixed(1) : String(Number(n)));

export const teamName = (mp, k) => mp?.teams?.[k]?.name || (k === 'a' ? 'Team A' : 'Team B');
export const teamShort = (mp, k) => mp?.teams?.[k]?.short || teamName(mp, k);
export const teamColor = (mp, k) => {
  const c = mp?.teams?.[k]?.color;
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : (k === 'a' ? '#1f6f43' : '#b3382c');
};

const matchesOf = (mp) => Object.values(mp?.matches || {}).filter(Boolean);

function playerNames(mp, match, k) {
  return (match?.players?.[k] || [])
    .map(pid => mp?.roster?.[pid]?.name || '')
    .filter(Boolean)
    .join(' / ');
}

const sessionLabel = (session) => {
  if (!session) return '';
  const day = session.day ? `${t('mpDay')} ${session.day}` : '';
  return [day, session.format].filter(Boolean).join(' — ');
};

// The session a viewer should be looking at: the one with matches under way,
// else the earliest that has not finished, else the last played.
export function currentSession(mp) {
  const sessions = Object.values(mp?.sessions || {}).filter(Boolean)
    .sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0)
      || (Number(a.number) || 0) - (Number(b.number) || 0));
  if (!sessions.length) return null;
  const stateOf = (s) => matchesOf(mp).filter(m => m.sessionId === s.id).map(matchState);
  const live = sessions.find(s => stateOf(s).some(x => x === 'LIVE' || x === 'SUSPENDED'));
  if (live) return live;
  const pending = sessions.find(s => {
    const states = stateOf(s);
    return states.length && states.some(x => x !== 'COMPLETED');
  });
  return pending || sessions.at(-1);
}

// ---- Top scoreboard (spec §8) ----

function scoreboardHTML(mp) {
  const total = teamTotals(matchesOf(mp));
  const session = currentSession(mp);
  const side = (k) => {
    const lead = total[k] > total[k === 'a' ? 'b' : 'a'];
    return `
      <div style="flex:1;text-align:center;min-width:120px;">
        <div style="height:4px;border-radius:2px;background:${teamColor(mp, k)};margin-bottom:8px;"></div>
        <div style="font-size:0.82rem;font-weight:700;line-height:1.25;">${esc(teamName(mp, k))}</div>
        <div style="font-size:2.3rem;font-weight:800;line-height:1.1;${lead ? '' : 'opacity:0.72;'}">${pts(total[k])}</div>
      </div>`;
  };
  return `
    <div class="surface-card" style="padding:16px;margin-top:12px;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        ${side('a')}
        <div style="align-self:center;font-size:0.8rem;color:var(--text-secondary);font-weight:700;">—</div>
        ${side('b')}
      </div>
      ${session ? `
        <div style="text-align:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);
                    font-size:0.78rem;font-weight:700;color:var(--text-secondary);letter-spacing:0.04em;">
          ${esc(sessionLabel(session).toUpperCase())}
        </div>` : ''}
    </div>`;
}

// ---- Match cards (spec §9) ----

function cardHTML(mp, match, state) {
  const total = match.totalHoles || DEFAULT_HOLES;
  const settled = settleMatch(match.holes, total);
  const session = mp.sessions?.[match.sessionId] || {};
  const stateText = { LIVE: t('mpLive'), COMPLETED: t('mpFinal'), SUSPENDED: t('mpSuspended') }[state]
    || t('mpUpcoming');

  // The one line a viewer reads: who leads and by how much, or the final
  // result. Always carries the team's name, never colour alone.
  const lead = settled.leader
    ? `${teamShort(mp, settled.leader)} ${statusText(settled)}`
    : (settled.finished ? t('mpTied') : 'AS');

  // Tee time before the off, THRU once under way (spec §17).
  const progress = state === 'UPCOMING'
    ? (match.teeTime ? `${t('mpTee')} ${esc(match.teeTime)}` : '')
    : (settled.finished ? '' : `${t('mpThru')} ${settled.thru}`);

  const sideHTML = (k) => {
    const names = playerNames(mp, match, k);
    const won = settled.finished && settled.winner === k;
    return `
      <div style="display:flex;gap:7px;align-items:baseline;margin-top:3px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${teamColor(mp, k)};flex:none;"></span>
        <span style="font-size:0.86rem;${won ? 'font-weight:800;' : ''}">${esc(names || '—')}</span>
      </div>`;
  };

  return `
    <button data-mpv="open" data-match="${esc(match.id)}" class="surface-card"
      style="display:block;width:100%;text-align:left;padding:12px;margin-top:8px;cursor:pointer;
             border:1px solid var(--border-color);font-family:var(--font);color:var(--text-primary);
             ${state === 'LIVE' ? 'border-left:3px solid var(--mpv-live,#d7263d);' : ''}">
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:0.72rem;font-weight:800;color:var(--text-secondary);">
          ${t('mpMatchNo')}${esc(match.number ?? '')}
        </span>
        <span style="font-size:0.66rem;color:var(--text-muted);">${esc(session.format || '')}</span>
        <span class="pill-soft" style="margin-left:auto;font-size:0.66rem;font-weight:800;">${esc(stateText)}</span>
      </div>
      ${sideHTML('a')}
      ${sideHTML('b')}
      <div style="display:flex;gap:10px;align-items:baseline;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);">
        <b style="font-size:0.95rem;">${esc(lead)}</b>
        ${progress ? `<span style="font-size:0.76rem;color:var(--text-secondary);margin-left:auto;">${esc(progress)}</span>` : ''}
      </div>
    </button>`;
}

// ---- Detail modal (spec §11) ----

function detailHTML(mp, match) {
  const total = match.totalHoles || DEFAULT_HOLES;
  const settled = settleMatch(match.holes, total);
  const session = mp.sessions?.[match.sessionId] || {};
  const rows = holeTimeline(match);
  const state = matchState(match);

  const cell = (r) => {
    const bg = r.result === 'a' ? teamColor(mp, 'a') : r.result === 'b' ? teamColor(mp, 'b') : 'transparent';
    const fg = r.result === 'a' || r.result === 'b' ? '#fff' : 'var(--text-secondary)';
    const mark = r.result === 'a' ? 'A' : r.result === 'b' ? 'W' : r.result === HALVED ? '–' : '·';
    return `
      <div style="text-align:center;border-radius:5px;padding:4px 0;background:${bg};color:${fg};
                  border:1px solid var(--border-color);font-size:0.7rem;font-weight:700;">
        <div style="font-size:0.56rem;opacity:0.75;">${r.hole}</div>${mark}
      </div>`;
  };

  const lead = settled.leader
    ? `${teamShort(mp, settled.leader)} ${statusText(settled)}`
    : (settled.finished ? t('mpTied') : 'AS');

  return `
    <div style="padding:4px 2px;">
      <div style="font-size:0.74rem;color:var(--text-secondary);font-weight:700;">
        ${t('mpMatchNo')}${esc(match.number ?? '')} — ${esc(session.format || '')}
        ${match.teeTime ? ` · ${esc(match.teeTime)}` : ''}
      </div>
      ${TEAM_KEYS.map(k => `
        <div style="display:flex;gap:7px;align-items:baseline;margin-top:5px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${teamColor(mp, k)};flex:none;"></span>
          <span style="font-size:0.9rem;font-weight:600;">${esc(playerNames(mp, match, k) || '—')}</span>
        </div>`).join('')}
      <div style="text-align:center;margin-top:12px;padding:10px;border-radius:10px;background:var(--bg-card-hover);">
        <div style="font-size:1.25rem;font-weight:800;">${esc(lead)}</div>
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">
          ${state === 'COMPLETED' ? t('mpFinal') : `${t('mpThru')} ${settled.thru}`}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin-top:12px;">
        ${rows.map(cell).join('')}
      </div>
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:8px;text-align:center;">
        A = ${esc(teamShort(mp, 'a'))} · W = ${esc(teamShort(mp, 'b'))} · – = ${t('mpHalved')}
      </div>
    </div>`;
}

// ---- Session summary (spec §24) ----

function summaryHTML(mp) {
  const totals = sessionTotals(matchesOf(mp));
  const sessions = Object.values(mp.sessions || {}).filter(Boolean)
    .sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0)
      || (Number(a.number) || 0) - (Number(b.number) || 0));
  const overall = teamTotals(matchesOf(mp));
  if (!sessions.length) return '';
  return `
    <div class="surface-card" style="padding:14px;margin-top:12px;">
      <div style="font-size:0.8rem;font-weight:800;">${t('mpOverall')}</div>
      <div style="display:flex;gap:8px;margin-top:4px;font-size:0.88rem;">
        <span>${esc(teamShort(mp, 'a'))} <b>${pts(overall.a)}</b></span>
        <span style="color:var(--text-secondary);">—</span>
        <span><b>${pts(overall.b)}</b> ${esc(teamShort(mp, 'b'))}</span>
      </div>
      <div style="font-size:0.78rem;font-weight:800;margin-top:12px;">${t('mpSessionResults')}</div>
      ${sessions.map(s => {
        const v = totals[s.id] || { a: 0, b: 0 };
        return `
          <div style="display:flex;gap:8px;align-items:baseline;margin-top:6px;font-size:0.8rem;">
            <span style="color:var(--text-secondary);">${esc(sessionLabel(s))}</span>
            <span style="margin-left:auto;font-weight:700;">${pts(v.a)} — ${pts(v.b)}</span>
          </div>`;
      }).join('')}
    </div>`;
}

// ---- Board ----

// Matches grouped the way the spec orders them for a phone (§22).
function groupsHTML(mp) {
  const sorted = sortMatchesForDisplay(matchesOf(mp));
  if (!sorted.length) {
    return `<div class="empty-state" style="padding:30px 20px;"><p>${t('mpNoMatches')}</p></div>`;
  }
  const group = (label, states) => {
    const items = sorted.filter(x => states.includes(x.state));
    if (!items.length) return '';
    return `
      <div class="section-head" style="margin-top:14px;">
        <h2 style="font-size:0.86rem;">${esc(label)} <span style="color:var(--text-secondary);font-weight:500;">(${items.length})</span></h2>
      </div>
      ${items.map(x => cardHTML(mp, x.match, x.state)).join('')}`;
  };
  return [
    group(t('mpLive'), ['LIVE', 'SUSPENDED']),
    group(t('mpFinal'), ['COMPLETED']),
    group(t('mpUpcoming'), ['UPCOMING'])
  ].join('');
}

/**
 * Render the Live Match Center into `host`.
 * ctx: { showModal(title, html) — opens the match detail }
 */
export function renderMatchCenter(host, tn, ctx = {}) {
  if (!host) return;
  const mp = tn?.mp;
  if (!mp || !Object.keys(mp.matches || {}).length) {
    host.innerHTML = `
      ${mp ? scoreboardHTML(mp) : ''}
      <div class="empty-state" style="padding:30px 20px;"><p>${t('mpNoMatches')}</p></div>`;
    return;
  }

  host.innerHTML = `
    ${scoreboardHTML(mp)}
    ${groupsHTML(mp)}
    ${summaryHTML(mp)}`;

  host.querySelectorAll('button[data-mpv="open"]').forEach(b => b.onclick = () => {
    const match = mp.matches[b.dataset.match];
    if (!match) return;
    ctx.showModal?.(
      `${t('mpMatchNo')}${match.number ?? ''}`,
      detailHTML(mp, match)
    );
  });
}

// Compact line for the home strip: the team score and what is running.
export function stripSummary(tn) {
  const mp = tn?.mp;
  if (!mp) return null;
  const matches = matchesOf(mp);
  if (!matches.length) return null;
  const total = teamTotals(matches);
  const liveCount = matches.filter(m => matchState(m) === 'LIVE').length;
  return {
    a: { name: teamShort(mp, 'a'), points: total.a, color: teamColor(mp, 'a') },
    b: { name: teamShort(mp, 'b'), points: total.b, color: teamColor(mp, 'b') },
    liveCount,
    session: sessionLabel(currentSession(mp))
  };
}

export { pts as formatPoints, matchPoints };

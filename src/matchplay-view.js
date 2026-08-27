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
  holeTimeline, sortMatchesForDisplay, DEFAULT_HOLES, HALVED, TEAM_KEYS, UNGROUPED,
  playerStats, pairStats, tournamentComplete, tnKind
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

// A stored logo is only ever accepted as an image data URI — anything else
// (a URL, markup, garbage) is ignored and the colour dot takes over. That is
// both the XSS boundary and the graceful fallback for teams with no logo.
export const teamLogo = (mp, k) => {
  const l = mp?.teams?.[k]?.logo;
  return typeof l === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(l)
    ? l : null;
};

// The team's visual mark wherever one is shown: the uploaded logo when there
// is one, the colour dot otherwise. Never the only carrier of meaning — the
// adjacent text always names the team (spec §23).
export function teamMark(mp, k, size = 8) {
  const logo = teamLogo(mp, k);
  if (logo) {
    return `<img src="${logo}" alt="" style="width:${size + 8}px;height:${size + 8}px;object-fit:contain;border-radius:4px;flex:none;" />`;
  }
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${teamColor(mp, k)};flex:none;"></span>`;
}

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
    const logo = teamLogo(mp, k);
    return `
      <div style="flex:1;text-align:center;min-width:120px;">
        <div style="height:4px;border-radius:2px;background:${teamColor(mp, k)};margin-bottom:8px;"></div>
        ${logo ? `<img src="${logo}" alt="" style="width:38px;height:38px;object-fit:contain;display:block;margin:0 auto 5px;border-radius:8px;" />` : ''}
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

// Does this member play in this match? Modern roster entries are keyed by
// the member's userId; older ones carry it in the record.
export function isPlayerInMatch(userId, match, roster) {
  if (!userId || !match) return false;
  return TEAM_KEYS.some(k => (match.players?.[k] || [])
    .some(pid => pid === userId || roster?.[pid]?.userId === userId));
}

// What the leading side is called on a status line: the team's short name in
// a team tournament, the player(s) themselves in plain match play.
function sideLabel(mp, match, k, singles) {
  if (!singles) return teamShort(mp, k);
  return playerNames(mp, match, k) || (k === 'a' ? 'A' : 'B');
}

function cardHTML(mp, match, state, tnId, viewerId, singles) {
  const total = match.totalHoles || DEFAULT_HOLES;
  const settled = settleMatch(match.holes, total);
  const session = mp.sessions?.[match.sessionId] || {};
  const stateText = { LIVE: t('mpLive'), COMPLETED: t('mpFinal'), SUSPENDED: t('mpSuspended') }[state]
    || t('mpUpcoming');

  // The one line a viewer reads: who leads and by how much, or the final
  // result. Always carries the team's name, never colour alone. A match that
  // has not teed off is not "all square" — it has no status at all, so it
  // shows what it is instead.
  const lead = state === 'UPCOMING'
    ? stateText
    : settled.leader
      ? `${sideLabel(mp, match, settled.leader, singles)} ${statusText(settled)}`
      : (settled.finished ? t('mpTied') : 'AS');

  // Tee time before the off, THRU once under way (spec §17).
  const progress = state === 'UPCOMING'
    ? (match.teeTime ? `${t('mpTee')} ${esc(match.teeTime)}` : '')
    : (settled.finished ? '' : `${t('mpThru')} ${settled.thru}`);

  const sideHTML = (k) => {
    const names = playerNames(mp, match, k);
    const won = settled.finished && settled.winner === k;
    return `
      <div style="display:flex;gap:7px;align-items:center;margin-top:3px;">
        ${teamMark(mp, k, 8)}
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
    </button>
    ${isPlayerInMatch(viewerId, match, mp.roster) && state !== 'COMPLETED' ? `
      <a href="#/score/${esc(tnId)}/${esc(match.id)}" class="btn btn-primary btn-sm"
         style="display:block;text-align:center;text-decoration:none;margin-top:4px;">
        ⛳ ${t('mpEnterScore')}
      </a>` : ''}`;
}

// ---- Detail modal (spec §11) ----

function detailHTML(mp, match, singles) {
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
    ? `${sideLabel(mp, match, settled.leader, singles)} ${statusText(settled)}`
    : (settled.finished ? t('mpTied') : 'AS');

  return `
    <div style="padding:4px 2px;">
      <div style="font-size:0.74rem;color:var(--text-secondary);font-weight:700;">
        ${t('mpMatchNo')}${esc(match.number ?? '')} — ${esc(session.format || '')}
        ${match.teeTime ? ` · ${esc(match.teeTime)}` : ''}
      </div>
      ${TEAM_KEYS.map(k => `
        <div style="display:flex;gap:7px;align-items:center;margin-top:5px;">
          ${teamMark(mp, k, 9)}
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
        A = ${esc(singles ? (playerNames(mp, match, 'a') || 'A') : teamShort(mp, 'a'))}
        · W = ${esc(singles ? (playerNames(mp, match, 'b') || 'B') : teamShort(mp, 'b'))}
        · – = ${t('mpHalved')}
      </div>
    </div>`;
}

// ---- Standings (plain match play) ----

// One row per participant over completed matches: P, W-L-H, points — the
// scoreboard a flat singles tournament has instead of team totals.
function standingsHTML(mp) {
  const stats = playerStats(mp);
  const rows = Object.entries(stats)
    .map(([pid, s]) => ({ name: mp.roster?.[pid]?.name || pid, ...s }))
    .sort((x, y) => y.points - x.points || y.w - x.w || x.name.localeCompare(y.name));
  if (!rows.length) return '';
  return `
    <div class="surface-card" style="padding:14px;margin-top:12px;">
      <div style="font-size:0.8rem;font-weight:800;">${t('mpStandings')}</div>
      <div style="display:grid;grid-template-columns:1fr repeat(2,44px) 44px;gap:2px 6px;margin-top:8px;font-size:0.8rem;">
        <span></span>
        <span style="text-align:center;color:var(--text-muted);font-size:0.66rem;font-weight:700;">P</span>
        <span style="text-align:center;color:var(--text-muted);font-size:0.66rem;font-weight:700;">W-L-H</span>
        <span style="text-align:right;color:var(--text-muted);font-size:0.66rem;font-weight:700;">Pts</span>
        ${rows.map(r => `
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.name)}</span>
          <span style="text-align:center;color:var(--text-secondary);">${r.played}</span>
          <span style="text-align:center;color:var(--text-secondary);">${r.w}-${r.l}-${r.h}</span>
          <span style="text-align:right;font-weight:700;">${pts(r.points)}</span>`).join('')}
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
      ${sessions.map(s => [sessionLabel(s), totals[s.id]])
        // A match whose session was lost still holds points, so it gets a row
        // of its own rather than making the rows disagree with the total.
        .concat(totals[UNGROUPED] ? [[t('mpUngrouped'), totals[UNGROUPED]]] : [])
        .map(([label, v]) => `
          <div style="display:flex;gap:8px;align-items:baseline;margin-top:6px;font-size:0.8rem;">
            <span style="color:var(--text-secondary);">${esc(label)}</span>
            <span style="margin-left:auto;font-weight:700;">${pts(v?.a || 0)} — ${pts(v?.b || 0)}</span>
          </div>`).join('')}
    </div>`;
}

// ---- Player statistics (spec §25) ----

function statsHTML(mp) {
  const stats = playerStats(mp);
  if (!Object.keys(stats).length) return '';
  const pairs = pairStats(mp);

  const teamTable = (k) => {
    const rows = Object.entries(stats)
      .filter(([pid]) => mp.roster?.[pid]?.teamId === k)
      .map(([pid, s]) => ({ name: mp.roster?.[pid]?.name || pid, ...s }))
      .sort((x, y) => y.points - x.points || y.w - x.w || x.name.localeCompare(y.name));
    if (!rows.length) return '';
    return `
      <div style="margin-top:12px;">
        <div style="display:flex;gap:7px;align-items:center;">
          ${teamMark(mp, k, 8)}
          <b style="font-size:0.78rem;">${esc(teamShort(mp, k))}</b>
        </div>
        <div style="display:grid;grid-template-columns:1fr repeat(3,34px) 44px;gap:2px 6px;margin-top:6px;font-size:0.78rem;">
          <span></span>
          <span style="text-align:center;color:var(--text-muted);font-size:0.66rem;font-weight:700;">P</span>
          <span style="text-align:center;color:var(--text-muted);font-size:0.66rem;font-weight:700;">W-L-H</span>
          <span></span>
          <span style="text-align:right;color:var(--text-muted);font-size:0.66rem;font-weight:700;">Pts</span>
          ${rows.map(r => `
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.name)}</span>
            <span style="text-align:center;color:var(--text-secondary);">${r.played}</span>
            <span style="text-align:center;color:var(--text-secondary);">${r.w}-${r.l}-${r.h}</span>
            <span></span>
            <span style="text-align:right;font-weight:700;">${pts(r.points)}</span>`).join('')}
        </div>
      </div>`;
  };

  const pairRows = Object.values(pairs)
    .sort((x, y) => (y.w - y.l) - (x.w - x.l) || y.played - x.played);
  const pairsBlock = pairRows.length ? `
    <div style="font-size:0.74rem;font-weight:800;margin-top:14px;color:var(--text-secondary);">${t('mpPairs')}</div>
    ${pairRows.map(p => `
      <div style="display:flex;gap:8px;align-items:center;margin-top:5px;font-size:0.78rem;">
        ${teamMark(mp, p.teamId, 8)}
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(p.players.map(pid => mp.roster?.[pid]?.name || pid).join(' / '))}
        </span>
        <span style="margin-left:auto;color:var(--text-secondary);white-space:nowrap;">${p.played} · ${p.w}-${p.l}-${p.h}</span>
      </div>`).join('')}` : '';

  // Collapsed by default: the spec's priority list (§22) puts the score and
  // the matches first, and mid-tournament this table is a curiosity, not the
  // headline.
  return `
    <details data-mpv-stats class="surface-card" style="padding:14px;margin-top:12px;">
      <summary style="font-size:0.8rem;font-weight:800;cursor:pointer;">${t('mpStats')}</summary>
      ${teamTable('a')}
      ${teamTable('b')}
      ${pairsBlock}
    </details>`;
}

// ---- Past tournaments (spec Phase 2: historical M Cup results) ----

// Finished match play tournaments other than the one on screen, newest first,
// each with its derived final score. Rendered by app.js below the board once
// the tournament list is in hand.
export function historyHTML(list, currentId) {
  const past = (Array.isArray(list) ? list : [])
    .filter(tn => tn && tn.format === 'match' && tn.id !== currentId
      && tn.mp && tournamentComplete(tn.mp))
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  if (!past.length) return '';

  const row = (tn) => {
    const total = teamTotals(Object.values(tn.mp.matches || {}));
    const winner = total.a > total.b ? 'a' : total.b > total.a ? 'b' : null;
    const side = (k) => `<span style="${winner === k ? 'font-weight:800;' : ''}">${esc(teamShort(tn.mp, k))} ${pts(total[k])}</span>`;
    const year = String(tn.startDate || '').slice(0, 4);
    return `
      <a href="#/tournament/${esc(tn.id)}" style="display:flex;gap:10px;align-items:baseline;margin-top:8px;
         text-decoration:none;color:var(--text-primary);font-size:0.82rem;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(tn.name || '—')}${year ? ` <span style="color:var(--text-muted);font-size:0.72rem;">${year}</span>` : ''}
        </span>
        <span style="margin-left:auto;white-space:nowrap;">${side('a')} <span style="color:var(--text-secondary);">—</span> ${side('b')}</span>
      </a>`;
  };

  return `
    <div class="surface-card" style="padding:14px;margin-top:12px;">
      <div style="font-size:0.8rem;font-weight:800;">${t('mpHistory')}</div>
      ${past.map(row).join('')}
    </div>`;
}

// ---- Board ----

// Matches grouped the way the spec orders them for a phone (§22).
function groupsHTML(mp, tnId, viewerId, singles) {
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
      ${items.map(x => cardHTML(mp, x.match, x.state, tnId, viewerId, singles)).join('')}`;
  };
  // Suspended matches keep their own heading rather than being counted under
  // LIVE, where the count would claim more play is under way than there is.
  return [
    group(t('mpLive'), ['LIVE']),
    group(t('mpSuspended'), ['SUSPENDED']),
    group(t('mpFinal'), ['COMPLETED']),
    group(t('mpUpcoming'), ['UPCOMING'])
  ].join('');
}

/**
 * Render the Live Match Center into `host`.
 * ctx: {
 *   showModal(title, html, matchId) — opens the match detail,
 *   refreshModal(render) — re-renders an open detail from fresh data
 * }
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

  // Plain match play carries no team scoreboard, session breakdown or pair
  // records — its headline is the player standings.
  const singles = tnKind(tn) === 'match';

  // A live update replaces the whole board; a stats panel the viewer had
  // open must not snap shut on every incoming hole. (Optional call: the
  // render tests drive this with a bare {innerHTML} host.)
  const statsOpen = host.querySelector?.('details[data-mpv-stats]')?.open;

  host.innerHTML = singles
    ? `
      ${standingsHTML(mp)}
      ${groupsHTML(mp, tn?.id, ctx.userId, true)}`
    : `
      ${scoreboardHTML(mp)}
      ${groupsHTML(mp, tn?.id, ctx.userId, false)}
      ${summaryHTML(mp)}
      ${statsHTML(mp)}`;

  if (statsOpen) {
    const d = host.querySelector?.('details[data-mpv-stats]');
    if (d) d.open = true;
  }

  host.querySelectorAll('button[data-mpv="open"]').forEach(b => b.onclick = () => {
    const match = mp.matches[b.dataset.match];
    if (!match) return;
    ctx.showModal?.(
      `${t('mpMatchNo')}${match.number ?? ''}`,
      detailHTML(mp, match, singles),
      match.id
    );
  });

  // This runs on every repaint, so a detail left open follows the match.
  ctx.refreshModal?.((id) => {
    const match = mp.matches[id];
    return match ? detailHTML(mp, match, singles) : null;
  });
}

// Compact line for the home strip: the team score and what is running. Plain
// match play has no team score — its summary carries only the live count, and
// the strip renders the tournament identity instead of a scoreboard.
export function stripSummary(tn) {
  const mp = tn?.mp;
  if (!mp) return null;
  const matches = matchesOf(mp);
  if (!matches.length) return null;
  const liveCount = matches.filter(m => matchState(m) === 'LIVE').length;
  if (tnKind(tn) === 'match') {
    return { singles: true, liveCount, session: '' };
  }
  const total = teamTotals(matches);
  return {
    a: { name: teamShort(mp, 'a'), points: total.a, color: teamColor(mp, 'a') },
    b: { name: teamShort(mp, 'b'), points: total.b, color: teamColor(mp, 'b') },
    liveCount,
    session: sessionLabel(currentSession(mp))
  };
}

export { pts as formatPoints, matchPoints };

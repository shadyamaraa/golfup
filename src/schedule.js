// src/schedule.js
// The marshal's printable tournament time table: #/tnschedule/:tnId
//
//   - an in-app stroke play tournament prints its flight draw, one section
//     per round (№, tee time, starting hole on shotgun draws, players, a
//     signature column);
//   - an M Cup prints its session draw (match #, tee time, both lineups).
//
// Read-only: flight and match times are edited in the tournament admin
// editors. Guest-reachable (like tournament boards) so a marshal without
// an account opens it straight from the QR.

import * as store from './store.js';
import { t } from './i18n.js';
import { spActive, spGroupList } from './strokeplay.js';
import { esc, pageUrl, mountQr, copyUrl, printStyleHTML, setPageTitle } from './print-common.js';

// ---- Tournament draws: stroke play flights and the M Cup ----

const MP_FORMAT_LABELS = { FOURSOMES: 'Foursomes', FOURBALL: 'Four-ball', SINGLES: 'Singles' };

// The marshal's time table for an in-app stroke play tournament: one section
// per round that has a draw — flight №, tee time, starting hole (shotgun
// draws only), players with HCP, and a signature column.
function strokeScheduleBlocksHTML(tn) {
  const roundCount = Math.max(1, Number(tn?.rounds) || 1);
  const players = tn?.sp?.players || {};
  const nameOf = (pid) => {
    const p = players[pid] || {};
    const hcp = Number.isFinite(Number(p.hcp))
      ? ` <span style="color:#777;">(${esc(p.hcp)})</span>` : '';
    return `${esc(p.name || pid)}${hcp}`;
  };
  const rounds = [];
  for (let r = 1; r <= roundCount; r++) {
    const groups = spGroupList(tn, r);
    if (groups.length) rounds.push({ r, groups });
  }
  if (!rounds.length) return '';
  return rounds.map(({ r, groups }) => {
    const hasHole = groups.some(g => g.startHole);
    return `
      <div style="margin-top:16px;">
        ${rounds.length > 1 || roundCount > 1 ? `<div style="font-weight:800;font-size:0.9rem;">R${r}</div>` : ''}
        <div class="sc-scroll" style="margin-top:5px;">
          <table class="sched-table" style="width:100%;font-size:0.82rem;">
            <thead>
            <tr class="sc-head">
              <th style="width:34px;">№</th>
              <th style="width:64px;">${t('spTeeTime')}</th>
              ${hasHole ? `<th style="width:64px;">${t('spStartHole')}</th>` : ''}
              <th style="text-align:left;padding-left:8px;">${t('tnPlayer')}</th>
              <th style="width:90px;">${t('scSignature')}</th>
            </tr>
            </thead>
            <tbody>
            ${groups.map(g => `
            <tr>
              <td style="font-weight:700;">${esc(g.number ?? '')}</td>
              <td style="font-weight:700;white-space:nowrap;">${esc(g.teeTime || '')}</td>
              ${hasHole ? `<td style="font-weight:700;">${g.startHole ? esc(g.startHole) : ''}</td>` : ''}
              <td style="text-align:left;padding-left:8px;">${Object.keys(g.players || {}).map(nameOf).join(', ') || '—'}</td>
              <td></td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

export async function renderTnSchedulePage(tnId, ctx) {
  const host = ctx.main();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let tn = null;
  try { tn = await store.loadTournament(tnId); } catch (_) { }

  // A stroke play tournament with a draw prints its flight time table; a
  // match play one prints its session draw. Nothing printable → not found.
  const strokeBlocks = tn && spActive(tn) ? strokeScheduleBlocksHTML(tn) : '';
  const mp = tn?.mp;
  const hasMp = !!(mp && mp.matches && Object.keys(mp.matches).length);
  if (!tn || (!strokeBlocks && !hasMp)) {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${strokeBlocks === '' && tn && spActive(tn) ? t('spNoGroups') : t('gsGameNotFound')}</p></div></div>`;
    return;
  }
  if (strokeBlocks) {
    renderTnScheduleShell(host, tn, tnId, ctx, strokeBlocks);
    return;
  }

  const roster = mp.roster || {};
  const nameOf = (pid) => roster[pid]?.name || pid || '';
  const lineup = (m, side) => (m.players?.[side] || []).filter(Boolean).map(pid => esc(nameOf(pid))).join(' / ');
  const teamName = (side) => mp.teams?.[side]?.name || side.toUpperCase();

  const sessions = Object.values(mp.sessions || {})
    .sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0) || (Number(a.number) || 0) - (Number(b.number) || 0));
  const matchesOf = (sid) => Object.values(mp.matches || {})
    .filter(m => (m.sessionId || null) === sid)
    .sort((a, b) => String(a.teeTime || '').localeCompare(String(b.teeTime || ''))
      || (Number(a.number) || 0) - (Number(b.number) || 0));
  // Matches with no session (or none defined at all) still print, ungrouped.
  const sessionBlocks = sessions.length
    ? [...sessions.map(s => ({ session: s, matches: matchesOf(s.id) })),
       { session: null, matches: matchesOf(null) }]
    : [{ session: null, matches: Object.values(mp.matches || {}) }];

  const sessionHTML = ({ session, matches }) => {
    if (!matches.length) return '';
    const head = session
      ? `Day ${esc(session.day ?? '')} · ${esc(MP_FORMAT_LABELS[session.format] || session.format || '')}${session.startTime ? ` · ${esc(session.startTime)}` : ''}`
      : '';
    return `
      <div style="margin-top:16px;">
        ${head ? `<div style="font-weight:800;font-size:0.9rem;">${head}</div>` : ''}
        <div class="sc-scroll" style="margin-top:5px;">
          <table class="sched-table" style="width:100%;font-size:0.82rem;">
            <thead>
            <tr class="sc-head">
              <th style="width:34px;">#</th>
              <th style="width:64px;">${t('scTeeTime')}</th>
              <th style="text-align:left;padding-left:8px;">${esc(teamName('a'))}</th>
              <th style="text-align:left;padding-left:8px;">${esc(teamName('b'))}</th>
            </tr>
            </thead>
            <tbody>
            ${matches.map(m => `
            <tr>
              <td style="font-weight:700;">${esc(m.number ?? '')}</td>
              <td style="font-weight:700;white-space:nowrap;">${esc(m.teeTime || '')}</td>
              <td style="text-align:left;padding-left:8px;">${lineup(m, 'a')}</td>
              <td style="text-align:left;padding-left:8px;">${lineup(m, 'b')}</td>
            </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  };

  renderTnScheduleShell(host, tn, tnId, ctx, sessionBlocks.map(sessionHTML).join(''));
}

// The shared sheet around either draw: toolbar, tournament header, QR, body.
function renderTnScheduleShell(host, tn, tnId, ctx, body) {
  setPageTitle(ctx, `${tn.name || ''} — ${t('scScheduleTitle')}`);
  const url = pageUrl(`#/tnschedule/${tnId}`);
  host.innerHTML = `
    <div class="detail-container fade-in sc-clip">
      ${printStyleHTML()}
      <style>
        .sc-sheet .sched-table th { background: #efe9db; }
        .sc-sheet .sched-table td { padding: 6px; }
      </style>
      <div class="sc-no-print" style="margin-bottom:4px;">
        <a href="${ctx.user ? `#/tournament/${esc(tnId)}` : '#/'}" class="back-link" style="margin:0;">← ${t('back')}</a>
        <span style="flex:1;"></span>
        <button class="btn btn-outline btn-sm" id="tsch-copy-btn">${t('copyLink')}</button>
        <button class="btn btn-primary btn-sm" id="tsch-print-btn">🖨 ${t('scPrint')}</button>
      </div>
      <div class="sc-sheet">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:1.15rem;">${esc(tn.name || '')} — ${t('scScheduleTitle')}</div>
            <div style="font-size:0.78rem;color:#555;margin-top:3px;">${esc(tn.startDate || '')}${tn.endDate && tn.endDate !== tn.startDate ? ` — ${esc(tn.endDate)}` : ''}${tn.venue ? ` · ${esc(tn.venue)}` : ''}</div>
          </div>
          <div style="text-align:center;flex:0 0 auto;">
            <canvas id="tsch-qr" width="120" height="120"></canvas>
            <div class="sc-url" style="font-size:0.6rem;color:#777;max-width:130px;">${t('scScanHint')}<br>${esc(url)}</div>
          </div>
        </div>
        ${body}
        <div style="margin-top:14px;font-size:0.7rem;color:#888;text-align:right;">${esc(tn.name || '')} - ${esc(tn.startDate || '')}</div>
      </div>
    </div>`;

  document.getElementById('tsch-print-btn')?.addEventListener('click', () => window.print());
  document.getElementById('tsch-copy-btn')?.addEventListener('click', () => copyUrl(url, ctx.showToast, t('copied')));
  mountQr('tsch-qr', url);
}

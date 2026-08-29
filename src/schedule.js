// src/schedule.js
// Print-ready start lists for the marshal — the sheet handed over (or QR'd)
// before a competition day.
//
//   #/schedule/:gameId    — a casual game's groups: group #, tee time,
//                           players (+HCP), a signature column. Tee times are
//                           computed (first group at startTime, +interval per
//                           group) with per-group manual overrides; the whole
//                           thing persists under games/{id}/schedule so the
//                           QR link shows the same times the printout does.
//   #/tnschedule/:tnId    — an M Cup's draw: sessions by day/number, each
//                           match's number, tee time and both lineups.
//                           Read-only here; times are edited in the existing
//                           match-play admin editor.
//
// Both routes are guest-reachable (like tournament boards) so a marshal
// without an account opens them straight from the QR.

import * as store from './store.js';
import { t } from './i18n.js';
import { gamePlayingHcp, groupsOf } from './game-score.js';
import { spActive, spGroupList } from './strokeplay.js';
import { courseTees } from './courses.js';
import { esc, pageUrl, mountQr, copyUrl, printStyleHTML } from './print-common.js';

// ---- Time math ----

// '09:00' + 25 → '09:25'. Bad input falls back to the base string.
function addMinutes(hhmm, minutes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return hhmm || '';
  const total = ((+m[1] * 60 + +m[2]) + Math.round(minutes)) % (24 * 60);
  const norm = (total + 24 * 60) % (24 * 60);
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

// The tee time for group i: manual override first, computed otherwise.
function groupTime(schedule, game, i) {
  const override = schedule?.times?.[i];
  if (override) return override;
  const start = schedule?.startTime || game.time || '';
  const interval = Number(schedule?.interval);
  return addMinutes(start, (Number.isFinite(interval) && interval > 0 ? interval : 10) * i);
}

function canEditSchedule(user, game) {
  return !!user && (user.role === 'admin' || user.role === 'marshal' || game.createdBy === user.id);
}

// ---- Game start list ----

export async function renderGameSchedulePage(gameId, ctx) {
  const host = ctx.main();
  host.innerHTML = `<div class="detail-container fade-in"><div class="loading-spinner"></div></div>`;

  let game = null;
  try { game = await store.loadGame(gameId); } catch (_) { }
  if (!game || game.status === 'deleted') {
    host.innerHTML = `<div class="detail-container fade-in">
      <a href="#/" class="back-link">${t('back')}</a>
      <div class="empty-state" style="padding:40px 20px;"><p>${t('gsGameNotFound')}</p></div></div>`;
    return;
  }

  const groups = groupsOf(game).filter(g => g.length > 0);

  // HCPs on the sheet want the profile-index fallback; best-effort per player.
  let usersById = {};
  try {
    const recs = await Promise.all(groups.flat().map(p => store.loadUserById(p.id).catch(() => null)));
    usersById = Object.fromEntries(recs.filter(Boolean).map(u => [u.id, u]));
  } catch (_) { }

  const url = pageUrl(`#/schedule/${gameId}`);
  const canEdit = canEditSchedule(ctx.user, game);
  // Working copy of the stored schedule; Save writes it back whole.
  const schedule = {
    startTime: game.schedule?.startTime || game.time || '',
    interval: Number(game.schedule?.interval) > 0 ? Number(game.schedule.interval) : 10,
    startTee: game.schedule?.startTee || '',
    times: { ...(game.schedule?.times || {}) },
  };

  const teeLabel = game.course?.tee
    ? (courseTees(game.location).find(x => x.key === game.course.tee)?.label || game.course.tee) : null;

  const paint = () => {
    const rowsHTML = groups.map((grp, i) => {
      const names = grp.map(p => {
        const hcp = gamePlayingHcp(game, p.id, usersById[p.id]);
        return `${esc(usersById[p.id]?.username || p.name || '?')}${typeof hcp === 'number' ? ` <span style="color:#777;">(${hcp})</span>` : ''}`;
      }).join(', ');
      return `
        <tr>
          <td style="font-weight:700;">${i + 1}</td>
          <td style="font-weight:700;white-space:nowrap;">${esc(groupTime(schedule, game, i))}</td>
          ${schedule.startTee ? `<td>${esc(schedule.startTee)}</td>` : ''}
          <td style="text-align:left;padding-left:8px;">${names}</td>
          <td style="min-width:90px;"></td>
        </tr>`;
    }).join('');

    host.innerHTML = `
      <div class="detail-container fade-in">
        ${printStyleHTML()}
        <style>
          .sc-sheet .sched-table { width: 100%; font-size: 0.82rem; }
          .sc-sheet .sched-table th { background: #efe9db; }
          .sc-sheet .sched-table td { padding: 7px 6px; }
          .sched-edit input, .sched-edit select {
            background: var(--bg-card-hover); color: var(--text-primary);
            border: 1px solid var(--border-color); border-radius: 8px; padding: 5px 7px;
            font-family: var(--font); font-size: 0.85rem;
          }
          .sched-edit label { font-size: 0.75rem; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 5px; }
        </style>
        <div class="sc-no-print" style="margin-bottom:4px;">
          <a href="${ctx.user ? `#/game/${esc(gameId)}` : '#/'}" class="back-link" style="margin:0;">← ${t('back')}</a>
          <span style="flex:1;"></span>
          <button class="btn btn-outline btn-sm" id="sch-copy-btn">${t('copyLink')}</button>
          <button class="btn btn-primary btn-sm" id="sch-print-btn">🖨 ${t('scPrint')}</button>
        </div>
        ${canEdit ? `
        <div class="sc-no-print sched-edit glass-card" style="padding:10px 12px;margin-bottom:4px;">
          <label>${t('scStartTime')} <input type="time" id="sch-start" value="${esc(schedule.startTime)}"></label>
          <label>${t('scInterval')} <input type="number" id="sch-interval" min="1" max="60" value="${schedule.interval}" style="width:58px;"></label>
          <label>${t('scStartTee')}
            <select id="sch-tee">
              <option value="" ${!schedule.startTee ? 'selected' : ''}>—</option>
              <option value="1" ${schedule.startTee === '1' ? 'selected' : ''}>Tee 1</option>
              <option value="10" ${schedule.startTee === '10' ? 'selected' : ''}>Tee 10</option>
            </select>
          </label>
          <span style="flex:1;"></span>
          <button class="btn btn-primary btn-sm" id="sch-save-btn">${t('save')}</button>
        </div>
        <div class="sc-no-print sched-edit glass-card" style="padding:10px 12px;margin-bottom:4px;gap:10px;">
          ${groups.map((_, i) => `
            <label>${t('group')} ${i + 1}
              <input type="time" data-sch-time="${i}" value="${esc(schedule.times[i] || '')}" placeholder="${esc(groupTime(schedule, game, i))}">
            </label>`).join('')}
        </div>` : ''}
        <div class="sc-sheet">
          <div style="display:flex;gap:14px;align-items:flex-start;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:800;font-size:1.15rem;">${esc(game.location || '')} — ${t('scScheduleTitle')}</div>
              <div style="font-size:0.78rem;color:#555;margin-top:3px;">${esc(game.date || '')} · ${esc(schedule.startTime)}${teeLabel ? ` · Tees: ${esc(teeLabel)}` : ''}</div>
              ${game.description ? `<div style="font-size:0.78rem;color:#555;margin-top:2px;">${esc(game.description)}</div>` : ''}
            </div>
            <div style="text-align:center;flex:0 0 auto;">
              <canvas id="sch-qr" width="120" height="120"></canvas>
              <div style="font-size:0.6rem;color:#777;max-width:130px;">${t('scScanHint')}<br>${esc(url)}</div>
            </div>
          </div>
          <div class="sc-scroll" style="margin-top:12px;">
            <table class="sched-table">
              <thead>
              <tr class="sc-head">
                <th style="width:44px;">${t('group')}</th>
                <th style="width:64px;">${t('scTeeTime')}</th>
                ${schedule.startTee ? `<th style="width:44px;">Tee</th>` : ''}
                <th style="text-align:left;padding-left:8px;">${t('tnPlayer')}</th>
                <th style="width:90px;">${t('scSignature')}</th>
              </tr>
              </thead>
              <tbody>
              ${rowsHTML || `<tr><td colspan="5" style="padding:16px;color:#888;">${t('emptySlot')}</td></tr>`}
              </tbody>
            </table>
          </div>
          <div style="margin-top:14px;font-size:0.7rem;color:#888;text-align:right;">${esc(game.location || '')} - ${esc(game.date || '')}</div>
        </div>
      </div>`;

    document.getElementById('sch-print-btn')?.addEventListener('click', () => window.print());
    document.getElementById('sch-copy-btn')?.addEventListener('click', () => copyUrl(url, ctx.showToast, t('copied')));
    mountQr('sch-qr', url);

    if (!canEdit) return;
    // Inputs update the working copy and repaint the sheet immediately;
    // Save persists the whole schedule object.
    document.getElementById('sch-start')?.addEventListener('change', (e) => {
      schedule.startTime = e.target.value; paint();
    });
    document.getElementById('sch-interval')?.addEventListener('change', (e) => {
      const v = Number(e.target.value);
      schedule.interval = Number.isFinite(v) && v > 0 ? v : 10;
      paint();
    });
    document.getElementById('sch-tee')?.addEventListener('change', (e) => {
      schedule.startTee = e.target.value; paint();
    });
    host.querySelectorAll('input[data-sch-time]').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const i = e.target.dataset.schTime;
        if (e.target.value) schedule.times[i] = e.target.value;
        else delete schedule.times[i];
        paint();
      });
    });
    document.getElementById('sch-save-btn')?.addEventListener('click', async () => {
      try {
        await store.saveGameSchedule(gameId, schedule);
        game.schedule = { ...schedule, times: { ...schedule.times } };
        ctx.showToast && ctx.showToast('✅ ' + t('saved'), 'success');
      } catch (err) {
        console.error('[schedule] save failed', err);
        ctx.showToast && ctx.showToast('⚠️ ' + (err?.message || 'Error'), 'error');
      }
    });
  };

  paint();
}

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
  const url = pageUrl(`#/tnschedule/${tnId}`);
  host.innerHTML = `
    <div class="detail-container fade-in">
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
            <div style="font-size:0.6rem;color:#777;max-width:130px;">${t('scScanHint')}<br>${esc(url)}</div>
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

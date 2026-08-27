// src/matchplay-admin.js
// Admin setup for a match play (M Cup) tournament: teams, rosters, sessions,
// pairings, and the lineup/participation validation panel. Mounted by the
// admin tournaments tab when a tournament's format is 'match'.
//
// Editing happens on a local DRAFT (one per tournament id), so typing never
// writes to Firebase and the tab re-rendering never loses keystrokes. The
// save button writes the mp/* subtrees via a partial update: hole results,
// scorer assignments and the audit trail are merged from a fresh read first,
// so saving the setup can never erase live scoring.

import * as store from './store.js';
import { t } from './i18n.js';
import {
  TEAM_KEYS, FORMATS, FORMAT_TEAM_SIZE, SESSION_PLAYERS_REQUIRED, ROSTER_SIZE,
  lineupIssues, participation, matchState
} from './matchplay.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:8px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);font-size:0.85rem;';
const LABEL = 'font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin:0 0 3px;';

const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- Draft state ----

// tnId -> { mp, dirty } — survives the admin tab's own re-renders; cleared on
// save so the next mount re-reads what Firebase actually holds.
const drafts = new Map();

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

function draftFor(tn) {
  let d = drafts.get(tn.id);
  if (!d || !d.dirty) {
    d = { mp: normalizeMp(clone(tn.mp)), dirty: false };
    drafts.set(tn.id, d);
  }
  return d;
}

// Firebase drops empty objects, so every level the editor touches must be
// re-created on read.
function normalizeMp(mp) {
  const out = mp && typeof mp === 'object' ? mp : {};
  out.teams = out.teams || {};
  TEAM_KEYS.forEach(k => { out.teams[k] = out.teams[k] || { name: '', short: '', color: '' }; });
  out.roster = out.roster || {};
  out.sessions = out.sessions || {};
  out.matches = out.matches || {};
  return out;
}

// ---- Derived helpers ----

const bySessionOrder = (a, b) =>
  (Number(a.day) || 0) - (Number(b.day) || 0)
  || (Number(a.number) || 0) - (Number(b.number) || 0);

function sessionList(mp) {
  return Object.values(mp.sessions).filter(Boolean).sort(bySessionOrder);
}

function sessionMatches(mp, sessionId) {
  return Object.values(mp.matches)
    .filter(m => m && m.sessionId === sessionId)
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
}

function rosterOf(mp, teamId) {
  return Object.entries(mp.roster)
    .filter(([, p]) => p && p.teamId === teamId)
    .map(([id, p]) => ({ id, name: p.name || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const playerName = (mp, pid) => mp.roster?.[pid]?.name || pid || '';

// Matches carry the format of their session so the pure engine can validate
// them standalone; sessions stay the single place the format is edited.
function withFormat(mp, matches) {
  return matches.map(m => ({ ...m, format: mp.sessions[m.sessionId]?.format || m.format }));
}

// ---- Rendering ----

function teamBoxHTML(tn, teamId) {
  const mp = draftFor(tn).mp;
  const team = mp.teams[teamId];
  const roster = rosterOf(mp, teamId);
  const names = roster.map(p => p.name).join('\n');
  const over = roster.length > ROSTER_SIZE;
  return `
    <div style="flex:1;min-width:230px;background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:10px;padding:10px;">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:6px;">
        <div><span style="${LABEL}">${t('mpTeamName')} ${teamId.toUpperCase()}</span>
          <input data-mp="team" data-team="${teamId}" data-f="name" value="${esc(team.name)}" placeholder="${teamId === 'a' ? 'Altai Eagles' : 'Wellcom Diesels'}" style="${INPUT}width:100%;" /></div>
        <div><span style="${LABEL}">${t('mpTeamShort')}</span>
          <input data-mp="team" data-team="${teamId}" data-f="short" value="${esc(team.short)}" placeholder="${teamId === 'a' ? 'ALTAI' : 'WELLCOM'}" maxlength="10" style="${INPUT}width:100%;" /></div>
        <div><span style="${LABEL}">${t('mpTeamColor')}</span>
          <input data-mp="team" data-team="${teamId}" data-f="color" type="color" value="${/^#[0-9a-fA-F]{6}$/.test(team.color) ? team.color : (teamId === 'a' ? '#1f6f43' : '#b3382c')}" style="${INPUT}width:100%;padding:3px;height:35px;" /></div>
      </div>
      <div style="margin-top:8px;">
        <span style="${LABEL}">${t('mpRoster')} — ${roster.length}/${ROSTER_SIZE}${over ? ' ⚠' : ''}</span>
        <textarea data-mp="roster" data-team="${teamId}" rows="6" placeholder="${t('mpRosterHint')}" style="${INPUT}width:100%;resize:vertical;">${esc(names)}</textarea>
      </div>
    </div>`;
}

function playerSelectHTML(mp, match, teamId, slot) {
  const roster = rosterOf(mp, teamId);
  const cur = match.players?.[teamId]?.[slot] || '';
  const known = !cur || roster.some(p => p.id === cur);
  return `
    <select data-mp="player" data-match="${esc(match.id)}" data-team="${teamId}" data-slot="${slot}" style="${INPUT}max-width:100%;">
      <option value="">${t('mpPickPlayer')}</option>
      ${roster.map(p => `<option value="${esc(p.id)}"${p.id === cur ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
      ${known ? '' : `<option value="${esc(cur)}" selected>${esc(playerName(mp, cur))} ⚠</option>`}
    </select>`;
}

function matchRowHTML(tn, match) {
  const mp = draftFor(tn).mp;
  const session = mp.sessions[match.sessionId] || {};
  const size = FORMAT_TEAM_SIZE[session.format] || 2;
  const live = matchState({ ...match }) !== 'UPCOMING';
  const sideHTML = (teamId) => `
    <div style="display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1;">
      ${Array.from({ length: size }, (_, i) => playerSelectHTML(mp, match, teamId, i)).join('')}
    </div>`;
  return `
    <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;margin-top:6px;background:var(--bg-color);">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input data-mp="match" data-match="${esc(match.id)}" data-f="number" type="number" min="1" value="${esc(match.number ?? '')}" title="${t('mpMatchNo')}" style="${INPUT}width:58px;" />
        <input data-mp="match" data-match="${esc(match.id)}" data-f="teeTime" type="time" value="${esc(match.teeTime || '')}" title="${t('mpTee')}" style="${INPUT}width:100px;" />
        ${live ? `<span class="pill-soft" style="font-size:0.68rem;">${t('mpHasScores')}</span>` : ''}
        <button data-mp="del-match" data-match="${esc(match.id)}" class="btn btn-outline-danger btn-sm" style="margin-left:auto;">✕</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
        ${sideHTML('a')}
        <b style="font-size:0.72rem;color:var(--text-secondary);">vs</b>
        ${sideHTML('b')}
      </div>
    </div>`;
}

// One session's lineup issues, in the admin's language and with player names.
function issuesHTML(tn, session) {
  const mp = draftFor(tn).mp;
  const matches = withFormat(mp, sessionMatches(mp, session.id));
  if (!matches.length) return '';
  const teamName = (k) => mp.teams[k]?.short || mp.teams[k]?.name || k.toUpperCase();
  const text = (i) => {
    if (i.kind === 'duplicate-player') return `${playerName(mp, i.playerId)} — ${t('mpIssueDup')}`;
    if (i.kind === 'player-count') return `${teamName(i.teamId)}: ${i.count}/${i.required} — ${t('mpIssueCount')}`;
    if (i.kind === 'match-size') return `#${mp.matches[i.matchId]?.number ?? '?'} ${teamName(i.teamId)}: ${i.count}/${i.required} — ${t('mpIssueSize')}`;
    if (i.kind === 'wrong-team') return `${playerName(mp, i.playerId)} — ${t('mpIssueWrongTeam')}`;
    if (i.kind === 'unknown-player') return `${playerName(mp, i.playerId)} — ${t('mpIssueUnknown')}`;
    return i.kind;
  };
  const issues = lineupIssues(matches, mp.roster, { required: SESSION_PLAYERS_REQUIRED });
  if (!issues.length) {
    return `<div style="font-size:0.74rem;color:var(--success-color,#2e7d32);margin-top:6px;">✓ ${t('mpLineupOk')}</div>`;
  }
  return `
    <div style="font-size:0.74rem;color:var(--amber);margin-top:6px;">
      ${issues.slice(0, 8).map(i => `<div>⚠ ${esc(text(i))}</div>`).join('')}
      ${issues.length > 8 ? `<div>… +${issues.length - 8}</div>` : ''}
    </div>`;
}

function sessionBoxHTML(tn, session) {
  const mp = draftFor(tn).mp;
  const matches = sessionMatches(mp, session.id);
  return `
    <div style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:10px;padding:10px;margin-top:8px;">
      <div style="display:flex;gap:6px;align-items:end;flex-wrap:wrap;">
        <div><span style="${LABEL}">${t('mpDay')}</span>
          <input data-mp="session" data-session="${esc(session.id)}" data-f="day" type="number" min="1" max="9" value="${esc(session.day ?? '')}" style="${INPUT}width:58px;" /></div>
        <div><span style="${LABEL}">${t('mpSessionNo')}</span>
          <input data-mp="session" data-session="${esc(session.id)}" data-f="number" type="number" min="1" max="9" value="${esc(session.number ?? '')}" style="${INPUT}width:58px;" /></div>
        <div><span style="${LABEL}">${t('mpFormat')}</span>
          <select data-mp="session" data-session="${esc(session.id)}" data-f="format" style="${INPUT}">
            ${FORMATS.map(f => `<option value="${f}"${session.format === f ? ' selected' : ''}>${f}</option>`).join('')}
          </select></div>
        <div><span style="${LABEL}">${t('mpStart')}</span>
          <input data-mp="session" data-session="${esc(session.id)}" data-f="startTime" type="time" value="${esc(session.startTime || '')}" style="${INPUT}" /></div>
        <button data-mp="del-session" data-session="${esc(session.id)}" class="btn btn-outline-danger btn-sm" style="margin-left:auto;">✕</button>
      </div>
      ${matches.map(m => matchRowHTML(tn, m)).join('')}
      <button data-mp="add-match" data-session="${esc(session.id)}" class="btn btn-outline btn-sm" style="margin-top:8px;">+ ${t('mpAddMatch')}</button>
      ${issuesHTML(tn, session)}
    </div>`;
}

function participationHTML(tn) {
  const mp = draftFor(tn).mp;
  const part = participation(mp.roster, withFormat(mp, Object.values(mp.matches)));
  const line = (k) => {
    const p = part[k];
    const name = mp.teams[k]?.short || mp.teams[k]?.name || k.toUpperCase();
    const ok = p.total > 0 && p.used === p.total;
    const unused = p.unused.map(pid => playerName(mp, pid)).join(', ');
    return `<div>${esc(name)}: <b>${p.used}/${p.total}</b>${ok ? ' ✓' : ''}${unused ? ` <span style="color:var(--text-muted);">(${esc(unused)})</span>` : ''}</div>`;
  };
  return `
    <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:10px;">
      <b>${t('mpParticipation')}</b>
      ${TEAM_KEYS.map(line).join('')}
    </div>`;
}

function sectionHTML(tn) {
  const mp = draftFor(tn).mp;
  const dirty = drafts.get(tn.id)?.dirty;
  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <h4 style="margin:0 0 8px;">${t('mpSetup')}</h4>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${TEAM_KEYS.map(k => teamBoxHTML(tn, k)).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px;">
        <b style="font-size:0.85rem;">${t('mpSessions')}</b>
        <button data-mp="add-session" class="btn btn-outline btn-sm">+ ${t('mpAddSession')}</button>
      </div>
      ${sessionList(mp).map(s => sessionBoxHTML(tn, s)).join('')
        || `<p style="font-size:0.78rem;color:var(--text-secondary);margin:8px 0 0;">${t('mpNoSessions')}</p>`}
      ${participationHTML(tn)}
      <button data-mp="save" class="btn ${dirty ? 'btn-primary' : 'btn-outline'} btn-sm" style="margin-top:12px;">
        ${t('mpSave')}${dirty ? ' *' : ''}
      </button>
    </div>`;
}

// ---- Saving ----

async function saveDraft(tn, ctx) {
  const mp = draftFor(tn).mp;
  // Merge live scoring from a fresh read: the scorer may have been tapping
  // holes the whole time this editor was open.
  let fresh = null;
  try { fresh = await store.loadTournament(tn.id); } catch (_) { /* keep local */ }
  const matches = {};
  Object.values(mp.matches).forEach(m => {
    if (!m) return;
    const session = mp.sessions[m.sessionId];
    if (!session) return; // its session was deleted
    const old = fresh?.mp?.matches?.[m.id] || tn.mp?.matches?.[m.id];
    matches[m.id] = {
      ...m,
      format: session.format,
      players: { a: (m.players?.a || []).slice(), b: (m.players?.b || []).slice() },
      ...(old?.holes ? { holes: old.holes } : {}),
      ...(old?.scorerIds ? { scorerIds: old.scorerIds } : {}),
      ...(old?.stateOverride ? { stateOverride: old.stateOverride } : {})
    };
  });
  // Multi-path update: mp/audit (and anything else under mp) stays untouched.
  await store.updateTournament(tn.id, {
    'mp/teams': mp.teams,
    'mp/roster': mp.roster,
    'mp/sessions': mp.sessions,
    'mp/matches': matches
  });
  drafts.delete(tn.id);
  ctx.showToast('✅ ' + t('mpSaved'), 'success');
  await ctx.rerender();
}

// ---- Draft mutations ----

// Reconcile a roster textarea against the draft: names keep their ids, new
// lines get fresh ids, and a removed player who is still fielded in a match
// is kept (and surfaces as a lineup warning) rather than silently dangling.
function reconcileRoster(mp, teamId, text) {
  const lines = [...new Set(String(text).split('\n').map(s => s.trim()).filter(Boolean))];
  const existing = rosterOf(mp, teamId);
  const used = new Set();
  Object.values(mp.matches).forEach(m =>
    TEAM_KEYS.forEach(k => (m?.players?.[k] || []).forEach(pid => pid && used.add(pid))));

  const keep = {};
  lines.forEach(name => {
    const hit = existing.find(p => p.name === name && !keep[p.id]);
    keep[hit ? hit.id : newId('p')] = { teamId, name };
  });
  existing.forEach(p => {
    if (!keep[p.id] && used.has(p.id)) keep[p.id] = { teamId, name: p.name };
  });

  existing.forEach(p => { delete mp.roster[p.id]; });
  Object.assign(mp.roster, keep);
}

function handleEdit(tn, el) {
  const d = draftFor(tn);
  const mp = d.mp;
  const kind = el.dataset.mp;

  if (kind === 'team') {
    mp.teams[el.dataset.team][el.dataset.f] = el.value.trim();
  } else if (kind === 'roster') {
    reconcileRoster(mp, el.dataset.team, el.value);
  } else if (kind === 'session') {
    const s = mp.sessions[el.dataset.session];
    if (!s) return false;
    const f = el.dataset.f;
    s[f] = (f === 'day' || f === 'number') ? (parseInt(el.value, 10) || null) : el.value;
  } else if (kind === 'match') {
    const m = mp.matches[el.dataset.match];
    if (!m) return false;
    const f = el.dataset.f;
    m[f] = f === 'number' ? (parseInt(el.value, 10) || null) : el.value;
  } else if (kind === 'player') {
    const m = mp.matches[el.dataset.match];
    if (!m) return false;
    m.players = m.players || { a: [], b: [] };
    const arr = (m.players[el.dataset.team] = m.players[el.dataset.team] || []);
    arr[Number(el.dataset.slot)] = el.value;
  } else {
    return false;
  }
  d.dirty = true;
  return true;
}

function handleClick(tn, el, ctx, host) {
  const d = draftFor(tn);
  const mp = d.mp;
  const kind = el.dataset.mp;

  if (kind === 'add-session') {
    const last = sessionList(mp).at(-1);
    const id = newId('s');
    mp.sessions[id] = {
      id,
      day: last?.day || 1,
      number: (Number(last?.number) || 0) + 1,
      format: last?.format || 'FOURSOMES',
      startTime: ''
    };
  } else if (kind === 'del-session') {
    const id = el.dataset.session;
    const hasScores = sessionMatches(mp, id).some(m => Object.keys(m.holes || {}).length);
    if (!confirm(t(hasScores ? 'mpDelSessionScored' : 'mpDelSession'))) return;
    sessionMatches(mp, id).forEach(m => { delete mp.matches[m.id]; });
    delete mp.sessions[id];
  } else if (kind === 'add-match') {
    const sessionId = el.dataset.session;
    const nums = sessionMatches(mp, sessionId).map(m => Number(m.number) || 0);
    const id = newId('m');
    mp.matches[id] = {
      id, sessionId,
      number: (nums.length ? Math.max(...nums) : 0) + 1,
      teeTime: '',
      players: { a: [], b: [] }
    };
  } else if (kind === 'del-match') {
    const m = mp.matches[el.dataset.match];
    if (!m) return;
    if (Object.keys(m.holes || {}).length && !confirm(t('mpDelMatchScored'))) return;
    delete mp.matches[el.dataset.match];
  } else if (kind === 'save') {
    saveDraft(tn, ctx).catch(err => {
      console.error('[matchplay-admin]', err);
      ctx.showToast('⚠️ ' + (err?.message || t('mpSaveFailed')), 'error');
    });
    return; // rerender happens after the write lands
  } else {
    return;
  }
  d.dirty = true;
  paint(host, tn, ctx);
}

// ---- Mount ----

function paint(host, tn, ctx) {
  host.innerHTML = sectionHTML(tn);
  wire(host, tn, ctx);
}

function wire(host, tn, ctx) {
  host.querySelectorAll('input[data-mp], select[data-mp], textarea[data-mp]').forEach(el => {
    // Rosters and player picks reshape the section, so they repaint; plain
    // fields only mark the draft dirty and repaint nothing — no lost focus.
    el.onchange = () => {
      const changed = handleEdit(tn, el);
      if (!changed) return;
      if (el.dataset.mp === 'roster' || el.dataset.mp === 'player'
        || (el.dataset.mp === 'session' && el.dataset.f === 'format')) {
        paint(host, tn, ctx);
      } else {
        host.querySelector('button[data-mp="save"]')?.classList.replace('btn-outline', 'btn-primary');
      }
    };
  });
  host.querySelectorAll('button[data-mp]').forEach(el => {
    el.onclick = () => handleClick(tn, el, ctx, host);
  });
}

/**
 * Render the match play setup section into `host`.
 * ctx: { showToast(msg, type), rerender() — re-renders the admin tab }
 */
export function mountMpAdmin(host, tn, ctx) {
  if (!host || !tn) return;
  paint(host, tn, ctx);
}

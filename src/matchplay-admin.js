// src/matchplay-admin.js
// Admin setup for a match play (M Cup) tournament: teams, rosters, sessions,
// pairings, and the lineup/participation validation panel. Mounted by the
// admin tournaments tab when a tournament's format is 'match'.
//
// Editing happens on a local DRAFT (one per tournament id), so typing never
// writes to Firebase and the tab re-rendering never loses keystrokes. The
// draft is dropped when the editor closes, so a stale snapshot cannot sit
// around and later overwrite newer work.
//
// Saving writes one key per field rather than replacing whole nodes, and
// never writes the fields the scorer owns (holes, suspension) at all. Between
// them those two rules mean a setup edit cannot erase a hole entered while
// the editor was open, cannot resurrect one the scorer undid, and cannot
// delete a match somebody else created in the meantime. Deletions are taken
// from what this editor actually removed, never inferred from what the draft
// no longer holds.

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
    // `removed` records what this editor deleted. Deletions cannot be
    // inferred from what the draft no longer holds: a match another admin
    // created since the draft was cloned is absent for an entirely different
    // reason, and treating that as a deletion would take it — and its
    // scores — with the next save.
    d = {
      mp: normalizeMp(clone(tn.mp)),
      dirty: false,
      removed: new Set(),
      removedSessions: new Set()
    };
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

// A logo the UI will actually accept later: an image data URI, nothing else.
const validLogo = (l) =>
  typeof l === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(l);

function teamBoxHTML(tn, teamId, users) {
  const mp = draftFor(tn).mp;
  const team = mp.teams[teamId];
  const roster = rosterOf(mp, teamId);
  const over = roster.length > ROSTER_SIZE;
  const logo = validLogo(team.logo) ? team.logo : null;

  // Everyone already on EITHER roster is out of the picker — one member,
  // one team.
  const taken = new Set(Object.keys(mp.roster));
  Object.values(mp.roster).forEach(p => { if (p?.userId) taken.add(p.userId); });

  const chip = (p) => `
    <span class="pill-soft" style="font-size:0.72rem;">${esc(p.name || p.id)}
      <button data-mp="del-player" data-pid="${esc(p.id)}" data-team="${teamId}"
        style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 4px;">✕</button>
    </span>`;

  return `
    <div style="flex:1;min-width:230px;background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:10px;padding:10px;">
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:6px;">
        <div><span style="${LABEL}">${t('mpTeamName')} ${teamId.toUpperCase()}</span>
          <input data-mp="team" data-team="${teamId}" data-f="name" value="${esc(team.name)}" placeholder="${teamId === 'a' ? 'Altai Eagles' : 'Wellcom Diesels'}" style="${INPUT}width:100%;" /></div>
        <div><span style="${LABEL}">${t('mpTeamShort')}</span>
          <input data-mp="team" data-team="${teamId}" data-f="short" value="${esc(team.short)}" placeholder="${teamId === 'a' ? 'ALTAI' : 'WELLCOM'}" maxlength="10" style="${INPUT}width:100%;" /></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
        <span style="${LABEL}margin:0;">${t('mpTeamLogo')}</span>
        ${logo
          ? `<img src="${logo}" alt="" style="width:34px;height:34px;object-fit:contain;border-radius:6px;border:1px solid var(--border-color);" />`
          : `<span style="font-size:0.72rem;color:var(--text-muted);">—</span>`}
        <button data-mp="logo-pick" data-team="${teamId}" class="btn btn-outline btn-sm" style="margin-left:auto;">${logo ? t('mpLogoChange') : t('mpLogoUpload')}</button>
        ${logo ? `<button data-mp="logo-clear" data-team="${teamId}" class="btn btn-outline-danger btn-sm">✕</button>` : ''}
        <input data-mp-logo-input="${teamId}" type="file" accept="image/*" style="display:none;" />
      </div>
      <div style="margin-top:8px;">
        <span style="${LABEL}">${t('mpRoster')} — ${roster.length}/${ROSTER_SIZE}${over ? ' ⚠' : ''}</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
          ${roster.map(chip).join('') || `<span style="font-size:0.72rem;color:var(--text-muted);">—</span>`}
        </div>
        <select data-mp="add-player" data-team="${teamId}" style="${INPUT}width:100%;margin-top:6px;">
          <option value="">+ ${t('mpPickMember')}</option>
          ${(users || []).filter(u => u && u.id && !taken.has(u.id))
            .map(u => `<option value="${esc(u.id)}">${esc(u.fullName || u.name || u.username || u.id)}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

// Read a picked image and shrink it to a small square-ish data URI. 96px is
// plenty for the marks the board draws (8–38px), and at that size a webp
// data URI is a few KB — small enough to live inside the tournament record,
// which spares us a whole storage bucket, its rules, and a second fetch.
const LOGO_PX = 96;
const LOGO_MAX_CHARS = 80000; // ~60KB decoded — far above any real 96px logo

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('not-image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, LOGO_PX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      // webp keeps transparency and compresses far better than png; fall
      // back to png only if the browser cannot encode webp.
      let out = canvas.toDataURL('image/webp', 0.85);
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png');
      if (out.length > LOGO_MAX_CHARS) { reject(new Error('too-big')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
    img.src = url;
  });
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

// Scorer assignment (spec §14). A picker over app members rather than free
// text, so what is stored is a member id. Server-side, writes are gated per
// DEVICE (the anonymous-auth allowlist in mpDevices — see the registry card
// below); which member may score which match stays a UI-level check, since
// the app's own sign-in carries no Firebase identity a rule could read.
// See docs/mcup-match-play.md.
function scorerHTML(tn, match, users) {
  const ids = Object.keys(match.scorerIds || {});
  const chip = (id) => {
    const u = users.find(x => x.id === id);
    return `<span class="pill-soft" style="font-size:0.68rem;">${esc(u ? (u.fullName || u.name || u.username) : id)}
      <button data-mp="del-scorer" data-match="${esc(match.id)}" data-user="${esc(id)}" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 4px;">✕</button></span>`;
  };
  return `
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;">
      <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:700;">${t('mpScorer')}:</span>
      ${ids.map(chip).join('') || `<span style="font-size:0.7rem;color:var(--text-muted);">—</span>`}
      <select data-mp="add-scorer" data-match="${esc(match.id)}" style="${INPUT}max-width:170px;font-size:0.78rem;">
        <option value="">+ ${t('mpScorer')}</option>
        ${users.filter(u => !ids.includes(u.id))
          .map(u => `<option value="${esc(u.id)}">${esc(u.fullName || u.name || u.username || u.id)}</option>`).join('')}
      </select>
    </div>`;
}

function matchRowHTML(tn, match, users) {
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
        <a href="#/score/${esc(tn.id)}/${esc(match.id)}" class="btn btn-outline btn-sm" style="font-size:0.72rem;">${t('mpOpenScorer')}</a>
        <button data-mp="del-match" data-match="${esc(match.id)}" class="btn btn-outline-danger btn-sm" style="margin-left:auto;">✕</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap;">
        ${sideHTML('a')}
        <b style="font-size:0.72rem;color:var(--text-secondary);">vs</b>
        ${sideHTML('b')}
      </div>
      ${scorerHTML(tn, match, users)}
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
    if (i.kind === 'duplicate-in-match') return `${playerName(mp, i.playerId)} — ${t('mpIssueDupMatch')}`;
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

function sessionBoxHTML(tn, session, users) {
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
      ${matches.map(m => matchRowHTML(tn, m, users)).join('')}
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

function sectionHTML(tn, users) {
  const mp = draftFor(tn).mp;
  const dirty = drafts.get(tn.id)?.dirty;
  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <h4 style="margin:0 0 8px;">${t('mpSetup')}</h4>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${TEAM_KEYS.map(k => teamBoxHTML(tn, k, users)).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:12px;">
        <b style="font-size:0.85rem;">${t('mpSessions')}</b>
        <button data-mp="add-session" class="btn btn-outline btn-sm">+ ${t('mpAddSession')}</button>
      </div>
      ${sessionList(mp).map(s => sessionBoxHTML(tn, s, users)).join('')
        || `<p style="font-size:0.78rem;color:var(--text-secondary);margin:8px 0 0;">${t('mpNoSessions')}</p>`}
      ${participationHTML(tn)}
      <button data-mp="save" class="btn ${dirty ? 'btn-primary' : 'btn-outline'} btn-sm" style="margin-top:12px;">
        ${t('mpSave')}${dirty ? ' *' : ''}
      </button>
    </div>`;
}

// ---- Saving ----

// Fields under a match that belong to the scorer, never to this editor.
const SCORER_OWNED = ['holes', 'stateOverride'];

async function saveDraft(tn, ctx) {
  const draft = draftFor(tn);
  const mp = draft.mp;

  // Written per record rather than by replacing mp/matches and mp/sessions
  // wholesale: replacing a node deletes anything created elsewhere since this
  // draft was cloned, and a match taken that way takes its scores with it.
  // Teams and the roster are edited as whole units here, so they go as units.
  const patch = { 'mp/teams': mp.teams, 'mp/roster': mp.roster };

  Object.values(mp.sessions).forEach(s => {
    if (s?.id) patch[`mp/sessions/${s.id}`] = s;
  });
  draft.removedSessions.forEach(id => { patch[`mp/sessions/${id}`] = null; });

  Object.values(mp.matches).forEach(m => {
    if (!m) return;
    const session = mp.sessions[m.sessionId];
    if (!session) return; // its session was deleted
    const size = FORMAT_TEAM_SIZE[session.format] || 2;
    // The draft's copy of a scorer-owned field is a snapshot from whenever it
    // was cloned, so it is dropped outright rather than merged: taking it
    // whenever the live record lacks the field would resurrect a hole the
    // scorer had just undone, or a suspension they had just cleared — and a
    // stale suspension on a decided match used to cost that match's point.
    const setup = { ...m, format: session.format };
    SCORER_OWNED.forEach(f => { delete setup[f]; });
    // A session switched to a smaller format leaves players in slots the form
    // no longer renders, which nothing could then clear.
    setup.players = {
      a: (m.players?.a || []).slice(0, size),
      b: (m.players?.b || []).slice(0, size)
    };
    Object.entries(setup).forEach(([field, value]) => {
      patch[`mp/matches/${m.id}/${field}`] = value;
    });
  });

  // Only what this editor actually deleted — never merely what the draft
  // does not hold.
  draft.removed.forEach(id => { patch[`mp/matches/${id}`] = null; });

  await store.updateTournament(tn.id, patch);
  drafts.delete(tn.id);
  ctx.showToast('✅ ' + t('mpSaved'), 'success');
  await ctx.rerender();
}

// Drop an unsaved draft — called when the editor closes, so a draft cannot
// sit for an hour and then overwrite newer work with its stale snapshot.
export function discardMpDraft(tnId) {
  drafts.delete(tnId);
}

// ---- Draft mutations ----

function handleEdit(tn, el) {
  const d = draftFor(tn);
  const mp = d.mp;
  const kind = el.dataset.mp;

  if (kind === 'team') {
    mp.teams[el.dataset.team][el.dataset.f] = el.value.trim();
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
    sessionMatches(mp, id).forEach(m => { d.removed.add(m.id); delete mp.matches[m.id]; });
    d.removedSessions.add(id);
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
  } else if (kind === 'logo-pick') {
    // Just opens the hidden file picker; the draft only changes when the
    // picked file lands in the input's onchange.
    host.querySelector(`input[data-mp-logo-input="${el.dataset.team}"]`)?.click();
    return;
  } else if (kind === 'logo-clear') {
    delete mp.teams[el.dataset.team].logo;
  } else if (kind === 'del-match') {
    const m = mp.matches[el.dataset.match];
    if (!m) return;
    if (Object.keys(m.holes || {}).length && !confirm(t('mpDelMatchScored'))) return;
    d.removed.add(el.dataset.match);
    delete mp.matches[el.dataset.match];
  } else if (kind === 'add-player') {
    // A roster entry is the member themselves: keyed by their userId, which
    // is what lets the scorer screen recognise "this signed-in member plays
    // in this match". The display name is a snapshot; the id is the truth.
    const u = (ctx.users || []).find(x => x.id === el.value);
    if (!u) return;
    mp.roster[u.id] = {
      teamId: el.dataset.team,
      name: u.fullName || u.name || u.username || u.id,
      userId: u.id
    };
  } else if (kind === 'del-player') {
    const pid = el.dataset.pid;
    const fielded = Object.values(mp.matches).some(m =>
      TEAM_KEYS.some(k => (m?.players?.[k] || []).includes(pid)));
    if (fielded && !confirm(t('mpDelPlayerFielded'))) return;
    delete mp.roster[pid];
  } else if (kind === 'add-scorer') {
    const m = mp.matches[el.dataset.match];
    if (!m || !el.value) return;
    m.scorerIds = { ...(m.scorerIds || {}), [el.value]: true };
  } else if (kind === 'del-scorer') {
    const m = mp.matches[el.dataset.match];
    if (!m?.scorerIds) return;
    delete m.scorerIds[el.dataset.user];
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
  host.innerHTML = sectionHTML(tn, ctx.users || []);
  wire(host, tn, ctx);
}

function wire(host, tn, ctx) {
  host.querySelectorAll('input[data-mp], select[data-mp], textarea[data-mp]').forEach(el => {
    // Rosters and player picks reshape the section, so they repaint; plain
    // fields only mark the draft dirty and repaint nothing — no lost focus.
    el.onchange = () => {
      if (el.dataset.mp === 'add-scorer' || el.dataset.mp === 'add-player') {
        if (el.value) { handleClick(tn, el, ctx, host); }
        return;
      }
      const changed = handleEdit(tn, el);
      if (!changed) return;
      if (el.dataset.mp === 'player'
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
  host.querySelectorAll('input[data-mp-logo-input]').forEach(inp => {
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      inp.value = '';
      if (!file) return;
      const d = draftFor(tn);
      try {
        d.mp.teams[inp.dataset.mpLogoInput].logo = await readLogoFile(file);
      } catch (err) {
        ctx.showToast('⚠️ ' + t(err?.message === 'too-big' ? 'mpLogoTooBig' : 'mpLogoBad'), 'error');
        return;
      }
      d.dirty = true;
      paint(host, tn, ctx);
    };
  });
}

/**
 * Render the match play setup section into `host`.
 * ctx: { showToast(msg, type), rerender() — re-renders the admin tab,
 *        users — app members, for the scorer picker }
 */
export function mountMpAdmin(host, tn, ctx) {
  if (!host || !tn) return;
  paint(host, tn, ctx);
}

// ---- Device registry (who may write live scores) ----
// The database rules only let allowlisted anonymous-auth devices write under
// tournaments/. This card is where the admin approves them: their own device
// first (the registry's first claim bootstraps as admin), then each scorer's
// phone as its request comes in. Hidden entirely while anonymous auth is not
// running — in that state the rules are not gating anything yet.

const shortUid = (uid) => (uid ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : '');

async function deviceAdminHTML() {
  const status = await store.deviceStatus();
  if (!status.uid) return '';
  const { devices, requests } = await store.loadDeviceRegistry();

  const mine = status.role
    ? `<span class="pill-soft">${status.role === 'admin' ? t('mpDevRoleAdmin') : t('mpDevRoleScorer')}</span>`
    : status.registryEmpty
      ? `<button data-dev="claim" class="btn btn-primary btn-sm">${t('mpDevClaim')}</button>`
      : status.requested
        ? `<span style="color:var(--amber);font-size:0.78rem;">${t('mpDevRequested')}</span>`
        : `<button data-dev="request" class="btn btn-outline btn-sm">${t('mpDevRequest')}</button>`;

  const requestRows = Object.entries(requests)
    .filter(([uid]) => !devices[uid])
    .map(([uid, r]) => `
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:0.8rem;">
        <span><b>${esc(r?.name || '?')}</b> <span style="color:var(--text-muted);">${shortUid(uid)}</span></span>
        <span style="margin-left:auto;display:flex;gap:6px;">
          <button data-dev="approve" data-uid="${esc(uid)}" data-name="${esc(r?.name || '')}" class="btn btn-primary btn-sm">${t('mpDevApprove')}</button>
          <button data-dev="dismiss" data-uid="${esc(uid)}" class="btn btn-outline-danger btn-sm">✕</button>
        </span>
      </div>`).join('');

  const deviceRows = Object.entries(devices).map(([uid, d]) => `
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:0.8rem;">
      <span><b>${esc(d?.name || '?')}</b> <span style="color:var(--text-muted);">${shortUid(uid)}</span></span>
      <span class="pill-soft" style="font-size:0.68rem;">${d?.role === 'admin' ? t('mpDevRoleAdmin') : t('mpDevRoleScorer')}</span>
      ${uid === status.uid ? `<span style="font-size:0.7rem;color:var(--text-secondary);">${t('mpDevThis')}</span>` : ''}
      <span style="margin-left:auto;display:flex;gap:6px;">
        ${d?.role !== 'admin' ? `<button data-dev="promote" data-uid="${esc(uid)}" data-name="${esc(d?.name || '')}" class="btn btn-outline btn-sm">${t('mpDevRoleAdmin')}</button>` : ''}
        <button data-dev="revoke" data-uid="${esc(uid)}" class="btn btn-outline-danger btn-sm">${t('mpDevRevoke')}</button>
      </span>
    </div>`).join('');

  return `
    <div style="background:var(--bg-card-hover);border:1px solid var(--border-color);border-radius:10px;padding:12px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <b style="font-size:0.85rem;">${t('mpDevTitle')}</b>
        <span style="font-size:0.72rem;color:var(--text-muted);">${t('mpDevThis')}: ${shortUid(status.uid)}</span>
        <span style="margin-left:auto;">${mine}</span>
      </div>
      ${status.registryEmpty && !status.role
        ? `<p style="font-size:0.74rem;color:var(--amber);margin:8px 0 0;">${t('mpDevBootstrapHint')}</p>` : ''}
      ${requestRows ? `<div style="margin-top:10px;font-size:0.72rem;font-weight:700;color:var(--text-secondary);">${t('mpDevRequests')}</div>${requestRows}` : ''}
      ${deviceRows ? `<div style="margin-top:10px;font-size:0.72rem;font-weight:700;color:var(--text-secondary);">${t('mpDevApproved')}</div>${deviceRows}` : ''}
    </div>`;
}

/**
 * Render the device-approval card into `host`.
 * ctx: { showToast(msg, type), adminName — name recorded on claims/requests }
 */
export async function mountDeviceAdmin(host, ctx) {
  if (!host) return;
  let html = '';
  try { html = await deviceAdminHTML(); } catch (err) { console.warn('[mp-devices]', err); }
  host.innerHTML = html;
  if (!html) return;

  const act = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) ctx.showToast('✅ ' + okMsg, 'success');
    } catch (err) {
      console.error('[mp-devices]', err);
      ctx.showToast('⚠️ ' + (/permission[_ ]denied/i.test(String(err?.message || err))
        ? t('mpDevDenied') : (err?.message || t('mpSaveFailed'))), 'error');
    }
    await mountDeviceAdmin(host, ctx);
  };

  host.querySelectorAll('button[data-dev]').forEach(b => b.onclick = () => {
    const kind = b.dataset.dev;
    if (kind === 'claim') act(() => store.claimAdminDevice(ctx.adminName), t('mpDevClaimed'));
    else if (kind === 'request') act(() => store.requestDeviceAccess(ctx.adminName), t('mpDevRequestSent'));
    else if (kind === 'approve') act(() => store.approveDevice(b.dataset.uid, b.dataset.name, 'scorer'), t('mpDevApproved'));
    else if (kind === 'promote') act(() => store.approveDevice(b.dataset.uid, b.dataset.name, 'admin'), t('mpDevApproved'));
    else if (kind === 'dismiss') act(() => store.dismissDeviceRequest(b.dataset.uid));
    else if (kind === 'revoke') {
      act(async () => {
        // Removing the last admin device would leave a registry nobody can
        // edit — the rules only let admin devices touch it — so it is
        // refused here rather than discovered as a lockout later.
        const { devices } = await store.loadDeviceRegistry();
        const admins = Object.entries(devices).filter(([, d]) => d?.role === 'admin');
        if (admins.length === 1 && admins[0][0] === b.dataset.uid) {
          throw new Error(t('mpDevLastAdmin'));
        }
        if (!confirm(t('mpDevRevokeConfirm'))) return;
        await store.revokeDevice(b.dataset.uid);
      });
    }
  });
}

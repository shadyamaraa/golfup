// src/strokeplay-admin.js
// Admin setup for an in-app stroke play tournament: the player list and each
// player's HCP/status. Same discipline as matchplay-admin: edits live on a
// local draft (the tab re-rendering never loses typing), and saving writes
// one key per player — never the sp/scores subtree, so a save can't clobber
// a card being filled on the course.

import * as store from './store.js';
import { t } from './i18n.js';
import {
  drawGroups, spGroupList, tnIsTeam, tnOneBall, tnTeamSize, teamKeyOf, isTeamEntry, teamMemberIds, spTeams
} from './strokeplay.js';
import { courseHandicap } from './handicap.js';
import { addMinutesHHMM } from './matchplay.js';
import { nameKey, nameMatches } from './tournament-sheet.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:8px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);font-size:0.85rem;';

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

// tnId -> { players, groups, dirty, removed } — survives tab re-renders,
// dropped on save/close so a stale snapshot can't overwrite newer work.
// groups: { [round]: { gid: { number, teeTime, players: {pid:true} } } }
const drafts = new Map();
// Which round's draw each open editor is looking at.
const groupRoundFor = new Map();
// The players fold, remembered across the tab's re-renders.
const playersOpenFor = new Map();
// The draw controls' values, so a repaint never resets what was picked.
const drawCtlFor = new Map();
// A team event: the players ticked for the next team, and the teams fold.
const teamPickFor = new Map();
const teamsOpenFor = new Map();
// How many teams fit a flight of four: one four-player team, two of two.
const teamsPerFlight = (tn) => Math.max(1, Math.floor(4 / tnTeamSize(tn)));
const drawCtl = (tnId) => {
  let c = drawCtlFor.get(tnId);
  if (!c) {
    c = { method: 'random', size: '4', count: '4', firstTee: '08:00', mode: 'seq' };
    drawCtlFor.set(tnId, c);
  }
  return c;
};

function draftFor(tn) {
  let d = drafts.get(tn.id);
  if (!d || !d.dirty) {
    d = {
      players: clone(tn.sp?.players) || {},
      groups: clone(tn.sp?.groups) || {},
      dirty: false,
      removed: new Set()
    };
    drafts.set(tn.id, d);
  }
  return d;
}

export function discardSpDraft(tnId) { drafts.delete(tnId); }

// ---- Group helpers on the draft ----

const roundOf = (tn) => Math.min(
  Math.max(1, Number(tn.rounds) || 1),
  groupRoundFor.get(tn.id) || Number(tn.currentRound) || 1);

const groupList = (d, round) => Object.entries(d.groups[round] || {})
  .filter(([, g]) => g)
  .map(([gid, g]) => ({ gid, ...g }))
  .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

const groupOfPid = (d, round, pid) => {
  const hit = Object.entries(d.groups[round] || {})
    .find(([, g]) => g?.players?.[pid]);
  return hit ? hit[0] : null;
};

// Re-time the procession: from the group holding `fromGid` (or the first),
// every later group goes off `step` minutes behind the one before it.
function rechainTees(d, round, fromGid, step = 10) {
  const list = groupList(d, round);
  const at = fromGid ? list.findIndex(g => g.gid === fromGid) : 0;
  if (at < 0) return;
  let clock = list[at]?.teeTime;
  if (!/^\d{1,2}:\d{2}$/.test(String(clock || ''))) return;
  for (let i = at + 1; i < list.length; i++) {
    clock = addMinutesHHMM(clock, step);
    d.groups[round][list[i].gid].teeTime = clock;
  }
}

// ---- Rendering ----

function rowHTML(tn, pid, p) {
  const scored = !!Object.keys(tn.sp?.scores?.[pid] || {}).length;
  return `
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;">
      <span style="flex:1;min-width:130px;font-size:0.85rem;">
        <b>${esc(p.name || pid)}</b>
        ${p.userId || !pid.startsWith('p_') ? '' : ` <span class="pill-soft" style="font-size:0.62rem;">✍</span>`}
        ${scored ? ` <span class="pill-soft" style="font-size:0.62rem;">✓</span>` : ''}
      </span>
      <input data-sp="hcp" data-pid="${esc(pid)}" type="number" step="1" min="0" max="54"
        value="${esc(p.hcp ?? '')}" placeholder="${t('spHcp')}" title="${t('spHcp')}" style="${INPUT}width:74px;" />
      <select data-sp="status" data-pid="${esc(pid)}" style="${INPUT}width:80px;">
        ${['', 'WD', 'DQ'].map(s => `<option value="${s}"${(p.status || '') === s ? ' selected' : ''}>${s || '—'}</option>`).join('')}
      </select>
      ${tnOneBall(tn) ? '' : `<a href="#/spscore/${esc(tn.id)}/${esc(pid)}" class="btn btn-outline btn-sm" style="font-size:0.72rem;">${t('spScorecard')}</a>`}
      <button data-sp="del" data-pid="${esc(pid)}" class="btn btn-outline-danger btn-sm">✕</button>
    </div>`;
}

// A member's WHS playing handicap on this tournament's course and tee — what
// seeds the roster's HCP field so nobody retypes what the club already knows.
// null when either side lacks the data (no index, custom course, no tee).
// A typed value always wins; this only ever fills blanks.
function whsHcp(u, tn) {
  const ch = courseHandicap(u?.hcpIndex, tn?.slope, tn?.rating, Number(tn?.par) || null);
  return ch === null ? null : Math.max(0, Math.min(54, ch));
}

function sectionHTML(tn, users) {
  const d = draftFor(tn);
  const rows = Object.entries(d.players)
    .filter(([, p]) => p && !isTeamEntry(p))
    .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));
  // An empty roster is the one time the fold opens itself — there is
  // nothing else for the admin to do until players exist.
  const open = playersOpenFor.get(tn.id) ?? !rows.length;
  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <details data-sp-players${open ? ' open' : ''}>
        <summary style="cursor:pointer;font-size:0.85rem;font-weight:800;">${t('spPlayers')} — ${rows.length}</summary>
        <div style="margin-top:8px;">
          ${rows.map(([pid, p]) => rowHTML(tn, pid, p)).join('')
            || `<p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">${t('spNoPlayers')}</p>`}
          <div style="position:relative;margin-top:8px;">
            <input data-sp="pick" placeholder="🔍 ${t('mpTypeName')}" autocomplete="off"
              style="${INPUT}width:100%;box-sizing:border-box;" />
            <div data-sp="pick-list" hidden style="position:absolute;left:0;right:0;top:100%;margin-top:3px;z-index:30;
              max-height:220px;overflow-y:auto;border:1px solid var(--border-color);
              background:var(--bg-card);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.25);"></div>
          </div>
          <input data-sp="manual" placeholder="✍ ${t('spAddManual')}"
            style="${INPUT}width:100%;box-sizing:border-box;margin-top:6px;" />
          <button data-sp="add-all" class="btn btn-outline btn-sm" style="width:100%;margin-top:6px;font-size:0.76rem;">
            👥 ${t('spAddAll')}
          </button>
          ${tn.rating && tn.slope ? `
          <button data-sp="hcp-whs" class="btn btn-outline btn-sm" style="width:100%;margin-top:6px;font-size:0.76rem;">
            ${t('spHcpFromWhs')}
          </button>` : ''}
        </div>
      </details>
      ${teamsHTML(tn, d)}
      ${groupsHTML(tn, d)}
      <button data-sp="save" class="btn ${d.dirty ? 'btn-primary' : 'btn-outline'} btn-sm" style="margin-top:12px;">
        ${t('mpSave')}${d.dirty ? ' *' : ''}
      </button>
    </div>`;
}

// ---- Teams section (scramble) ----
// A team is built from the roster: tick the players, name it, create — and it
// becomes an sp.players entry of its own, so the draw, the board and the
// scorer treat it like any competitor. The team handicap is typed by hand;
// nothing is derived from the members, because a scramble's allowance is the
// organiser's call and no formula fits both a pair and a four.
function teamsHTML(tn, d) {
  if (!tnIsTeam(tn)) return '';
  const size = tnTeamSize(tn);
  const { teams, free } = spTeams({ sp: { players: d.players } });
  const picked = teamPickFor.get(tn.id) || new Set();
  teamPickFor.set(tn.id, picked);
  // A pick that was since claimed by another team, or removed, is dropped.
  const freeIds = new Set(free.map(p => p.pid));
  [...picked].forEach(pid => { if (!freeIds.has(pid)) picked.delete(pid); });
  const open = teamsOpenFor.get(tn.id) ?? true;
  const nameOf = (pid) => d.players[pid]?.name || pid;
  const autoName = [...picked].map(pid => String(nameOf(pid)).split(' ')[0]).join(' / ');

  const teamRow = (tm) => {
    const scored = !!Object.keys(tn.sp?.scores?.[tm.pid] || {}).length;
    return `
    <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;margin-top:6px;background:var(--bg-color);">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <input data-spt="tname" data-pid="${esc(tm.pid)}" value="${esc(tm.name || '')}" placeholder="${t('spTeamName')}"
          style="${INPUT}flex:1;min-width:140px;font-weight:700;" />
        ${tn.format === 'fourball' ? '' : `<input data-spt="hcp" data-pid="${esc(tm.pid)}" type="number" step="1" min="0" max="72"
          value="${esc(tm.hcp ?? '')}" placeholder="${t('spTeamHcp')}" title="${t('spTeamHcp')}" style="${INPUT}width:84px;" />`}
        ${scored ? `<span class="pill-soft" style="font-size:0.62rem;">✓</span>` : ''}
        ${tn.format === 'fourball' ? '' : `<a href="#/spscore/${esc(tn.id)}/${esc(tm.pid)}" class="btn btn-outline btn-sm" style="font-size:0.72rem;">${t('spScorecard')}</a>`}
        <button data-spt="disband" data-pid="${esc(tm.pid)}" class="btn btn-outline-danger btn-sm" title="${t('spTeamDisband')}">✕</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
        ${tm.memberIds.map(pid => `<span class="pill-soft" style="font-size:0.72rem;">${esc(nameOf(pid))}</span>`).join('')}
      </div>
    </div>`;
  };

  const chip = (p) => `
    <button data-spt="pick" data-pid="${esc(p.pid)}" type="button"
      class="seg-chip${picked.has(p.pid) ? ' active' : ''}"
      style="flex:0 0 auto;padding:7px 10px;font-size:0.78rem;">${esc(p.name || p.pid)}</button>`;

  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <details data-sp-teams${open ? ' open' : ''}>
        <summary style="cursor:pointer;font-size:0.85rem;font-weight:800;">${t('spTeams')} — ${teams.length}</summary>
        <div style="margin-top:8px;">
          ${teams.map(teamRow).join('')
            || `<p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">${t('spNoTeams')}</p>`}
          <div style="margin-top:12px;font-size:0.8rem;font-weight:700;">
            ${t('spTeamNew')} · ${picked.size}/${size}
            <span style="font-weight:400;color:var(--text-secondary);">${t('spTeamPick')}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            ${free.map(chip).join('')
              || `<span style="font-size:0.74rem;color:var(--text-muted);">— ${t('spTeamFree')}: 0</span>`}
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <input data-spt="name" placeholder="${t('spTeamName')}" value="${esc(autoName)}"
              style="${INPUT}flex:1;min-width:0;box-sizing:border-box;" />
            <button data-spt="create" class="btn btn-primary btn-sm" ${picked.size === size ? '' : 'disabled'}>${t('spTeamCreate')}</button>
          </div>
        </div>
      </details>
    </div>`;
}

// ---- Groups (flights) section ----

function groupsHTML(tn, d) {
  const roundCount = Math.max(1, Number(tn.rounds) || 1);
  const round = roundOf(tn);
  const groups = groupList(d, round);
  const inGroup = new Set();
  groups.forEach(g => Object.keys(g.players || {}).forEach(pid => inGroup.add(pid)));
  const team = tnIsTeam(tn);
  const loose = Object.entries(d.players)
    .filter(([pid, p]) => p && !inGroup.has(pid) && isTeamEntry(p) === team
      && !['WD', 'DQ'].includes(String(p.status || '').toUpperCase()))
    .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));

  const groupBox = (g) => `
    <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;margin-top:6px;background:var(--bg-color);">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <b style="font-size:0.8rem;">${t('spGroup')} ${esc(g.number ?? '')}</b>
        <input data-spg="tee" data-gid="${esc(g.gid)}" type="time" value="${esc(g.teeTime || '')}"
          title="${t('mpTee')}" style="${INPUT}width:100px;" />
        <input data-spg="shole" data-gid="${esc(g.gid)}" type="number" min="1" max="18"
          value="${esc(g.startHole ?? '')}" placeholder="№" title="${t('spStartHole')}" style="${INPUT}width:64px;" />
        <a href="#/spgroup/${esc(tn.id)}/${round}/${esc(g.gid)}" class="btn btn-outline btn-sm" style="font-size:0.72rem;">${t('spScorecard')}</a>
        <button data-spg="del-group" data-gid="${esc(g.gid)}" class="btn btn-outline-danger btn-sm" style="margin-left:auto;">✕</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
        ${Object.keys(g.players || {}).map(pid => `
          <span class="pill-soft" style="font-size:0.72rem;">${esc(d.players[pid]?.name || pid)}
            <button data-spg="del-player" data-gid="${esc(g.gid)}" data-pid="${esc(pid)}"
              style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 4px;">✕</button>
          </span>`).join('') || `<span style="font-size:0.72rem;color:var(--text-muted);">—</span>`}
      </div>
      <div style="position:relative;margin-top:6px;">
        <input data-spg="find" data-gid="${esc(g.gid)}" placeholder="🔍 ${t('mpTypeName')}" autocomplete="off"
          style="${INPUT}width:100%;box-sizing:border-box;font-size:0.78rem;" />
        <div data-spg-list="${esc(g.gid)}" hidden style="position:absolute;left:0;right:0;top:100%;margin-top:3px;z-index:30;
          max-height:200px;overflow-y:auto;border:1px solid var(--border-color);
          background:var(--bg-card);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.25);"></div>
      </div>
    </div>`;

  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <b style="font-size:0.85rem;">${t('spGroups')}</b>
        <span style="display:flex;gap:4px;">
          ${Array.from({ length: roundCount }, (_, i) => `
            <button data-spg="round" data-round="${i + 1}" class="btn ${round === i + 1 ? 'btn-primary' : 'btn-outline'} btn-sm" style="font-size:0.72rem;">R${i + 1}</button>`).join('')}
        </span>
        <button data-spg="import" class="btn btn-outline btn-sm" style="margin-left:auto;font-size:0.72rem;">📄 Excel</button>
        <input data-spg-file type="file" accept=".xlsx,.xls,.csv" style="display:none;" />
      </div>
      ${(() => {
        const c = drawCtl(tn.id);
        const sel = (v, cur) => String(v) === String(cur) ? ' selected' : '';
        return `
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px;">
        <select data-spg="method" style="${INPUT}font-size:0.78rem;">
          <option value="random"${sel('random', c.method)}>${t('spDrawRandom')}</option>
          <option value="hcp"${sel('hcp', c.method)}>${t('spDrawHcp')}</option>
          <option value="standings"${sel('standings', c.method)}>${t('spDrawStandings')}</option>
          <option value="empty"${sel('empty', c.method)}>${t('spEmptyGroups')}</option>
        </select>
        ${c.method === 'empty'
          ? `<input data-spg="empty-count" type="number" min="1" max="40" value="${esc(c.count)}" title="${t('spGroups')}" style="${INPUT}width:64px;" />`
          : team
            ? `<select data-spg="size" style="${INPUT}font-size:0.78rem;">
              ${Array.from({ length: teamsPerFlight(tn) }, (_, i) => teamsPerFlight(tn) - i)
                .map(n => `<option value="${n}"${sel(n, Math.min(Number(c.size) || 4, teamsPerFlight(tn)))}>${n} ${t('spTeamsPerGroup')}</option>`).join('')}
            </select>`
            : `<select data-spg="size" style="${INPUT}font-size:0.78rem;">
              ${[4, 3].map(n => `<option value="${n}"${sel(n, c.size)}>${n} ${t('spPerGroup')}</option>`).join('')}
            </select>`}
        <input data-spg="first-tee" type="time" value="${esc(c.firstTee)}" title="${t('mpTee')}" style="${INPUT}width:100px;" />
        <select data-spg="start-mode" title="${t('spStartMode')}" style="${INPUT}font-size:0.78rem;">
          <option value="seq"${sel('seq', c.mode)}>${t('spSequential')}</option>
          <option value="shotgun"${sel('shotgun', c.mode)}>${t('spShotgun')}</option>
        </select>
        <button data-spg="draw" class="btn btn-primary btn-sm">${t('spDraw')}</button>
      </div>`;
      })()}
      ${groups.map(groupBox).join('')
        || `<p style="font-size:0.76rem;color:var(--text-secondary);margin:8px 0 0;">${t('spNoGroups')}</p>`}
      ${loose.length && groups.length ? `
        <p style="font-size:0.72rem;color:var(--amber);margin:6px 0 0;">
          ⚠ ${loose.length} ${t('spUnassigned')}: ${esc(loose.map(([, p]) => p.name).join(', '))}
        </p>` : ''}
    </div>`;
}

// ---- Saving ----

async function saveDraft(tn, ctx) {
  const d = draftFor(tn);
  const patch = {};

  // The group pointer on each player is derived from the draw itself, so the
  // two copies can never disagree; the rules read the pointer.
  const pointers = {};
  Object.entries(d.groups).forEach(([round, groups]) => {
    Object.entries(groups || {}).forEach(([gid, g]) => {
      Object.keys(g?.players || {}).forEach(pid => {
        (pointers[pid] = pointers[pid] || {})[round] = gid;
        // A team's members stand in its flight too: the same-flight database
        // rule is what lets them enter the team's ball, and it reads the
        // pointer on THEIR player record.
        teamMemberIds(d.players[pid]).forEach(m => {
          (pointers[m] = pointers[m] || {})[round] = gid;
        });
      });
    });
    patch[`sp/groups/${round}`] = groups && Object.keys(groups).length ? groups : null;
  });

  Object.entries(d.players).forEach(([pid, p]) => {
    if (!p) return;
    const rec = { name: p.name || '' };
    if (p.userId) rec.userId = p.userId;
    if (isTeamEntry(p)) { rec.kind = 'team'; rec.members = p.members || {}; }
    if (p.hcp !== '' && p.hcp !== null && p.hcp !== undefined && !isNaN(Number(p.hcp))) rec.hcp = Number(p.hcp);
    if (p.status) rec.status = p.status;
    if (pointers[pid]) rec.groups = pointers[pid];
    patch[`sp/players/${pid}`] = rec;
  });
  d.removed.forEach(pid => {
    patch[`sp/players/${pid}`] = null;
    patch[`sp/scores/${pid}`] = null;
  });
  await store.updateTournament(tn.id, patch);
  drafts.delete(tn.id);
  ctx.showToast('✅ ' + t('mpSaved'), 'success');
  await ctx.rerender();
}

// ---- Mount ----

function paint(host, tn, ctx) {
  host.innerHTML = sectionHTML(tn, ctx.users || []);
  wire(host, tn, ctx);
}

function wire(host, tn, ctx) {
  const d = draftFor(tn);
  host.querySelector('details[data-sp-players]')?.addEventListener('toggle', (e) => {
    playersOpenFor.set(tn.id, e.target.open);
  });
  const markDirty = () => {
    d.dirty = true;
    host.querySelector('button[data-sp="save"]')?.classList.replace('btn-outline', 'btn-primary');
  };

  host.querySelectorAll('input[data-sp="hcp"]').forEach(inp => {
    inp.onchange = () => {
      const p = d.players[inp.dataset.pid];
      if (!p) return;
      p.hcp = inp.value.trim();
      markDirty();
    };
  });

  host.querySelectorAll('select[data-sp="status"]').forEach(sel => {
    sel.onchange = () => {
      const p = d.players[sel.dataset.pid];
      if (!p) return;
      p.status = sel.value;
      markDirty();
    };
  });

  host.querySelectorAll('button[data-sp="del"]').forEach(b => b.onclick = () => {
    const pid = b.dataset.pid;
    const scored = !!Object.keys(tn.sp?.scores?.[pid] || {}).length;
    if (scored && !confirm(t('spDelPlayerScored'))) return;
    delete d.players[pid];
    // Out of the roster means out of every round's draw too.
    Object.values(d.groups).forEach(groups =>
      Object.values(groups || {}).forEach(g => { if (g?.players) delete g.players[pid]; }));
    d.removed.add(pid);
    d.dirty = true;
    paint(host, tn, ctx);
  });

  wireGroups(host, tn, ctx, d, markDirty);
  wireTeams(host, tn, ctx, d, markDirty);

  // The whole membership in one tap — every active member not already on
  // the roster. Names come through memberName so they read first-name-first.
  const addAll = host.querySelector('button[data-sp="add-all"]');
  if (addAll) addAll.onclick = () => {
    const adds = (ctx.users || []).filter(u =>
      u && u.id && u.status !== 'hold' && !d.players[u.id]);
    if (!adds.length) { ctx.showToast(t('spAddAllNone'), 'info'); return; }
    if (!confirm(`${adds.length} ${t('spAddAllConfirm')}`)) return;
    adds.forEach(u => {
      const hcp = whsHcp(u, tn);
      d.players[u.id] = { name: store.memberName(u), userId: u.id, ...(hcp !== null ? { hcp } : {}) };
    });
    d.dirty = true;
    paint(host, tn, ctx);
  };

  // Fill the BLANK HCP fields from members' WHS indexes (courseHandicap on
  // this tournament's tee). Hand-entered values are never overwritten.
  const whsBtn = host.querySelector('button[data-sp="hcp-whs"]');
  if (whsBtn) whsBtn.onclick = () => {
    const byId = new Map((ctx.users || []).map(u => [u.id, u]));
    let filled = 0;
    Object.entries(d.players).forEach(([pid, p]) => {
      if (!p || !p.userId || (p.hcp !== '' && p.hcp !== null && p.hcp !== undefined)) return;
      const hcp = whsHcp(byId.get(p.userId), tn);
      if (hcp !== null) { p.hcp = hcp; filled++; }
    });
    if (!filled) { ctx.showToast(t('spHcpWhsNone'), 'info'); return; }
    d.dirty = true;
    paint(host, tn, ctx);
  };

  // Manual (non-member) player: type a name, press Enter.
  const manual = host.querySelector('input[data-sp="manual"]');
  if (manual) manual.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const name = manual.value.trim();
    if (!name) return;
    const pid = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    d.players[pid] = { name };
    d.dirty = true;
    paint(host, tn, ctx);
  };

  // Member picker — the same type-to-search the match play editor uses.
  const inp = host.querySelector('input[data-sp="pick"]');
  const list = host.querySelector('[data-sp="pick-list"]');
  if (!inp || !list) return;

  const candidates = () => (ctx.users || [])
    .filter(u => u && u.id && !d.players[u.id])
    .map(u => {
      const label = store.memberName(u);
      return { id: u.id, label, sub: u.username && u.username !== label ? u.username : '' };
    });

  const show = () => {
    const q = inp.value.trim().toLowerCase();
    const all = candidates();
    const hits = q ? all.filter(c => `${c.label} ${c.sub}`.toLowerCase().includes(q)) : all;
    list.innerHTML = hits.length
      ? hits.slice(0, 60).map(c => `
        <div data-sp-id="${esc(c.id)}" data-sp-name="${esc(c.label)}" style="padding:8px 10px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border-color);">
          ${esc(c.label)}${c.sub ? ` <span style="color:var(--text-muted);font-size:0.72rem;">${esc(c.sub)}</span>` : ''}
        </div>`).join('')
      : `<div style="padding:8px 10px;font-size:0.78rem;color:var(--text-muted);">${t('mpNoneFound')}</div>`;
    list.hidden = false;
    list.querySelectorAll('[data-sp-id]').forEach(item => {
      item.onpointerdown = (e) => {
        e.preventDefault();
        const id = item.dataset.spId;
        const hcp = whsHcp((ctx.users || []).find(u => u?.id === id), tn);
        d.players[id] = { name: item.dataset.spName, userId: id, ...(hcp !== null ? { hcp } : {}) };
        d.dirty = true;
        paint(host, tn, ctx);
      };
    });
  };

  inp.onfocus = show;
  inp.oninput = show;
  inp.onblur = () => setTimeout(() => {
    if (!document.body.contains(inp)) return;
    inp.value = '';
    list.hidden = true;
  }, 150);

  host.querySelector('button[data-sp="save"]').onclick = () => {
    saveDraft(tn, ctx).catch(err => {
      console.error('[strokeplay-admin]', err);
      ctx.showToast('⚠️ ' + (err?.message || t('mpSaveFailed')), 'error');
    });
  };
}

// ---- Team wiring ----

function wireTeams(host, tn, ctx, d, markDirty) {
  if (!tnIsTeam(tn)) return;
  const size = tnTeamSize(tn);
  const picked = teamPickFor.get(tn.id) || new Set();
  teamPickFor.set(tn.id, picked);
  const repaint = () => paint(host, tn, ctx);
  host.querySelector('details[data-sp-teams]')?.addEventListener('toggle', (e) => {
    teamsOpenFor.set(tn.id, e.target.open);
  });

  host.querySelectorAll('button[data-spt="pick"]').forEach(b => b.onclick = () => {
    const pid = b.dataset.pid;
    if (picked.has(pid)) picked.delete(pid);
    else if (picked.size < size) picked.add(pid);
    repaint();
  });

  const nameInp = host.querySelector('input[data-spt="name"]');
  host.querySelector('button[data-spt="create"]')?.addEventListener('click', () => {
    if (picked.size !== size) return;
    const members = [...picked];
    const key = teamKeyOf(members);
    if (d.players[key]) { ctx.showToast?.('⚠️ ' + t('spTeamCreate'), 'warning'); return; }
    const typed = nameInp?.value.trim();
    d.players[key] = {
      kind: 'team',
      name: typed || members.map(pid => String(d.players[pid]?.name || pid).split(' ')[0]).join(' / '),
      members: Object.fromEntries(members.map(pid => [pid, true])),
      hcp: ''
    };
    picked.clear();
    markDirty();
    repaint();
  });

  host.querySelectorAll('input[data-spt="tname"]').forEach(inp => inp.onchange = () => {
    const tm = d.players[inp.dataset.pid];
    if (!tm) return;
    tm.name = inp.value.trim();
    markDirty();
  });

  host.querySelectorAll('input[data-spt="hcp"]').forEach(inp => inp.onchange = () => {
    const tm = d.players[inp.dataset.pid];
    if (!tm) return;
    tm.hcp = inp.value.trim();
    markDirty();
  });

  // Disbanding frees the members for another team. A team that has scored
  // is asked about first — its ball goes with it.
  host.querySelectorAll('button[data-spt="disband"]').forEach(b => b.onclick = () => {
    const pid = b.dataset.pid;
    const scored = !!Object.keys(tn.sp?.scores?.[pid] || {}).length;
    if (scored && !confirm(t('spDelPlayerScored'))) return;
    delete d.players[pid];
    Object.values(d.groups).forEach(groups =>
      Object.values(groups || {}).forEach(g => { if (g?.players) delete g.players[pid]; }));
    d.removed.add(pid);
    markDirty();
    repaint();
  });
}

// ---- Group wiring ----

function wireGroups(host, tn, ctx, d, markDirty) {
  const round = roundOf(tn);
  const repaint = () => { d.dirty = true; paint(host, tn, ctx); };

  host.querySelectorAll('button[data-spg="round"]').forEach(b => b.onclick = () => {
    groupRoundFor.set(tn.id, Number(b.dataset.round));
    paint(host, tn, ctx);
  });

  // The draw controls keep their values in drawCtl so repaints never reset
  // them; changing the method swaps the size/count field, so it repaints.
  const c = drawCtl(tn.id);
  const bindCtl = (selector, key, repaintToo) => {
    const el = host.querySelector(selector);
    if (el) el.onchange = () => {
      c[key] = el.value;
      if (repaintToo) paint(host, tn, ctx);
    };
  };
  bindCtl('select[data-spg="method"]', 'method', true);
  bindCtl('select[data-spg="size"]', 'size');
  bindCtl('input[data-spg="empty-count"]', 'count');
  bindCtl('input[data-spg="first-tee"]', 'firstTee');
  bindCtl('select[data-spg="start-mode"]', 'mode');

  // The draw: method + size + first tee → groups numbered in order. The
  // "empty groups" method APPENDS that many groups to fill by hand; the
  // real draws replace this round after a confirm.
  const drawBtn = host.querySelector('button[data-spg="draw"]');
  if (drawBtn) drawBtn.onclick = () => {
    const shotgun = c.mode === 'shotgun';
    const firstTee = c.firstTee || '';

    if (c.method === 'empty') {
      const count = Math.min(40, Math.max(1, Number(c.count) || 1));
      const existing = groupList(d, round);
      let number = existing.length ? Math.max(...existing.map(g => Number(g.number) || 0)) : 0;
      let clock = existing.length ? existing.at(-1).teeTime || '' : firstTee;
      const groups = (d.groups[round] = d.groups[round] || {});
      for (let i = 0; i < count; i++) {
        number += 1;
        if (!shotgun && clock && (existing.length || i > 0)) clock = addMinutesHHMM(clock, 10);
        groups[`g_${round}_${Date.now().toString(36)}${number}`] = {
          number,
          teeTime: (shotgun ? firstTee : clock) || '',
          ...(shotgun ? { startHole: ((number - 1) % 18) + 1 } : {}),
          players: {}
        };
      }
      repaint();
      return;
    }

    if (Object.keys(d.groups[round] || {}).length && !confirm(t('spRedrawConfirm'))) return;
    const method = c.method;
    // The size control remembers "4" from an individual event; a team event
    // can never seat more teams than fit a flight of four.
    const size = tnIsTeam(tn)
      ? Math.max(1, Math.min(Number(c.size) || teamsPerFlight(tn), teamsPerFlight(tn)))
      : (Number(c.size) || 4);
    // The draw reads the DRAFT roster (unsaved adds included) but the live
    // scores, so a standings draw ranks on what the board shows.
    const draw = drawGroups(
      { ...tn, sp: { ...(tn.sp || {}), players: d.players, scores: tn.sp?.scores || {} } },
      { method, size, round });
    const groups = {};
    let clock = firstTee;
    draw.forEach((pids, i) => {
      const gid = `g_${round}_${i + 1}`;
      groups[gid] = {
        number: i + 1,
        // Shotgun: every flight starts at the shared tee time (retimed by
        // hand per flight afterwards, e.g. a second group off the same hole
        // 10 minutes later). Sequential: the 10-minute procession off the 1st.
        teeTime: shotgun ? firstTee : (clock || ''),
        ...(shotgun ? { startHole: (i % 18) + 1 } : {}),
        players: Object.fromEntries(pids.map(pid => [pid, true]))
      };
      if (!shotgun && clock) clock = addMinutesHHMM(clock, 10);
    });
    d.groups[round] = groups;
    repaint();
  };

  host.querySelectorAll('input[data-spg="tee"]').forEach(inp => inp.onchange = () => {
    const g = d.groups[round]?.[inp.dataset.gid];
    if (!g) return;
    g.teeTime = inp.value;
    // Shotgun flights never sync: each flight's time is edited on its own
    // (a second group off the same hole 10 minutes later is a hand edit).
    // Sequential groups still re-chain — the ones behind follow at
    // 10-minute steps, a procession, not a sheet of independent times.
    if (!g.startHole) rechainTees(d, round, inp.dataset.gid);
    repaint();
  });

  host.querySelectorAll('input[data-spg="shole"]').forEach(inp => inp.onchange = () => {
    const g = d.groups[round]?.[inp.dataset.gid];
    if (!g) return;
    const n = parseInt(inp.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 18) g.startHole = n;
    else delete g.startHole;
    repaint();
  });

  host.querySelectorAll('button[data-spg="del-group"]').forEach(b => b.onclick = () => {
    delete d.groups[round]?.[b.dataset.gid];
    repaint();
  });

  host.querySelectorAll('button[data-spg="del-player"]').forEach(b => b.onclick = () => {
    const g = d.groups[round]?.[b.dataset.gid];
    if (g?.players) delete g.players[b.dataset.pid];
    repaint();
  });

  // Type-to-search per group: the same pattern as every other picker —
  // focus shows all unassigned players, typing filters, pointerdown moves
  // the player into this group (and out of their old one).
  host.querySelectorAll('input[data-spg="find"]').forEach(inp => {
    const gid = inp.dataset.gid;
    const list = host.querySelector(`[data-spg-list="${CSS.escape(gid)}"]`);
    if (!list) return;

    const candidates = () => {
      // Everyone playable except this group's own members. A player already
      // in another flight still shows — labeled with it — and picking them
      // MOVES them here, so a full field never dead-ends an empty group.
      const groups = groupList(d, round);
      const numberOf = new Map();
      groups.forEach(g => Object.keys(g.players || {}).forEach(pid => numberOf.set(pid, g.number)));
      const mine = new Set(Object.keys(d.groups[round]?.[gid]?.players || {}));
      return Object.entries(d.players)
        .filter(([pid, p]) => p && !mine.has(pid) && isTeamEntry(p) === tnIsTeam(tn)
          && !['WD', 'DQ'].includes(String(p.status || '').toUpperCase()))
        .map(([pid, p]) => ({
          pid,
          name: p.name || pid,
          from: numberOf.has(pid) ? `${t('spGroup')} ${numberOf.get(pid)}` : ''
        }))
        .sort((a, b) => (a.from ? 1 : 0) - (b.from ? 1 : 0)
          || a.name.localeCompare(b.name));
    };

    const show = () => {
      const q = inp.value.trim().toLowerCase();
      const all = candidates();
      const hits = q ? all.filter(c => c.name.toLowerCase().includes(q)) : all;
      list.innerHTML = hits.length
        ? hits.slice(0, 40).map(c => `
          <div data-spg-pid="${esc(c.pid)}" style="padding:8px 10px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid var(--border-color);">
            ${esc(c.name)}${c.from ? ` <span style="color:var(--text-muted);font-size:0.7rem;">↪ ${esc(c.from)}</span>` : ''}
          </div>`).join('')
        : `<div style="padding:8px 10px;font-size:0.76rem;color:var(--text-muted);">${t('mpNoneFound')}</div>`;
      list.hidden = false;
      list.querySelectorAll('[data-spg-pid]').forEach(item => {
        item.onpointerdown = (e) => {
          e.preventDefault();
          const pid = item.dataset.spgPid;
          const g = d.groups[round]?.[gid];
          if (!g) return;
          const old = groupOfPid(d, round, pid);
          if (old) delete d.groups[round][old].players[pid];
          (g.players = g.players || {})[pid] = true;
          repaint();
        };
      });
    };

    inp.onfocus = show;
    inp.oninput = show;
    inp.onblur = () => setTimeout(() => {
      if (!document.body.contains(inp)) return;
      inp.value = '';
      list.hidden = true;
    }, 150);
  });

  // Excel/CSV import: rows of (group, name[, tee time]) become this round's
  // draw; names are matched to the roster with the same tolerant matcher the
  // sheet-era leaderboard used.
  const fileInp = host.querySelector('input[data-spg-file]');
  const importBtn = host.querySelector('button[data-spg="import"]');
  if (importBtn && fileInp) {
    importBtn.onclick = () => fileInp.click();
    fileInp.onchange = async () => {
      const file = fileInp.files && fileInp.files[0];
      fileInp.value = '';
      if (!file) return;
      try {
        const rows = await readTableFile(file);
        const res = groupsFromRows(rows, d.players);
        if (!res.groups.length) { ctx.showToast('⚠️ ' + t('spImportNone'), 'warning'); return; }
        const summary = `${res.groups.length} ${t('spGroups')} · ${res.matched} ${t('tnPlayers')}`
          + (res.unmatched.length ? ` · ${t('spImportUnmatched')}: ${res.unmatched.join(', ')}` : '');
        if (!confirm(`${summary}\n\n${t('tnConfirmImport')}`)) return;
        const groups = {};
        res.groups.forEach((g, i) => {
          groups[`g_${round}_${i + 1}`] = {
            number: i + 1,
            teeTime: g.teeTime || '',
            players: Object.fromEntries(g.pids.map(pid => [pid, true]))
          };
        });
        d.groups[round] = groups;
        repaint();
      } catch (err) {
        console.error('[sp-groups-import]', err);
        ctx.showToast('⚠️ ' + (err?.message || t('mpSaveFailed')), 'error');
      }
    };
  }
}

// A workbook or CSV as rows of trimmed strings.
async function readTableFile(file) {
  if ((file.name || '').toLowerCase().endsWith('.csv')) {
    return (await file.text()).split(/\r?\n/).map(l => l.split(',').map(c => c.trim()));
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
    .map(r => r.map(c => String(c ?? '').trim()));
}

// Read a draw out of pasted table rows. Understood shapes, per row:
//   [group №, player name, tee time?]  — the common export;
//   [player name] under a "Групп 1" / "Group 1"-style heading row.
// Rows whose name matches nothing on the roster are reported, not guessed.
export function groupsFromRows(rows, players) {
  const roster = Object.entries(players || {})
    .filter(([, p]) => p)
    .map(([pid, p]) => ({ pid, key: nameKey(p.name || '') }));
  const findPid = (name) => {
    const k = nameKey(name);
    if (!k) return null;
    return roster.find(r => r.key && nameMatches(k, [r.key]))?.pid || null;
  };
  const timeIn = (cells) => {
    const hit = cells.map(c => /^(\d{1,2}):(\d{2})$/.exec(c)).find(Boolean);
    return hit ? `${hit[1].padStart(2, '0')}:${hit[2]}` : '';
  };

  const byNumber = new Map();
  let heading = 0;
  (rows || []).forEach(cells => {
    if (!Array.isArray(cells)) return;
    const text = cells.filter(Boolean);
    if (!text.length) return;
    // A "Group 3" heading row switches the bucket the bare names below fill.
    const head = /(?:групп|group|flight)\s*№?\s*(\d+)/i.exec(text.join(' '));
    const numCell = text.find(c => /^\d{1,2}$/.test(c));
    if (head && !text.some(c => findPid(c))) { heading = Number(head[1]); return; }
    const names = text.map(c => ({ c, pid: findPid(c) })).filter(x => x.pid);
    if (!names.length) return;
    const n = numCell ? Number(numCell) : (heading || 1);
    const g = byNumber.get(n) || { pids: [], teeTime: '' };
    names.forEach(x => { if (!g.pids.includes(x.pid)) g.pids.push(x.pid); });
    g.teeTime = g.teeTime || timeIn(text);
    byNumber.set(n, g);
  });

  const groups = [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
  const matchedSet = new Set(groups.flatMap(g => g.pids));
  const unmatched = (rows || []).flatMap(cells => (Array.isArray(cells) ? cells : []))
    .filter(c => c && /[^\d:.\s]/.test(c) && nameKey(c) && !findPid(c)
      && !/групп|group|flight|нэр|name|tee|цаг/i.test(c));
  return { groups, matched: matchedSet.size, unmatched: [...new Set(unmatched)].slice(0, 8) };
}

/** Render the stroke play player section into `host`. */
export function mountSpAdmin(host, tn, ctx) {
  if (!host || !tn) return;
  paint(host, tn, ctx);
}

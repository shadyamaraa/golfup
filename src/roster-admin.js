// src/roster-admin.js
// The one roster editor: who is in the tournament. Stroke play and match
// play keep their entries in different places (sp.players, mp.roster) and
// read different things off them, but adding a person, listing them and
// taking them off is the same work — the type-to-search member picker, a
// hand-typed guest, «every member», one row per person with the date they
// were added and a ✕ — so it lives here once, and each editor hands in an
// adapter for its own draft plus whatever cells its kind reads (handicap,
// status and division for stroke play; the team for a cup).
//
// The entry shape is one superset across kinds:
//   { name, userId?, teamId?, hcp?, status?, division?, groups?, kind?,
//     members?, addedAt? }
// A member's pid is their userId; a guest typed by hand is keyed p_… and
// carries no userId; a match play entry is a subset of the shape.
//
// Nothing here writes: the adapter mutates its editor's draft, and the
// editor saves as it always did.

import * as store from './store.js';
import { t } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:8px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);font-size:0.85rem;';

// «2026-09-17 19:08» in the browser's own clock — the club reads this in
// Ulaanbaatar, and toLocaleString would spell the date differently in every
// language the app carries.
export function addedAtText(at) {
  const ms = Number(at) || 0;
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A member's roster entry as every editor writes it: the display name is a
// snapshot, the id is the truth, the date is when they were added. `extra`
// is the kind's own (a handicap, a division, a team).
export function memberEntry(u, extra = {}) {
  return { name: store.memberName(u), userId: u.id, addedAt: Date.now(), ...extra };
}

// The people on the roster, teams left out (a scramble's teams have their
// own section), sorted by name.
const personRows = (entries) => Object.entries(entries || {})
  .filter(([, p]) => p && p.kind !== 'team')
  .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));

// Members not yet on the roster — by key, and by userId for entries that
// key some other way.
function candidates(users, entries) {
  const taken = new Set(Object.keys(entries || {}));
  Object.values(entries || {}).forEach(p => { if (p?.userId) taken.add(p.userId); });
  return (users || []).filter(u => u && u.id && !taken.has(u.id));
}

/**
 * opts:
 *   users            — app members
 *   entries()        — the draft's entries {pid: entry}
 *   add(pid, entry)  — put an entry on the draft
 *   remove(pid)      — take one off (the adapter confirms and cascades); false = cancelled
 *   patch(pid, ch)   — change fields on an entry (the team select)
 *   repaint()        — the editor repaints itself after a structural change
 *   markDirty()      — a field changed, no repaint needed
 *   enrich(u)        — extra fields for a picked member (stroke: hcp, division)
 *   manual           — allow a hand-typed guest (stroke play; a cup's scorer
 *                      needs an account, so a guest could never score there)
 *   teams            — [{ id, label }] when entries file under a team: a team
 *                      toggle on the picker and a team select on every row
 *   teamPick         — { get(), set(v) } the picker's current team, kept by the
 *                      editor across repaints
 *   cellsHTML(pid,p) — the kind's own cells between the name and the ✕
 *   badgesHTML(pid,p)— the kind's own pills beside the name (✓ scored …)
 *   extraHTML        — the kind's own bulk controls, after «add every member»
 *   emptyText        — shown when nobody is on the roster
 */
export function rosterHTML(opts) {
  const entries = opts.entries() || {};
  const rows = personRows(entries);
  const teams = opts.teams || null;
  const pickTeam = teams ? (opts.teamPick?.get() || teams[0]?.id) : null;
  const teamSelect = (pid, p) => !teams ? '' : `
      <select data-ro="team" data-pid="${esc(pid)}" title="${t('mpTeamName')}" style="${INPUT}width:96px;${p.teamId ? '' : 'border-color:var(--amber);'}">
        <option value=""${p.teamId ? '' : ' selected'}>—</option>
        ${teams.map(tm => `<option value="${esc(tm.id)}"${p.teamId === tm.id ? ' selected' : ''}>${esc(tm.label)}</option>`).join('')}
      </select>`;
  const row = ([pid, p]) => {
    const guest = !p.userId && String(pid).startsWith('p_');
    const added = addedAtText(p.addedAt);
    return `
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;">
      <span style="flex:1;min-width:130px;font-size:0.85rem;">
        <b>${esc(p.name || pid)}</b>
        ${guest ? ` <span class="pill-soft" style="font-size:0.62rem;">✍</span>` : ''}
        ${opts.badgesHTML ? opts.badgesHTML(pid, p) : ''}
        ${added ? `<span style="display:block;font-size:0.66rem;color:var(--text-secondary);margin-top:1px;">${t('spAddedAt')}: ${esc(added)}</span>` : ''}
      </span>
      ${teamSelect(pid, p)}
      ${opts.cellsHTML ? opts.cellsHTML(pid, p) : ''}
      <button data-ro="del" data-pid="${esc(pid)}" class="btn btn-outline-danger btn-sm">✕</button>
    </div>`;
  };
  return `
        <!-- Adding comes first: a 72-player roster put these controls a full
             screen of scrolling below the list, so adding one more player
             meant scrolling past everyone already on it. -->
        ${teams ? `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <span style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;">${t('mpTeamName')}:</span>
          ${teams.map(tm => `
          <button data-ro="team-pick" data-team="${esc(tm.id)}" type="button"
            class="seg-chip${pickTeam === tm.id ? ' active' : ''}" style="flex:0 0 auto;padding:6px 10px;font-size:0.76rem;">${esc(tm.label)}</button>`).join('')}
        </div>` : ''}
        <div style="position:relative;">
          <input data-ro="pick" placeholder="🔍 ${t('mpTypeName')}" autocomplete="off"
            style="${INPUT}width:100%;box-sizing:border-box;" />
          <div data-ro="pick-list" hidden style="position:absolute;left:0;right:0;top:100%;margin-top:3px;z-index:30;
            max-height:220px;overflow-y:auto;border:1px solid var(--border-color);
            background:var(--bg-card);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.25);"></div>
        </div>
        ${opts.manual ? `
        <input data-ro="manual" placeholder="✍ ${t('spAddManual')}"
          style="${INPUT}width:100%;box-sizing:border-box;margin-top:6px;" />` : ''}
        <button data-ro="add-all" class="btn btn-outline btn-sm" style="width:100%;margin-top:6px;font-size:0.76rem;">
          👥 ${t('spAddAll')}
        </button>
        ${opts.extraHTML || ''}
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-color);">
          ${rows.map(row).join('')
            || `<p style="font-size:0.78rem;color:var(--text-secondary);margin:0;">${esc(opts.emptyText || t('spNoPlayers'))}</p>`}
        </div>`;
}

export function wireRoster(host, opts) {
  const users = opts.users || [];
  const entries = () => opts.entries() || {};
  const teamExtra = () => (opts.teams && opts.teamPick ? { teamId: opts.teamPick.get() || opts.teams[0]?.id } : {});

  host.querySelectorAll('button[data-ro="team-pick"]').forEach(b => b.onclick = () => {
    opts.teamPick?.set(b.dataset.team);
    host.querySelectorAll('button[data-ro="team-pick"]').forEach(x => x.classList.toggle('active', x === b));
  });

  host.querySelectorAll('select[data-ro="team"]').forEach(sel => sel.onchange = () => {
    opts.patch(sel.dataset.pid, { teamId: sel.value || null });
    opts.markDirty();
    // The amber edge marks the unassigned; the toggle is cheaper than a repaint.
    sel.style.borderColor = sel.value ? '' : 'var(--amber)';
  });

  host.querySelectorAll('button[data-ro="del"]').forEach(b => b.onclick = () => {
    if (opts.remove(b.dataset.pid) === false) return;
    opts.repaint();
  });

  // The whole membership in one tap — every active member not already on
  // the roster. Names come through memberName so they read first-name-first.
  // Filed under no team: a cup's admin places them afterwards.
  const addAll = host.querySelector('button[data-ro="add-all"]');
  if (addAll) addAll.onclick = () => {
    const adds = candidates(users, entries()).filter(u => u.status !== 'hold');
    if (!adds.length) { opts.showToast?.(t('spAddAllNone'), 'info'); return; }
    if (!confirm(`${adds.length} ${t('spAddAllConfirm')}`)) return;
    adds.forEach(u => opts.add(u.id, memberEntry(u, opts.enrich ? opts.enrich(u) : {})));
    opts.repaint();
  };

  // A guest (non-member): type a name, press Enter.
  const manual = host.querySelector('input[data-ro="manual"]');
  if (manual) manual.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const name = manual.value.trim();
    if (!name) return;
    const pid = `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    opts.add(pid, { name, addedAt: Date.now(), ...teamExtra() });
    opts.repaint();
  };

  // Member picker — the same type-to-search the match play editor uses.
  const inp = host.querySelector('input[data-ro="pick"]');
  const list = host.querySelector('[data-ro="pick-list"]');
  if (!inp || !list) return;

  const show = () => {
    const q = inp.value.trim().toLowerCase();
    const all = candidates(users, entries()).map(u => {
      const label = store.memberName(u);
      return { id: u.id, label, sub: u.username && u.username !== label ? u.username : '' };
    });
    const hits = q ? all.filter(c => `${c.label} ${c.sub}`.toLowerCase().includes(q)) : all;
    list.innerHTML = hits.length
      ? hits.slice(0, 60).map(c => `
        <div data-ro-id="${esc(c.id)}" style="padding:8px 10px;cursor:pointer;font-size:0.82rem;border-bottom:1px solid var(--border-color);">
          ${esc(c.label)}${c.sub ? ` <span style="color:var(--text-muted);font-size:0.72rem;">${esc(c.sub)}</span>` : ''}
        </div>`).join('')
      : `<div style="padding:8px 10px;font-size:0.78rem;color:var(--text-muted);">${t('mpNoneFound')}</div>`;
    list.hidden = false;
    list.querySelectorAll('[data-ro-id]').forEach(item => {
      // pointerdown fires before the input's blur, so the pick wins.
      item.onpointerdown = (e) => {
        e.preventDefault();
        const u = users.find(x => x?.id === item.dataset.roId);
        if (!u) return;
        opts.add(u.id, memberEntry(u, { ...teamExtra(), ...(opts.enrich ? opts.enrich(u) : {}) }));
        opts.repaint();
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
}

// src/strokeplay-admin.js
// Admin setup for an in-app stroke play tournament: the player list and each
// player's HCP/status. Same discipline as matchplay-admin: edits live on a
// local draft (the tab re-rendering never loses typing), and saving writes
// one key per player — never the sp/scores subtree, so a save can't clobber
// a card being filled on the course.

import * as store from './store.js';
import { t } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:8px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);font-size:0.85rem;';

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

// tnId -> { players, dirty, removed } — survives tab re-renders, dropped on
// save/close so a stale snapshot can't overwrite newer work.
const drafts = new Map();

function draftFor(tn) {
  let d = drafts.get(tn.id);
  if (!d || !d.dirty) {
    d = { players: clone(tn.sp?.players) || {}, dirty: false, removed: new Set() };
    drafts.set(tn.id, d);
  }
  return d;
}

export function discardSpDraft(tnId) { drafts.delete(tnId); }

// ---- Rendering ----

function rowHTML(tn, pid, p) {
  const scored = !!Object.keys(tn.sp?.scores?.[pid] || {}).length;
  return `
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;">
      <span style="flex:1;min-width:130px;font-size:0.85rem;">
        <b>${esc(p.name || pid)}</b>
        ${p.userId || !pid.startsWith('p_') ? '' : ` <span class="pill-soft" style="font-size:0.62rem;">✍</span>`}
        ${scored ? ` <span class="pill-soft" style="font-size:0.62rem;">⛳</span>` : ''}
      </span>
      <input data-sp="hcp" data-pid="${esc(pid)}" type="number" step="1" min="0" max="54"
        value="${esc(p.hcp ?? '')}" placeholder="${t('spHcp')}" title="${t('spHcp')}" style="${INPUT}width:74px;" />
      <select data-sp="status" data-pid="${esc(pid)}" style="${INPUT}width:80px;">
        ${['', 'WD', 'DQ'].map(s => `<option value="${s}"${(p.status || '') === s ? ' selected' : ''}>${s || '—'}</option>`).join('')}
      </select>
      <a href="#/spscore/${esc(tn.id)}/${esc(pid)}" class="btn btn-outline btn-sm" style="font-size:0.72rem;">${t('spScorecard')}</a>
      <button data-sp="del" data-pid="${esc(pid)}" class="btn btn-outline-danger btn-sm">✕</button>
    </div>`;
}

function sectionHTML(tn, users) {
  const d = draftFor(tn);
  const rows = Object.entries(d.players)
    .filter(([, p]) => p)
    .sort((a, b) => String(a[1].name || '').localeCompare(String(b[1].name || '')));
  return `
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color);">
      <h4 style="margin:0 0 8px;">${t('spPlayers')} — ${rows.length}</h4>
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
      <button data-sp="save" class="btn ${d.dirty ? 'btn-primary' : 'btn-outline'} btn-sm" style="margin-top:12px;">
        ${t('mpSave')}${d.dirty ? ' *' : ''}
      </button>
    </div>`;
}

// ---- Saving ----

async function saveDraft(tn, ctx) {
  const d = draftFor(tn);
  const patch = {};
  Object.entries(d.players).forEach(([pid, p]) => {
    if (!p) return;
    const rec = { name: p.name || '' };
    if (p.userId) rec.userId = p.userId;
    if (p.hcp !== '' && p.hcp !== null && p.hcp !== undefined && !isNaN(Number(p.hcp))) rec.hcp = Number(p.hcp);
    if (p.status) rec.status = p.status;
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
    d.removed.add(pid);
    d.dirty = true;
    paint(host, tn, ctx);
  });

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
        d.players[item.dataset.spId] = { name: item.dataset.spName, userId: item.dataset.spId };
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

/** Render the stroke play player section into `host`. */
export function mountSpAdmin(host, tn, ctx) {
  if (!host || !tn) return;
  paint(host, tn, ctx);
}

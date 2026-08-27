// src/tournament-wizard.js
// Squabbit-style tournament creation: five small steps instead of one form
// that asks stroke play questions of a match play tournament. The type is
// chosen SECOND, and everything after it only shows what that type actually
// uses — PAR, rounds, the cut and the scoring sheet mean nothing in match
// play, where days and sessions replace rounds and only hole winners score.
//
// Same shape as the other admin modules: mounted into a host div, edits live
// on a module-level draft so the tab re-rendering never loses typing, and
// nothing is written until the final step's create button.

import * as store from './store.js';
import { t } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:9px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);width:100%;';
const LABEL = 'font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin:0 0 3px;';

const STEPS = 5;

const blank = () => ({
  step: 1,
  name: '', format: '',
  startDate: '', endDate: '', venue: '', city: '',
  rounds: '', currentRound: '', par: '', cutAfterRound: '', cutSize: '',
  sheetUrl: '', sheetTab: '',
  teamAName: '', teamAShort: '', teamBName: '', teamBShort: ''
});

let draft = blank();

export function resetTnWizard() { draft = blank(); }

// ---- Steps ----

function dotsHTML() {
  return `
    <div style="display:flex;gap:6px;justify-content:center;margin-bottom:14px;">
      ${Array.from({ length: STEPS }, (_, i) => `
        <span style="width:8px;height:8px;border-radius:50%;
          background:${i + 1 <= draft.step ? 'var(--gold,#DD8910)' : 'var(--border-color)'};"></span>`).join('')}
    </div>`;
}

const field = (label, inner) => `<div><span style="${LABEL}">${label}</span>${inner}</div>`;
const input = (key, type, placeholder = '') =>
  `<input data-wz="${key}" type="${type}" value="${esc(draft[key])}" placeholder="${esc(placeholder)}" style="${INPUT}" />`;

function stepHTML() {
  if (draft.step === 1) {
    return `
      <h4 style="margin:0 0 10px;">${t('wzName')}</h4>
      ${input('name', 'text', t('tnFName'))}`;
  }

  if (draft.step === 2) {
    const card = (value, icon, title, desc) => `
      <button data-wz-type="${value}" style="flex:1;min-width:200px;text-align:left;cursor:pointer;
        padding:14px;border-radius:12px;font-family:var(--font);color:var(--text-primary);
        background:${draft.format === value ? 'var(--bg-card-hover)' : 'var(--bg-color)'};
        border:2px solid ${draft.format === value ? 'var(--gold,#DD8910)' : 'var(--border-color)'};">
        <div style="font-size:1.4rem;">${icon}</div>
        <div style="font-weight:800;margin-top:6px;">${title}</div>
        <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:4px;line-height:1.45;">${desc}</div>
      </button>`;
    return `
      <h4 style="margin:0 0 10px;">${t('wzType')}</h4>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${card('stroke', '⛳', t('wzTypeStroke'), t('wzTypeStrokeDesc'))}
        ${card('match', '🏆', t('wzTypeMatch'), t('wzTypeMatchDesc'))}
      </div>`;
  }

  if (draft.step === 3) {
    return `
      <h4 style="margin:0 0 10px;">${t('wzWhenWhere')}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
        ${field(t('date'), input('startDate', 'date'))}
        ${field(t('tnFEnd'), input('endDate', 'date'))}
        ${field(t('tnFVenue'), input('venue', 'text'))}
        ${field(t('tnFCity'), input('city', 'text'))}
      </div>`;
  }

  if (draft.step === 4) {
    if (draft.format === 'match') {
      return `
        <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;">
          ${field(`${t('mpTeamName')} A`, input('teamAName', 'text', 'Altai Eagles'))}
          ${field(t('mpTeamShort'), input('teamAShort', 'text', 'ALTAI'))}
          ${field(`${t('mpTeamName')} B`, input('teamBName', 'text', 'Wellcom Diesels'))}
          ${field(t('mpTeamShort'), input('teamBShort', 'text', 'WELLCOM'))}
        </div>
        <p style="margin:10px 0 0;font-size:0.76rem;color:var(--text-secondary);">${t('wzMatchHint')}</p>`;
    }
    return `
      <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
        ${field(t('tnFRounds'), input('rounds', 'number'))}
        ${field(t('tnFCurrentRound'), input('currentRound', 'number'))}
        ${field(t('tnFPar'), input('par', 'number'))}
        ${field(t('tnFCutAfter'), input('cutAfterRound', 'number'))}
        ${field(t('tnFCutSize'), input('cutSize', 'number'))}
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-top:8px;">
        ${field(t('tnFSheetUrl'), input('sheetUrl', 'url'))}
        ${field(t('tnFSheetTab'), input('sheetTab', 'text'))}
      </div>
      <p style="margin:6px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('tnFSheetHint')}</p>`;
  }

  // Step 5 — summary.
  const line = (k, v) => (v ? `
    <div style="display:flex;gap:10px;font-size:0.84rem;margin-top:5px;">
      <span style="color:var(--text-secondary);min-width:90px;">${k}</span><b>${esc(v)}</b>
    </div>` : '');
  return `
    <h4 style="margin:0 0 10px;">${t('wzSummary')}</h4>
    ${line(t('tnFName'), draft.name)}
    ${line(t('wzType'), draft.format === 'match' ? t('wzTypeMatch') : t('wzTypeStroke'))}
    ${line(t('date'), [draft.startDate, draft.endDate].filter(Boolean).join(' — '))}
    ${line(t('tnFVenue'), [draft.venue, draft.city].filter(Boolean).join(' · '))}
    ${draft.format === 'match'
      ? line(t('mpTeamName'), [draft.teamAName || 'A', draft.teamBName || 'B'].join(' vs '))
      : line(t('tnFPar'), draft.par)}`;
}

// A step's gate: what must be filled before Үргэлжлүүлэх works.
function stepValid() {
  if (draft.step === 1) return !!draft.name.trim();
  if (draft.step === 2) return draft.format === 'stroke' || draft.format === 'match';
  return true;
}

// ---- Create ----

async function create(ctx) {
  const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
  const data = {
    name: draft.name.trim(),
    format: draft.format,
    startDate: draft.startDate, endDate: draft.endDate,
    venue: draft.venue.trim(), city: draft.city.trim(),
    entries: [],
    createdAt: Date.now()
  };
  if (draft.format === 'match') {
    data.mp = {
      teams: {
        a: { name: draft.teamAName.trim(), short: draft.teamAShort.trim(), color: '' },
        b: { name: draft.teamBName.trim(), short: draft.teamBShort.trim(), color: '' }
      }
    };
  } else {
    Object.assign(data, {
      rounds: num(draft.rounds), currentRound: num(draft.currentRound),
      par: num(draft.par), cutAfterRound: num(draft.cutAfterRound), cutSize: num(draft.cutSize),
      sheetUrl: draft.sheetUrl.trim(), sheetTab: draft.sheetTab.trim()
    });
  }
  const id = await store.saveTournament(data);
  resetTnWizard();
  return { id, data };
}

// ---- Mount ----

export function mountTnWizard(host, ctx) {
  if (!host) return;
  paint(host, ctx);
}

function paint(host, ctx) {
  host.innerHTML = `
    ${dotsHTML()}
    ${stepHTML()}
    <div style="display:flex;gap:8px;margin-top:14px;">
      ${draft.step > 1 ? `<button data-wz-nav="back" class="btn btn-outline btn-sm">${t('wzBack')}</button>` : ''}
      <button data-wz-nav="${draft.step === STEPS ? 'create' : 'next'}"
        class="btn btn-primary btn-sm" style="margin-left:auto;" ${stepValid() ? '' : 'disabled'}>
        ${draft.step === STEPS ? t('wzCreate') : t('wzNext')}
      </button>
    </div>`;

  host.querySelectorAll('input[data-wz]').forEach(inp => {
    inp.oninput = () => {
      draft[inp.dataset.wz] = inp.value;
      // Only the gate button reacts while typing; repainting would drop focus.
      const btn = host.querySelector('button[data-wz-nav="next"], button[data-wz-nav="create"]');
      if (btn) btn.disabled = !stepValid();
    };
  });

  host.querySelectorAll('button[data-wz-type]').forEach(b => b.onclick = () => {
    draft.format = b.dataset.wzType;
    paint(host, ctx);
  });

  host.querySelectorAll('button[data-wz-nav]').forEach(b => b.onclick = async () => {
    const nav = b.dataset.wzNav;
    if (nav === 'back') { draft.step--; paint(host, ctx); return; }
    if (!stepValid()) return;
    if (nav === 'next') { draft.step++; paint(host, ctx); return; }
    b.disabled = true;
    try {
      const { id, data } = await create(ctx);
      ctx.showToast?.('✅ ' + t('tnCreated'), 'success');
      ctx.onCreated?.(id, data);
    } catch (err) {
      console.error('[tn-wizard]', err);
      b.disabled = false;
      ctx.showToast?.('⚠️ ' + (err?.message || t('tnErrSave')), 'error');
    }
  });
}

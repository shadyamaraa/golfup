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
import { ryderRulesHTML, matchRulesHTML } from './mcup-rules.js';
import { COURSES, courseByKey } from './strokeplay.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:9px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);width:100%;';
const LABEL = 'font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin:0 0 3px;';

const STEPS = 5;

const blank = () => ({
  step: 1,
  name: '', format: '',
  startDate: '', endDate: '', venue: '', city: '',
  course: '', rounds: '1', par: '72', cutAfterRound: '', cutSize: '',
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
      <button data-wz-type="${value}" style="flex:1;min-width:160px;text-align:left;cursor:pointer;
        padding:14px;border-radius:12px;font-family:var(--font);color:var(--text-primary);
        background:${draft.format === value ? 'var(--bg-card-hover)' : 'var(--bg-color)'};
        border:2px solid ${draft.format === value ? 'var(--gold,#DD8910)' : 'var(--border-color)'};">
        <div style="font-size:1.4rem;">${icon}</div>
        <div style="font-weight:800;margin-top:6px;">${title}</div>
        <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:4px;line-height:1.45;">${desc}</div>
      </button>`;
    // The two match play kinds carry their rulebook right here, so the choice
    // between plain match play and the Ryder Cup rules is made informed.
    const rules = draft.format === 'ryder' ? ryderRulesHTML()
      : draft.format === 'match' ? matchRulesHTML() : '';
    return `
      <h4 style="margin:0 0 10px;">${t('wzType')}</h4>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${card('stroke', '⛳', t('wzTypeStroke'), t('wzTypeStrokeDesc'))}
        ${card('match', '🎯', t('wzTypeMatch'), t('wzTypeMatchDesc'))}
        ${card('ryder', '🏆', t('wzTypeRyder'), t('wzTypeRyderDesc'))}
      </div>
      ${rules ? `
        <details style="margin-top:10px;">
          <summary style="font-size:0.78rem;font-weight:700;cursor:pointer;color:var(--text-secondary);">📖 ${t('wzRules')}</summary>
          ${rules}
        </details>` : ''}`;
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
    if (draft.format === 'ryder') {
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
    if (draft.format === 'match') {
      // Plain match play has no up-front settings — participants and the
      // match list are built in the editor once the tournament exists.
      return `
        <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
        <p style="margin:0;font-size:0.8rem;color:var(--text-secondary);">${t('wzMatchHint')}</p>`;
    }
    // Stroke play: pick the course (venue, city and PAR fill themselves),
    // pick the round count, decide the cut. No free-number guessing, and no
    // scoring sheet — scores are entered in the app.
    const select = (key, options) => `
      <select data-wz="${key}" style="${INPUT}">
        ${options.map(([v, label]) => `<option value="${esc(v)}"${String(draft[key]) === String(v) ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>`;
    const rounds = Number(draft.rounds) || 1;
    const cutOptions = [['', t('spCutNone')],
      ...Array.from({ length: Math.max(0, rounds - 1) }, (_, i) => [String(i + 1), `R${i + 1} ${t('spCutAfterR')}`])];
    return `
      <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
        ${field(t('spCourse'), select('course', [
          ...COURSES.map(c => [c.key, `${c.name} · PAR ${c.par}`]),
          ['', t('spCourseCustom')]
        ]))}
        ${field(t('tnFPar'), input('par', 'number'))}
        ${field(t('tnFRounds'), select('rounds', [1, 2, 3, 4].map(n => [String(n), String(n)])))}
        ${field(t('tnFCutAfter'), select('cutAfterRound', cutOptions))}
        ${draft.cutAfterRound ? field(t('tnFCutSize'), input('cutSize', 'number')) : ''}
      </div>
      <p style="margin:8px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('spWizardHint')}</p>`;
  }

  // Step 5 — summary.
  const line = (k, v) => (v ? `
    <div style="display:flex;gap:10px;font-size:0.84rem;margin-top:5px;">
      <span style="color:var(--text-secondary);min-width:90px;">${k}</span><b>${esc(v)}</b>
    </div>` : '');
  return `
    <h4 style="margin:0 0 10px;">${t('wzSummary')}</h4>
    ${line(t('tnFName'), draft.name)}
    ${line(t('wzType'), { stroke: t('wzTypeStroke'), match: t('wzTypeMatch'), ryder: t('wzTypeRyder') }[draft.format] || '')}
    ${line(t('date'), [draft.startDate, draft.endDate].filter(Boolean).join(' — '))}
    ${line(t('tnFVenue'), [draft.venue, draft.city].filter(Boolean).join(' · '))}
    ${draft.format === 'ryder'
      ? line(t('mpTeamName'), [draft.teamAName || 'A', draft.teamBName || 'B'].join(' vs '))
      : draft.format === 'stroke'
        ? line(t('spCourse'), courseByKey(draft.course)?.name || draft.venue || '—')
          + line(t('tnFRounds'), draft.rounds)
          + line(t('tnFPar'), draft.par)
        : ''}`;
}

// A step's gate: what must be filled before Үргэлжлүүлэх works.
function stepValid() {
  if (draft.step === 1) return !!draft.name.trim();
  if (draft.step === 2) return ['stroke', 'match', 'ryder'].includes(draft.format);
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
  if (draft.format === 'ryder') {
    data.mp = {
      teams: {
        a: { name: draft.teamAName.trim(), short: draft.teamAShort.trim(), color: '' },
        b: { name: draft.teamBName.trim(), short: draft.teamBShort.trim(), color: '' }
      }
    };
  } else if (draft.format === 'match') {
    // Participants and matches are added in the editor; nothing to seed.
  } else {
    // Scores are entered in the app (sp node); the round being played starts
    // at 1 and the admin advances it from the editor.
    Object.assign(data, {
      course: draft.course,
      rounds: num(draft.rounds) || 1, currentRound: 1,
      par: num(draft.par) || 72,
      cutAfterRound: num(draft.cutAfterRound), cutSize: num(draft.cutSize)
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

  host.querySelectorAll('select[data-wz]').forEach(sel => {
    sel.onchange = () => {
      draft[sel.dataset.wz] = sel.value;
      // Picking a course fills PAR, venue and city in one go (typed values
      // are respected — only blanks are filled). Round count reshapes the
      // cut options, so both repaint; a select loses nothing to that.
      if (sel.dataset.wz === 'course') {
        const c = courseByKey(sel.value);
        if (c) {
          draft.par = String(c.par);
          if (!draft.venue.trim()) draft.venue = c.name;
          if (!draft.city.trim()) draft.city = c.city;
        }
      }
      if (sel.dataset.wz === 'rounds'
        && Number(draft.cutAfterRound) >= Number(draft.rounds || 1)) {
        draft.cutAfterRound = '';
      }
      paint(host, ctx);
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

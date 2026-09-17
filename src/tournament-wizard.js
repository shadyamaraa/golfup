// src/tournament-wizard.js
// Squabbit-style tournament creation: five small steps instead of one form
// that asks stroke play questions of a match play tournament. The type is
// chosen SECOND. What every tournament shares — the name, the dates, the
// course and its tee, the crest — is asked of every type in the same words;
// only the fourth step turns on the type, and there each type gets the
// whole of what it needs: rounds and the cut for stroke play, the two teams
// and the session plan for a cup, the match count for a singles draw. A cup
// leaves here with its draw laid out — sessions, matches, tee times — so
// its page opens as a Match Center at once, and the admin has only the
// roster and the lineups left to pick.
//
// Same shape as the other admin modules: mounted into a host div, edits live
// on a module-level draft so the tab re-rendering never loses typing, and
// nothing is written until the final step's create button.

import * as store from './store.js';
import { t } from './i18n.js';
import { ryderRulesHTML, matchRulesHTML, scrambleRulesHTML, fourballRulesHTML, foursomesRulesHTML } from './mcup-rules.js';

// The 2 v 2 tournament types, all on the stroke play rails.
const TEAM_TYPES = ['scramble', 'fourball', 'foursome'];
import { COURSES, courseByKey } from './strokeplay.js';
import { readImageFile, validImageData } from './media.js';
import { courseTees } from './courses.js';
import { FORMATS, TEAM_COLORS, mpTemplate } from './matchplay.js';
import { rosterHTML, wireRoster } from './roster-admin.js';
import { whsHcp, profileDivision } from './strokeplay-admin.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const INPUT = 'padding:9px;border-radius:7px;border:1px solid var(--border-color);background:var(--bg-color);color:var(--text-primary);font-family:var(--font);width:100%;';
const LABEL = 'font-size:0.72rem;color:var(--text-secondary);font-weight:700;display:block;margin:0 0 3px;';

const STEPS = 6;

// The cup's draw as the club plays it — M Cup 2026's own layout. A row per
// session: the day, the format, how many matches, when the first tees off.
// The admin edits the rows in step 4; mpTemplate() turns them into sessions
// and matches on create.
const M_CUP_PLAN = () => [
  { day: 1, format: 'FOURSOMES', matches: 6, startTime: '09:30' },
  { day: 1, format: 'FOURBALL', matches: 6, startTime: '14:00' },
  { day: 2, format: 'SINGLES', matches: 12, startTime: '10:00' }
];

const blank = () => ({
  step: 1,
  name: '', format: '', logo: null,
  startDate: '', endDate: '', venue: '', city: '',
  course: '', tee: '', par: '72',
  rounds: '1', spScoring: 'strokes', cutAfterRound: '', cutSize: '',
  spDivisions: '', womenTee: '',
  spTeamSize: '4', spTeamRank: 'board',
  teamAName: '', teamAShort: '', teamAColor: TEAM_COLORS.a,
  teamBName: '', teamBShort: '', teamBColor: TEAM_COLORS.b,
  mpPlan: M_CUP_PLAN(),
  // A singles draw: how many matches to lay out, and when the first goes.
  mpSingles: '8', mpSinglesStart: '',
  // Who is in — optional here, the editor has the same list. Entries in the
  // one roster shape; a cup's carry the team they were filed under.
  roster: {}, teamPick: 'a'
});

// The members, for the roster step's picker: loaded once, on first need.
let wizUsers = null;
let wizUsersLoading = null;

let draft = blank();

export function resetTnWizard() { draft = blank(); }

const validColor = (c, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? c : fallback);

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
const select = (key, options) => `
      <select data-wz="${key}" style="${INPUT}">
        ${options.map(([v, label]) => `<option value="${esc(v)}"${String(draft[key]) === String(v) ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>`;
const teeLabel = (x) => `${x.label} · ${x.rating}/${x.slope}`;

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
      : draft.format === 'match' ? matchRulesHTML()
        : draft.format === 'scramble' ? scrambleRulesHTML()
          : draft.format === 'fourball' ? fourballRulesHTML()
            : draft.format === 'foursome' ? foursomesRulesHTML() : '';
    return `
      <h4 style="margin:0 0 10px;">${t('wzType')}</h4>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        ${card('stroke', '⛳', t('wzTypeStroke'), t('wzTypeStrokeDesc'))}
        ${card('scramble', '🤝', t('wzTypeScramble'), t('wzTypeScrambleDesc'))}
        ${card('fourball', '🏌️', t('wzTypeFourball'), t('wzTypeFourballDesc'))}
        ${card('foursome', '🔁', t('wzTypeFoursome'), t('wzTypeFoursomeDesc'))}
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
    // Where and when, for every type alike: the course decides the venue,
    // the city and PAR (typed values are respected), and the tee its rating
    // and slope — what the WHS course handicap and posted differentials
    // need. Match play never scores against PAR, but a cup is played on a
    // course too, and its print pages and share cards name it.
    const tees = courseTees(draft.course);
    return `
      <h4 style="margin:0 0 10px;">${t('wzWhenWhere')}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
        ${field(t('date'), input('startDate', 'date'))}
        ${field(t('tnFEnd'), input('endDate', 'date'))}
        ${field(t('spCourse'), select('course', [
          ...COURSES.map(c => [c.key, `${c.name} · PAR ${c.par}`]),
          ['', t('spCourseCustom')]
        ]))}
        ${tees.length ? field(t('spTee'), select('tee', [['', '—'], ...tees.map(x => [x.key, teeLabel(x)])])) : ''}
        ${field(t('tnFVenue'), input('venue', 'text'))}
        ${field(t('tnFCity'), input('city', 'text'))}
        ${field(t('tnFPar'), input('par', 'number'))}
      </div>
      <p style="margin:8px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('wzCourseHint')}</p>
      <div style="margin-top:10px;">
        <span style="display:block;font-size:0.72rem;color:var(--text-secondary);margin-bottom:5px;">${t('tnLogoLabel')}</span>
        <div style="display:flex;gap:8px;align-items:center;">
          ${draft.logo
            ? `<span style="display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px;padding:4px;">
                 <img src="${draft.logo}" alt="" style="max-height:40px;max-width:90px;object-fit:contain;display:block;" /></span>`
            : `<span style="font-size:0.74rem;color:var(--text-muted);">—</span>`}
          <button type="button" data-wz-logo="pick" class="btn btn-outline btn-sm">${draft.logo ? t('mpLogoChange') : t('mpLogoUpload')}</button>
          ${draft.logo ? `<button type="button" data-wz-logo="clear" class="btn btn-outline-danger btn-sm">✕</button>` : ''}
          <input data-wz-logo-input type="file" accept="image/*" style="display:none;" />
        </div>
      </div>`;
  }

  if (draft.step === 4) {
    if (draft.format === 'ryder') return ryderStepHTML();
    if (draft.format === 'match') return singlesStepHTML();
    return strokeStepHTML();
  }

  if (draft.step === 5) return rosterStepHTML();

  return summaryHTML();
}

// The roster editor every type shares (roster-admin.js), over the draft:
// pick now or leave it to the editor. A cup files each pick under the team
// the toggle shows; a stroke event's picks arrive with their handicap on
// this tee and, with divisions on, the division their profile says.
function rosterOpts() {
  const isMatch = draft.format === 'ryder' || draft.format === 'match';
  const tnLike = { par: draft.par, rating: courseTees(draft.course).find(x => x.key === draft.tee)?.rating ?? null,
    slope: courseTees(draft.course).find(x => x.key === draft.tee)?.slope ?? null, spDivisions: draft.spDivisions };
  return {
    users: wizUsers || [],
    entries: () => draft.roster,
    manual: !isMatch,
    teams: draft.format === 'ryder'
      ? [['a', draft.teamAShort || draft.teamAName || 'A'], ['b', draft.teamBShort || draft.teamBName || 'B']].map(([id, label]) => ({ id, label }))
      : null,
    teamPick: { get: () => draft.teamPick, set: (v) => { draft.teamPick = v; } },
    enrich: isMatch ? undefined : (u) => {
      const division = profileDivision(u, tnLike);
      const hcp = whsHcp(u, tnLike, division);
      return { ...(hcp !== null ? { hcp } : {}), ...(division ? { division } : {}) };
    },
    add: (pid, entry) => { draft.roster[pid] = entry; },
    remove: (pid) => { delete draft.roster[pid]; return true; },
    patch: (pid, ch) => { if (draft.roster[pid]) Object.assign(draft.roster[pid], ch); },
    markDirty: () => {}
  };
}

function rosterStepHTML() {
  const n = Object.keys(draft.roster).length;
  return `
    <h4 style="margin:0 0 10px;">${t('mpParticipants')}${n ? ` — ${n}` : ''}</h4>
    ${wizUsers ? rosterHTML(rosterOpts()) : `<div class="loading-spinner"></div>`}
    <p style="margin:10px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('wzRosterHint')}</p>`;
}

// The cup: its two teams — name, short, colour, the way the editor's team
// boxes have them — and the session plan, one row per session.
function ryderStepHTML() {
  const team = (k, name, short, color, ph) => `
    <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end;">
      ${field(`${t('mpTeamName')} ${k}`, input(name, 'text', ph[0]))}
      ${field(t('mpTeamShort'), input(short, 'text', ph[1]))}
      ${field(t('mpTeamColor'), `<input data-wz="${color}" type="color" value="${esc(draft[color])}"
        style="width:44px;height:38px;padding:0;border:1px solid var(--border-color);border-radius:7px;background:none;cursor:pointer;" />`)}
    </div>`;
  // The format column gets the room: FOURSOMES has to read whole on a phone.
  const planGrid = 'display:grid;grid-template-columns:44px 1fr 56px 78px 30px;gap:5px;align-items:center;';
  const row = (r, i) => `
    <div style="${planGrid}margin-top:6px;">
      <input data-wz-plan="${i}" data-f="day" type="number" min="1" max="9" value="${esc(r.day)}" style="${INPUT}padding:7px;" />
      <select data-wz-plan="${i}" data-f="format" style="${INPUT}padding:7px;">
        ${FORMATS.map(f => `<option value="${f}"${r.format === f ? ' selected' : ''}>${f}</option>`).join('')}
      </select>
      <input data-wz-plan="${i}" data-f="matches" type="number" min="1" max="30" value="${esc(r.matches)}" style="${INPUT}padding:7px;" />
      <input data-wz-plan="${i}" data-f="startTime" type="time" value="${esc(r.startTime)}" style="${INPUT}padding:7px;" />
      <button type="button" data-wz-plan-del="${i}" class="btn btn-outline-danger btn-sm" style="padding:4px 6px;">✕</button>
    </div>`;
  return `
    <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
    ${team('A', 'teamAName', 'teamAShort', 'teamAColor', ['Altai Eagles', 'ALTAI'])}
    <div style="height:8px;"></div>
    ${team('B', 'teamBName', 'teamBShort', 'teamBColor', ['Wellcom Diesels', 'WELLCOM'])}
    <div style="margin-top:14px;">
      <span style="${LABEL}">${t('wzPlan')}</span>
      <div style="${planGrid}font-size:0.6rem;font-weight:700;color:var(--text-muted);white-space:nowrap;">
        <span>${t('mpDay')}</span><span>${t('mpFormat')}</span><span>${t('wzPlanMatches')}</span><span>${t('mpStart')}</span><span></span>
      </div>
      ${draft.mpPlan.map(row).join('')}
      <button type="button" data-wz-plan-add class="btn btn-outline btn-sm" style="margin-top:8px;">+ ${t('mpAddSession')}</button>
    </div>
    <p style="margin:10px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('wzPlanHint')}</p>`;
}

// A singles draw: how many matches, and when the first tees off.
function singlesStepHTML() {
  return `
    <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
      ${field(t('wzPlanMatches'), `<input data-wz="mpSingles" type="number" min="1" max="64" value="${esc(draft.mpSingles)}" style="${INPUT}" />`)}
      ${field(t('mpStart'), input('mpSinglesStart', 'time'))}
    </div>
    <p style="margin:10px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('wzSinglesHint')}</p>`;
}

// Stroke play: the round count, the cut, the scoring sheet's rules, the
// divisions — and for a team type the two choices that shape its teams.
function strokeStepHTML() {
  const rounds = Number(draft.rounds) || 1;
  const cutOptions = [['', t('spCutNone')],
    ...Array.from({ length: Math.max(0, rounds - 1) }, (_, i) => [String(i + 1), `R${i + 1} ${t('spCutAfterR')}`])];
  const tees = courseTees(draft.course);
  return `
    <h4 style="margin:0 0 10px;">${t('wzTypeSettings')}</h4>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">
      ${field(t('tnFRounds'), select('rounds', [1, 2, 3, 4].map(n => [String(n), String(n)])))}
      ${field(t('spScoring'), select('spScoring', [
        ['strokes', t('spScoringStrokes')],
        ['stableford', t('spScoringStableford')]
      ]))}
      ${field(t('tnFCutAfter'), select('cutAfterRound', cutOptions))}
      ${draft.cutAfterRound ? field(t('tnFCutSize'), input('cutSize', 'number')) : ''}
      ${field(t('spDivisions'), select('spDivisions', [
        ['', t('spDivisionsNone')],
        ['gender', t('spDivisionsGender')]
      ]))}
      ${draft.spDivisions === 'gender' && tees.length
        // The women's division plays its own tee — its own rating and
        // slope — the way the club already runs its ladies' events.
        ? field(t('spWomenTee'), select('womenTee', [['', t('spWomenTeeSame')], ...tees.map(x => [x.key, teeLabel(x)])]))
        : ''}
      ${draft.format === 'scramble' ? field(t('spTeamSize'), select('spTeamSize', [
        ['4', t('spTeamSize4')],
        ['2', t('spTeamSize2')]
      ])) : ''}
      ${(draft.format === 'scramble' && draft.spTeamSize === '2') || draft.format === 'fourball' || draft.format === 'foursome'
        ? field(t('spTeamRank'), select('spTeamRank', [
        ['board', t('spTeamRankBoard')],
        ['match', t('spTeamRankMatch')]
      ])) : ''}
    </div>
    <p style="margin:8px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('spWizardHint')}</p>
    ${draft.format === 'scramble' || draft.format === 'foursome'
      ? `<p style="margin:6px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('spTeamScoreHint')}</p>` : ''}
    ${draft.format === 'fourball'
      ? `<p style="margin:6px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('spFourballHint')}</p>` : ''}
    ${draft.spScoring === 'stableford'
      ? `<p style="margin:6px 0 0;font-size:0.74rem;color:var(--text-secondary);">${t('spStablefordHint')}</p>` : ''}`;
}

// Step 5 — one summary, the same lines for every type, then the type's own.
function summaryHTML() {
  const line = (k, v) => (v ? `
    <div style="display:flex;gap:10px;font-size:0.84rem;margin-top:5px;">
      <span style="color:var(--text-secondary);min-width:90px;">${k}</span><b>${esc(v)}</b>
    </div>` : '');
  const tee = courseTees(draft.course).find(v => v.key === draft.tee);
  const womenTee = courseTees(draft.course).find(v => v.key === draft.womenTee);
  const typeLabel = { stroke: t('wzTypeStroke'), scramble: t('wzTypeScramble'), fourball: t('wzTypeFourball'), foursome: t('wzTypeFoursome'), match: t('wzTypeMatch'), ryder: t('wzTypeRyder') }[draft.format] || '';
  const planRows = draft.mpPlan.filter(r => Number(r.matches) > 0);
  const planTotal = planRows.reduce((n, r) => n + (Math.floor(Number(r.matches)) || 0), 0);
  return `
    <h4 style="margin:0 0 10px;">${t('wzSummary')}</h4>
    ${line(t('tnFName'), draft.name)}
    ${line(t('wzType'), typeLabel)}
    ${line(t('date'), [draft.startDate, draft.endDate].filter(Boolean).join(' — '))}
    ${line(t('tnFVenue'), [draft.venue, draft.city].filter(Boolean).join(' · '))}
    ${line(t('spCourse'), courseByKey(draft.course)?.name || draft.venue || '—')}
    ${line(t('spTee'), tee ? teeLabel(tee) : '')}
    ${line(t('tnFPar'), draft.par)}
    ${draft.logo ? line(t('tnLogoLabel'), '✓') : ''}
    ${line(t('mpParticipants'), Object.keys(draft.roster).length ? String(Object.keys(draft.roster).length) : '')}
    ${draft.format === 'ryder'
      ? line(t('mpTeamName'), [draft.teamAName || 'A', draft.teamBName || 'B'].join(' vs '))
        + line(t('wzPlan'), `${planRows.length} session · ${planTotal} match`)
        + planRows.map(r => line(`${t('mpDay')} ${esc(r.day)}`, `${r.format} · ${r.matches} match${r.startTime ? ` · ${r.startTime}` : ''}`)).join('')
      : draft.format === 'match'
        ? line(t('wzPlanMatches'), `${Math.max(1, Math.floor(Number(draft.mpSingles)) || 1)}${draft.mpSinglesStart ? ` · ${draft.mpSinglesStart}` : ''}`)
        : (draft.spDivisions === 'gender'
          ? line(t('spDivisions'), t('spDivisionsGender'))
            + line(t('spWomenTee'), womenTee ? teeLabel(womenTee) : t('spWomenTeeSame'))
          : '')
          + line(t('tnFRounds'), draft.rounds)
          + line(t('spScoring'), draft.spScoring === 'stableford' ? t('spScoringStableford') : t('spScoringStrokes'))
          + (draft.cutAfterRound ? line(t('tnFCutAfter'), `R${draft.cutAfterRound}${draft.cutSize ? ` · ${draft.cutSize}` : ''}`) : '')
          + (draft.format === 'scramble'
            ? line(t('spTeamSize'), draft.spTeamSize === '2' ? t('spTeamSize2') : t('spTeamSize4')) : '')}`;
}

// A step's gate: what must be filled before Үргэлжлүүлэх works.
function stepValid() {
  if (draft.step === 1) return !!draft.name.trim();
  if (draft.step === 2) return ['stroke', 'scramble', 'fourball', 'foursome', 'match', 'ryder'].includes(draft.format);
  if (draft.step === 4 && draft.format === 'ryder') {
    // Two named teams and a draw with something in it — a cup with neither
    // would open as an empty Match Center.
    return !!draft.teamAName.trim() && !!draft.teamBName.trim()
      && draft.mpPlan.some(r => Math.floor(Number(r.matches)) >= 1);
  }
  if (draft.step === 4 && draft.format === 'match') return Math.floor(Number(draft.mpSingles)) >= 1;
  return true;
}

// ---- Create ----

// The record a draft becomes — pure, so a test can read what each type
// writes without a store. create() below is this plus the write.
export function tnWizardRecord(d) {
  const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
  const teeInfo = courseTees(d.course).find(x => x.key === d.tee) || null;
  const data = {
    name: d.name.trim(),
    format: d.format,
    startDate: d.startDate, endDate: d.endDate,
    venue: d.venue.trim(), city: d.city.trim(),
    ...(validImageData(d.logo) ? { logo: d.logo } : {}),
    // The course and its tee, for every type: rating and slope are what a
    // stroke play card posts against; a cup only names them.
    course: d.course,
    tee: teeInfo ? d.tee : null,
    rating: teeInfo?.rating ?? null,
    slope: teeInfo?.slope ?? null,
    par: num(d.par) || 72,
    entries: [],
    createdAt: Date.now()
  };
  if (d.format === 'ryder') {
    // The two teams as the editor's boxes hold them, and the draw laid out
    // from the plan — the editor reads both as if it had built them. The
    // roster and the lineups are the admin's, in the editor.
    const { sessions, matches } = mpTemplate(d.mpPlan);
    data.mp = {
      teams: {
        a: { name: d.teamAName.trim(), short: d.teamAShort.trim(), color: validColor(d.teamAColor, TEAM_COLORS.a) },
        b: { name: d.teamBName.trim(), short: d.teamBShort.trim(), color: validColor(d.teamBColor, TEAM_COLORS.b) }
      },
      sessions, matches
    };
  } else if (d.format === 'match') {
    // A flat singles list and nothing else: no teams, no sessions — an
    // empty teams node would make tnKind read the draw as a cup.
    const { matches } = mpTemplate(
      [{ matches: Math.max(1, num(d.mpSingles) || 1), startTime: d.mpSinglesStart }],
      { singles: true });
    data.mp = { matches };
  } else {
    // Scores are entered in the app (sp node); the round being played starts
    // at 1 and the admin advances it from the editor. A scramble is the same
    // stroke play pipeline with teams as its entries, plus the two choices
    // that shape those teams.
    const womenTeeInfo = courseTees(d.course).find(x => x.key === d.womenTee) || null;
    Object.assign(data, {
      // Gender divisions, and the tee the women's one plays: nulls mean the
      // main tee, exactly as the edit form stores them.
      spDivisions: d.spDivisions === 'gender' ? 'gender' : '',
      womenTee: womenTeeInfo ? d.womenTee : null,
      womenRating: womenTeeInfo?.rating ?? null,
      womenSlope: womenTeeInfo?.slope ?? null,
      rounds: num(d.rounds) || 1, currentRound: 1,
      spScoring: d.spScoring === 'stableford' ? 'stableford' : 'strokes',
      cutAfterRound: num(d.cutAfterRound), cutSize: num(d.cutSize)
    });
    if (TEAM_TYPES.includes(d.format)) {
      // Fourball and foursome are pairs by definition; only a scramble asks.
      data.spTeamSize = d.format === 'scramble' && d.spTeamSize !== '2' ? 4 : 2;
      data.spTeamRank = data.spTeamSize === 2 && d.spTeamRank === 'match' ? 'match' : 'board';
    }
  }
  // The roster, where the kind keeps it — only when somebody was picked, so
  // a stroke event with nobody yet does not grow an empty sp node.
  if (Object.keys(d.roster || {}).length) {
    if (data.mp) data.mp.roster = d.roster;
    else data.sp = { players: d.roster };
  }
  return data;
}

async function create() {
  const data = tnWizardRecord(draft);
  const id = await store.saveTournament(data);
  resetTnWizard();
  return { id, data };
}

// A draft with the wizard's defaults under it — what a test hands to
// tnWizardRecord to read one type's record.
export const tnWizardDraft = (d = {}) => ({ ...blank(), ...d });

// ---- Mount ----

export function mountTnWizard(host, ctx) {
  if (!host) return;
  paint(host, ctx);
}

// The members for the picker, fetched once through the mount's loader; the
// step repaints when they land.
function ensureUsers(host, ctx) {
  if (wizUsers || wizUsersLoading || !ctx.loadUsers) return;
  wizUsersLoading = Promise.resolve().then(() => ctx.loadUsers()).then((list) => {
    wizUsers = (list || []).filter(u => u && u.id && u.status !== 'deleted');
  }).catch(() => { wizUsers = []; }).finally(() => {
    wizUsersLoading = null;
    if (draft.step === 5 && document.body.contains(host)) paint(host, ctx);
  });
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

  // Only the gate button reacts while typing; repainting would drop focus.
  const gate = () => {
    const btn = host.querySelector('button[data-wz-nav="next"], button[data-wz-nav="create"]');
    if (btn) btn.disabled = !stepValid();
  };

  host.querySelectorAll('input[data-wz]').forEach(inp => {
    inp.oninput = () => { draft[inp.dataset.wz] = inp.value; gate(); };
  });

  // The session plan's rows: typed straight onto the draft, no repaint.
  host.querySelectorAll('[data-wz-plan]').forEach(el => {
    el.oninput = () => {
      const r = draft.mpPlan[Number(el.dataset.wzPlan)];
      if (!r) return;
      const f = el.dataset.f;
      r[f] = f === 'day' || f === 'matches' ? Number(el.value) : el.value;
      gate();
    };
  });
  host.querySelectorAll('button[data-wz-plan-del]').forEach(b => b.onclick = () => {
    draft.mpPlan.splice(Number(b.dataset.wzPlanDel), 1);
    paint(host, ctx);
  });
  host.querySelector('button[data-wz-plan-add]')?.addEventListener('click', () => {
    const last = draft.mpPlan.at(-1);
    draft.mpPlan.push({ day: last?.day || 1, format: last?.format || 'FOURSOMES', matches: 6, startTime: '' });
    paint(host, ctx);
  });

  host.querySelectorAll('select[data-wz]').forEach(sel => {
    sel.onchange = () => {
      draft[sel.dataset.wz] = sel.value;
      // Picking a course fills PAR, venue and city in one go (typed values
      // are respected — only blanks are filled). Round count reshapes the
      // cut options, so both repaint; a select loses nothing to that.
      if (sel.dataset.wz === 'course') {
        draft.tee = '';
        draft.womenTee = '';
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

  // The crest: picked here so a tournament has its face from the moment it
  // exists; sponsors and the удирдамж are bulkier and belong in the editor.
  host.querySelector('button[data-wz-logo="pick"]')
    ?.addEventListener('click', () => host.querySelector('input[data-wz-logo-input]')?.click());
  host.querySelector('button[data-wz-logo="clear"]')
    ?.addEventListener('click', () => { draft.logo = null; paint(host, ctx); });
  const logoInput = host.querySelector('input[data-wz-logo-input]');
  if (logoInput) logoInput.onchange = async () => {
    const file = logoInput.files && logoInput.files[0];
    logoInput.value = '';
    if (!file) return;
    try {
      draft.logo = await readImageFile(file, { px: 192 });
      paint(host, ctx);
    } catch (err) {
      ctx.showToast?.('⚠️ ' + t(err?.message === 'too-big' ? 'mpLogoTooBig' : 'mpLogoBad'), 'error');
    }
  };

  host.querySelectorAll('button[data-wz-type]').forEach(b => b.onclick = () => {
    draft.format = b.dataset.wzType;
    paint(host, ctx);
  });

  if (draft.step === 5) {
    ensureUsers(host, ctx);
    if (wizUsers) wireRoster(host, { ...rosterOpts(), showToast: ctx.showToast, repaint: () => paint(host, ctx) });
  }

  host.querySelectorAll('button[data-wz-nav]').forEach(b => b.onclick = async () => {
    const nav = b.dataset.wzNav;
    if (nav === 'back') { draft.step--; paint(host, ctx); return; }
    if (!stepValid()) return;
    if (nav === 'next') { draft.step++; paint(host, ctx); return; }
    b.disabled = true;
    try {
      const { id, data } = await create();
      ctx.showToast?.('✅ ' + t('tnCreated'), 'success');
      ctx.onCreated?.(id, data);
    } catch (err) {
      console.error('[tn-wizard]', err);
      b.disabled = false;
      ctx.showToast?.('⚠️ ' + (err?.message || t('tnErrSave')), 'error');
    }
  });
}

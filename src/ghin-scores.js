// src/ghin-scores.js
// A member's scoring record from GHIN, as a list: the scores the Handicap
// Index is worked out from (usually twenty), the ones it counts marked, and
// above them the scores posted since. Builds HTML only — the record comes
// from src/store.js (loadGhinScores, ghinScoresSync), its shape and the
// rows from src/ghin.js. Used on the profile and in the player's details —
// and, as a board of small cells under the Handicap Index, on the home
// screen (ghinHomeHTML).

import { ghinScoreRows, ghinScoreCounts, ghinDiffText, ghinAdjustText, ghinHiText } from './ghin.js';

// So many rows before «Бүгдийг харах».
const FIRST = 5;

// '2026-11-01' → '2026.11.01'
const dateText = (d) => String(d || '').slice(0, 10).replace(/-/g, '.');

function rowHTML(s, h, hidden) {
  const { t, esc, icon } = h;
  const meta = [
    dateText(s.date),
    s.tee,
    s.rating && s.slope ? `${s.rating}/${s.slope}` : '',
    s.holes === 9 ? t('ghinScores9') : '',
    s.type,
    s.pcc ? `PCC ${s.pcc > 0 ? '+' : ''}${s.pcc}` : '',
  ].filter(Boolean).map(esc).join(' · ');
  // What marks a score out, as GHIN's own app does: new, exceptional (E), a penalty score (P).
  const tags = [
    s.pending ? `<span class="gs-tag">${t('ghinScoresPending')}</span>` : '',
    s.exceptional ? `<span class="gs-tag" title="${esc(t('ghinScoresExceptional'))}">E</span>` : '',
    s.penalty ? `<span class="gs-tag" title="${esc(t('ghinScoresPenalty'))}">P</span>` : '',
  ].join('');
  // A differential GHIN adjusted: by how much, under it.
  const adjust = ghinAdjustText(s);
  return `
    <div class="gs-row${s.used ? ' used' : ''}${s.pending ? ' pending' : ''}"${hidden ? ' hidden data-more' : ''}>
      <div class="gs-score">${esc(s.score)}</div>
      <div class="gs-main">
        <div class="gs-course"><span class="gs-name">${esc(s.course || '—')}</span>${tags}</div>
        <div class="gs-meta">${meta}</div>
      </div>
      <div class="gs-right">
        <div class="gs-diff" title="${s.used ? esc(t('ghinScoresUsed')) : ''}">${s.used ? icon('star', { size: 12 }) : ''}${esc(ghinDiffText(s.diff) || '—')}</div>
        ${adjust ? `<div class="gs-adj" title="${esc(t('ghinScoresAdjusted').replace('{raw}', ghinDiffText(s.rawDiff)))}">${esc(adjust)}</div>` : ''}
      </div>
    </div>`;
}

/**
 * The list for a stored record. `h`: { t, esc, icon }. A record with no
 * scores says so — in GHIN's own words when it gave any — and one whose
 * scores the server kept back says why.
 */
export function ghinScoresHTML(record, h) {
  const { t, esc } = h;
  const rows = ghinScoreRows(record);
  const trial = record?.env === 'staging' ? ` · ${t('ghinStagingShort')}` : '';
  if (!rows.length) {
    // Kept back by the server: the record is for the golfer's club only, and
    // the member's GHIN number is not proven theirs (functions/ghin.js).
    const why = record?.withheld === true ? t('ghinScoresUnproven') : t('ghinScoresNone');
    return `<div class="gs-empty">${esc(record?.message || why)}</div>`;
  }
  const n = ghinScoreCounts(record);
  const summary = t('ghinScoresSub').replace('{n}', n.revision).replace('{used}', n.used)
    + (n.pending ? ' ' + t('ghinScoresWaiting').replace('{n}', n.pending) : '');
  return `
    <div class="gs-sub">GHIN${trial} · ${esc(summary)}</div>
    <div class="gs-list">
      <div class="gs-head"><span>${t('ghinScoresScore')}</span><span>${t('ghinScoresWhere')}</span><span>${t('ghinScoresDiff')}</span></div>
      ${rows.map((s, i) => rowHTML(s, h, i >= FIRST)).join('')}
      ${rows.length > FIRST ? `<button type="button" class="gs-more" data-open="0">${esc(t('ghinScoresAll').replace('{n}', rows.length))}</button>` : ''}
    </div>`;
}

/** «Бүгдийг харах» / «Хураах» under a list drawn by ghinScoresHTML. */
export function wireGhinScores(root, h) {
  const btn = root?.querySelector('.gs-more');
  if (!btn) return;
  const total = root.querySelectorAll('.gs-row').length;
  btn.addEventListener('click', () => {
    const open = btn.dataset.open !== '1';
    btn.dataset.open = open ? '1' : '0';
    root.querySelectorAll('.gs-row[data-more]').forEach(r => { r.hidden = !open; });
    btn.textContent = open ? h.t('ghinScoresLess') : h.t('ghinScoresAll').replace('{n}', total);
  });
}

// '2026-11-12' → '11.12'
const dayText = (d) => String(d || '').slice(5, 10).replace('-', '.');

/**
 * The home screen's block, as GHIN's own app opens: the Handicap Index, the
 * low index and the latest score as tiles, then the scores the index is
 * worked out from — the revision's, usually twenty: two rows of ten — as a
 * board of cells: the day, the score, the differential, the ones the index
 * counts filled in. A score posted since is not on the board (it is not in
 * the index yet): it is the latest-score tile, and counted in the board's
 * heading. `hi` is the stored ghin/{id} record, `scores` the stored
 * ghinScores/{id}; either may be missing. '' when there is nothing to show.
 * Whatever carries `data-ghin-all` leads to the full list.
 */
export function ghinHomeHTML(hi, scores, h) {
  const { t, esc } = h;
  const rows = ghinScoreRows(scores);
  if (!(hi && hi.found !== false) && !rows.length) return '';
  const trial = (hi?.env || scores?.env) === 'staging' ? t('ghinStagingShort') : '';
  const tile = (label, value, sub, navy) => `
      <div class="stat-tile${navy ? ' navy' : ''}"><div class="st-label">${label}</div><div class="st-value">${esc(value)}</div>${sub ? `<div class="st-sub" title="${esc(sub)}">${esc(sub)}</div>` : ''}</div>`;
  const last = rows[0];
  const n = ghinScoreCounts(scores);
  const cell = (s) => {
    const tip = [dateText(s.date), s.course, s.tee, s.used ? t('ghinScoresUsed') : ''].filter(Boolean).join(' · ');
    return `<span class="gb-cell${s.used ? ' used' : ''}" title="${esc(tip)}">
        <span class="gb-d">${esc(dayText(s.date))}</span>
        <span class="gb-s">${esc(s.score)}</span>
        <span class="gb-x">${esc(ghinDiffText(s.diff) || '—')}</span>
      </span>`;
  };
  const sub = t('ghinBoardSub').replace('{n}', n.revision).replace('{used}', n.used)
    + (n.pending ? ` · +${n.pending} ${t('ghinScoresPending')}` : '');
  const board = rows.length ? `
    <div class="hole-course">
      <span class="hole-course-name">${t('ghinScoresTitle')}</span>
      <span class="hole-course-sub">${esc(sub)}</span>
    </div>
    <a class="gs-board" href="#/profile" data-ghin-all>${rows.filter(s => !s.pending).map(cell).join('')}</a>
    <div class="hole-legend">${t('ghinBoardLegend')}</div>`
    : scores ? `<div class="gs-empty" style="margin-top:10px;">${esc(scores.message || (scores.withheld === true ? t('ghinScoresUnproven') : t('ghinScoresNone')))}</div>` : '';
  return `
    <div class="section-head">
      <h2>${t('ghinHomeTitle')}</h2>
      <a href="#/profile" class="view-all" data-ghin-all>${t('viewAllShort')}</a>
    </div>
    <div class="stat-row">
      ${tile('H.I', ghinHiText(hi), [trial, hi?.revDate ? dayText(hi.revDate) : ''].filter(Boolean).join(' · '), true)}
      ${tile(t('ghinLowHi'), (hi && hi.lowHi) || '—', '', true)}
      ${last ? tile(t('ghinLastScore'), last.score, [dayText(last.date), last.pending ? t('ghinScoresPending') : last.course].filter(Boolean).join(' · '), false) : ''}
    </div>${board}`;
}

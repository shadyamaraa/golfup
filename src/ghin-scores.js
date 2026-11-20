// src/ghin-scores.js
// A member's scoring record from GHIN, as a list: the scores the Handicap
// Index is worked out from (usually twenty), the ones it counts marked, and
// above them the scores posted since. Builds HTML only — the record comes
// from src/store.js (loadGhinScores, ghinScoresSync), its shape and the
// rows from src/ghin.js. Used on the profile and in the player's details —
// and on the home screen: one line under the greeting (ghinHomeStripHTML)
// and the scores as a board of small cells (ghinHomeBoardHTML).

import { ghinScoreRows, ghinScoreCounts, ghinScoreStats, ghinDiffText, ghinAdjustText, ghinHiText } from './ghin.js';

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
  // The average, the best and the worst, in a line over the list.
  const st = ghinScoreStats(record);
  const stats = st ? `
    <div class="gs-stats">${[['ghinStatAverage', st.average], ['ghinStatBest', st.low], ['ghinStatWorst', st.high]].map(([label, value]) => `
      <span class="gs-stat"><span class="gs-stat-l">${t(label)}</span><span class="gs-stat-v">${esc(value)}</span></span>`).join('')}
    </div>` : '';
  return `
    <div class="gs-sub">GHIN${trial} · ${esc(summary)}</div>${stats}
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
 * The home screen, in two places (docs/ghin.md).
 *
 * Under the greeting, one line: the Handicap Index, the low index and the
 * latest score — a strip that leads down to the board (`data-ghin-board`),
 * or to the full list when there is no board (`data-ghin-all`). It has room
 * for the three numbers and no more: that the data is a trial, and that a
 * score is new, is said at the board.
 * `hi` is the stored ghin/{id} record, `scores` the stored ghinScores/{id};
 * either may be missing. '' when there is nothing to show.
 */
export function ghinHomeStripHTML(hi, scores, h) {
  const { t, esc, icon } = h;
  const rows = ghinScoreRows(scores);
  if (!(hi && hi.found !== false) && !rows.length) return '';
  const last = rows[0];
  const item = (label, value) => `<span class="ghs-item"><span class="ghs-l">${label}</span><span class="ghs-v">${esc(value)}</span></span>`;
  return `
    <a class="ghin-strip" href="#/profile" ${rows.some(s => !s.pending) ? 'data-ghin-board' : 'data-ghin-all'}>
      ${item('H.I', ghinHiText(hi))}
      ${item(t('ghinLowHi'), (hi && hi.lowHi) || '—')}
      ${last ? item(t('ghinLastScore'), last.score) : ''}
      <span class="ghs-end">${icon('next', { size: 16 })}</span>
    </a>`;
}

/**
 * Above «Eagle · Birdie», in its manner: the scores the index is worked out
 * from — the revision's, usually twenty: two rows of ten — as a board of
 * cells: the day, the score, the differential, the ones the index counts
 * filled in. A score posted since is not on the board (it is not in the
 * index yet): it is counted in the board's heading, and is the strip's
 * latest score. '' when the revision has no scores. Whatever carries
 * `data-ghin-all` leads to the full list.
 */
export function ghinHomeBoardHTML(hi, scores, h) {
  const { t, esc } = h;
  const board = ghinScoreRows(scores).filter(s => !s.pending);
  if (!board.length) return '';
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
  const trial = (hi?.env || scores?.env) === 'staging' ? ` · ${t('ghinStagingShort')}` : '';
  return `
    <div class="section-head">
      <h2>${t('ghinScoresTitle')}</h2>
      <a href="#/profile" class="view-all" data-ghin-all>${t('viewAllShort')}</a>
    </div>
    <div class="hole-course">
      <span class="hole-course-name">H.I ${esc(ghinHiText(hi))}${esc(trial)}</span>
      <span class="hole-course-sub">${esc(sub)}</span>
    </div>
    <a class="gs-board" href="#/profile" data-ghin-all>${board.map(cell).join('')}</a>
    <div class="hole-legend">${t('ghinBoardLegend')}</div>`;
}

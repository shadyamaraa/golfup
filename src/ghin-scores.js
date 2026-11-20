// src/ghin-scores.js
// A member's scoring record from GHIN, as a list: the scores the Handicap
// Index is worked out from (usually twenty), the ones it counts marked, and
// above them the scores posted since. Builds HTML only — the record comes
// from src/store.js (loadGhinScores, ghinScoresSync), its shape and the
// rows from src/ghin.js. Used on the profile and in the player's details.

import { ghinScoreRows, ghinScoreCounts, ghinDiffText, ghinAdjustText } from './ghin.js';

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

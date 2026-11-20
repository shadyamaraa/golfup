// src/course-handicaps.js
// A member's Course Handicap on every tee of the app's courses — how many
// strokes their Handicap Index is worth from that tee:
//
//   Course Handicap = Handicap Index × Slope ÷ 113 + (Course Rating − Par)
//
// rounded to a whole stroke (src/handicap.js, courseHandicap). The index is
// GHIN's (ghin/{memberId}.hiValue); the ratings are the course list's, which
// agrees with GHIN's (src/courses.js, docs/ghin.md), so the number is the one
// GHIN's own calculator gives. A tee is rated apart for men and for women: a
// member is shown the tees rated for them, and every tee when the app does
// not know which. No network, no Firebase; the last function builds HTML.

import { COURSE_DATA, courseTees } from './courses.js';
import { courseHandicap } from './handicap.js';
import { teeWanted } from './ghin-course.js';

const GENDER = { male: 'M', female: 'F' };

/**
 * [{ key, name, par, tees: [{ key, label, rating, slope, strokes }] }] — a
 * course with no tee rated for the member is left out. `index` is the number
 * behind the Handicap Index (a plus handicap is below zero); with none there
 * is nothing to work out: [].
 */
export function courseHandicaps(index, gender) {
  if (typeof index !== 'number' || !Number.isFinite(index)) return [];
  const want = GENDER[gender] || '';
  return Object.entries(COURSE_DATA).map(([name, c]) => ({
    key: c.key,
    name,
    par: c.par,
    tees: courseTees(name)
      .filter(t => !want || teeWanted(t.key).gender === want)
      .map(t => ({ ...t, strokes: courseHandicap(index, t.slope, t.rating, c.par) }))
      .filter(t => t.strokes !== null),
  })).filter(c => c.tees.length);
}

/** A course handicap as it is written: 12, 0, and «+2» for one below zero. */
export function strokesText(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n < 0 ? `+${-n}` : String(n);
}

/**
 * The profile's block: each course, and a cell for each tee — its name, the
 * strokes, its rating and slope. `hi` is the stored ghin/{id} record;
 * `h`: { t, esc }. '' when there is no index to work from.
 */
export function courseHandicapsHTML(hi, gender, h) {
  const { t, esc } = h;
  const courses = hi && hi.found !== false ? courseHandicaps(hi.hiValue, gender) : [];
  if (!courses.length) return '';
  const trial = hi.env === 'staging' ? ` · ${t('ghinStagingShort')}` : '';
  return `
    <div class="gs-sub">${esc(t('ghinChSub').replace('{hi}', hi.hi ?? hi.hiValue))}${esc(trial)}</div>
    ${courses.map(c => `
    <div class="hole-course">
      <span class="hole-course-name">${esc(c.name)}</span>
      <span class="hole-course-sub">PAR ${esc(c.par)}</span>
    </div>
    <div class="ch-grid">${c.tees.map(tee => `
      <span class="ch-cell">
        <span class="ch-t">${esc(tee.label)}</span>
        <span class="ch-n">${esc(strokesText(tee.strokes))}</span>
        <span class="ch-r">${esc(tee.rating)}/${esc(tee.slope)}</span>
      </span>`).join('')}
    </div>`).join('')}
    <div class="hole-legend">${t('ghinChLegend')}</div>`;
}

// src/ghin-course.js
// The app's own course list (src/courses.js) against the course as GHIN
// keeps it. Pure — no network, no Firebase, no DOM.
//
// A score differential agrees with GHIN's only when it is worked out from
// GHIN's rating and slope, and posting a score names the course and the tee
// set by GHIN's ids. So each tee of an app course is paired with a GHIN tee
// set, and what differs is listed. The GHIN course is the trimmed one of
// functions/ghin.js (courseById):
//
//   { id, name, facility, tees: [{ id, name, gender, par, rating, slope,
//                                  pars, si, lengths, … }] }

/**
 * An app tee key → the colour word and gender to look for on GHIN. A key is
 * a men's tee of its colour, unless it says otherwise (src/courses.js):
 * `…Ladies` is the women's rating of that colour and `…Men` the men's;
 * `red` has always been the women's Red, and «lady» is a women's tee.
 */
export function teeWanted(key) {
  const k = String(key || '');
  if (k === 'red' || k === 'lady') return { word: k, gender: 'F' };
  const m = k.match(/^(.+)(Ladies|Men)$/);
  if (m) return { word: m[1].toLowerCase(), gender: m[2] === 'Ladies' ? 'F' : 'M' };
  return { word: k.toLowerCase(), gender: 'M' };
}

/**
 * The GHIN tee set for an app tee: its name has the colour and it is rated
 * for the gender wanted. With no such gender, one of that colour for the
 * other gender is no match — a rating is not carried across.
 */
export function matchTee(key, ghinTees) {
  const { word, gender } = teeWanted(key);
  if (!word) return null;
  return (ghinTees || []).find(t => t && t.gender === gender && String(t.name || '').toLowerCase().includes(word)) || null;
}

const same = (a, b) => Number(a) === Number(b);

/**
 * What the app has for a course against what GHIN has:
 *
 *   tees       — each app tee with its GHIN tee set (or none), and whether
 *                the rating and slope agree
 *   unmatched  — GHIN tee sets no app tee stands for
 *   par        — the app's total par, and each par GHIN has across tee sets
 *   holes      — holes where par or stroke index differ from GHIN's, by
 *                gender: the app has one card, GHIN may rate men and women
 *                apart ({ gender, hole, par?: [app, ghin], si?: [app, ghin],
 *                tees?: the tee sets with that card, when a gender has several })
 *   agrees     — nothing differs and every app tee is on GHIN
 */
export function courseDiff(appCourse, ghinCourse) {
  const app = appCourse || {};
  const ghinTees = (ghinCourse && ghinCourse.tees) || [];
  const used = new Set();
  const tees = Object.entries(app.tees || {}).map(([key, t]) => {
    const g = matchTee(key, ghinTees);
    if (g) used.add(g.id);
    return {
      key, app: { rating: t.rating, slope: t.slope },
      ghin: g ? { id: g.id, name: g.name, gender: g.gender, rating: g.rating, slope: g.slope, par: g.par } : null,
      same: !!g && same(t.rating, g.rating) && same(t.slope, g.slope),
    };
  });
  const unmatched = ghinTees.filter(t => !used.has(t.id))
    .map(t => ({ id: t.id, name: t.name, gender: t.gender, rating: t.rating, slope: t.slope, par: t.par }));

  // The app has one card; GHIN keeps pars and stroke allocation with each
  // tee set. The tee sets of a gender nearly always share a card: each
  // different card is compared once, and named by its tees when a gender
  // has more than one.
  const holes = [];
  for (const gender of ['M', 'F']) {
    const cards = new Map();   // the card as text → { card, names }
    for (const t of ghinTees) {
      if (t.gender !== gender || !Object.keys(t.pars || {}).length) continue;
      const key = JSON.stringify([t.pars, t.si || {}]);
      if (!cards.has(key)) cards.set(key, { card: t, names: [] });
      cards.get(key).names.push(t.name);
    }
    for (const { card, names } of cards.values()) {
      for (let hole = 1; hole <= 18; hole++) {
        const row = { gender, hole };
        const [ap, gp] = [app.pars && app.pars[hole], card.pars[hole]];
        if (ap != null && gp != null && !same(ap, gp)) row.par = [ap, gp];
        const [as, gs] = [app.si && app.si[hole], card.si && card.si[hole]];
        if (as != null && gs != null && !same(as, gs)) row.si = [as, gs];
        if (cards.size > 1) row.tees = names;
        if (row.par || row.si) holes.push(row);
      }
    }
  }
  const ghinPars = [...new Set(ghinTees.map(t => t.par).filter(p => p != null))];
  const parSame = app.par == null || !ghinPars.length || ghinPars.every(p => same(p, app.par));
  return {
    tees, unmatched, holes,
    par: { app: app.par ?? null, ghin: ghinPars },
    agrees: tees.every(t => t.same) && !holes.length && parSame,
  };
}

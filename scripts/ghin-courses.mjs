// scripts/ghin-courses.mjs
// The app's course list (src/courses.js) against the same courses as GHIN
// keeps them, with the association's own login, from your own terminal. It
// only reads, and nothing it prints is personal: courses, tees, ratings.
//
//   node scripts/ghin-courses.mjs                    every course of the app
//   node scripts/ghin-courses.mjs sky=12345          … this GHIN course id for «sky»
//   node scripts/ghin-courses.mjs --find "Bogd"      only search GHIN for a name
//
// For each course: the GHIN course it was matched to (or the ones a search
// found, to choose from), every tee set GHIN has with its ids, rating and
// slope, and what differs from the app — a tee's rating or slope, a hole's
// par or stroke index, a tee GHIN has no rating for. A score differential
// agrees with GHIN's only when it is worked out from GHIN's numbers, and a
// score is posted under GHIN's course and tee-set ids (docs/ghin.md).
//
// The login is asked for here (scripts/ghin-login.mjs); GHIN_BASE_URL points
// at another environment than staging.

import { createRequire } from 'node:module';
import { askLogin, failureText } from './ghin-login.mjs';
import { COURSE_DATA } from '../src/courses.js';
import { courseDiff } from '../src/ghin-course.js';

const ghin = createRequire(import.meta.url)('../functions/ghin.js');

// The words to search GHIN for, by a course's key in the app — for a course
// that carries no GHIN id yet (`ghinCourseId` in src/courses.js).
const LOOK = {
  chinggis: { words: ['Chinggis'] },
  sky: { words: ['Bogd', 'Sky Resort'] },
};

const args = process.argv.slice(2);
const findAt = args.indexOf('--find');
const findName = findAt >= 0 ? String(args[findAt + 1] || '').trim() : '';
const pinned = Object.fromEntries(args.filter(a => /^[a-z]\w*=\d+$/i.test(a)).map(a => a.split('=')));
if (findAt >= 0 && !findName) {
  console.error('Usage: node scripts/ghin-courses.mjs --find "<part of a course or club name>"');
  process.exit(1);
}

const { email, password } = await askLogin();
const base = ghin.baseUrlOf(process.env.GHIN_BASE_URL);
console.log(`\nGHIN: ${base}  (${ghin.envOf(base)})`);
// The functions' own client, saying once that the login was taken — after
// the first request GHIN answers.
const inner = ghin.createClient({ fetch, email, password, baseUrl: process.env.GHIN_BASE_URL });
let answered = false;
const client = {
  env: inner.env,
  get: async (path, query) => {
    const data = await inner.get(path, query);
    if (!answered) { answered = true; console.log('Login: OK'); }
    return data;
  },
};

const where = (c) => [c.city, c.state, c.country].filter(Boolean).join(', ');
const listFound = (found) => {
  for (const c of found) console.log(`    ${c.id.padStart(6)}  ${c.facility}${c.name && c.name !== c.facility ? ` — ${c.name}` : ''}  (${where(c) || '—'})${c.status && c.status !== 'Active' ? `  [${c.status}]` : ''}`);
};
const rs = (t) => (t ? `${t.rating} / ${t.slope}` : '—');
const G = { M: 'men', F: 'women', '': '?' };

try {
  if (findName) {
    const found = await ghin.findCourses(client, findName);
    console.log(`\n«${findName}» on GHIN: ${found.length}`);
    listFound(found);
    process.exit(0);
  }

  const summary = {};
  for (const [name, app] of Object.entries(COURSE_DATA)) {
    const look = LOOK[app.key] || { words: [name] };
    let id = pinned[app.key] || app.ghinCourseId || '';
    console.log(`\n=== ${name}  (${app.key})`);

    if (!id) {
      const seen = new Map();
      for (const word of look.words) for (const c of await ghin.findCourses(client, word)) seen.set(c.id, c);
      const found = [...seen.values()];
      const active = found.filter(c => !c.status || c.status === 'Active');
      const here = active.filter(c => /mongol/i.test(c.country) || /^MN\b|^MNG\b/i.test(c.state) || /ulaanbaatar/i.test(c.city));
      console.log(`  GHIN has ${found.length} course(s) under ${look.words.map(w => `«${w}»`).join(' / ')}:`);
      listFound(found);
      const pick = here.length === 1 ? here[0] : active.length === 1 ? active[0] : null;
      if (!pick) {
        console.log(`  Not one clear match. Run again with its id:  node scripts/ghin-courses.mjs ${app.key}=<id>`);
        continue;
      }
      id = pick.id;
    }

    const course = await ghin.courseById(client, id);
    if (!course) { console.log(`  GHIN has no course under id ${id}.`); continue; }
    console.log(`  GHIN course ${course.id}: ${course.facility}${course.name && course.name !== course.facility ? ` — ${course.name}` : ''}  (${[course.city, course.state].filter(Boolean).join(', ') || '—'})${course.status ? `  [${course.status}]` : ''}`);
    console.log('  Tee sets on GHIN:');
    for (const t of course.tees) {
      console.log(`    ${t.id.padStart(7)}  ${t.name.padEnd(16)} ${G[t.gender].padEnd(5)}  ${String(t.rating).padStart(5)} / ${String(t.slope).padEnd(3)}  par ${t.par ?? '—'}  ${t.yards ? `${t.yards} yd` : ''}${t.front && t.back ? `   front ${rs(t.front)}, back ${rs(t.back)}` : ''}`);
    }

    const diff = courseDiff(app, course);
    console.log('  The app\'s tees against GHIN\'s:');
    for (const t of diff.tees) {
      const held = app.tees[t.key].ghinTeeSetId;
      const mark = !t.ghin ? 'NOT ON GHIN' : !t.same ? 'DIFFERS' : held && held !== t.ghin.id ? `same — but the app holds tee set ${held}` : 'same';
      console.log(`    ${t.key.padEnd(11)} app ${rs(t.app).padEnd(11)}  GHIN ${t.ghin ? `${rs(t.ghin).padEnd(11)} (${t.ghin.name}, ${G[t.ghin.gender]}, id ${t.ghin.id})` : '—'.padEnd(11)}  ${mark}`);
    }
    if (diff.unmatched.length) console.log(`  On GHIN, not in the app: ${diff.unmatched.map(t => `${t.name} (${G[t.gender]}) ${rs(t)}`).join('; ')}`);
    if (diff.par.ghin.length && !diff.par.ghin.every(p => p === diff.par.app)) console.log(`  Par: app ${diff.par.app}, GHIN ${diff.par.ghin.join(' / ')}`);
    if (diff.holes.length) {
      console.log('  Holes that differ (app → GHIN):');
      for (const h of diff.holes) console.log(`    hole ${String(h.hole).padStart(2)} (${G[h.gender]}${h.tees ? `: ${h.tees.join(', ')}` : ''}): ${[h.par && `par ${h.par[0]} → ${h.par[1]}`, h.si && `stroke index ${h.si[0]} → ${h.si[1]}`].filter(Boolean).join(', ')}`);
    } else if (course.tees.length) {
      console.log('  Pars and stroke indexes: the same as GHIN\'s.');
    }
    const idsOff = diff.tees.some(t => t.ghin && app.tees[t.key].ghinTeeSetId && app.tees[t.key].ghinTeeSetId !== t.ghin.id);
    console.log(`  ${diff.agrees && !idsOff ? 'Agrees with GHIN.' : 'Does not agree with GHIN yet — see above.'}`);
    summary[app.key] = { ghinCourseId: course.id, tees: Object.fromEntries(diff.tees.map(t => [t.key, t.ghin ? { teeSetId: t.ghin.id, rating: t.ghin.rating, slope: t.ghin.slope } : null])) };
  }
  if (Object.keys(summary).length) {
    console.log('\nFor src/courses.js (GHIN\'s ids and numbers):');
    for (const [key, c] of Object.entries(summary)) {
      console.log(`  ${key}: GHIN course ${c.ghinCourseId}`);
      for (const [tee, g] of Object.entries(c.tees)) console.log(`    ${tee.padEnd(11)} ${g ? `tee set ${g.teeSetId}  ${g.rating} / ${g.slope}` : '— not on GHIN'}`);
    }
  }
} catch (err) {
  console.error('\nFailed:', failureText(err));
  process.exit(1);
}

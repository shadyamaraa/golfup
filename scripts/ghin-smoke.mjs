// scripts/ghin-smoke.mjs
// A live check against GHIN with the association's own login — the same code
// the ghinGolfer / ghinSync functions run (functions/ghin.js), from your own
// terminal. It only reads.
//
//   node scripts/ghin-smoke.mjs 12345678            one GHIN number
//   node scripts/ghin-smoke.mjs 12345678 7900344    several, in one request
//
// The login is asked for here (the password is not shown as it is typed) and
// goes nowhere but to GHIN. To skip the questions, set GHIN_EMAIL and
// GHIN_PASSWORD in the environment; GHIN_BASE_URL points at another
// environment than staging.
//
// What it prints: for each number, the name, club and Handicap Index the app
// would keep — and the NAMES of the fields GHIN sent, without their values,
// so the mapping can be checked without anyone's personal details leaving
// your screen. Then the golfer's scoring record as the ghinScores function
// would keep it: how many scores, how many count, the newest three, and
// which request GHIN answered — or what it said in refusing.

import { createRequire } from 'node:module';
import { askLogin, failureText } from './ghin-login.mjs';

const ghin = createRequire(import.meta.url)('../functions/ghin.js');

const numbers = process.argv.slice(2).map(a => ghin.ghinNumber(a));
if (!numbers.length || numbers.some(n => !n)) {
  console.error('Usage: node scripts/ghin-smoke.mjs <GHIN number> [more numbers]   (7 or 8 digits each)');
  process.exit(1);
}

const { email, password } = await askLogin();

const base = ghin.baseUrlOf(process.env.GHIN_BASE_URL);
console.log(`\nGHIN: ${base}  (${ghin.envOf(base)})`);

// The same client the functions use, with a look at what came back: how many
// rows, and which fields — names only.
const fields = new Set();
let rowCount = 0;
let masked = 0;
const inner = ghin.createClient({ fetch, email, password, baseUrl: process.env.GHIN_BASE_URL });
const client = {
  env: inner.env,
  get: async (path, query) => {
    const data = await inner.get(path, query);
    for (const row of Array.isArray(data.golfers) ? data.golfers : []) {
      rowCount++;
      if (String(row.ghin ?? '').includes('*')) masked++;
      Object.keys(row).forEach(k => fields.add(k));
    }
    return data;
  },
};

try {
  const found = await ghin.golfersByNumber(client, numbers);
  console.log('Login: OK');
  for (const n of numbers) {
    const g = found.get(n);
    if (!g) { console.log(`\n${n}: GHIN has no golfer under this number (or this login may not see them).`); continue; }
    console.log(`\n${n}: ${g.name}`);
    console.log(`  club:            ${g.club || '—'}${g.association ? `  (${g.association})` : ''}`);
    console.log(`  status:          ${g.status || '—'}`);
    console.log(`  Handicap Index:  ${g.hi ?? '—'}${g.hiValue === null ? '' : `  (value ${g.hiValue})`}${g.withdrawn ? '  WITHDRAWN' : ''}`);
    console.log(`  low HI:          ${g.lowHi ?? '—'}`);
    console.log(`  revised:         ${g.revDate ?? '—'}`);
  }
  console.log(`\nRows GHIN sent: ${rowCount}${masked ? `  (${masked} with a masked number)` : ''}`);
  console.log(`Fields GHIN sent (names only): ${[...fields].sort().join(', ') || '—'}`);

  // The scoring record, the way the ghinScores function reads it.
  const asked = [];
  const scoreFields = new Set();
  const scoreClient = {
    env: inner.env,
    get: async (path, query) => {
      try {
        const data = await inner.get(path, query);
        asked.push(`${path}: OK`);
        for (const part of [data, data.revision_scores, data.recent_scores]) {
          for (const row of Array.isArray(part?.scores) ? part.scores : []) Object.keys(row || {}).forEach(k => scoreFields.add(k));
        }
        return data;
      } catch (err) {
        asked.push(`${path}: ${err.ghin || err.message}${err.upstream ? ` (HTTP ${err.upstream})` : ''}${err.detail ? ` — ${err.detail}` : ''}`);
        throw err;
      }
    },
  };
  for (const n of numbers) {
    if (!found.get(n)) continue;
    try {
      const rec = await ghin.scoresByNumber(scoreClient, n, Date.now());
      const used = rec.revision.filter(s => s.used).length;
      console.log(`\n${n}: scoring record`);
      console.log(`  revision scores: ${rec.revision.length}  (${used} counted)${rec.revision.length ? `   ${rec.revision.at(-1).date} … ${rec.revision[0].date}` : ''}`);
      console.log(`  posted since:    ${rec.recent.length}`);
      console.log(`  shown to:        ${rec.visibility}${rec.message ? `  — ${rec.message}` : ''}`);
      for (const s of [...rec.recent, ...rec.revision].slice(0, 3)) {
        console.log(`    ${s.date}  ${String(s.score).padStart(3)}  ${s.diff == null ? '   —' : s.diff.toFixed(1).padStart(5)}${s.used ? ' *' : '  '}  ${s.course || ''}`);
      }
    } catch (err) {
      console.log(`\n${n}: the scoring record could not be read (${err.ghin || err.message}).`);
    }
  }
  if (asked.length) console.log(`\nScore requests:\n  ${asked.join('\n  ')}`);
  console.log(`Score fields GHIN sent (names only): ${[...scoreFields].sort().join(', ') || '—'}`);
} catch (err) {
  console.error('\nFailed:', failureText(err));
  process.exit(1);
}

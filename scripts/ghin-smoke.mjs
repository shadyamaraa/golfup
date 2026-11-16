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
// your screen.

import readline from 'node:readline';
import { createRequire } from 'node:module';

const ghin = createRequire(import.meta.url)('../functions/ghin.js');

const numbers = process.argv.slice(2).map(a => ghin.ghinNumber(a));
if (!numbers.length || numbers.some(n => !n)) {
  console.error('Usage: node scripts/ghin-smoke.mjs <GHIN number> [more numbers]   (7 or 8 digits each)');
  process.exit(1);
}

// One reader for both questions; what is typed for the password is not echoed.
async function askLogin() {
  let email = process.env.GHIN_EMAIL || '';
  let password = process.env.GHIN_PASSWORD || '';
  if (email && password) return { email, password };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let hidden = false;
  const write = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (text) => { if (!hidden) write(text); };
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (question, secret) => {
    process.stdout.write(question);
    hidden = secret;
    const { value } = await lines.next();
    hidden = false;
    if (secret) process.stdout.write('\n');
    return String(value ?? '').trim();
  };
  if (!email) email = await ask('GHIN email: ', false);
  if (!password) password = await ask('GHIN password: ', true);
  rl.close();
  return { email, password };
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
} catch (err) {
  const what = {
    NOT_CONFIGURED: 'No email or password given.',
    LOGIN_REFUSED: `GHIN refused the login (HTTP ${err.upstream}). Check the email and password.`,
    GHIN_UNREACHABLE: 'GHIN could not be reached.',
    GHIN_ERROR: `GHIN answered with an error (HTTP ${err.upstream}).`,
  }[err.ghin];
  console.error('\nFailed:', what || err.message);
  process.exit(1);
}

// Fill in users/{id}.gender for the members who registered before the profile
// carried the field.
//
// The rule lives in src/gender.js so it can be unit-tested (scripts/
// test-gender.mjs); this script only gathers the two signals it reads:
//
//   female — the member is in the women's circle ('women' in user.communities),
//            or they have played in a tournament the club named for women
//            ("… (Ladies)", "… Ladies Championship", "Эмэгтэй…");
//   male   — everybody else.
//
// The second signal exists because a woman who never joined the circle would
// otherwise be written down as a man. It is a blunt rule either way, so:
//
// Safety: only the `gender` key is PATCHed, nothing else is touched. A user
// whose gender is already set is skipped, never overwritten — so the script is
// idempotent and safe to re-run after members correct themselves. Nothing is
// written at all without --apply.
//
// Usage:
//   node scripts/backfill-gender.mjs                       # dry run (report only)
//   node scripts/backfill-gender.mjs --apply               # write
//   node scripts/backfill-gender.mjs --apply \
//     --set u_123_abc=female                               # fix one, then write
//   node scripts/backfill-gender.mjs --names               # dry run, with names
//
// The report prints ids, not names, unless --names is passed: it is a list of
// the whole membership and it ends up in a terminal scrollback.

import { firebaseConfig } from '../src/config.js';
import { inferGender, isGender, isLadiesEvent, WOMEN_CIRCLE } from '../src/gender.js';

const DB = firebaseConfig.databaseURL;

// ---- CLI args --------------------------------------------------------------
const args = process.argv.slice(2);
const opt = { apply: false, names: false, sets: [] };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') opt.apply = true;
  else if (args[i] === '--names') opt.names = true;
  else if (args[i] === '--set') opt.sets.push(args[++i] || '');
  else { console.error('Unknown argument:', args[i]); process.exit(1); }
}

const overrides = new Map();
for (const s of opt.sets) {
  const [id, value] = String(s).split('=');
  if (!id || !isGender(value)) {
    console.error(`--set must be userId=male|female, got: ${s}`);
    process.exit(1);
  }
  overrides.set(id, value);
}

// The query string goes AFTER .json — `tournaments.json?shallow=true`, not
// `tournaments?shallow=true.json`, which silently returns nothing.
const getJson = async (path, query = '') => {
  const res = await fetch(`${DB}/${path}.json${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error(`${path} fetch failed: ${res.status}`);
  return res.json();
};

// Every member who has played in a tournament the club named for women. Read
// from the tournaments node rather than assumed: sp.players holds one entry per
// competitor, and a member's entry carries their userId.
async function ladiesPlayerIds() {
  const ids = new Set();
  const events = [];
  const index = (await getJson('tournaments', 'shallow=true')) || {};
  for (const tnId of Object.keys(index)) {
    const name = await getJson(`tournaments/${tnId}/name`);
    if (!isLadiesEvent(name)) continue;
    events.push(name);
    const players = (await getJson(`tournaments/${tnId}/sp/players`)) || {};
    for (const p of Object.values(players)) {
      if (p && p.kind !== 'team' && p.userId) ids.add(p.userId);
    }
  }
  return { ids, events };
}

const line = (u) => (opt.names ? `${u.id}  ${u.name || u.username || ''}` : u.id);

async function main() {
  console.log(`DB: ${DB}${opt.apply ? '' : '   (dry run — pass --apply to write)'}`);

  const usersRaw = (await getJson('users')) || {};
  const users = Object.values(usersRaw).filter(u => u && u.id);
  const { ids: ladies, events } = await ladiesPlayerIds();

  console.log(`Users: ${users.length}`);
  const inCircle = (u) => Array.isArray(u.communities) && u.communities.includes(WOMEN_CIRCLE);
  console.log(`Women's circle ('${WOMEN_CIRCLE}'): ${users.filter(inCircle).length}`);
  console.log(`Ladies events: ${events.length ? events.join(', ') : 'none'} → ${ladies.size} distinct members`);

  const byCircle = [], byLadies = [], male = [], already = [], forced = [];

  for (const u of users) {
    if (overrides.has(u.id)) { forced.push({ u, gender: overrides.get(u.id) }); continue; }
    if (isGender(u.gender)) { already.push(u); continue; }
    const { gender, why } = inferGender(u, ladies);
    if (why === 'circle') byCircle.push(u);
    else if (why === 'ladies') byLadies.push(u);
    else male.push({ u, gender });
  }

  const section = (title, rows) => {
    console.log(`\n${title} (${rows.length})`);
    rows.forEach(r => console.log('  ' + line(r.u || r)));
  };

  section('FEMALE — in the women\'s circle', byCircle);
  section('FEMALE — played a ladies event, not in the circle', byLadies);
  section('MALE — no signal either way', male);
  if (already.length) section('SKIPPED — gender already set', already);
  if (forced.length) console.log(`\nFORCED by --set (${forced.length})`
    + forced.map(f => `\n  ${f.u.id} → ${f.gender}`).join(''));

  const plan = [
    ...byCircle.map(u => ({ u, gender: 'female' })),
    ...byLadies.map(u => ({ u, gender: 'female' })),
    ...male,
    ...forced,
  ];
  console.log(`\nWould write: ${plan.length}  (female ${plan.filter(p => p.gender === 'female').length},`
    + ` male ${plan.filter(p => p.gender === 'male').length})`);

  if (!opt.apply) { console.log('\nDry run — nothing written.'); return; }

  let ok = 0;
  for (const p of plan) {
    const res = await fetch(`${DB}/users/${p.u.id}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender: p.gender }),
    });
    if (!res.ok) {
      throw new Error(`PATCH failed for ${p.u.id}: ${res.status} ${await res.text()}`
        + ` — ${ok} of ${plan.length} were already written`);
    }
    ok++;
  }
  console.log(`\nWrote gender for ${ok} users.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

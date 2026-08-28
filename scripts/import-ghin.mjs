// Import GHIN numbers into user profiles from a club roster export.
//
// Matches app users (users/{id} in RTDB) against a roster CSV by name —
// firstName↔given, lastName↔surname, either order, with Mongolian-Latin
// spelling variants (kh/h, double vowels, ...) and Cyrillic transliteration —
// and writes confident matches to users/{id}.ghinNumber (the field
// rounds/{ghinNumber} and the WHS handicap machinery key on, see
// src/game-score.js and src/handicap.js).
//
// The roster CSV needs a header row with a name column ("Golfer Name" or
// "Name") and a GHIN column ("GHIN#" or "GHIN"). Extra columns are ignored.
// Export the sheet from the GHIN admin xlsx as CSV, or any two-column file.
//
// Usage:
//   node scripts/import-ghin.mjs --file golfers.csv              # dry run (report only)
//   node scripts/import-ghin.mjs --file golfers.csv --apply      # write matches
//   node scripts/import-ghin.mjs --file golfers.csv --apply \
//     --set u_123_abc=13429466                                   # manual override(s)
//
// Safety: only the ghinNumber key is PATCHed, nothing else is touched.
// A user whose ghinNumber is already set to a different value is skipped
// and reported (use --force to overwrite). Ambiguous matches (two roster
// rows or two users competing for one number) are never auto-applied —
// they are listed for manual review, then applied via --set.

import { readFileSync } from 'node:fs';
import { firebaseConfig } from '../src/config.js';

const DB = firebaseConfig.databaseURL;

// ---- CLI args --------------------------------------------------------------
const args = process.argv.slice(2);
const opt = { file: '', apply: false, force: false, sets: [] };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') opt.file = args[++i] || '';
  else if (args[i] === '--apply') opt.apply = true;
  else if (args[i] === '--force') opt.force = true;
  else if (args[i] === '--set') opt.sets.push(args[++i] || '');
  else { console.error('Unknown argument:', args[i]); process.exit(1); }
}
if (!opt.file && !opt.sets.length) {
  console.error('Usage: node scripts/import-ghin.mjs --file roster.csv [--apply] [--set userId=GHIN]');
  process.exit(1);
}

// ---- name normalisation ----------------------------------------------------
const CYR = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i',
  'й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','ө':'u','п':'p','р':'r','с':'s',
  'т':'t','у':'u','ү':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sh',
  'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
};
const translit = (s) => [...String(s).toLowerCase()].map(c => CYR[c] ?? c).join('');
const norm = (s) => translit(s || '').normalize('NFKD').replace(/[^a-z]/g, '');
// collapse common Mongolian-Latin spelling variants so Amraa≈Amaraa, Khulan≈Hulan
const fold = (s) => norm(s)
  .replace(/kh/g, 'h')
  .replace(/([aeiouy])\1+/g, '$1')
  .replace(/ya/g, 'ia').replace(/y/g, 'i')
  .replace(/w/g, 'v')
  .replace(/ts/g, 'c').replace(/z/g, 'c').replace(/j/g, 'c');

function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ---- roster ----------------------------------------------------------------
// club/course tags the GHIN export appends after some names ("... Jci", "... (sky)")
const CLUB_TAGS = new Set(['jci', 'sky', 'vista', 'eagle', 'star', 'club', 'soyombo', 'khanbogd', 'zaan', 'terelj', 'mcs', 'w']);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some(x => x.trim())) rows.push(row); }
  return rows;
}

function loadRoster(file) {
  const rows = parseCsv(readFileSync(file, 'utf8'));
  if (!rows.length) throw new Error('empty roster file');
  const header = rows[0].map(h => h.trim().toLowerCase());
  let nameCol = header.findIndex(h => h.includes('name'));
  let ghinCol = header.findIndex(h => h.includes('ghin'));
  if (nameCol < 0 || ghinCol < 0) throw new Error(`roster header needs a name and a GHIN column, got: ${rows[0].join(', ')}`);
  const roster = [];
  for (const row of rows.slice(1)) {
    const raw = (row[nameCol] || '').trim();
    const ghin = (row[ghinCol] || '').replace(/\D/g, '');
    if (!raw || !/^\d{7,8}$/.test(ghin)) {
      if (raw || ghin) console.warn(`  ! skipping roster row without a valid 7-8 digit GHIN: ${raw || '(no name)'} / ${row[ghinCol] || ''}`);
      continue;
    }
    const toks = raw.split(/\s+/).map(t => t.replace(/[^A-Za-zЀ-ӿ-]/g, '')).filter(Boolean);
    while (toks.length > 2 && CLUB_TAGS.has(toks[toks.length - 1].toLowerCase())) toks.pop();
    const given = toks[0] || '', surname = toks.length > 1 ? toks[toks.length - 1] : '';
    roster.push({
      raw, ghin, given, surname,
      ng: norm(given), ns: norm(surname), fg: fold(given), fs: fold(surname),
      njoin: norm(toks.join('')), fjoin: fold(toks.join('')),
    });
  }
  return roster;
}

// ---- matching --------------------------------------------------------------
// Tier 1: given+surname exact (either order). Tier 2: equal after variant
// folding, or the full joined name matches. Tier 3: one part exact, the
// other a near-miss (edit distance ≤2 / abbreviation). Anything else: no match.
function score(u, r) {
  if (u.nf && u.nl) {
    if (u.nf === r.ng && u.nl === r.ns) return [1, 'first=given, last=surname'];
    if (u.nf === r.ns && u.nl === r.ng) return [1, 'swapped order'];
    if (u.ff === r.fg && u.fl === r.fs) return [2, 'spelling variant'];
    if (u.ff === r.fs && u.fl === r.fg) return [2, 'spelling variant, swapped'];
    if (u.nf === r.ng && (lev(u.fl, r.fs) <= 2 || (u.fl && r.fs && (u.fl.startsWith(r.fs) || r.fs.startsWith(u.fl)))))
      return [3, `given exact, surname ~ (${r.surname})`];
    if (u.nl === r.ns && lev(u.ff, r.fg) <= 1) return [3, `surname exact, given ~ (${r.given})`];
  }
  if (u.njoin && (u.njoin === r.njoin || (u.fjoin && u.fjoin === r.fjoin))) return [2, 'full name'];
  return [99, ''];
}

async function main() {
  console.log(`DB: ${DB}${opt.apply ? '' : '   (dry run — pass --apply to write)'}`);
  const res = await fetch(`${DB}/users.json`);
  if (!res.ok) throw new Error(`users fetch failed: ${res.status}`);
  const usersRaw = await res.json();

  const users = Object.entries(usersRaw || {}).filter(([, u]) => u && typeof u === 'object').map(([id, u]) => {
    const first = (u.firstName || '').trim(), last = (u.lastName || '').trim();
    const base = (u.fullName || u.name || u.username || '').trim();
    const toks = base.split(/\s+/).map(t => t.replace(/[^A-Za-zЀ-ӿ-]/g, '')).filter(Boolean);
    return {
      id, name: u.name || id, first, last,
      current: String(u.ghinNumber || '').trim(), legacy: String(u.ghin || '').trim(),
      nf: norm(first), nl: norm(last), ff: fold(first), fl: fold(last),
      njoin: norm(toks.join('')), fjoin: fold(toks.join('')),
    };
  });

  const roster = opt.file ? loadRoster(opt.file) : [];
  console.log(`${users.length} app users, ${roster.length} roster golfers\n`);

  // best-tier candidates per user
  const best = new Map();
  for (const u of users) {
    let t = 99, cands = [];
    for (const r of roster) {
      const [tier, note] = score(u, r);
      if (tier < t) { t = tier; cands = [{ r, note }]; }
      else if (tier === t && tier < 99) cands.push({ r, note });
    }
    if (t < 99) best.set(u.id, { tier: t, cands });
  }

  // which users claim each GHIN
  const claims = new Map();
  for (const [uid, { cands }] of best) for (const { r } of cands) {
    claims.set(r.ghin, (claims.get(r.ghin) || []).concat(uid));
  }

  const plan = [], review = [], unmatched = [], skipped = [];
  for (const u of users) {
    const m = best.get(u.id);
    if (!m) { if (opt.file) unmatched.push(u); continue; }
    const { tier, cands } = m;
    const dupName = (r) => roster.filter(x => x.njoin === r.njoin).length > 1;
    if (cands.length > 1) review.push([u, `${cands.length} roster candidates: ` + cands.map(c => `${c.r.raw}=${c.r.ghin}`).join('; ')]);
    else if (claims.get(cands[0].r.ghin).length > 1) review.push([u, `GHIN ${cands[0].r.ghin} (${cands[0].r.raw}) also matches another user`]);
    else if (dupName(cands[0].r)) review.push([u, `duplicate name in roster: ${cands[0].r.raw}`]);
    else if (u.current && u.current !== cands[0].r.ghin && !opt.force) skipped.push([u, `has ghinNumber ${u.current}, roster says ${cands[0].r.ghin} (--force to overwrite)`]);
    else if (u.current === cands[0].r.ghin) skipped.push([u, `already set (${u.current})`]);
    else plan.push({ u, ghin: cands[0].r.ghin, why: `T${tier} ${cands[0].r.raw} [${cands[0].note}]` });
  }

  // manual overrides
  for (const s of opt.sets) {
    const [uid, ghin] = s.split('=').map(x => (x || '').trim());
    const u = users.find(x => x.id === uid);
    if (!u) { console.error(`--set: no user with id ${uid}`); process.exit(1); }
    if (!/^\d{7,8}$/.test(ghin)) { console.error(`--set: ${ghin} is not a 7-8 digit GHIN`); process.exit(1); }
    if (u.current === ghin) { skipped.push([u, `already set (${ghin})`]); continue; }
    if (u.current && !opt.force) { skipped.push([u, `has ghinNumber ${u.current} (--force to overwrite)`]); continue; }
    const idx = plan.findIndex(p => p.u.id === uid);
    if (idx >= 0) plan.splice(idx, 1);
    const rIdx = review.findIndex(([ru]) => ru.id === uid);
    if (rIdx >= 0) review.splice(rIdx, 1);
    plan.push({ u, ghin, why: 'manual --set' });
  }

  const w = (s, n) => String(s).padEnd(n);
  console.log(`=== TO APPLY (${plan.length}) ===`);
  for (const p of plan.sort((a, b) => a.u.name.localeCompare(b.u.name)))
    console.log(`  ${w(p.u.name, 24)} ${w(`${p.u.first} ${p.u.last}`, 28)} -> ${p.ghin}  ${p.why}`);
  if (review.length) {
    console.log(`\n=== NEEDS MANUAL REVIEW (${review.length}) — apply with --set userId=GHIN ===`);
    for (const [u, why] of review) console.log(`  ${w(u.name, 24)} (${u.id})  ${why}`);
  }
  if (skipped.length) {
    console.log(`\n=== SKIPPED (${skipped.length}) ===`);
    for (const [u, why] of skipped) console.log(`  ${w(u.name, 24)} ${why}`);
  }
  if (unmatched.length) {
    console.log(`\n=== NOT IN ROSTER (${unmatched.length}) ===`);
    for (const u of unmatched) console.log(`  ${w(u.name, 24)} ${u.first} ${u.last}`);
  }

  if (!opt.apply) { console.log('\nDry run — nothing written.'); return; }

  console.log(`\nWriting ghinNumber for ${plan.length} users...`);
  let ok = 0;
  for (const p of plan) {
    const res = await fetch(`${DB}/users/${p.u.id}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ghinNumber: p.ghin }),
    });
    if (!res.ok) throw new Error(`PATCH failed for ${p.u.name} (${p.u.id}): ${res.status} ${await res.text()} — ${ok} of ${plan.length} were already written`);
    ok++;
    console.log(`  ✓ ${p.u.name} -> ${p.ghin}`);
  }
  console.log(`Done: ${ok} profiles updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

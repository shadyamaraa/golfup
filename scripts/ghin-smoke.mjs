// Live check against GHIN staging (UAT) with real Admin Portal credentials —
// the same code the ghinGolfer function runs. Prints the trimmed golfer.
//
// Usage:
//   GHIN_EMAIL=... GHIN_PASSWORD=... node scripts/ghin-smoke.mjs 1234567
//   (GHIN_BASE_URL=... to point at another environment)

import { createRequire } from 'node:module';

const ghin = createRequire(import.meta.url)('../functions/ghin.js');
const number = (process.argv[2] || '').replace(/\D/g, '');
if (!/^\d{7,8}$/.test(number)) { console.error('Usage: node scripts/ghin-smoke.mjs <GHIN number>'); process.exit(1); }

console.log('GHIN base:', ghin.baseUrl());
try {
  const g = await ghin.golferByGhin(number);
  console.log(g ? g : 'No golfer with that number.');
} catch (err) {
  console.error('Failed:', err.message, err.upstream ? `(GHIN HTTP ${err.upstream})` : '');
  process.exit(1);
}

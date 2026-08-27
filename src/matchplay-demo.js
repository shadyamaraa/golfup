// src/matchplay-demo.js
// A sample M Cup, so the Live Match Center can be reviewed before any real
// tournament exists. Same purpose and same confinement as TN_DEMO in app.js:
// localhost and Firebase preview channels only — see tnDemoAllowed().
//
// Shaped like the real thing on purpose: both teams full, one session
// finished, one running, one still to tee off, and matches in every state
// including a suspension and a dormie. Reviewing the board against this
// should show every case the tournament can produce.

import { HALVED } from './matchplay.js';

export const MP_DEMO_ID = 'mcup-demo';

// holes('a', 'h', 'b') → { 1:'a', 2:'h', 3:'b' }
const holes = (...results) => Object.fromEntries(results.map((r, i) => [i + 1, r]));
const h = HALVED;

const ALTAI = [
  'Маргад Жамбалдорж', 'Бат-Амгалан Чинбат', 'Ганбат Дорж', 'Энхжин Даш',
  'Мөнх-Эрдэнэ Сүх', 'Тэмүүлэн Гантөмөр', 'Бат-Эрдэнэ Очир', 'Наранцэцэг Жаргал',
  'Батбаяр Хүрэл', 'Дорж Тулга', 'Оюунбилэг Лхагва', 'Ганзориг Чулуун',
  'Алтанцэцэг Мөнх', 'Хүрэлбаатар Баяр'
];
const WELLCOM = [
  'Самади Батболд', 'Солонгобат Отгонбаатар', 'Энхтуяа Ням', 'Батсайхан Дамба',
  'Ариунболд Цэрэн', 'Ундрам Батжаргал', 'Тэлмэн Сүхбат', 'Номин Эрдэнэ',
  'Хулан Ганбат', 'Сүхбаатар Дорж', 'Ирээдүй Мягмар', 'Анужин Бат',
  'Золбоо Насан', 'Мөнхзул Даваа'
];

const roster = {};
ALTAI.forEach((name, i) => { roster[`a${i + 1}`] = { teamId: 'a', name }; });
WELLCOM.forEach((name, i) => { roster[`b${i + 1}`] = { teamId: 'b', name }; });

// Session 1 (finished) — the six foursomes, 3.5 to Altai.
const S1 = [
  // 3 & 2 to Altai.
  { n: 1, a: [1, 2], b: [1, 2], holes: holes('a', 'a', h, 'a', h, h, h, h, h, h, h, h, h, h, h, h) },
  // 2 & 1 to Wellcom.
  { n: 2, a: [3, 4], b: [3, 4], holes: holes('b', h, 'b', h, h, h, h, h, h, h, h, h, h, h, h, h, h) },
  // Halved over 18.
  { n: 3, a: [5, 6], b: [5, 6], holes: holes(...Array(18).fill(h)) },
  // 1 UP to Altai, decided on the last green.
  { n: 4, a: [7, 8], b: [7, 8], holes: holes('a', ...Array(17).fill(h)) },
  // 5 & 4 to Wellcom.
  { n: 5, a: [9, 10], b: [9, 10], holes: holes('b', 'b', 'b', 'b', 'b', h, h, h, h, h, h, h, h, h) },
  // 2 UP to Altai.
  { n: 6, a: [11, 12], b: [11, 12], holes: holes('a', h, 'a', ...Array(15).fill(h)) }
];

// Session 2 (running) — every live shape worth looking at.
const S2 = [
  // Altai 2 UP thru 11 — the spec's own example card.
  { n: 7, a: [1, 2], b: [1, 2], tee: '13:00', holes: holes('a', h, 'a', h, h, 'b', 'a', h, h, h, h) },
  // All square thru 14.
  { n: 8, a: [3, 5], b: [3, 5], tee: '13:10', holes: holes('a', 'b', h, 'a', 'b', h, h, h, h, h, h, h, h, h) },
  // Wellcom 3 UP with 3 to play — dormie.
  { n: 9, a: [7, 9], b: [7, 9], tee: '13:20', holes: holes('b', 'b', 'b', ...Array(12).fill(h)) },
  // Suspended mid-round.
  { n: 10, a: [11, 13], b: [11, 13], tee: '13:30', holes: holes('a', h, 'b', h, h, h), suspended: true },
  // Just teed off.
  { n: 11, a: [4, 6], b: [4, 6], tee: '13:40', holes: holes('b', h) },
  // Wellcom 1 UP thru 8.
  { n: 12, a: [8, 10], b: [8, 10], tee: '13:50', holes: holes(h, 'b', h, h, h, h, h, h) }
];

// Session 3 (singles, not yet under way) — twelve matches, one per player,
// fielding everyone except the pair each team opened with. Between the three
// sessions all 14 get a match, so participation reads 14/14 for both teams
// and no session trips the twelve-unique-players rule.
const S3 = Array.from({ length: 12 }, (_, i) => ({
  n: 13 + i,
  a: [i + 3],
  b: [i + 3],
  tee: `0${8 + Math.floor(i / 6)}:${String((i % 6) * 10).padStart(2, '0')}`
}));

function buildMatches() {
  const out = {};
  const add = (sessionId, list, format) => list.forEach(m => {
    const id = `${sessionId}-m${m.n}`;
    out[id] = {
      id,
      sessionId,
      number: m.n,
      teeTime: m.tee || '',
      format,
      players: { a: m.a.map(i => `a${i}`), b: m.b.map(i => `b${i}`) },
      ...(m.holes ? { holes: m.holes } : {}),
      ...(m.suspended ? { stateOverride: 'SUSPENDED' } : {})
    };
  });
  add('s1', S1, 'FOURSOMES');
  add('s2', S2, 'FOURBALL');
  add('s3', S3, 'SINGLES');
  return out;
}

export const MP_DEMO = {
  id: MP_DEMO_ID,
  name: 'M Cup 2026',
  venue: 'Mt. Bogd Golf Club',
  city: 'Улаанбаатар',
  startDate: '2026-08-26',
  endDate: '2026-08-27',
  format: 'ryder',
  status: 'live',
  description: 'Altai Eagles vs Wellcom Diesels — багийн match play тэмцээн.',
  entries: [],
  mp: {
    teams: {
      // Tiny inline SVG monograms, so the logo rendering can be reviewed on
      // preview builds without uploading anything.
      a: {
        name: 'Altai Eagles', short: 'ALTAI', color: '#1f6f43',
        logo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzAiIGZpbGw9IiMxZjZmNDMiLz48cGF0aCBkPSJNMTggNDAgTDMyIDE4IEw0NiA0MCBMMzggNDAgTDMyIDMwIEwyNiA0MCBaIiBmaWxsPSIjZjNlZmU0Ii8+PC9zdmc+'
      },
      b: {
        name: 'Wellcom Diesels', short: 'WELLCOM', color: '#b3382c',
        logo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzAiIGZpbGw9IiNiMzM4MmMiLz48cmVjdCB4PSIxNiIgeT0iMjYiIHdpZHRoPSIyMCIgaGVpZ2h0PSIxNCIgcng9IjIiIGZpbGw9IiNmM2VmZTQiLz48cmVjdCB4PSIzNiIgeT0iMzAiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgcng9IjIiIGZpbGw9IiNmM2VmZTQiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjQzIiByPSI0IiBmaWxsPSIjYjMzODJjIiBzdHJva2U9IiNmM2VmZTQiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjQwIiBjeT0iNDMiIHI9IjQiIGZpbGw9IiNiMzM4MmMiIHN0cm9rZT0iI2YzZWZlNCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+'
      }
    },
    roster,
    sessions: {
      s1: { id: 's1', day: 1, number: 1, format: 'FOURSOMES', startTime: '08:00' },
      s2: { id: 's2', day: 1, number: 2, format: 'FOURBALL', startTime: '13:00' },
      s3: { id: 's3', day: 2, number: 1, format: 'SINGLES', startTime: '08:00' }
    },
    matches: buildMatches()
  }
};

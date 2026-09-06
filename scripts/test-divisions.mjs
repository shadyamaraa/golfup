// scripts/test-divisions.mjs
// Gender divisions inside one stroke play tournament — the pure half: which
// division an entry stands in, which tee it plays, how the boards rank and
// cut on their own, and how the draw keeps them apart.
// Pure modules — no browser, no Firebase. Run with: npm run test:mp

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIVISIONS, tnHasDivisions, entryDivisionInfo, entryDivision, tnTeeFor,
  spEntries, drawGroups, spPlayerStats, SP_HOLES
} from '../src/strokeplay.js';
import { rankEntries, rankByDivision, winners } from '../src/tournament-sheet.js';
import { roundFromTournament } from '../src/handicap.js';

const fullRound = (avg) => Object.fromEntries(
  Array.from({ length: SP_HOLES }, (_, i) => [i + 1, avg]));

// Six men and four women on the Sky course, one round each, the way the JCI
// Open and the JCI Ladies Championship would read as ONE tournament.
const FIELD = () => ({
  format: 'stroke', par: 72, rounds: 2, course: 'sky', spDivisions: 'gender',
  tee: 'blue', rating: 71.5, slope: 130, womenTee: 'goldLadies', womenRating: 72.8, womenSlope: 134,
  sp: {
    players: {
      m1: { name: 'Бат', userId: 'm1', division: 'male', hcp: 4 },
      m2: { name: 'Дорж', userId: 'm2', division: 'male', hcp: 8 },
      m3: { name: 'Тулга', userId: 'm3', division: 'male', hcp: 12 },
      m4: { name: 'Ганбат', userId: 'm4', division: 'male', hcp: 16 },
      m5: { name: 'Энхжин', userId: 'm5', division: 'male', hcp: 20 },
      m6: { name: 'Мөнх', userId: 'm6', division: 'male', hcp: 24 },
      w1: { name: 'Сараа', userId: 'w1', division: 'female', hcp: 10 },
      w2: { name: 'Хулан', userId: 'w2', division: 'female', hcp: 14 },
      w3: { name: 'Номин', userId: 'w3', division: 'female', hcp: 18 },
      w4: { name: 'Ундрам', userId: 'w4', division: 'female', hcp: 22 },
    },
    scores: {
      m1: { 1: fullRound(4) }, m2: { 1: { ...fullRound(4), 1: 5 } }, m3: { 1: { ...fullRound(4), 1: 6 } },
      m4: { 1: { ...fullRound(4), 1: 7 } }, m5: { 1: { ...fullRound(4), 1: 8 } }, m6: { 1: { ...fullRound(4), 1: 9 } },
      w1: { 1: { ...fullRound(4), 1: 5 } }, w2: { 1: { ...fullRound(4), 1: 5 } },
      w3: { 1: { ...fullRound(4), 1: 8 } }, w4: { 1: { ...fullRound(4), 1: 10 } },
    }
  }
});

// This morning's Han Bogd Cup as one record: two-person scramble, a men's
// pair, a women's pair, a mixed pair and one the admin overrode.
const CUP = () => ({
  format: 'scramble', spTeamSize: 2, par: 72, rounds: 1, course: 'sky', spDivisions: 'gender',
  tee: 'blue', rating: 71.5, slope: 130, womenTee: 'goldLadies', womenRating: 72.8, womenSlope: 134,
  sp: {
    players: {
      'a1+a2': { kind: 'team', name: 'Бат / Дорж', members: { a1: true, a2: true }, hcp: 2 },
      'b1+b2': { kind: 'team', name: 'Сараа / Хулан', members: { b1: true, b2: true }, hcp: 4 },
      'c1+c2': { kind: 'team', name: 'Тулга / Номин', members: { c1: true, c2: true }, hcp: 3 },
      'd1+d2': { kind: 'team', name: 'Ундрам / Оюун', members: { d1: true, d2: true }, hcp: 5, division: 'male' },
      a1: { name: 'Бат', userId: 'a1', division: 'male' }, a2: { name: 'Дорж', userId: 'a2', division: 'male' },
      b1: { name: 'Сараа', userId: 'b1', division: 'female' }, b2: { name: 'Хулан', userId: 'b2', division: 'female' },
      c1: { name: 'Тулга', userId: 'c1', division: 'male' }, c2: { name: 'Номин', userId: 'c2', division: 'female' },
      d1: { name: 'Ундрам', userId: 'd1', division: 'female' }, d2: { name: 'Оюун', userId: 'd2', division: 'female' },
    },
    scores: { 'a1+a2': { 1: fullRound(4) }, 'b1+b2': { 1: { ...fullRound(4), 1: 5 } }, 'c1+c2': { 1: { ...fullRound(4), 1: 6 } } }
  }
});

test('divisions are on only when the record says gender', () => {
  assert.deepEqual(DIVISIONS, ['male', 'female']);
  assert.ok(tnHasDivisions({ spDivisions: 'gender' }));
  for (const v of ['', undefined, null, 'age', 'GENDER']) {
    assert.equal(tnHasDivisions({ spDivisions: v }), false, `${JSON.stringify(v)} must be off`);
  }
  assert.equal(tnHasDivisions(null), false);
});

test('an entry stands in its own division, a team in its members’, and nothing means male', () => {
  const { players } = CUP().sp;
  assert.deepEqual(entryDivisionInfo(players, 'b1'), { division: 'female', source: 'set' });
  assert.deepEqual(entryDivisionInfo(players, 'a1'), { division: 'male', source: 'set' });
  // A team without a division of its own takes its members'.
  assert.deepEqual(entryDivisionInfo(players, 'b1+b2'), { division: 'female', source: 'derived' });
  assert.deepEqual(entryDivisionInfo(players, 'a1+a2'), { division: 'male', source: 'derived' });
  // A mixed pair stands with the men.
  assert.deepEqual(entryDivisionInfo(players, 'c1+c2'), { division: 'male', source: 'derived' });
  // Two women the admin put on the men's board: the override wins.
  assert.deepEqual(entryDivisionInfo(players, 'd1+d2'), { division: 'male', source: 'set' });
  // Nothing to go on — a manual player, a member added before the field
  // existed, a pid that is not there at all — is male, and says so.
  assert.deepEqual(entryDivisionInfo({ p_x: { name: 'Гуест' } }, 'p_x'), { division: 'male', source: 'fallback' });
  assert.deepEqual(entryDivisionInfo(players, 'nobody'), { division: 'male', source: 'fallback' });
  assert.deepEqual(entryDivisionInfo(null, 'x'), { division: 'male', source: 'fallback' });
  // A team whose member has no division is not all-women.
  const half = { 't': { kind: 'team', members: { x: true, y: true } }, x: { division: 'female' }, y: { name: 'Y' } };
  assert.equal(entryDivision(half, 't'), 'male');
  // An empty team derives nothing.
  assert.equal(entryDivision({ t: { kind: 'team', members: {} } }, 't'), 'male');
});

test('the women’s division plays its own tee — only when it exists and divisions are on', () => {
  const tn = FIELD();
  assert.deepEqual(tnTeeFor(tn, 'female'), { tee: 'goldLadies', rating: 72.8, slope: 134 });
  assert.deepEqual(tnTeeFor(tn, 'male'), { tee: 'blue', rating: 71.5, slope: 130 });
  // Switched off: the women's tee left on the record is inert.
  assert.deepEqual(tnTeeFor({ ...tn, spDivisions: '' }, 'female'), { tee: 'blue', rating: 71.5, slope: 130 });
  // A key with no numbers behind it is not a tee.
  assert.deepEqual(tnTeeFor({ ...tn, womenRating: null }, 'female'), { tee: 'blue', rating: 71.5, slope: 130 });
  assert.deepEqual(tnTeeFor({ ...tn, womenSlope: undefined }, 'female'), { tee: 'blue', rating: 71.5, slope: 130 });
  // A custom course has no tees at all, and says so with nulls either way.
  assert.deepEqual(tnTeeFor({ spDivisions: 'gender' }, 'female'), { tee: null, rating: null, slope: null });
  assert.deepEqual(tnTeeFor(null, 'male'), { tee: null, rating: null, slope: null });
});

test('entries carry their division only when the tournament has divisions', () => {
  const on = spEntries(FIELD(), 'gross');
  assert.equal(on.length, 10);
  assert.ok(on.every(e => e.division === 'male' || e.division === 'female'));
  assert.equal(on.filter(e => e.division === 'female').length, 4);
  // Off: the key is ABSENT, not null — the entry shape is exactly what it was.
  const off = spEntries({ ...FIELD(), spDivisions: '' }, 'gross');
  assert.ok(off.every(e => !('division' in e)));
  // A team event's entries are the teams, each in its derived division.
  const teams = spEntries(CUP(), 'gross');
  assert.deepEqual(Object.fromEntries(teams.map(e => [e.pid, e.division])),
    { 'a1+a2': 'male', 'b1+b2': 'female', 'c1+c2': 'male', 'd1+d2': 'male' });
});

test('an undivided list is one board, ranked exactly as rankEntries ranks it', () => {
  const entries = spEntries({ ...FIELD(), spDivisions: '' }, 'gross');
  const boards = rankByDivision(entries);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].division, null);
  assert.deepEqual(boards[0].entries, rankEntries(entries));
  // A legacy sheet snapshot has no division field either.
  const legacy = [{ name: 'A', total: -1, thru: 'F' }, { name: 'B', total: 2, thru: 'F' }];
  assert.deepEqual(rankByDivision(legacy), [{ division: null, entries: rankEntries(legacy) }]);
  assert.deepEqual(rankByDivision([]), [{ division: null, entries: [] }]);
  assert.deepEqual(rankByDivision(null), [{ division: null, entries: [] }]);
});

test('a divided list is two boards, men first, positions starting again on each', () => {
  const boards = rankByDivision(spEntries(FIELD(), 'gross'));
  assert.deepEqual(boards.map(b => b.division), ['male', 'female']);
  const [men, women] = boards;
  assert.equal(men.entries.length, 6);
  assert.equal(women.entries.length, 4);
  assert.equal(men.entries[0].pid, 'm1');
  assert.equal(men.entries[0].posLabel, '1');
  // The women's leaders are level on +1 — a tie on THEIR board, 1 and 3 after.
  assert.deepEqual(women.entries.map(e => e.posLabel), ['T1', 'T1', '3', '4']);
  assert.deepEqual(winners(women.entries).map(e => e.pid).sort(), ['w1', 'w2']);
  // Had the field been ranked as one, Сараа would be T2 behind Бат.
  assert.equal(rankEntries(spEntries(FIELD(), 'gross')).find(e => e.pid === 'w1').posLabel, 'T2');
});

test('the cut is taken per board, when THAT board’s next round starts', () => {
  const tn = FIELD();
  tn.cutAfterRound = 1;
  tn.cutSize = 3;
  // The men are into round two; the women have not teed off.
  tn.sp.scores.m1[2] = { 1: 4, 2: 4 };
  const opts = { cutAfterRound: 1, cutSize: 3 };
  const [men, women] = rankByDivision(spEntries(tn, 'gross'), opts);
  assert.deepEqual(men.entries.map(e => e.posLabel), ['1', '2', '3', 'CUT', 'CUT', 'CUT']);
  // Ranked as one field the top 3 of ten would have cut every woman but none of them yet;
  // per board the women are simply still playing round one.
  assert.ok(women.entries.every(e => e.posLabel !== 'CUT'), 'no woman is cut before her division plays R2');
  // The women's turn: a round-two score on their board applies their cut —
  // and Сараа's birdie on the first (par 5) moves her clear of Хулан.
  tn.sp.scores.w1[2] = { 1: 4 };
  const after = rankByDivision(spEntries(tn, 'gross'), opts);
  assert.deepEqual(after[1].entries.map(e => e.posLabel), ['1', '2', '3', 'CUT']);
  assert.equal(after[1].entries[0].pid, 'w1');
  // The men's board is untouched by the women's round.
  assert.deepEqual(after[0].entries.map(e => e.posLabel), ['1', '2', '3', 'CUT', 'CUT', 'CUT']);
});

test('an empty division is left out; an entry without one stands with the men', () => {
  const tn = FIELD();
  ['w1', 'w2', 'w3', 'w4'].forEach(pid => { delete tn.sp.players[pid]; delete tn.sp.scores[pid]; });
  const boards = rankByDivision(spEntries(tn, 'gross'));
  assert.deepEqual(boards.map(b => b.division), ['male']);
  // Hand-built entries, one of them unlabelled: it ranks among the men.
  const mixed = [
    { pid: 'a', name: 'A', total: -2, thru: 'F', division: 'female' },
    { pid: 'b', name: 'B', total: -1, thru: 'F', division: 'male' },
    { pid: 'c', name: 'C', total: -3, thru: 'F' },
  ];
  const [men, women] = rankByDivision(mixed);
  assert.deepEqual(men.entries.map(e => e.pid), ['c', 'b']);
  assert.deepEqual(women.entries.map(e => e.pid), ['a']);
});

test('Stableford ranks each board points-first, as one board does', () => {
  const tn = { ...FIELD(), spScoring: 'stableford' };
  const boards = rankByDivision(spEntries(tn, 'stableford'), { higherWins: true });
  for (const b of boards) {
    const pts = b.entries.map(e => e.total);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i - 1] >= pts[i], `${b.division} board must read highest first`);
  }
});

test('the draw never puts the two divisions in one flight, and numbers on through', () => {
  const tn = FIELD();
  const seq = [0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6, 0.05];
  let i = 0;
  const groups = drawGroups(tn, { method: 'random', size: 4, rnd: () => seq[i++ % seq.length] });
  const div = (pid) => entryDivision(tn.sp.players, pid);
  groups.forEach(g => assert.equal(new Set(g.map(div)).size, 1, `mixed flight: ${g}`));
  // Six men → 4 + 2? No: chunkGroups spreads them 3/3; four women → one flight of 4.
  assert.deepEqual(groups.map(g => g.length), [3, 3, 4]);
  assert.ok(groups.slice(0, 2).every(g => g.every(p => div(p) === 'male')), 'men first');
  assert.ok(groups[2].every(p => div(p) === 'female'));
  // HCP snake, still one division per flight.
  const byHcp = drawGroups(tn, { method: 'hcp', size: 4 });
  byHcp.forEach(g => assert.equal(new Set(g.map(div)).size, 1));
  assert.equal(byHcp.length, 3);
  // Standings: leaders last WITHIN each division.
  const byStand = drawGroups(tn, { method: 'standings', size: 4 });
  byStand.forEach(g => assert.equal(new Set(g.map(div)).size, 1));
  assert.ok(byStand[1].includes('m1'), 'the men’s leader tees off in the last men’s flight');
  assert.ok(byStand[2].includes('w1') && byStand[2].includes('w2'));
});

test('a team event draws teams by their derived division', () => {
  const tn = CUP();
  const groups = drawGroups(tn, { method: 'hcp', size: 2 });
  const div = (pid) => entryDivision(tn.sp.players, pid);
  groups.forEach(g => assert.equal(new Set(g.map(div)).size, 1));
  // Three men's teams (one mixed, one overridden) and one women's team.
  const flat = groups.flat();
  assert.deepEqual(flat.filter(p => div(p) === 'male').sort(), ['a1+a2', 'c1+c2', 'd1+d2']);
  assert.deepEqual(flat.filter(p => div(p) === 'female'), ['b1+b2']);
});

test('with divisions off the draw is byte-for-byte what it was', () => {
  const tn = { ...FIELD(), spDivisions: '' };
  const seq = [0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6, 0.05];
  let i = 0;
  const groups = drawGroups(tn, { method: 'random', size: 4, rnd: () => seq[i++ % seq.length] });
  // Ten players at size four spread 4/3/3 over ONE field, divisions ignored.
  assert.deepEqual(groups.map(g => g.length), [4, 3, 3]);
  const stand = drawGroups(tn, { method: 'standings', size: 4 });
  assert.ok(stand[stand.length - 1].includes('m1'), 'the overall leader goes out last');
});

test('a player’s field average is her own division’s', () => {
  const tn = FIELD();
  // The men's rounds average lower; a woman's field average must ignore them.
  const her = spPlayerStats(tn, 'w1', 1);
  const womenGross = ['w1', 'w2', 'w3', 'w4'].map(p => Object.values(tn.sp.scores[p][1]).reduce((a, b) => a + b, 0));
  assert.equal(her.fieldAvg, womenGross.reduce((a, b) => a + b, 0) / 4);
  const him = spPlayerStats(tn, 'm1', 1);
  assert.notEqual(him.fieldAvg, her.fieldAvg);
  // Off: everyone counts.
  const all = spPlayerStats({ ...tn, spDivisions: '' }, 'w1', 1);
  assert.equal(all.fieldAvg, (womenGross.reduce((a, b) => a + b, 0)
    + ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(p => Object.values(tn.sp.scores[p][1]).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0)) / 10);
});

test('a WHS round posted on the women’s tee carries that tee’s rating and slope', () => {
  const tn = { ...FIELD(), id: 'tn1', startDate: '2026-09-06' };
  const holes = fullRound(4);
  const tee = tnTeeFor(tn, 'female');
  const rec = roundFromTournament({ ...tn, rating: tee.rating, slope: tee.slope }, 'w1', 1, holes);
  assert.equal(rec.courseRating, 72.8);
  assert.equal(rec.slopeRating, 134);
  const blue = roundFromTournament(tn, 'm1', 1, holes);
  assert.equal(blue.courseRating, 71.5);
  // Same 72 strokes, a different differential: that is the whole point of the tee.
  assert.notEqual(rec.differential, blue.differential);
  // scoreDifferential rounds to a tenth, as WHS does.
  assert.equal(rec.differential, Math.round((113 / 134) * (72 - 72.8) * 10) / 10);
  assert.equal(blue.differential, Math.round((113 / 130) * (72 - 71.5) * 10) / 10);
});

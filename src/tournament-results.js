// src/tournament-results.js
// The result of a tournament, read the way a tour's results page reads it:
// who won (or leads), the final table with positions and ties, who missed
// the cut, who withdrew, and the field's numbers for the day — or, for an
// M Cup, the two teams' points and every session's matches.
//
// Pure: no DOM, no Firebase, no i18n. The results page, the printed sheet and
// the shared image all read this one model, so they cannot disagree with each
// other or with the leaderboard — the ranking is tournament-sheet.js's own,
// the entries strokeplay.js's, the match points matchplay.js's. Labels are
// the caller's business; this module carries values.

import {
  spEntries, spActive, spMetricFor, tnScoring, tnIsTeam, tnTeamSize, tnPars,
  spPlayerCard, roundGross, SP_HOLES
} from './strokeplay.js';
import { rankByDivision, winners, activeRound, isRetired, isCut } from './tournament-sheet.js';
import {
  teamTotals, sessionTotals, settleMatch, statusText, matchState, tournamentComplete,
  playerStats, tnKind, DEFAULT_HOLES, UNGROUPED
} from './matchplay.js';
import { teamName, teamShort, teamColor, teamLogo } from './matchplay-view.js';

// How many rows the shared image and the tournament page's summary show.
export const RESULT_TOP = 10;

/**
 * The model. `state` is the tournament's state as app.js reads it
 * ('final' | 'live' | 'upcoming'); the model only carries it through, so a
 * caller that has already decided never has to decide twice. `metric` is the
 * board reading for a stroke tournament — gross by default, the tournament's
 * own reading, exactly as the browse row ranks it.
 */
export function tnResultModel(tn, { state = 'final', metric = 'gross' } = {}) {
  const kind = tnKind(tn);
  if (kind === 'ryder') return ryderModel(tn, state);
  if (kind === 'match') return singlesModel(tn, state);
  return strokeModel(tn, state, metric);
}

// ---- Stroke play, Stableford, team events ----

function strokeModel(tn, state, metric) {
  const points = tnScoring(tn) === 'stableford';
  const entries = spActive(tn)
    ? spEntries(tn, spMetricFor(tn, metric))
    : (Array.isArray(tn?.entries) ? tn.entries : []);
  const opts = { cutAfterRound: tn?.cutAfterRound, cutSize: tn?.cutSize, higherWins: points };
  const rounds = Math.max(1, Number(tn?.rounds) || 1);
  const round = activeRound(entries, tn?.currentRound);

  const boards = rankByDivision(entries, opts).map(b => {
    const inPlay = b.entries.filter(e => e.rank !== Infinity);
    const cut = b.entries.filter(e => e.rank === Infinity && isCut(e.status));
    const retired = b.entries.filter(e => e.rank === Infinity && !isCut(e.status) && isRetired(e.status));
    const idle = b.entries.filter(e => e.rank === Infinity && !isCut(e.status) && !isRetired(e.status));
    return {
      division: b.division,
      entries: b.entries,
      leaders: winners(b.entries),
      inPlay,
      top: inPlay.slice(0, RESULT_TOP),
      cut,
      retired,
      idle,
      cutSize: Number(tn?.cutSize) || 0,
      cutAfterRound: Number(tn?.cutAfterRound) || 0
    };
  });

  return {
    kind: 'stroke',
    state,
    points,
    team: tnIsTeam(tn),
    teamSize: tnIsTeam(tn) ? tnTeamSize(tn) : 1,
    rounds,
    round,
    par: Number(tn?.par) || 72,
    hasHcp: entries.some(e => e.hcp !== null && e.hcp !== undefined),
    players: entries.length,
    boards,
    stats: strokeStats(tn, entries, rounds)
  };
}

// The field's numbers: per round the low round (every player level on it)
// and the scoring average over complete rounds; eagles and birdies across
// the whole field where the course's per-hole pars are known; how many of
// the field have every round in. Null when nothing has been scored in-app —
// a sheet-era record carries totals only.
function strokeStats(tn, entries, rounds) {
  if (!spActive(tn)) return null;
  const scores = tn.sp.scores || {};
  const pars = tnPars(tn);
  const par = Number(tn?.par) || 72;
  const nameOf = new Map(entries.map(e => [e.pid, e.name]));
  // A fourball team has no card of its own, so it carries nothing here; its
  // members are not on the board either. Everyone else on the board scores.
  const pids = entries.map(e => e.pid).filter(pid => scores[pid]);
  if (!pids.length) return null;

  const perRound = [];
  let eagles = 0;
  let birdies = 0;
  let best = null;
  let scoredRounds = 0;
  for (let r = 1; r <= rounds; r++) {
    let sum = 0;
    let n = 0;
    let low = [];
    pids.forEach(pid => {
      const { gross, holesIn, toPar } = roundGross(scores[pid]?.[r], pars);
      if (holesIn < SP_HOLES) return;
      sum += gross;
      n += 1;
      const rec = { pid, name: nameOf.get(pid) || pid, round: r, gross, toPar: toPar !== null ? toPar : gross - par };
      if (!low.length || gross < low[0].gross) low = [rec];
      else if (gross === low[0].gross) low.push(rec);
      if (!best || gross < best.gross) best = rec;
      if (pars) {
        spPlayerCard(tn, pid, r).holes.forEach(h => {
          if (h.cls === 'eagle') eagles += 1;
          else if (h.cls === 'birdie') birdies += 1;
        });
      }
    });
    if (n) {
      scoredRounds += 1;
      perRound.push({ round: r, count: n, avg: sum / n, low });
    }
  }
  if (!scoredRounds) return null;

  const finished = pids.filter(pid => {
    for (let r = 1; r <= rounds; r++) {
      if (roundGross(scores[pid]?.[r]).holesIn < SP_HOLES) return false;
    }
    return true;
  }).length;

  return {
    hasPars: !!pars,
    players: entries.length,
    finished,
    eagles: pars ? eagles : null,
    birdies: pars ? birdies : null,
    rounds: perRound,
    best
  };
}

// ---- M Cup ----

function ryderModel(tn, state) {
  const mp = tn?.mp || {};
  const matches = Object.values(mp.matches || {}).filter(Boolean);
  const total = teamTotals(matches);
  const winner = total.a > total.b ? 'a' : total.b > total.a ? 'b' : null;
  const totals = sessionTotals(matches);

  const names = (m, k) => (m.players?.[k] || [])
    .map(pid => mp.roster?.[pid]?.name || '').filter(Boolean);
  const matchRow = (m) => {
    const st = matchState(m);
    const settled = settleMatch(m.holes, m.totalHoles || DEFAULT_HOLES);
    return {
      id: m.id,
      number: m.number ?? null,
      a: names(m, 'a'),
      b: names(m, 'b'),
      state: st,
      // The score line the way it is said: "4 & 3", "2 UP", "AS", "HALVED".
      result: st === 'UPCOMING' ? '' : statusText(settled),
      thru: settled.thru,
      // Decided matches name their winner; a halved one has none. Undecided
      // ones name the leader instead.
      winner: st === 'COMPLETED' ? settled.winner : null,
      leader: st === 'COMPLETED' ? null : settled.leader
    };
  };
  const byNumber = (x, y) => (Number(x.number) || 0) - (Number(y.number) || 0);

  const known = Object.values(mp.sessions || {}).filter(Boolean)
    .sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0)
      || (Number(a.number) || 0) - (Number(b.number) || 0));
  const sessions = known.map(s => ({
    id: s.id,
    day: s.day ?? null,
    number: s.number ?? null,
    format: s.format || '',
    startTime: s.startTime || '',
    totals: totals[s.id] || { a: 0, b: 0 },
    matches: matches.filter(m => m.sessionId === s.id).sort(byNumber).map(matchRow)
  }));
  // A match whose session is missing still carries points, so it keeps a
  // row of its own rather than making the sessions disagree with the total.
  const stray = matches.filter(m => !known.some(s => s.id === m.sessionId));
  if (stray.length) {
    sessions.push({
      id: UNGROUPED, day: null, number: null, format: '', startTime: '',
      totals: teamTotals(stray),
      matches: stray.sort(byNumber).map(matchRow)
    });
  }

  const team = (k) => ({
    key: k,
    name: teamName(mp, k),
    short: teamShort(mp, k),
    color: teamColor(mp, k),
    logo: teamLogo(mp, k),
    points: total[k]
  });

  return {
    kind: 'ryder',
    state,
    complete: tournamentComplete(mp),
    teams: { a: team('a'), b: team('b') },
    winner,
    sessions,
    matches: matches.length,
    played: matches.filter(m => matchState(m) === 'COMPLETED').length
  };
}

// ---- Plain match play: a draw of singles has standings, not a board ----

function singlesModel(tn, state) {
  const mp = tn?.mp || {};
  const stats = playerStats(mp);
  const rows = Object.entries(stats)
    .map(([pid, s]) => ({ pid, name: mp.roster?.[pid]?.name || pid, ...s }))
    .sort((x, y) => y.points - x.points || y.w - x.w || x.name.localeCompare(y.name));
  const counts = new Map();
  rows.forEach(r => counts.set(r.points, (counts.get(r.points) || 0) + 1));
  let pos = 0;
  rows.forEach((r, i) => {
    if (i === 0 || rows[i - 1].points !== r.points) pos = i + 1;
    r.rank = pos;
    r.posLabel = `${counts.get(r.points) > 1 ? 'T' : ''}${pos}`;
  });
  const matches = Object.values(mp.matches || {}).filter(Boolean);
  return {
    kind: 'singles',
    state,
    complete: tournamentComplete(mp),
    standings: rows,
    leaders: rows.filter(r => r.rank === 1),
    top: rows.slice(0, RESULT_TOP),
    matches: matches.length,
    played: matches.filter(m => matchState(m) === 'COMPLETED').length
  };
}

// ---- Readings shared by every surface ----

// A to-par total as golfers write it; a points total as a plain number.
export function resultScoreText(v, points = false) {
  if (v === undefined || v === null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (points) return String(n);
  if (n === 0) return 'E';
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

// Match play points print as 8.5, never 8.50 or 8.
export const resultPointsText = (n) => (Number(n) % 1 ? Number(n).toFixed(1) : String(Number(n) || 0));

// Whether a total reads under par — the one colour a results sheet uses.
export const resultUnder = (v, points = false) => !points && Number(v) < 0;

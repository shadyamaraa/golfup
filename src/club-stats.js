// src/club-stats.js
// The club's numbers for anyone who opens ubgolf.club: a season in figures
// and the champions wall. Pure — no DOM, no Firebase, no i18n — so every
// figure is checked in scripts/test-club-stats.mjs against hand-made
// tournaments. The public landing and the statistics page only lay these out.
//
// Names appear only where they are already on a public board (a champion, a
// low round).

import { tnResultModel } from './tournament-results.js';
import { spActive, isTeamEntry, teamMemberIds, tnScoring, tnIsTeam, tnPars, spPlayerCard, courseByKey, SP_HOLES } from './strokeplay.js';
import { nameKey } from './tournament-sheet.js';
import { tnKind } from './matchplay.js';
import { tnLogo } from './tournament-media.js';

const DAY = 86400000;

const dayMs = (s) => {
  if (!s) return null;
  const ms = new Date(`${s}T00:00:00`).getTime();
  return isNaN(ms) ? null : ms;
};

/** The year a tournament belongs to — its start date's. Null without one. */
export function tnYear(tn) {
  const y = Number(String(tn?.startDate || '').slice(0, 4));
  return y > 1900 ? y : null;
}

/**
 * live | final | upcoming — the same reading app.js's tnStatus gives: an
 * explicit status wins, otherwise the dates, the end date counting as a
 * whole day. Here so the model runs without app.js; the page hands in the
 * app's own function through `stateOf` and the two agree.
 */
export function tnState(tn, now = Date.now()) {
  if (tn?.status === 'live' || tn?.status === 'final' || tn?.status === 'upcoming') return tn.status;
  const start = dayMs(tn?.startDate);
  if (start === null) return 'upcoming';
  if (now < start) return 'upcoming';
  const end = dayMs(tn?.endDate || tn?.startDate);
  if (end !== null && now >= end + DAY) return 'final';
  return 'live';
}

const liveList = (tns) => (Array.isArray(tns) ? tns : []).filter(tn => tn && tn.id && tn.status !== 'deleted');
const endMs = (tn) => dayMs(tn.endDate || tn.startDate) || 0;

/** The years with a tournament, newest first. */
export function seasonYears(tns) {
  return [...new Set(liveList(tns).map(tnYear).filter(Boolean))].sort((a, b) => b - a);
}

/** This year when it has a tournament, else the newest year that does, else this year. */
export function defaultSeasonYear(tns, now = Date.now()) {
  const thisYear = new Date(now).getFullYear();
  const years = seasonYears(tns);
  return years.includes(thisYear) ? thisYear : (years[0] || thisYear);
}

// One key per person across every roster shape, so a member who played
// three tournaments counts once: a member's pid is their userId; a guest
// entry keyed p_… counts by name; a team counts its members, not itself.
function personKeys(tn) {
  const keys = new Set();
  // nameKey wants two tokens; a one-word guest still needs a key of their own.
  const byName = (name) => `n:${nameKey(name) || String(name).trim().toLowerCase()}`;
  const keyOf = (id, rec) => rec?.userId || (String(id).startsWith('p_') && rec?.name ? byName(rec.name) : String(id));
  if (spActive(tn)) {
    Object.entries(tn.sp.players || {}).forEach(([pid, p]) => {
      if (!p) return;
      if (isTeamEntry(p)) teamMemberIds(p).forEach(id => keys.add(keyOf(id, p.members?.[id])));
      else keys.add(keyOf(pid, p));
    });
  } else if (tn?.mp?.roster) {
    Object.entries(tn.mp.roster).forEach(([pid, r]) => { if (r) keys.add(keyOf(pid, r)); });
  } else if (Array.isArray(tn?.entries)) {
    tn.entries.forEach(e => { if (e?.name) keys.add(e.userId || byName(e.name)); });
  }
  return keys;
}

/**
 * One season in numbers. `year` defaults to defaultSeasonYear; `stateOf`
 * is the app's tnStatus when the page calls, tnState in the tests.
 */
export function seasonStats(tns, { year, now = Date.now(), stateOf } = {}) {
  const state = stateOf || ((tn) => tnState(tn, now));
  const all = liveList(tns);
  const y = year || defaultSeasonYear(all, now);
  const list = all.filter(tn => tnYear(tn) === y);
  const players = new Set();
  let rounds = 0;
  let matches = 0;
  let eagles = 0;
  let birdies = 0;
  let hasPars = false;
  let lowRound = null;
  const byFormat = { stroke: 0, stableford: 0, team: 0, ryder: 0, match: 0 };
  const counts = { live: 0, upcoming: 0, finished: 0 };

  list.forEach(tn => {
    const st = state(tn);
    counts[st === 'final' ? 'finished' : st] += 1;
    personKeys(tn).forEach(k => players.add(k));
    const kind = tnKind(tn);
    if (kind === 'ryder' || kind === 'match') {
      byFormat[kind] += 1;
      matches += tnResultModel(tn, { state: st }).played || 0;
      return;
    }
    if (tnScoring(tn) === 'stableford') byFormat.stableford += 1;
    else if (tnIsTeam(tn)) byFormat.team += 1;
    else byFormat.stroke += 1;
    const stats = tnResultModel(tn, { state: st }).stats;
    if (!stats) return;
    stats.rounds.forEach(r => {
      rounds += r.count;
      r.low.forEach(rec => {
        if (!lowRound || rec.gross < lowRound.gross) {
          lowRound = { name: rec.name, gross: rec.gross, toPar: rec.toPar, round: rec.round, tnId: tn.id, tnName: tn.name || '', tied: 1 };
        } else if (rec.gross === lowRound.gross) lowRound.tied += 1;
      });
    });
    if (stats.hasPars) {
      hasPars = true;
      eagles += stats.eagles || 0;
      birdies += stats.birdies || 0;
    }
  });

  return {
    year: y,
    tournaments: list.length,
    live: counts.live,
    upcoming: counts.upcoming,
    finished: counts.finished,
    players: players.size,
    rounds,
    matches,
    lowRound,
    eagles: hasPars ? eagles : null,
    birdies: hasPars ? birdies : null,
    hasPars,
    byFormat
  };
}

/**
 * Every finished tournament with someone to name, newest first: the winners
 * per division of a stroke event, the two teams and the winner of a cup,
 * the standings leader of a singles draw (a draw has no winner — the caption
 * is the page's to choose). homeHidden stays: that flag is about the home
 * strip, not about history. A finished event nobody scored is not a champion.
 */
export function championsWall(tns, { now = Date.now(), stateOf } = {}) {
  const state = stateOf || ((tn) => tnState(tn, now));
  const rows = [];
  liveList(tns).forEach(tn => {
    if (state(tn) !== 'final') return;
    const model = tnResultModel(tn, { state: 'final' });
    const base = {
      id: tn.id, name: tn.name || '', year: tnYear(tn), startDate: tn.startDate || '', endDate: tn.endDate || '',
      venue: tn.venue || '', logo: tnLogo(tn), kind: model.kind, points: !!model.points
    };
    if (model.kind === 'ryder') {
      const { a, b } = model.teams;
      if (!model.played) return;
      rows.push({ ...base, teams: { a, b, winner: model.winner } });
    } else if (model.kind === 'singles') {
      if (!model.leaders.length) return;
      rows.push({ ...base, leaders: model.leaders.map(r => ({ name: r.name, points: r.points })) });
    } else {
      const divisions = model.boards
        .filter(b => b.leaders.length)
        .map(b => ({ division: b.division, winners: b.leaders.map(e => ({ pid: e.pid, name: e.name, total: e.total })), tied: b.leaders.length }));
      if (!divisions.length) return;
      rows.push({ ...base, divisions });
    }
  });
  return rows.sort((x, y) => endMs(y) - endMs(x) || String(y.id).localeCompare(String(x.id)));
}

/**
 * Where the eagles and birdies fell: per course played this season, every
 * hole with its par and how many eagles and birdies the field made there,
 * over every card with a hole on it. Courses with the most cards first;
 * `best` is the hole with the most birdies (the lowest number on a tie).
 * Only tournaments scored in-app on a course whose pars are known count.
 */
export function holeStats(tns, { year, now = Date.now(), stateOf } = {}) {
  const all = liveList(tns);
  const y = year || defaultSeasonYear(all, now);
  const byCourse = new Map();
  all.forEach(tn => {
    if (tnYear(tn) !== y || tnKind(tn) !== 'stroke' || !spActive(tn)) return;
    const pars = tnPars(tn);
    if (!pars) return;
    const rec = courseByKey(tn.course || tn.venue);
    const key = String(rec?.key || rec?.id || tn.course || tn.venue || '?');
    if (!byCourse.has(key)) {
      byCourse.set(key, {
        course: key, name: rec?.name || tn.venue || tn.course || key, cards: 0, eagles: 0, birdies: 0,
        holes: Array.from({ length: SP_HOLES }, (_, i) => ({ hole: i + 1, par: Number(pars[i + 1]) || null, eagles: 0, birdies: 0 }))
      });
    }
    const c = byCourse.get(key);
    const rounds = Math.max(1, Number(tn.rounds) || 1);
    Object.keys(tn.sp.players || {}).forEach(pid => {
      for (let r = 1; r <= rounds; r++) {
        const card = spPlayerCard(tn, pid, r);
        if (!card || !card.total.holesIn) continue;
        c.cards += 1;
        card.holes.forEach(h => {
          if (h.cls === 'eagle') { c.holes[h.hole - 1].eagles += 1; c.eagles += 1; }
          else if (h.cls === 'birdie') { c.holes[h.hole - 1].birdies += 1; c.birdies += 1; }
        });
      }
    });
  });
  return [...byCourse.values()]
    .sort((a, b) => b.cards - a.cards || a.name.localeCompare(b.name))
    .map(c => {
      const best = c.holes.reduce((m, h) => (h.birdies + h.eagles > (m ? m.birdies + m.eagles : 0) ? h : m), null);
      return { ...c, best: best && best.birdies + best.eagles > 0 ? best : null };
    });
}

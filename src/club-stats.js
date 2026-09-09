// src/club-stats.js
// The club's numbers for anyone who opens ubgolf.club: a season in figures,
// the champions wall, and how busy the casual games are. Pure — no DOM, no
// Firebase, no i18n — so every figure is checked in scripts/test-club-stats.mjs
// against hand-made tournaments and games. The public landing and the
// statistics page only lay these out.
//
// Names appear only where they are already on a public board (a champion, a
// low round). The casual-game activity carries counts, never a member.

import { tnResultModel } from './tournament-results.js';
import { spActive, isTeamEntry, teamMemberIds, tnScoring, tnIsTeam } from './strokeplay.js';
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

const arr = (v) => (!v ? [] : Array.isArray(v) ? v : Object.values(v));
const groupsOf = (g) => (!g?.groups ? [] : Array.isArray(g.groups) ? g.groups : Object.values(g.groups));

/**
 * How busy the casual games are — the admin Статистик tab's fold, without
 * the per-player table: games, this month's, players active in the last
 * thirty days, the busiest courses, and a month-by-month count for a bar
 * strip. Deleted games are out; a game with no readable date counts in the
 * totals and nowhere on the calendar.
 */
export function casualActivity(games, { now = Date.now(), months = 6 } = {}) {
  const live = (Array.isArray(games) ? games : []).filter(g => g && g.status !== 'deleted');
  const d = new Date(now);
  const ym = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = ym(d);
  const d30 = now - 30 * DAY;
  const players = new Set();
  const active30 = new Set();
  const locCount = {};
  const monthCount = {};
  live.forEach(g => {
    const month = String(g.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month)) monthCount[month] = (monthCount[month] || 0) + 1;
    if (g.location) locCount[g.location] = (locCount[g.location] || 0) + 1;
    const gMs = new Date(`${g.date}T${String(g.time || '00:00').padStart(5, '0')}`).getTime();
    groupsOf(g).flatMap(arr).forEach(p => {
      if (!p?.id) return;
      players.add(p.id);
      if (!isNaN(gMs) && gMs >= d30 && gMs <= now) active30.add(p.id);
    });
  });
  const byMonth = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const key = ym(m);
    byMonth.push({ ym: key, count: monthCount[key] || 0 });
  }
  return {
    games: live.length,
    thisMonth: monthCount[thisMonth] || 0,
    active30: active30.size,
    players: players.size,
    topLocations: Object.entries(locCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count })),
    byMonth
  };
}

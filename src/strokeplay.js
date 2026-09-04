// src/strokeplay.js
// Pure engine for in-app stroke play scoring, the same shape of module as
// matchplay.js: the per-hole strokes under tournaments/{id}/sp are the only
// stored fact, and everything the leaderboard shows — round totals, to-par,
// net, thru — is recomputed from them on every render. No DOM, no Firebase.
//
// Data model (tournaments/{id}):
//   course: 'sky' | 'chinggis' | ''        // registry key, '' = custom venue
//   tee: 'blue' | ... | null               // registry tee key (optional)
//   rating, slope: number | null           // from the chosen tee (optional)
//   sp: {
//     players: { pid: { name, userId?, hcp?, status? } },
//       // pid IS the member's userId for members; manually added players
//       // (non-members) get a generated 'p_...' id and no userId.
//     scores:  { pid: { [round]: { [hole]: strokes } } }
//   }
//
// A TEAM event (scramble) needs no second data model: a team is simply another
// sp.players entry — kind:'team', its members listed, and the organiser's
// hand-entered team handicap — so its one ball lives at the ordinary
// sp.scores[teamKey] path, the leaderboard ranks it like any other entry, and
// the database rules already let anyone in the flight write it. Its members
// stay in sp.players too (that is what carries the flight pointer the rules
// read) and are simply left off the board.
//
// The board keeps riding the existing pure ranking in tournament-sheet.js
// (rankEntries / cutSet / activeRound): spEntries() emits exactly the entry
// shape those functions and the leaderboard render already consume.

import { courseList, resolveCourse, coursePars, courseSIs } from './courses.js';
import { holePoints, roundPoints } from './stableford.js';
import { strokesReceived } from './handicap.js';
import { settleMatch, statusText, HALVED } from './matchplay.js';

export const SP_HOLES = 18;

// The courses the club actually plays, so creating a tournament is a pick,
// not a form: choosing one fills the venue, city and PAR in one tap. The
// list is the shared registry in courses.js — the same per-hole data the
// casual game scorer uses — addressed here by short key ('sky'/'chinggis').
export const COURSES = courseList();

export const courseByKey = (key) => resolveCourse(key);

// A tournament's per-hole pars/SIs: the course key first, then the venue
// name — an older record whose admin never picked a course still resolves
// when its typed venue ("Mt. Bogd") is a registry alias.
export const tnPars = (tn) => coursePars(tn?.course) || coursePars(tn?.venue);
export const tnSIs = (tn) => courseSIs(tn?.course) || courseSIs(tn?.venue);

// How the organiser chose to score this tournament. Stableford ranks POINTS,
// highest first — the whole board, the cut and the movement arrows follow
// this, so every reader goes through here rather than testing the field.
// A record without the field is stroke play, and is never backfilled.
export const tnScoring = (tn) => (tn?.spScoring === 'stableford' ? 'stableford' : 'strokes');

// Whether a bigger total is a better one.
export const tnHigherWins = (tn) => tnScoring(tn) === 'stableford';

// ---- Team events (scramble, fourball, foursome) ----
//
// The TEAM is the scoring unit and the ranked entry. The whole strokeplay
// stack — spEntries, rankEntries, the cut, the movement arrows, the board, the
// schedule — needs no change for that, because a team is stored as an
// sp.players entry and therefore already looks like a competitor to every one
// of them. Only the scorer and the admin have to know an entry is a team
// rather than a person.
//
// Scramble and foursome play ONE ball: the team's strokes live under the team
// key and no member has a card, so nothing posts to WHS. Fourball is a team
// event too, but each member plays their own ball on their own ordinary card,
// and the team's score is DERIVED — its best ball on every hole — so the
// members' cards post exactly as stroke play does.

export const TN_TEAM_FORMATS = ['scramble', 'fourball', 'foursome'];

// Is this tournament played by teams rather than individuals?
export const tnIsTeam = (tn) => TN_TEAM_FORMATS.includes(tn?.format);

// One ball a team — the team's score is stored, not derived, and no member has
// a card of their own.
export const tnOneBall = (tn) => tn?.format === 'scramble' || tn?.format === 'foursome';

// How many players to a team. A scramble is the organiser's choice, missing
// reads as 4 — the club scramble, because that is what a flight of four
// already is. Fourball and foursome are pairs by definition.
export const tnTeamSize = (tn) => {
  if (tn?.format === 'fourball' || tn?.format === 'foursome') return 2;
  return Number(tn?.spTeamSize) === 2 ? 2 : 4;
};

// What a team event ranks: the whole field on one board, or a contest inside
// each flight. Only two-player teams can meet inside a flight of four, so a
// four-player team event is always a board however the field is stored.
export const tnTeamRank = (tn) =>
  tnIsTeam(tn) && tnTeamSize(tn) === 2 && tn?.spTeamRank === 'match' ? 'match' : 'board';

// A team's id: its members' ids sorted and joined with '+' — the same
// collision-proof shape pairKey() gives a casual game, so a team taken apart
// and put back together the same way finds its scores again.
export const teamKeyOf = (memberIds) =>
  [...(memberIds || [])].map(String).sort().join('+');

// Is this sp.players entry a team rather than a person?
export const isTeamEntry = (p) => p?.kind === 'team';

// A team entry's member ids. Stored as a {pid:true} map rather than an array
// so the database rules can test membership without iterating.
export const teamMemberIds = (p) => Object.keys(p?.members || {});

// Fourball: a team's round, derived from its members' own cards. On every hole
// the team scores its BEST ball — best gross for the gross reading, best net
// with each member off their FULL playing handicap by stroke index (the same
// full allowance a Stableford tournament gives), best points for Stableford.
// One ball is enough: a partner who picked up leaves a blank, which is ordinary
// fourball; a hole with neither ball in stays absent. The three tallies come
// back in the shapes roundGross() and roundPoints() return, so spEntries only
// has to choose them.
export function fourballRound(tn, team, round) {
  const players = tn?.sp?.players || {};
  const sis = tnSIs(tn);
  const pars = tnPars(tn);
  const members = teamMemberIds(team);
  const gross = {};
  let netSum = 0, parIn = 0, holesIn = 0, pts = 0;
  let parKnown = !!pars;
  let pointsKnown = !!pars;
  for (let n = 1; n <= SP_HOLES; n++) {
    const si = sis?.[n] ?? null;
    const par = Number(pars?.[n]);
    let bg = null, bn = null, bp = null;
    members.forEach(m => {
      const strokes = Number(tn?.sp?.scores?.[m]?.[round]?.[n]);
      if (!(strokes > 0)) return;
      const h = Number(players[m]?.hcp);
      const given = Number.isFinite(h) ? strokesReceived(h, si) : 0;
      if (bg === null || strokes < bg) bg = strokes;
      if (bn === null || strokes - given < bn) bn = strokes - given;
      const p = Number.isFinite(par) ? holePoints(strokes, par, given) : null;
      if (p !== null && (bp === null || p > bp)) bp = p;
    });
    if (bg === null) continue;
    holesIn += 1;
    gross[n] = bg;
    netSum += bn;
    if (Number.isFinite(par)) parIn += par; else parKnown = false;
    if (bp === null) pointsKnown = false; else pts += bp;
  }
  return {
    grossRound: roundGross(gross, pars),
    netRound: { gross: netSum, holesIn, toPar: parKnown && holesIn ? netSum - parIn : null },
    pointsRound: { points: pts, holesIn, parsKnown: pointsKnown }
  };
}

// A flight of exactly two teams read as a match — the organiser's 'match'
// choice for a two-player-team event. The hand-entered team handicaps play off
// the lower, the difference allocated by stroke index, and the holes settle
// through the same engine the M Cup and the casual game use. null unless the
// flight holds exactly two teams, so a caller can simply not draw it.
export function spFlightMatch(tn, round, teamPids) {
  if (!Array.isArray(teamPids) || teamPids.length !== 2) return null;
  const players = tn?.sp?.players || {};
  const [a, b] = teamPids;
  if (!isTeamEntry(players[a]) || !isTeamEntry(players[b])) return null;
  const sis = tnSIs(tn);

  if (tn?.format === 'fourball') {
    // Each member plays their own ball, and a side's score on a hole is its
    // best net ball — everyone off the LOWEST of the four in the flight, the
    // reading the casual game and the M Cup give a fourball match. One ball
    // is enough; a side with neither ball in has not finished the hole.
    const sides = [teamMemberIds(players[a]), teamMemberIds(players[b])];
    const hs = sides.flat().map(m => Number(players[m]?.hcp));
    const net = hs.length === 4 && hs.every(Number.isFinite);
    const base = net ? Math.min(...hs) : 0;
    const diffOf = (m) => (net ? Math.round(Number(players[m].hcp) - base) : 0);
    const best = (members, n, si) => {
      const nets = members.map(m => {
        const strokes = Number(tn?.sp?.scores?.[m]?.[round]?.[n]);
        return strokes > 0 ? strokes - strokesReceived(diffOf(m), si) : null;
      }).filter(v => v !== null);
      return nets.length ? Math.min(...nets) : null;
    };
    const holes = {};
    for (let n = 1; n <= SP_HOLES; n++) {
      const si = sis?.[n] ?? null;
      const na = best(sides[0], n, si);
      const nb = best(sides[1], n, si);
      if (na === null || nb === null) continue;
      holes[n] = na < nb ? 'a' : nb < na ? 'b' : HALVED;
    }
    const settled = settleMatch(holes, SP_HOLES);
    const strokes = Object.fromEntries(sides.flat().map(m => [m, diffOf(m)]));
    return { a, b, holes, settled, status: statusText(settled), allowance: { net, base: net ? base : null, a: 0, b: 0, strokes } };
  }

  const ha = Number(players[a].hcp);
  const hb = Number(players[b].hcp);
  const net = Number.isFinite(ha) && Number.isFinite(hb);
  const base = net ? Math.min(ha, hb) : 0;
  const diff = { a: net ? Math.round(ha - base) : 0, b: net ? Math.round(hb - base) : 0 };
  const sa = tn?.sp?.scores?.[a]?.[round] || {};
  const sb = tn?.sp?.scores?.[b]?.[round] || {};
  const holes = {};
  for (let n = 1; n <= SP_HOLES; n++) {
    const ga = Number(sa[n]);
    const gb = Number(sb[n]);
    // A hole either team has not finished stays absent; settleMatch stops there.
    if (!(ga > 0) || !(gb > 0)) continue;
    const si = sis?.[n] ?? null;
    const na = ga - strokesReceived(diff.a, si);
    const nb = gb - strokesReceived(diff.b, si);
    holes[n] = na < nb ? 'a' : nb < na ? 'b' : HALVED;
  }
  const settled = settleMatch(holes, SP_HOLES);
  return { a, b, holes, settled, status: statusText(settled), allowance: { net, base: net ? base : null, ...diff } };
}

// Every team in the tournament, and every player who is not in one — what the
// admin's team builder reads.
export function spTeams(tn) {
  const players = tn?.sp?.players || {};
  const teams = [];
  const claimed = new Set();
  Object.entries(players).forEach(([pid, p]) => {
    if (!isTeamEntry(p)) return;
    const members = teamMemberIds(p);
    members.forEach(m => claimed.add(m));
    teams.push({ pid, ...p, memberIds: members });
  });
  const free = Object.entries(players)
    .filter(([pid, p]) => p && !isTeamEntry(p) && !claimed.has(pid))
    .map(([pid, p]) => ({ pid, ...p }));
  return { teams, free };
}

// Which spEntries metric a tournament's board should ask for. Stableford is
// already played off handicap, so the gross/net toggle does not apply to it.
export const spMetricFor = (tn, uiMetric) =>
  (tnScoring(tn) === 'stableford' ? 'stableford' : (uiMetric === 'net' ? 'net' : 'gross'));

// One round's tally from its hole map: total strokes entered, how many holes
// they cover, and — when the course's per-hole pars are known — the running
// to-par over exactly the holes entered. Non-numeric and non-positive values
// are ignored — an admin clearing a hole writes null, which RTDB drops.
export function roundGross(holes, pars = null) {
  let gross = 0;
  let holesIn = 0;
  let parIn = 0;
  let parKnown = !!pars;
  Object.entries(holes || {}).forEach(([h, v]) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      gross += n;
      holesIn += 1;
      const p = Number(pars?.[h]);
      if (Number.isFinite(p)) parIn += p; else parKnown = false;
    }
  });
  return { gross, holesIn, toPar: parKnown && holesIn ? gross - parIn : null };
}

// Without per-hole pars a round only counts toward totals once every hole is
// in — a single course PAR gives a partial round no honest to-par, which is
// also how the old sheet flow behaved. With the registry's pars the board
// instead posts a running to-par from the first hole (see spEntries).
const completeRounds = (perRound) => perRound.filter(r => r.holesIn >= SP_HOLES);

/**
 * The leaderboard's entries, computed from sp. `metric` picks what `total`
 * and `rounds[]` carry:
 *   'gross'      — to-par as posted;
 *   'net'        — to-par less the player's HCP per completed round;
 *   'stableford' — POINTS, where higher is better (see src/stableford.js).
 *                  Rank these with rankEntries({ higherWins: true }).
 * Every entry also carries gross/net stroke totals and hcp for display, plus
 * pid/userId so a row can be tied to the signed-in member without name
 * matching. Entries with nothing to post have total null (rankEntries sorts
 * them last among those still standing) — that means no complete round on a
 * course without per-hole pars, or no score at all on a registry course.
 */
export function spEntries(tn, metric = 'gross') {
  const sp = tn?.sp;
  if (!sp?.players) return [];
  const par = Number(tn?.par) || 72;
  const pars = tnPars(tn);
  const sis = tnSIs(tn);
  const roundCount = Math.max(1, Number(tn?.rounds) || 1);
  const hcpOf = (p) => {
    const n = Number(p?.hcp);
    return Number.isFinite(n) ? n : null;
  };

  // A team event ranks teams. Their members stay in sp.players — that is what
  // carries the flight pointer the database rules read — but they have no card
  // of their own, so they never appear on the board.
  const teamOnly = tnIsTeam(tn);

  const fourball = tn?.format === 'fourball';

  return Object.entries(sp.players)
    .filter(([, p]) => p && (!teamOnly || isTeamEntry(p)))
    .map(([pid, p]) => {
    // A fourball team has no card of its own: its rounds are derived from its
    // members' cards, best ball by best ball, and it has no team handicap —
    // the net reading is already inside the derived round.
    const fb = fourball && isTeamEntry(p);
    const fbRounds = fb ? Array.from({ length: roundCount }, (_, i) => fourballRound(tn, p, i + 1)) : null;
    const grossRounds = fb
      ? fbRounds.map(r => r.grossRound)
      : Array.from({ length: roundCount }, (_, i) => roundGross(sp.scores?.[pid]?.[i + 1], pars));
    const perRound = fb && metric === 'net' ? fbRounds.map(r => r.netRound) : grossRounds;
    const hcp = fb ? null : hcpOf(p);
    const net = metric === 'net' && hcp !== null;
    // Stableford counts points per hole off the full handicap by stroke
    // index, so a round in progress already has an honest total — and a
    // course with no card cannot be scored in points at all.
    const points = metric === 'stableford'
      ? (fb ? fbRounds.map(r => r.pointsRound)
        : Array.from({ length: roundCount }, (_, i) =>
          roundPoints(sp.scores?.[pid]?.[i + 1], pars, sis, hcp)))
      : null;

    // With the registry's per-hole pars an in-progress round posts its
    // running to-par (net keeps the club's flat reading: the full HCP comes
    // off from the first hole, matching the casual game's netToPar). Without
    // them only a complete round has an honest score.
    const roundToPar = (r) => {
      if (r.toPar !== null && r.holesIn > 0) return r.toPar - (net ? hcp : 0);
      return r.holesIn >= SP_HOLES ? r.gross - par - (net ? hcp : 0) : null;
    };
    const rounds = points
      ? points.map(r => (r.holesIn > 0 && r.parsKnown ? r.points : null))
      : perRound.map(roundToPar);
    const done = completeRounds(grossRounds);
    const grossTotal = done.length ? done.reduce((a, r) => a + r.gross, 0) : null;
    // A fourball team's net total is the sum of its complete net rounds; it has
    // no flat handicap to take off.
    const fbNet = fb ? completeRounds(fbRounds.map(r => r.netRound)) : null;
    const started = rounds.filter(v => v !== null);
    const total = started.length
      ? started.reduce((a, v) => a + v, 0)
      : null;

    // Thru of the latest round anyone has touched: 'F' once that round is
    // complete, the hole count while it runs, '' before the first score.
    let thru = '';
    for (let i = grossRounds.length - 1; i >= 0; i--) {
      if (grossRounds[i].holesIn > 0) {
        thru = grossRounds[i].holesIn >= SP_HOLES ? 'F' : String(grossRounds[i].holesIn);
        break;
      }
    }

    return {
      pid,
      // A team is nobody's card: leaving userId null keeps the "that's me"
      // banner, the home tee card and the WHS posting from ever matching it.
      userId: isTeamEntry(p) ? null : (p.userId || (pid.startsWith('p_') ? null : pid)),
      name: p.name || pid,
      hcp,
      status: p.status || '',
      rounds,
      total,
      gross: grossTotal,
      netTotal: fb
        ? (fbNet.length ? fbNet.reduce((a, r) => a + r.gross, 0) : null)
        : (grossTotal !== null && hcp !== null ? grossTotal - hcp * done.length : null),
      thru
    };
  });
}

// Does this tournament score in the app (vs. a legacy record whose entries
// came from a sheet or file and are simply displayed)?
export const spActive = (tn) => !!tn?.sp?.players;

// Any player with an HCP makes the Net view worth offering.
export const spHasHcp = (tn) =>
  Object.values(tn?.sp?.players || {}).some(p => Number.isFinite(Number(p?.hcp)));

// ---- Groups (flights) ----
// Groups live per ROUND — professional draws regroup every day (R1 by draw,
// R2+ by standings with the leaders off last). Stored twice on purpose:
//   sp/groups/{round}/{gid} = { number, teeTime, players: {pid:true} }
//   sp/players/{pid}/groups/{round} = gid
// The pointer on the player is what the database rules read to allow "anyone
// in my flight may enter my strokes" without iterating groups.

// The player's group id for a round, and the sorted group list.
export const spPlayerGroup = (players, pid, round) =>
  players?.[pid]?.groups?.[round] || null;

export function spGroupList(tn, round) {
  return Object.entries(tn?.sp?.groups?.[round] || {})
    .filter(([, g]) => g)
    .map(([gid, g]) => ({ gid, ...g }))
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0)
      || String(a.teeTime || '').localeCompare(String(b.teeTime || '')));
}

// Chunk an ordered list of pids into groups of `size`, spreading the
// leftover so no one plays alone: 10 players at size 4 → 4/3/3, not 4/4/2.
export function chunkGroups(pids, size = 4) {
  const n = pids.length;
  if (!n) return [];
  const count = Math.max(1, Math.ceil(n / size));
  const base = Math.floor(n / count);
  let extra = n % count;
  const out = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    const take = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    out.push(pids.slice(at, at + take));
    at += take;
  }
  return out;
}

/**
 * The draw: an ordered list of groups (arrays of pids) by `method`.
 *   'random'    — shuffled (rnd() injectable so tests are deterministic);
 *   'hcp'       — snake seeding by HCP so every group mixes strong and weak;
 *   'standings' — by current total, LEADERS LAST (the professional draw:
 *                 the last group off holds the lead), needs `entries` from
 *                 spEntries(); players without a score go out first.
 * WD/DQ players are left out of every draw.
 */
export function drawGroups(tn, { method = 'random', size = 4, round = 1, rnd = Math.random } = {}) {
  const players = tn?.sp?.players || {};
  // A team event draws TEAMS into flights; an individual event never draws a
  // team, even if a stray team entry is left over from a format change.
  const teamOnly = tnIsTeam(tn);
  const pids = Object.keys(players).filter(pid => {
    const p = players[pid];
    if (!p || isTeamEntry(p) !== teamOnly) return false;
    return !['WD', 'DQ'].includes(String(p.status || '').toUpperCase());
  });

  if (method === 'hcp') {
    const hcpOf = (pid) => {
      const n = Number(players[pid]?.hcp);
      return Number.isFinite(n) ? n : 999;
    };
    pids.sort((a, b) => hcpOf(a) - hcpOf(b));
    // Snake over the group count: 1..N, then N..1, so totals even out.
    const count = Math.max(1, Math.ceil(pids.length / size));
    const buckets = Array.from({ length: count }, () => []);
    pids.forEach((pid, i) => {
      const lap = Math.floor(i / count);
      const at = i % count;
      buckets[lap % 2 ? count - 1 - at : at].push(pid);
    });
    return buckets.filter(g => g.length);
  }

  if (method === 'standings') {
    // Whatever the tournament actually ranks by: a Stableford draw has to
    // read points, or "leaders last" would send the field out backwards.
    const higher = tnHigherWins(tn);
    const totals = new Map(spEntries(tn, higher ? 'stableford' : 'gross').map(e => [e.pid, e.total]));
    // Worst first: the leaders land in the LAST group, teeing off last.
    const key = (pid) => {
      const v = totals.get(pid);
      if (v === null || v === undefined) return -Infinity;
      return higher ? -v : v;
    };
    pids.sort((a, b) => key(b) - key(a));
    return chunkGroups(pids, size);
  }

  // random — Fisher–Yates with the injectable rnd.
  for (let i = pids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pids[i], pids[j]] = [pids[j], pids[i]];
  }
  return chunkGroups(pids, size);
}

// Who may enter strokes on a player's card: the player themself, anyone in
// the same group that round (the flight's marker practice — and what the
// database rules enforce via the player's group pointer), and the club's
// officials. `round` is optional: without it only self and officials pass.
export function canScoreSp(user, pid, players, round) {
  if (!user || !pid) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  const p = players?.[pid];
  if (pid === user.id || p?.userId === user.id) return true;
  if (!round) return false;
  const myPid = players?.[user.id] ? user.id
    : Object.keys(players || {}).find(k => players[k]?.userId === user.id);
  if (!myPid) return false;
  const g = spPlayerGroup(players, pid, round);
  return !!g && g === spPlayerGroup(players, myPid, round);
}

// ---- Player card (read-only, PGA-style) ----
// A player's round told hole by hole: what they shot, how it read against
// the hole's par, and the score running through the turn. Pure — the view
// in strokeplay-card.js only lays these numbers out.

// How a hole read: the club's card and the app's card classify identically,
// so this is the single place the thresholds live.
export function holeDiffClass(strokes, par) {
  const s = Number(strokes);
  const p = Number(par);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return null;
  const d = s - p;
  if (d <= -2) return 'eagle';    // an albatross folds in here, as on the printed card
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'double';                // double bogey or worse
}

/**
 * One stretch of holes (a nine, or the whole round). `gross`/`holesIn`/`toPar`
 * cover exactly the holes ENTERED — that is the honest running score — while
 * `par` is the stretch's FULL par, unplayed holes included, because that is
 * what the card's PAR row prints. `par` stays null unless every hole in the
 * stretch has a par: a single course total can't fill nine cells.
 */
export function spSegment(holes, pars = null, from = 1, to = SP_HOLES) {
  const seg = {};
  for (let h = from; h <= to; h++) {
    if (holes?.[h] !== undefined && holes?.[h] !== null) seg[h] = holes[h];
  }
  const { gross, holesIn, toPar } = roundGross(seg, pars);
  let par = 0;
  let known = !!pars;
  for (let h = from; h <= to && known; h++) {
    const p = Number(pars?.[h]);
    if (Number.isFinite(p) && p > 0) par += p; else known = false;
  }
  return { gross, holesIn, toPar, par: known ? par : null };
}

/**
 * One player's round, hole by hole. `running` is cumulative through the
 * whole turn — the back nine continues from the front's last value, so the
 * final cell equals the round's to-par, the way a golfer reads a card.
 * Returns null for an unknown player.
 */
export function spPlayerCard(tn, pid, round) {
  const p = tn?.sp?.players?.[pid];
  if (!p) return null;
  const r = Math.max(1, Number(round) || 1);
  const pars = tnPars(tn);
  const sis = tnSIs(tn);
  const holes = tn?.sp?.scores?.[pid]?.[r] || {};
  const hcpN = Number(p.hcp);

  let run = 0;
  let seen = 0;
  const rows = Array.from({ length: SP_HOLES }, (_, i) => {
    const hole = i + 1;
    const par = Number(pars?.[hole]) || null;
    const raw = Number(holes[hole]);
    const strokes = Number.isFinite(raw) && raw > 0 ? raw : null;
    const diff = strokes !== null && par !== null ? strokes - par : null;
    if (diff !== null) { run += diff; seen += 1; }
    return {
      hole,
      par,
      si: Number(sis?.[hole]) || null,
      strokes,
      diff,
      cls: holeDiffClass(strokes, par),
      // Only a hole that was actually played against a known par carries a
      // running figure; the rest print blank.
      running: diff !== null ? run : null,
      // The Stableford reading of the same hole — computed for every card
      // because it is cheap and pure; the view decides whether to show it.
      given: Number.isFinite(hcpN) ? strokesReceived(hcpN, Number(sis?.[hole]) || null) : 0,
      points: holePoints(strokes, par,
        Number.isFinite(hcpN) ? strokesReceived(hcpN, Number(sis?.[hole]) || null) : 0)
    };
  });

  const front = spSegment(holes, pars, 1, 9);
  const back = spSegment(holes, pars, 10, SP_HOLES);
  const total = spSegment(holes, pars, 1, SP_HOLES);
  return {
    pid,
    round: r,
    name: p.name || pid,
    hcp: Number.isFinite(hcpN) ? hcpN : null,
    status: p.status || '',
    hasPars: !!pars,
    holes: rows,
    front,
    back,
    total,
    thru: total.holesIn >= SP_HOLES ? 'F' : total.holesIn ? String(total.holesIn) : ''
  };
}

/**
 * A player's numbers for one round (`round` a number) or the whole
 * tournament (`round` null). Everything that needs per-hole pars — the
 * scoring spread, the by-par averages, best/worst, to-par — comes back null
 * on a course the registry doesn't carry; the stroke counts always hold.
 */
export function spPlayerStats(tn, pid, round = null) {
  const p = tn?.sp?.players?.[pid];
  if (!p) return null;
  const roundCount = Math.max(1, Number(tn?.rounds) || 1);
  const scope = round === null || round === 'all' ? 'all' : Math.max(1, Number(round) || 1);
  const inScope = (r) => scope === 'all' || r === scope;
  const pars = tnPars(tn);
  const hasPars = !!pars;
  const hcpN = Number(p.hcp);
  const hcp = Number.isFinite(hcpN) ? hcpN : null;

  const rounds = [];
  const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  const byPar = { 3: { count: 0, gross: 0 }, 4: { count: 0, gross: 0 }, 5: { count: 0, gross: 0 } };
  let gross = 0;
  let holesPlayed = 0;
  let toPar = 0;
  let roundsPlayed = 0;
  let roundsComplete = 0;
  let frontGross = 0; let frontHoles = 0; let frontToPar = 0;
  let backGross = 0; let backHoles = 0; let backToPar = 0;
  let best = null;
  let worst = null;

  for (let r = 1; r <= roundCount; r++) {
    const card = spPlayerCard(tn, pid, r);
    const complete = card.total.holesIn >= SP_HOLES;
    rounds.push({
      round: r,
      gross: card.total.holesIn ? card.total.gross : null,
      holesIn: card.total.holesIn,
      toPar: card.total.toPar,
      thru: card.thru,
      complete
    });
    if (!inScope(r)) continue;
    if (card.total.holesIn) roundsPlayed += 1;
    if (complete) roundsComplete += 1;
    gross += card.total.gross;
    holesPlayed += card.total.holesIn;
    if (card.total.toPar !== null) toPar += card.total.toPar;
    frontGross += card.front.gross; frontHoles += card.front.holesIn;
    if (card.front.toPar !== null) frontToPar += card.front.toPar;
    backGross += card.back.gross; backHoles += card.back.holesIn;
    if (card.back.toPar !== null) backToPar += card.back.toPar;

    card.holes.forEach(h => {
      if (h.strokes === null || h.cls === null) return;
      dist[h.cls] += 1;
      const bucket = byPar[h.par];
      if (bucket) { bucket.count += 1; bucket.gross += h.strokes; }
      const at = { round: r, hole: h.hole, par: h.par, strokes: h.strokes, diff: h.diff, cls: h.cls };
      if (!best || h.diff < best.diff) best = at;
      if (!worst || h.diff > worst.diff) worst = at;
    });
  }

  // The field's scoring average over the same scope — the number that tells
  // a player whether their round was good for the day, not just for them.
  let fieldGross = 0;
  let fieldRounds = 0;
  Object.keys(tn?.sp?.players || {}).forEach(other => {
    for (let r = 1; r <= roundCount; r++) {
      if (!inScope(r)) continue;
      const holes = tn?.sp?.scores?.[other]?.[r];
      const { gross: g, holesIn } = roundGross(holes);
      if (holesIn >= SP_HOLES) { fieldGross += g; fieldRounds += 1; }
    }
  });

  const parBuckets = {};
  [3, 4, 5].forEach(k => {
    const b = byPar[k];
    parBuckets[k] = b.count
      ? { count: b.count, gross: b.gross, avg: b.gross / b.count, toPar: b.gross / b.count - k }
      : { count: 0, gross: 0, avg: null, toPar: null };
  });

  return {
    pid,
    name: p.name || pid,
    status: p.status || '',
    hcp,
    hasPars,
    scope,
    rounds,
    roundsPlayed,
    roundsComplete,
    holesPlayed,
    gross: holesPlayed ? gross : null,
    toPar: hasPars && holesPlayed ? toPar : null,
    net: hcp !== null && roundsComplete ? gross - hcp * roundsComplete : null,
    scoringAvg: roundsComplete
      ? rounds.filter(x => x.complete && inScope(x.round)).reduce((a, x) => a + x.gross, 0) / roundsComplete
      : null,
    holeAvg: holesPlayed ? gross / holesPlayed : null,
    front: { gross: frontGross, holesIn: frontHoles, toPar: hasPars && frontHoles ? frontToPar : null },
    back: { gross: backGross, holesIn: backHoles, toPar: hasPars && backHoles ? backToPar : null },
    dist: hasPars ? dist : null,
    byPar: hasPars ? parBuckets : null,
    best: hasPars ? best : null,
    worst: hasPars ? worst : null,
    fieldAvg: fieldRounds ? fieldGross / fieldRounds : null
  };
}

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
// The board keeps riding the existing pure ranking in tournament-sheet.js
// (rankEntries / cutSet / activeRound): spEntries() emits exactly the entry
// shape those functions and the leaderboard render already consume.

import { courseList, resolveCourse, coursePars, courseSIs } from './courses.js';

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
 *   'gross' — to-par as posted;
 *   'net'   — to-par less the player's HCP per completed round.
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
  const roundCount = Math.max(1, Number(tn?.rounds) || 1);
  const hcpOf = (p) => {
    const n = Number(p?.hcp);
    return Number.isFinite(n) ? n : null;
  };

  return Object.entries(sp.players).filter(([, p]) => p).map(([pid, p]) => {
    const perRound = Array.from({ length: roundCount }, (_, i) =>
      roundGross(sp.scores?.[pid]?.[i + 1], pars));
    const hcp = hcpOf(p);
    const net = metric === 'net' && hcp !== null;

    // With the registry's per-hole pars an in-progress round posts its
    // running to-par (net keeps the club's flat reading: the full HCP comes
    // off from the first hole, matching the casual game's netToPar). Without
    // them only a complete round has an honest score.
    const roundToPar = (r) => {
      if (r.toPar !== null && r.holesIn > 0) return r.toPar - (net ? hcp : 0);
      return r.holesIn >= SP_HOLES ? r.gross - par - (net ? hcp : 0) : null;
    };
    const rounds = perRound.map(roundToPar);
    const done = completeRounds(perRound);
    const grossTotal = done.length ? done.reduce((a, r) => a + r.gross, 0) : null;
    const started = rounds.filter(v => v !== null);
    const total = started.length
      ? started.reduce((a, v) => a + v, 0)
      : null;

    // Thru of the latest round anyone has touched: 'F' once that round is
    // complete, the hole count while it runs, '' before the first score.
    let thru = '';
    for (let i = perRound.length - 1; i >= 0; i--) {
      if (perRound[i].holesIn > 0) {
        thru = perRound[i].holesIn >= SP_HOLES ? 'F' : String(perRound[i].holesIn);
        break;
      }
    }

    return {
      pid,
      userId: p.userId || (pid.startsWith('p_') ? null : pid),
      name: p.name || pid,
      hcp,
      status: p.status || '',
      rounds,
      total,
      gross: grossTotal,
      netTotal: grossTotal !== null && hcp !== null ? grossTotal - hcp * done.length : null,
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
  const pids = Object.keys(players).filter(pid => {
    const p = players[pid];
    return p && !['WD', 'DQ'].includes(String(p.status || '').toUpperCase());
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
    const totals = new Map(spEntries(tn, 'gross').map(e => [e.pid, e.total]));
    // Worst first: the leaders land in the LAST group, teeing off last.
    pids.sort((a, b) => {
      const ta = totals.get(a); const tb = totals.get(b);
      const va = ta === null || ta === undefined ? -Infinity : ta;
      const vb = tb === null || tb === undefined ? -Infinity : tb;
      return vb - va;
    });
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

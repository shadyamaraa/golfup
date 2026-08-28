// src/strokeplay.js
// Pure engine for in-app stroke play scoring, the same shape of module as
// matchplay.js: the per-hole strokes under tournaments/{id}/sp are the only
// stored fact, and everything the leaderboard shows — round totals, to-par,
// net, thru — is recomputed from them on every render. No DOM, no Firebase.
//
// Data model (tournaments/{id}):
//   course: 'sky' | 'chinggis' | ''        // preset key, '' = custom venue
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

export const SP_HOLES = 18;

// The courses the club actually plays, so creating a tournament is a pick,
// not a form: choosing one fills the venue, city and PAR in one tap.
export const COURSES = [
  { key: 'sky', name: 'Sky Resort Golf Club', city: 'Ulaanbaatar', par: 72 },
  { key: 'chinggis', name: 'Chinggis Khaan Golf Club', city: 'Ulaanbaatar', par: 72 }
];

export const courseByKey = (key) => COURSES.find(c => c.key === key) || null;

// One round's tally from its hole map: total strokes entered and how many
// holes they cover. Non-numeric and non-positive values are ignored — an
// admin clearing a hole writes null, which RTDB drops.
export function roundGross(holes) {
  let gross = 0;
  let holesIn = 0;
  Object.values(holes || {}).forEach(v => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) { gross += n; holesIn += 1; }
  });
  return { gross, holesIn };
}

// A round only counts toward totals once every hole is in — with a single
// course PAR (no per-hole pars) a partial round has no honest to-par, which
// is also how the old sheet flow behaved. The board still shows the thru of
// the round being played.
const completeRounds = (perRound) => perRound.filter(r => r.holesIn >= SP_HOLES);

/**
 * The leaderboard's entries, computed from sp. `metric` picks what `total`
 * and `rounds[]` carry:
 *   'gross' — to-par as posted;
 *   'net'   — to-par less the player's HCP per completed round.
 * Every entry also carries gross/net stroke totals and hcp for display, plus
 * pid/userId so a row can be tied to the signed-in member without name
 * matching. Entries with no complete round have total null (rankEntries
 * sorts them last among those still standing).
 */
export function spEntries(tn, metric = 'gross') {
  const sp = tn?.sp;
  if (!sp?.players) return [];
  const par = Number(tn?.par) || 72;
  const roundCount = Math.max(1, Number(tn?.rounds) || 1);
  const hcpOf = (p) => {
    const n = Number(p?.hcp);
    return Number.isFinite(n) ? n : null;
  };

  return Object.entries(sp.players).filter(([, p]) => p).map(([pid, p]) => {
    const perRound = Array.from({ length: roundCount }, (_, i) =>
      roundGross(sp.scores?.[pid]?.[i + 1]));
    const hcp = hcpOf(p);
    const net = metric === 'net' && hcp !== null;

    const rounds = perRound.map(r =>
      r.holesIn >= SP_HOLES ? r.gross - par - (net ? hcp : 0) : null);
    const done = completeRounds(perRound);
    const grossTotal = done.length ? done.reduce((a, r) => a + r.gross, 0) : null;
    const total = done.length
      ? grossTotal - par * done.length - (net ? hcp * done.length : 0)
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

// Who may enter strokes on a player's card: the player themself (their pid
// IS their member id, or a legacy record carries it as userId) and the
// club's officials. Mirrors matchplay-score's canScore.
export function canScoreSp(user, pid, players) {
  if (!user || !pid) return false;
  if (user.role === 'admin' || user.role === 'marshal') return true;
  const p = players?.[pid];
  return pid === user.id || p?.userId === user.id;
}

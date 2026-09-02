// src/ranking.js
// The club ranking's ▲/▼ baseline. Admins upload a spreadsheet; each player's
// arrow compares their rank with the ranking BEFORE the last real change —
// not with whatever happened to be saved last. Re-uploading the same
// standings to fix a name or a points cell therefore keeps the movement
// instead of silently wiping it, which is what used to happen.
//
// Pure: no DOM, no store. Tested in scripts/test-ranking.mjs.

// One key per player. Uploads come from hand-edited spreadsheets, so the
// same member arrives as "A  B", "a b" or with a trailing space.
export function rankingKey(name) {
  return String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

const bare = (e) => ({ rank: e.rank, name: e.name, points: e.points ?? '' });

// A correction is an upload where every player present in BOTH rankings
// sits at the same rank — additions and removals allowed. Any one player
// having moved makes it a new ranking.
export function isRankingCorrection(currentEntries, parsed) {
  const cur = new Map((currentEntries || []).map(e => [rankingKey(e.name), e.rank]));
  if (!cur.size) return false;
  let shared = 0;
  for (const e of parsed || []) {
    const r = cur.get(rankingKey(e.name));
    if (r == null) continue;
    shared++;
    if (r !== e.rank) return false;
  }
  return shared > 0;
}

/**
 * Fold an upload into the stored ranking.
 * current: { updatedAt, entries: [{rank,name,points,prevRank?}], previous? }
 * parsed:  [{rank, name, points}] from parseRankingFile
 * Returns the object to save: { updatedAt, entries, previous? } where
 * `previous` is the ranking the arrows compare against. It only advances when
 * the ranking really changed; a correction keeps it — and, for data saved
 * before `previous` existed, keeps the prevRank each entry already carries.
 */
export function mergeRankingUpload(current, parsed, now = Date.now()) {
  const cur = Array.isArray(current?.entries) ? current.entries : [];
  const correction = isRankingCorrection(cur, parsed);

  let previous = null;
  let prevByKey;
  if (correction) {
    previous = current?.previous || null;
    prevByKey = previous
      ? new Map((previous.entries || []).map(e => [rankingKey(e.name), e.rank]))
      : new Map(cur.filter(e => e.prevRank != null).map(e => [rankingKey(e.name), e.prevRank]));
  } else if (cur.length) {
    previous = { updatedAt: current?.updatedAt ?? null, entries: cur.map(bare) };
    prevByKey = new Map(cur.map(e => [rankingKey(e.name), e.rank]));
  } else {
    prevByKey = new Map();
  }

  const entries = (parsed || []).map(e => {
    const out = bare(e);
    const p = prevByKey.get(rankingKey(e.name));
    if (p != null) out.prevRank = p;
    return out;
  });

  // Never emit an `undefined` value — the store writes this whole object with
  // set(), and RTDB rejects undefined.
  const ranking = { updatedAt: now, entries };
  if (previous) ranking.previous = previous;
  return ranking;
}

// How the field moved, for the admin's summary line.
export function rankingMovement(entries) {
  const m = { up: 0, down: 0, same: 0, fresh: 0 };
  for (const e of entries || []) {
    if (e.prevRank == null) m.fresh++;
    else if (e.prevRank > e.rank) m.up++;
    else if (e.prevRank < e.rank) m.down++;
    else m.same++;
  }
  return m;
}

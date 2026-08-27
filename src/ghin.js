// GHIN (USGA) adapter — preparation layer only, no network calls yet.
//
// GHIN is not a public API: access is granted and audited by the USGA through
// an association/club-level agreement. Until those credentials exist this
// module only shapes data. When access is granted, fill in GHIN_CONFIG and add
// the HTTP call in postRound() — everything upstream already stores rounds
// keyed by GHIN number (rounds/{ghinNumber}/{gameId}, see src/store.js) in a
// posting-ready shape, so no data migration will be needed.

const GHIN_CONFIG = {
  baseUrl: '',   // e.g. https://api2.ghin.com (set when USGA access is granted)
  token: '',     // issued credential — never commit a real value
};

export function isGhinConfigured() {
  return !!(GHIN_CONFIG.baseUrl && GHIN_CONFIG.token);
}

// rounds/{ghinNumber}/{gameId} record → GHIN score-posting payload.
export function toGhinScorePayload(ghinNumber, round) {
  return {
    golfer_id: String(ghinNumber),
    played_at: new Date(round.playedAt).toISOString().slice(0, 10),
    course_name: round.courseName || '',
    course_rating: round.courseRating,
    slope_rating: round.slopeRating,
    number_of_holes: round.holesPlayed,
    adjusted_gross_score: round.agsTotal,
    score_type: 'H',   // home score; tournaments would post 'T'
    hole_details: Object.entries(round.holeScores || {}).map(([hole, strokes]) => ({
      hole_number: Number(hole),
      raw_score: strokes,
    })),
  };
}

// Future entry point: post one round and flip its ghinPosted flag. Kept as a
// stub so callers can already be written against it.
export async function postRound(ghinNumber, round) {
  if (!isGhinConfigured()) throw new Error('GHIN API is not configured');
  throw new Error('GHIN posting not implemented yet');
}

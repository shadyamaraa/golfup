// Per-hole course data, keyed by the game's location string.
//
// Sky Resort is Mt. Bogd Golf Club's course (MTBOGD_CONFIG.locationName in
// src/config.js), so its numbers come straight from the club's official
// scorecard: par and stroke index per hole, and rating/slope per tee. A
// location without an entry simply has no per-hole data — the scorer and
// standings fall back to totals-only display.

export const COURSE_DATA = {
  'Sky Resort Golf Club': {   // Mt. Bogd Golf Club official scorecard
    par: 72,
    pars: { 1: 5, 2: 4, 3: 4, 4: 3, 5: 5, 6: 4, 7: 4, 8: 3, 9: 4, 10: 4, 11: 4, 12: 5, 13: 3, 14: 4, 15: 4, 16: 4, 17: 3, 18: 5 },
    si:   { 1: 5, 2: 3, 3: 9, 4: 11, 5: 7, 6: 15, 7: 13, 8: 17, 9: 1, 10: 18, 11: 10, 12: 2, 13: 12, 14: 16, 15: 4, 16: 6, 17: 14, 18: 8 },
    tees: {
      black: { rating: 73.8, slope: 132 },
      blue: { rating: 71.5, slope: 130 },
      white: { rating: 69.4, slope: 128 },
      gold: { rating: 67.1, slope: 121 },
      goldLadies: { rating: 72.8, slope: 134 },
      red: { rating: 69.1, slope: 122 },
    },
  },
};

// Scorer hole n (1..9 or 1..18) → the course's physical hole. A back9 game
// numbers its holes 1..9 on the card but plays 10..18 on the ground.
export function physicalHole(game, n) {
  return game?.holes === 'back9' ? n + 9 : n;
}

export function holePar(game, n) {
  return COURSE_DATA[game?.location]?.pars?.[physicalHole(game, n)] ?? null;
}

export function holeSI(game, n) {
  return COURSE_DATA[game?.location]?.si?.[physicalHole(game, n)] ?? null;
}

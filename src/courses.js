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
  'Chinggis Khaan Golf Course': {   // Riverside Golf Club (Terelj) official scorecard
    par: 72,
    pars: { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 4, 7: 3, 8: 5, 9: 4, 10: 4, 11: 5, 12: 3, 13: 4, 14: 4, 15: 5, 16: 3, 17: 4, 18: 4 },
    si:   { 1: 17, 2: 15, 3: 7, 4: 3, 5: 13, 6: 1, 7: 9, 8: 11, 9: 5, 10: 10, 11: 2, 12: 18, 13: 6, 14: 12, 15: 16, 16: 8, 17: 14, 18: 4 },
    tees: {
      professional: { rating: 74.1, slope: 137 },
      regular: { rating: 71.1, slope: 135 },
      senior: { rating: 68.3, slope: 126 },
      lady: { rating: 70.5, slope: 138 },
    },
  },
};

const TEE_LABELS = {
  black: 'Black', blue: 'Blue', white: 'White', gold: 'Gold',
  goldLadies: 'Gold (L)', red: 'Red',
  professional: 'Professional', regular: 'Regular', senior: 'Senior', lady: 'Lady',
};

// The card's tee options for a location — what the create/edit forms offer
// so rating/slope need not be typed by hand. Empty for unknown locations.
export function courseTees(location) {
  const tees = COURSE_DATA[location]?.tees;
  if (!tees) return [];
  return Object.entries(tees).map(([key, t]) => ({
    key, label: TEE_LABELS[key] || key, rating: t.rating, slope: t.slope,
  }));
}

export function coursePar(location) {
  return COURSE_DATA[location]?.par ?? null;
}

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

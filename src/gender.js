// src/gender.js
// The member's gender: a two-value field on users/{id}, and the rule the
// one-off backfill uses to fill it in for the members who registered before
// the field existed (scripts/backfill-gender.mjs).
//
// Pure module — no DOM, no Firebase — so the rule can be checked against a
// fixture rather than against the club's real membership.

export const GENDERS = ['male', 'female'];

// Anything that is not one of the two reads as "not set". A record written
// before this field existed, a hand-edited value, an empty select — all the
// same: unknown, and the profile simply shows nothing.
export const isGender = (v) => GENDERS.includes(v);

// The i18n key for a value, so the three screens that show it agree.
export const genderKey = (v) => (v === 'female' ? 'genderFemale' : v === 'male' ? 'genderMale' : '');

// The circle that stands for the club's women's group (BUILTIN_COMMUNITIES in
// app.js). Membership of it is the first of the two signals below.
export const WOMEN_CIRCLE = 'women';

// A member is female when the club already says so in one of two independent
// ways: they are in the women's circle, or they have played in a tournament
// the club named for women. Two signals rather than one because a woman who
// never joined the circle would otherwise be written down as a man.
//
// Everything else is male. That is a blunt rule and it will be wrong for
// somebody — which is why the backfill never overwrites a value that is
// already set, and why the profile lets a member change it.
export function inferGender(user, ladiesIds = new Set()) {
  const circles = Array.isArray(user?.communities) ? user.communities : [];
  if (circles.includes(WOMEN_CIRCLE)) return { gender: 'female', why: 'circle' };
  if (user?.id && ladiesIds.has(user.id)) return { gender: 'female', why: 'ladies' };
  return { gender: 'male', why: 'default' };
}

// Does this tournament name itself as a women's event? The club writes them
// "… (Ladies)" and "… Ladies Championship"; Mongolian spellings count too.
export const isLadiesEvent = (name) => {
  // Lowercased first, so a capitalised Cyrillic "Эмэгтэйчүүдийн" matches too.
  const s = String(name || '').toLowerCase();
  return s.includes('ladies') || s.includes('women') || s.includes('эмэгтэй');
};

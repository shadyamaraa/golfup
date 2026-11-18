// src/coaching-programs.js
// A coach's programs — «Сургалт»: a course or a package a coach offers, with
// a poster, what it costs and what it is. Pure: no network, no Firebase, no DOM.
//
// A lesson (coaching.js) is one booked time. A program is the offer around
// lessons: «Анхан шатны сургалт — 10 хичээл 1,200,000₮», «1 сарын хичээл»,
// a trial lesson. A member reads it, picks one of its prices and asks to join;
// the coach sees who asked and takes it from there. Payment is between the
// two of them for now, like a lesson's.
//
//   coachPrograms/{coachId}/{programId}   { title, level, summary, options: [{ label, price }],
//                                           people, thumb, hasPoster, active, createdAt, updatedAt }
//   coachPosters/{coachId}/{programId}    the poster, an image data URI — read only
//                                           on the program's own page
//   coachEnrollments/{coachId}/{programId}/{playerId}
//                                         { option, label, price, note, at }
//                                           — the coach and that player read
//   playerPrograms/{playerId}/{key}       { coachId, programId, at } — the player's own list
//
// The poster is kept apart from the program so the list of programs does not
// carry every poster; the program holds a small thumbnail instead.
// Joining is one write to two places (enrollWrites), leaving another
// (unenrollWrites); the database rules let each through only whole and only
// from the right person — database.rules.json, docs/coaching.md.

export const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'];
export const MAX_OPTIONS = 6;
export const PEOPLE_MAX = 10;
const TITLE_MAX = 80;
const SUMMARY_MAX = 1000;
const LABEL_MAX = 40;
const NOTE_MAX = 300;
const PRICE_MAX = 100000000;
// How large a poster and its thumbnail may be as stored (characters of the
// data URI). The database rules carry the same two numbers —
// scripts/test-coaching-programs.mjs checks they agree.
export const POSTER_MAX_CHARS = 600000;
export const THUMB_MAX_CHARS = 60000;

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const price = (v) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, PRICE_MAX) : 0;
};

/** A new program's key: sortable by when it was made, and not guessable in a hurry. */
export const programId = (now = Date.now(), rand = Math.random()) =>
  'p' + now.toString(36) + Math.floor(rand * 1296).toString(36).padStart(2, '0');

/** A program's key in the member's own list. */
export const enrollKey = (coachId, id) => `${coachId}_${id}`;

/** The prices of a program as stored (a list, or the object a database makes of one) → a list. */
export function optionList(program) {
  const o = program && program.options;
  return (Array.isArray(o) ? o : Object.values(o || {}))
    .filter(x => x && typeof x === 'object' && String(x.label || '').trim())
    .map(x => ({ label: String(x.label), price: price(x.price) }));
}

/** The prices as typed → as stored: a row with no name is dropped; six at most. */
export function cleanOptions(list) {
  return (Array.isArray(list) ? list : [])
    .map(o => ({ label: text(o && o.label, LABEL_MAX), price: price(o && o.price) }))
    .filter(o => o.label)
    .slice(0, MAX_OPTIONS);
}

/** What a coach says of a program, as typed → as stored. */
export function cleanProgram(input) {
  const i = input || {};
  const people = Math.round(Number(i.people));
  return {
    title: text(i.title, TITLE_MAX),
    level: LEVELS.includes(i.level) ? i.level : 'all',
    summary: text(i.summary, SUMMARY_MAX),
    options: cleanOptions(i.options),
    people: Number.isFinite(people) && people >= 1 ? Math.min(people, PEOPLE_MAX) : 1,
  };
}

/** What is still missing before a program can be published: 'title' | 'options'. */
export function programErrors(input) {
  const p = cleanProgram(input);
  const out = [];
  if (!p.title) out.push('title');
  if (!p.options.length) out.push('options');
  return out;
}

/** The lowest price of a program that has one; 0 when none is set. */
export function fromPrice(program) {
  const prices = optionList(program).map(o => o.price).filter(p => p > 0);
  return prices.length ? Math.min(...prices) : 0;
}

/** coachPrograms/{coachId} as stored → a list with ids: published ones first, newest first. */
export function programList(map, { all = false } = {}) {
  return Object.entries(map || {})
    .filter(([, p]) => p && typeof p === 'object' && p.title)
    .map(([id, p]) => ({ id, ...p, active: p.active === true }))
    .filter(p => all || p.active)
    .sort((a, b) => (b.active - a.active) || (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

/**
 * Every published program of every coach who is taking bookings, newest first.
 * `byCoach` is coachPrograms/*; `isCoach(coachId)` says who is one.
 */
export function allPrograms(byCoach, isCoach) {
  return Object.entries(byCoach || {})
    .filter(([coachId]) => isCoach(coachId))
    .flatMap(([coachId, map]) => programList(map).map(p => ({ coachId, ...p })))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

/**
 * The write that saves a program. `poster`: a data URI to set one (with its
 * `thumb`), null to take it away, undefined to leave the one there alone.
 * `existing` is the program as stored, when it is an edit.
 */
export function programWrites(coachId, id, input, { poster, thumb, existing = null, now = Date.now() } = {}) {
  const record = {
    ...cleanProgram(input),
    active: input && input.active === false ? false : true,
    hasPoster: poster === undefined ? !!(existing && existing.hasPoster) : !!poster,
    createdAt: Number(existing && existing.createdAt) || now,
    updatedAt: now,
  };
  const small = poster === undefined ? (existing && existing.thumb) : (poster ? thumb : null);
  if (small) record.thumb = small;
  const out = { [`coachPrograms/${coachId}/${id}`]: record };
  if (poster !== undefined) out[`coachPosters/${coachId}/${id}`] = poster || null;
  return out;
}

/** The write that shows or hides a program without changing it. */
export const publishWrites = (coachId, id, active, now = Date.now()) => ({
  [`coachPrograms/${coachId}/${id}/active`]: !!active,
  [`coachPrograms/${coachId}/${id}/updatedAt`]: now,
});

/**
 * The write that asks to join: the request under the program, and the
 * program on the member's own list — both or neither. `index` is which of
 * the program's prices; its name and amount are copied as they stand now.
 */
export function enrollWrites(coachId, id, playerId, program, index, note, now = Date.now()) {
  const option = optionList(program)[index];
  if (!option) return null;
  const request = { option: String(index), label: option.label, price: option.price, at: now };
  const n = text(note, NOTE_MAX);
  if (n) request.note = n;
  return {
    [`coachEnrollments/${coachId}/${id}/${playerId}`]: request,
    [`playerPrograms/${playerId}/${enrollKey(coachId, id)}`]: { coachId, programId: id, at: now },
  };
}

/** The write that takes a request back — by the member, or by the coach. */
export const unenrollWrites = (coachId, id, playerId) => ({
  [`coachEnrollments/${coachId}/${id}/${playerId}`]: null,
  [`playerPrograms/${playerId}/${enrollKey(coachId, id)}`]: null,
});

/** The write that removes a program whole: itself, its poster, and every request to join it. */
export function removeProgramWrites(coachId, id, playerIds = []) {
  const out = { [`coachPrograms/${coachId}/${id}`]: null, [`coachPosters/${coachId}/${id}`]: null };
  for (const playerId of playerIds) Object.assign(out, unenrollWrites(coachId, id, playerId));
  return out;
}

/** coachEnrollments/{coachId}/{programId} as stored → a list with player ids, newest first. */
export function enrollmentList(map) {
  return Object.entries(map || {})
    .filter(([, e]) => e && typeof e === 'object')
    .map(([playerId, e]) => ({ playerId, label: String(e.label || ''), price: price(e.price), note: String(e.note || ''), at: Number(e.at) || 0 }))
    .sort((a, b) => b.at - a.at);
}

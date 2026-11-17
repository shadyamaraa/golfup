// src/member-systems.js
// Which systems a UB Golf member is also in, by what is on their own record,
// and the admin's member list filtered and ordered by it. Pure — no
// Firebase, no DOM.
//
// Every record here is a UB Golf member. Beside that a member may be:
//   on GHIN    — they have a GHIN number (tied to a golfer; docs/ghin.md)
//   at MT Bogd — they have an MT Bogd club code
//
// This is a view of UB Golf's own members only. Who is on GHIN or at MT Bogd
// and NOT in UB Golf is not something this app knows — that is the members'
// hub's question (golf-members-hub), which holds people, not app accounts.

import { ghinDigits } from './ghin.js';

/** { ghin, mtbogd } — the other systems this member is in. */
export function memberSystems(user) {
  return {
    ghin: !!ghinDigits(user?.ghinNumber),
    mtbogd: String(user?.mtbogdCode ?? '').trim() !== '',
  };
}

/**
 * The filters of the admin's member list, in the order they are shown:
 *   all     everyone
 *   ghin    on GHIN
 *   mtbogd  at MT Bogd
 *   both    in all three — UB Golf, GHIN and MT Bogd
 *   ubgolf  UB Golf only — neither on GHIN nor at MT Bogd
 */
export const MEMBER_FILTERS = ['all', 'ghin', 'mtbogd', 'both', 'ubgolf'];

/** Whether a member in these systems ({ ghin, mtbogd }) is shown under a filter. */
export function systemsInFilter(systems, filter) {
  const ghin = !!systems?.ghin;
  const mtbogd = !!systems?.mtbogd;
  switch (filter) {
    case 'ghin': return ghin;
    case 'mtbogd': return mtbogd;
    case 'both': return ghin && mtbogd;
    case 'ubgolf': return !ghin && !mtbogd;
    default: return true;
  }
}

export function inMemberFilter(user, filter) {
  return systemsInFilter(memberSystems(user), filter);
}

/** How many members each filter shows: { all, ghin, mtbogd, both, ubgolf }. */
export function memberFilterCounts(users) {
  const list = (users || []).filter(u => u && typeof u === 'object');
  return Object.fromEntries(MEMBER_FILTERS.map(f => [f, list.filter(u => inMemberFilter(u, f)).length]));
}

/** The orders of the list: newest first (as it always was), by name, by Handicap Index. */
export const MEMBER_ORDERS = ['new', 'name', 'hi'];

/**
 * What a row is ordered by: { created, name, hi }. `nameOf` gives the name
 * shown for a member; `hiValue` is their Handicap Index as a number, or
 * null when GHIN has none for them.
 */
export function memberSortKey(user, { nameOf, hiValue } = {}) {
  const hi = typeof hiValue === 'number' && Number.isFinite(hiValue) ? hiValue : null;
  return {
    created: Number(user?.createdAt) || 0,
    name: String((nameOf ? nameOf(user) : user?.name) ?? '').trim().toLowerCase(),
    hi,
  };
}

/**
 * Compare two sort keys under an order. By Handicap Index the lowest comes
 * first and a member with none comes last; ties fall back to the name.
 */
export function compareMembers(a, b, order) {
  if (order === 'name') return a.name.localeCompare(b.name) || b.created - a.created;
  if (order === 'hi') {
    if (a.hi === null && b.hi === null) return a.name.localeCompare(b.name);
    if (a.hi === null) return 1;
    if (b.hi === null) return -1;
    return a.hi - b.hi || a.name.localeCompare(b.name);
  }
  return b.created - a.created || a.name.localeCompare(b.name);
}

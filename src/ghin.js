// src/ghin.js
// GHIN on the app's side. Pure — no network, no Firebase, no DOM.
//
// GHIN (the USGA's handicap service) is read by the server only
// (functions/ghin.js): the association's login can see every golfer's
// personal details and never reaches the browser. The app asks the server
// through src/store.js (ghinCheck, ghinSync, ghinSyncAll) and reads what the
// server stored under ghin/{memberId}:
//
//   { number, found, name, club, association, status,
//     hi, hiValue, lowHi, revDate, withdrawn, env, syncedAt }
//
// and a member's scoring record under ghinScores/{memberId} (ghinScoreRows):
//
//   { number, env, syncedAt, visibility, revision: [score], recent: [score],
//     stats?, message?, withheld? }
//   `withheld`: the record is for the golfer's club only and the member's
//   GHIN number is not proven theirs — the server stored no scores.
//   score: { date, score, used, id?, diff?, rawDiff?, holes?, course?, tee?,
//            rating?, slope?, type?, pcc?, exceptional?, penalty? }
//
// `hi` is the Handicap Index as GHIN displays it ('12.3', '+1.2', 'NH');
// `hiValue` is the number behind it, null when there is none; `env` is
// 'staging' until the USGA grants production — staging holds a copy of the
// real data taken at some earlier date, so it is shown marked as a trial.
//
// rounds/{ghinNumber}/{gameId} is kept in a shape GHIN's score posting takes
// (toGhinScorePayload, at the bottom). Posting is a later step, with its own
// permission, and will also go through the server.

/** Who sees the GHIN parts of the app: 'off', 'admin' (the trial) or 'all'. */
export function ghinVisibleTo(stage, user) {
  if (!user) return false;
  if (stage === 'all') return true;
  return stage === 'admin' && user.role === 'admin';
}

// Two spellings of one GHIN number: digits only, a leading zero not counted
// (GHIN keeps a number as an integer).
const numberKey = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');

/** A GHIN number as typed → its digits when it is one (7 or 8), else ''. */
export function ghinDigits(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  return /^\d{7,8}$/.test(d) ? d : '';
}

/**
 * The stored GHIN record, if it is about the number the member has now. A
 * record read for an earlier number — the member has since corrected it or
 * removed it — is not theirs any more.
 */
export function ghinFor(user, record) {
  if (!record || typeof record !== 'object') return null;
  const mine = numberKey(user?.ghinNumber);
  return mine && numberKey(record.number) === mine ? record : null;
}

/** The Handicap Index to show: '12.3', '+1.2', 'NH' — or '—' when GHIN has none for them. */
export function ghinHiText(record) {
  if (!record || record.found === false) return '—';
  const hi = record.hi == null ? '' : String(record.hi).trim();
  return hi || '—';
}

/** Whether a stored record is due a fresh read: none yet, or older than a day. */
export function ghinStale(record, now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000) {
  const at = Number(record?.syncedAt);
  return !Number.isFinite(at) || at <= 0 || now - at > maxAgeMs;
}

// A list as stored: an array, or the object a database makes of one.
const scoreItems = (v) => (Array.isArray(v) ? v : Object.values(v && typeof v === 'object' ? v : {}))
  .filter(s => s && typeof s === 'object' && s.date && typeof s.score === 'number');

/**
 * The scores of a stored scoring record as the list shows them, newest
 * first: those posted since the last revision (`pending` — the Handicap Index
 * has not taken them in yet), then the revision's own, `used` marking the
 * ones the index is the average of.
 */
export function ghinScoreRows(record) {
  return [
    ...scoreItems(record?.recent).map(s => ({ ...s, used: false, pending: true })),
    ...scoreItems(record?.revision).map(s => ({ ...s, used: s.used === true, pending: false })),
  ];
}

/** How many scores the Handicap Index is worked out from, how many of them count, how many wait. */
export function ghinScoreCounts(record) {
  const rows = ghinScoreRows(record);
  const revision = rows.filter(r => !r.pending);
  return { revision: revision.length, used: revision.filter(r => r.used).length, pending: rows.length - revision.length };
}

/**
 * The average, the best and the worst of a scoring record's scores:
 * { average, low, high, count }. GHIN's own figures where it sent them
 * (`stats`); otherwise worked out from the revision's eighteen-hole scores —
 * a nine-hole score is not set beside an eighteen-hole one. null when there
 * is nothing to say.
 */
export function ghinScoreStats(record) {
  const st = record?.stats;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (st && num(st.average) != null && num(st.low) != null && num(st.high) != null) {
    return { average: st.average, low: st.low, high: st.high, count: num(st.count) ?? 0 };
  }
  const full = scoreItems(record?.revision).filter(s => s.holes !== 9).map(s => s.score);
  if (!full.length) return null;
  const average = Math.round((full.reduce((a, b) => a + b, 0) / full.length) * 10) / 10;
  return { average, low: Math.min(...full), high: Math.max(...full), count: full.length };
}

/** A differential as shown: one decimal; '' when GHIN gave none. */
export function ghinDiffText(diff) {
  return typeof diff === 'number' && Number.isFinite(diff) ? diff.toFixed(1) : '';
}

/**
 * By how much GHIN adjusted a score's differential — '−1.0' after an
 * exceptional score, '+1.0' — or '' when it did not (`rawDiff` is kept only
 * when the differential differs from it).
 */
export function ghinAdjustText(score) {
  const [diff, raw] = [score?.diff, score?.rawDiff];
  if (![diff, raw].every(n => typeof n === 'number' && Number.isFinite(n))) return '';
  const by = Math.round((diff - raw) * 10) / 10;
  return by ? `${by < 0 ? '−' : '+'}${Math.abs(by).toFixed(1)}` : '';
}

/** The i18n key for a refusal from the GHIN functions. */
export function ghinErrorKey(err) {
  switch (String(err?.code ?? '')) {
    case 'NOT_FOUND': return 'ghinNotFound';
    case 'BAD_GHIN': return 'gsGhinInvalid';
    case 'NO_GHIN': return 'ghinErrNoNumber';
    case 'TOO_MANY': return 'ghinErrTooMany';
    case 'UNAUTHENTICATED': return 'ghinErrSignIn';
    case 'FORBIDDEN': return 'pwMigrateAdminOnly';
    case 'NOT_CONFIGURED':
    case 'LOGIN_REFUSED': return 'ghinErrNotEnabled';
    case 'GHIN_UNREACHABLE':
    case 'GHIN_ERROR': return 'ghinErrUnreachable';
    default:
  }
  if (err?.status === 404) return 'ghinErrNotEnabled';   // the functions are not deployed
  if (err instanceof TypeError || err?.name === 'TypeError') return 'svErrNetwork';
  return 'ghinErrUnreachable';
}

/** The i18n key for why the server would not tie a member to a golfer. */
export function ghinLinkWhyKey(reason) {
  return {
    NO_MEMBER: 'ghinWhyNoMember',
    BAD_GHIN: 'gsGhinInvalid',
    HAS_NUMBER: 'ghinWhyHasNumber',
    NO_PHONE: 'ghinWhyNoPhone',
    TAKEN: 'ghinWhyTaken',
    NOT_ON_GHIN: 'ghinWhyNotOnGhin',
    PHONE_DIFFERS: 'ghinWhyPhoneDiffers',
  }[String(reason ?? '')] || 'ghinWhyOther';
}

/**
 * What the admin's table shows: every member with a GHIN number, with what
 * GHIN said of it — found, not found, or not read yet — and the totals.
 * `records` is ghin/* keyed by member id.
 */
export function ghinRoster(users, records) {
  const rows = [];
  for (const u of users || []) {
    if (!u || !ghinDigits(u.ghinNumber)) continue;
    const rec = ghinFor(u, (records || {})[u.id]);
    rows.push({
      id: u.id,
      user: u,
      number: ghinDigits(u.ghinNumber),
      record: rec,
      state: !rec ? 'unread' : rec.found === false ? 'missing' : 'found',
    });
  }
  const count = (s) => rows.filter(r => r.state === s).length;
  const last = rows.reduce((m, r) => Math.max(m, Number(r.record?.syncedAt) || 0), 0);
  return { rows, total: rows.length, found: count('found'), missing: count('missing'), unread: count('unread'), syncedAt: last || null };
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

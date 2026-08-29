import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, remove, onValue, off, push } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { isFirebaseConfigured, firebaseConfig } from './config.js';

let db = null;
let auth = null;
export let firebaseApp = null;
let useFirebase = false;
// The anonymous-auth uid of this browser, once sign-in resolves; null before
// that and null forever when the Anonymous provider is not enabled.
let deviceUid = null;

export async function initStore() {
  if (isFirebaseConfigured()) {
    try {
      firebaseApp = initializeApp(firebaseConfig);
      db = getDatabase(firebaseApp);
      auth = getAuth(firebaseApp);
      useFirebase = true;
      console.log('Firebase connected');
      // Anonymous auth stamps every request from this browser with a stable
      // uid, which is what the database rules check before letting a device
      // write live scores. The app's own sign-in is untouched. If the
      // Anonymous provider is not enabled in the Firebase console this
      // rejects and the uid stays null — everything else keeps working.
      onAuthStateChanged(auth, (u) => { deviceUid = u?.uid || null; });
      signInAnonymously(auth).catch((e) => console.warn('anon auth unavailable:', e?.code || e));
    } catch (e) {
      console.warn('Firebase init failed, using localStorage', e);
    }
  }
}

export function isUsingFirebase() { return useFirebase; }

// ---- User Management ----
export function getUser() {
  const data = localStorage.getItem('golfup_user');
  return data ? JSON.parse(data) : null;
}

export function logoutUser() {
  localStorage.removeItem('golfup_user');
}

export function saveUser(user) {
  localStorage.setItem('golfup_user', JSON.stringify(user));
  if (useFirebase && user.id && db) {
    set(ref(db, 'users/' + user.id), user).catch(console.warn);
  }
}

export async function adminCreateUser(name, password, phone, role = 'user', communities = [], extra = {}) {
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const user = {
    id, name, username: '', firstName: '', lastName: '', fullName: '', communities, password, phone, role, status: 'active',
    bankName: '', bankAccount: '', bankIban: '', avatar: '',
    createdAt: Date.now(),
    ...extra
  };
  if (useFirebase && db) {
    await set(ref(db, 'users/' + id), user);
  }
  return user;
}

export async function adminUpdateUser(user) {
  if (useFirebase && db && user.id) {
    await set(ref(db, 'users/' + user.id), user);
  }
}

export async function loadAllUsers() {
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'users'));
      if (!snap.exists()) return [];
      const data = snap.val();
      return Object.entries(data).map(([id, val]) => ({
        id: val.id || id,
        ...val
      })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (error) {
      console.error('Failed to load users:', error);
      return [];
    }
  }
  return [];
}

export async function loadUserById(id) {
  if (!id) return null;
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'users/' + id));
      return snap.exists() ? snap.val() : null;
    } catch (error) {
      console.error('Failed to load user:', error);
      return null;
    }
  }
  const me = getUser();
  return me && me.id === id ? me : null;
}

export async function findUserByName(name) {
  const users = await loadAllUsers();
  return users.find(u => u.name && u.name.toLowerCase() === name.toLowerCase());
}

export async function findUserByPhone(phone) {
  const users = await loadAllUsers();
  return users.find(u => u.phone === phone);
}

export async function deleteUserFromDB(uid) {
  if (useFirebase && db) {
    await remove(ref(db, 'users/' + uid));
  }
}

// ---- Game Storage ----
function getLocalGames() {
  const data = localStorage.getItem('golfup_games');
  return data ? JSON.parse(data) : {};
}

function setLocalGames(games) {
  localStorage.setItem('golfup_games', JSON.stringify(games));
}

export async function saveGame(game) {
  if (useFirebase && db) {
    // update(), not set(): a whole-record set would silently overwrite a
    // group member's concurrent score tap (scores/scoreAudit/hcp live under
    // the same game, and schedule is saved from its own page). Every caller
    // passes the full record, so the named top-level keys are still replaced
    // wholesale — only the scoring/schedule branches are spared.
    const { scores, scoreAudit, hcp, schedule, ...rest } = game;
    await update(ref(db, 'games/' + game.id), rest);
  } else {
    const games = getLocalGames();
    games[game.id] = game;
    setLocalGames(games);
  }
}

// One score tap on the casual-game scorecard — strokes for one player on one
// hole, or null to clear it. Mirrors saveTnMatchHole(): path-scoped write plus
// a fire-and-forget audit push, so concurrent scorers in the same group never
// clobber each other and offline taps queue in RTDB.
export async function saveGameScoreHole(gameId, playerId, hole, strokes, by) {
  if (useFirebase && db) {
    const holeRef = ref(db, `games/${gameId}/scores/${playerId}/holes/${hole}`);
    // The previous value is only for the audit trail — offline (where get()
    // rejects without a warm cache) the write itself must still go through.
    let prev = null;
    try { prev = (await get(holeRef)).val() ?? null; } catch (_) { }
    if (strokes === null || strokes === undefined) {
      await remove(holeRef);
    } else {
      await set(holeRef, strokes);
    }
    push(ref(db, `games/${gameId}/scoreAudit`), {
      at: Date.now(), by: by || null, playerId, hole, value: strokes ?? null, prev
    }).catch(console.warn);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.scores = game.scores || {};
  game.scores[playerId] = game.scores[playerId] || { holes: {} };
  game.scores[playerId].holes = game.scores[playerId].holes || {};
  if (strokes === null || strokes === undefined) delete game.scores[playerId].holes[hole];
  else game.scores[playerId].holes[hole] = strokes;
  setLocalGames(games);
  // No listener fires in localStorage mode — the caller repaints from this.
  return game;
}

// A player's playing handicap for ONE game, entered by hand until the GHIN
// connection exists. Path-scoped like score taps; null clears it.
export async function saveGamePlayerHcp(gameId, playerId, hcp) {
  if (useFirebase && db) {
    const r = ref(db, `games/${gameId}/hcp/${playerId}`);
    if (hcp === null || hcp === undefined) await remove(r);
    else await set(r, hcp);
    return null;
  }
  const games = getLocalGames();
  const game = games[gameId];
  if (!game) return null;
  game.hcp = game.hcp || {};
  if (hcp === null || hcp === undefined) delete game.hcp[playerId];
  else game.hcp[playerId] = hcp;
  setLocalGames(games);
  return game;
}

// The marshal start list for one game: first-group time, tee interval,
// starting tee, and per-group manual overrides. Path-scoped like scores so
// editing the game record never clobbers it (saveGame strips `schedule`).
export async function saveGameSchedule(gameId, schedule) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + gameId), { schedule: schedule ?? null });
    return null;
  }
  const games = getLocalGames();
  if (!games[gameId]) return null;
  games[gameId].schedule = schedule ?? null;
  setLocalGames(games);
  return games[gameId];
}

// Switch a game's scoring mode (normal 18 ↔ competition 9/9) after it has
// started — path-scoped so it never touches scores.
export async function saveGameScoreMode(gameId, mode) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + gameId), { scoreMode: mode });
    return null;
  }
  const games = getLocalGames();
  if (!games[gameId]) return null;
  games[gameId].scoreMode = mode;
  setLocalGames(games);
  return games[gameId];
}

// ---- Handicap rounds ----
// rounds/{ghinNumber}/{gameId} — one finished scorecard per game, keyed by the
// player's GHIN number so a future GHIN API sync posts records as-is. The
// record already carries every field GHIN score posting wants (played_at,
// course rating/slope, 9/18 holes, adjusted gross, hole-by-hole).

function getLocalRounds() {
  const data = localStorage.getItem('golfup_rounds');
  return data ? JSON.parse(data) : {};
}

export async function upsertRound(ghinNumber, round) {
  if (!ghinNumber || !round?.gameId) return;
  if (useFirebase && db) {
    await set(ref(db, `rounds/${ghinNumber}/${round.gameId}`), round);
  } else {
    const rounds = getLocalRounds();
    rounds[ghinNumber] = rounds[ghinNumber] || {};
    rounds[ghinNumber][round.gameId] = round;
    localStorage.setItem('golfup_rounds', JSON.stringify(rounds));
  }
}

export async function loadRounds(ghinNumber) {
  if (!ghinNumber) return [];
  let map = null;
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'rounds/' + ghinNumber));
      map = snap.exists() ? snap.val() : null;
    } catch (error) {
      console.error('Failed to load rounds:', error);
    }
  } else {
    map = getLocalRounds()[ghinNumber] || null;
  }
  if (!map) return [];
  return Object.values(map).sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
}

// The player's handicap index is derived from their rounds; the value is
// cached on users/{id} so lists can show it without reading every round.
export async function saveUserHcp(userId, hcpIndex) {
  if (!useFirebase || !db || !userId) return;
  await update(ref(db, 'users/' + userId), { hcpIndex: hcpIndex ?? null, hcpUpdatedAt: Date.now() });
}

export async function loadGame(gameId) {
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'games/' + gameId));
      return snap.exists() ? snap.val() : null;
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }
  return getLocalGames()[gameId] || null;
}

export async function loadAllGames() {
  if (useFirebase && db) {
    try {
      const snap = await get(ref(db, 'games'));
      if (!snap.exists()) return [];
      const data = snap.val();
      return Object.values(data).filter(g => g.status !== 'deleted').sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to load all games:', error);
      return [];
    }
  }
  const games = getLocalGames();
  return Object.values(games).filter(g => g.status !== 'deleted').sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadAllGamesAdmin() {
  if (useFirebase && db) {
    const snap = await get(ref(db, 'games'));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return Object.values(getLocalGames()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function deleteGame(id) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { status: 'deleted', deletedAt: Date.now() });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].status = 'deleted'; games[id].deletedAt = Date.now(); }
    setLocalGames(games);
  }
}

export async function restoreGame(id) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { status: 'open', deletedAt: null });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].status = 'open'; delete games[id].deletedAt; }
    setLocalGames(games);
  }
}

export function createUser(name, uid = null, role = 'user') {
  const id = uid || ('u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
  const user = { id, name, role, status: 'active', createdAt: Date.now() };
  saveUser(user);
  return user;
}

export function onAllGamesChanged(callback) {
  if (useFirebase && db) {
    const gamesRef = ref(db, 'games');
    onValue(gamesRef, (snap) => {
      const data = snap.val();
      if (!data) callback([]);
      else callback(Object.values(data).filter(g => g.status !== 'deleted').sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => off(gamesRef);
  }
}

export async function markBookingPaid(id, amount) {
  if (!useFirebase || !db) return;
  await update(ref(db, 'games/' + id), {
    bookingPaid: true,
    paidAt: new Date().toISOString(),
    paidAmount: amount || null,
  });
}

// The real MTBogd price for a booking, cached on the game after the first
// qpay-status call so later visits render it without re-querying MTBogd.
export async function saveBookingQuote(id, quote) {
  if (useFirebase && db) {
    await update(ref(db, 'games/' + id), { bookingQuote: quote });
  } else {
    const games = getLocalGames();
    if (games[id]) { games[id].bookingQuote = quote; setLocalGames(games); }
  }
}

export function onGameChanged(id, callback) {
  if (useFirebase && db) {
    const gameRef = ref(db, 'games/' + id);
    onValue(gameRef, (snap) => {
      callback(snap.val());
    });
    return () => off(gameRef);
  }
}

// ---- Follow System ----
export async function followUser(currentUserId, targetUserId) {
  if (useFirebase && db) {
    await Promise.all([
      set(ref(db, `follows/${currentUserId}/${targetUserId}`), true),
      set(ref(db, `followers/${targetUserId}/${currentUserId}`), true)
    ]);
  }
}

export async function unfollowUser(currentUserId, targetUserId) {
  if (useFirebase && db) {
    await Promise.all([
      remove(ref(db, `follows/${currentUserId}/${targetUserId}`)),
      remove(ref(db, `followers/${targetUserId}/${currentUserId}`))
    ]);
  }
}

export async function loadFollows(userId) {
  if (useFirebase && db) {
    const snap = await get(ref(db, `follows/${userId}`));
    return snap.exists() ? snap.val() : {};
  }
  return {};
}

export async function getFollowerIds(targetUserId) {
  if (useFirebase && db) {
    const snap = await get(ref(db, `followers/${targetUserId}`));
    return snap.exists() ? Object.keys(snap.val()) : [];
  }
  return [];
}

// ---- Notifications ----
export async function saveNotification(targetUserId, notif) {
  if (useFirebase && db) {
    if (notif?.gameId && notif?.type && !['game_updated', 'player_joined', 'player_left', 'game_deleted'].includes(notif.type)) {
      const snap = await get(ref(db, `notifications/${targetUserId}`));
      if (snap.exists()) {
        const duplicate = Object.values(snap.val()).find(n =>
          n &&
          n.gameId === notif.gameId &&
          n.type === notif.type &&
          (n.from || '') === (notif.from || '')
        );
        if (duplicate) return duplicate.id;
      }
    }
    const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await set(ref(db, `notifications/${targetUserId}/${id}`), { ...notif, id, createdAt: Date.now() });
    return id;
  }
}

export async function loadNotifications(userId) {
  if (useFirebase && db) {
    const snap = await get(ref(db, `notifications/${userId}`));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => b.createdAt - a.createdAt);
  }
  return [];
}

export async function deleteNotification(userId, notifId) {
  if (useFirebase && db) {
    await remove(ref(db, `notifications/${userId}/${notifId}`));
  }
}

export function onNotificationsChanged(userId, callback) {
  if (useFirebase && db) {
    const notifRef = ref(db, `notifications/${userId}`);
    onValue(notifRef, (snap) => {
      if (!snap.exists()) { callback([]); return; }
      callback(Object.values(snap.val()).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => off(notifRef);
  }
}

// ---- FCM Token ----
export async function saveFCMToken(userId, token) {
  if (useFirebase && db && userId && token) {
    await set(ref(db, `users/${userId}/fcmToken`), token);
  }
}

// ---- Menu (RTDB) ----
export async function loadMenu() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'menu'));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .filter(item => item && item.id)
    .sort((a, b) => {
      if (a.popular && !b.popular) return -1;
      if (!a.popular && b.popular) return 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
}

export async function saveMenuItem(item) {
  if (!useFirebase || !db) return;
  if (!item.id) item.id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await set(ref(db, 'menu/' + item.id), item);
  return item.id;
}

export async function deleteMenuItem(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'menu/' + id));
}

// ---- Circles / communities (admin-added, on top of the built-in ones) ----
export async function loadCircles() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'circles'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(c => c && c.id);
}

export async function saveCircle(circle) {
  if (!useFirebase || !db) return;
  await set(ref(db, 'circles/' + circle.id), circle);
}

export async function deleteCircle(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'circles/' + id));
}

// ---- Ranking (admin-uploaded leaderboard) ----
export async function loadRanking() {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'ranking'));
  return snap.exists() ? snap.val() : null;
}

export async function saveRanking(ranking) {
  if (!useFirebase || !db) return;
  await set(ref(db, 'ranking'), ranking);
}

// ---- News / announcements (RTDB) — shown in the home carousel ----
export async function loadNews() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'news'));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .filter(n => n && n.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveNewsItem(item) {
  if (!useFirebase || !db) return;
  if (!item.id) item.id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  if (!item.createdAt) item.createdAt = Date.now();
  await set(ref(db, 'news/' + item.id), item);
  return item.id;
}

export async function deleteNewsItem(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'news/' + id));
}

export function onNewsChanged(callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'news');
  const handler = onValue(r, (snap) => {
    const val = snap.exists() ? Object.values(snap.val()).filter(n => n && n.id) : [];
    val.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    callback(val);
  });
  return () => off(r, 'value', handler);
}

// ---- Sponsor banner (RTDB, single object: { imageUrl, link }) ----
export async function loadSponsor() {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'sponsor'));
  return snap.exists() ? snap.val() : null;
}

export async function saveSponsor(obj) {
  if (!useFirebase || !db) return;
  await set(ref(db, 'sponsor'), obj || {});
}

export function onSponsorChanged(callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'sponsor');
  const handler = onValue(r, (snap) => callback(snap.exists() ? snap.val() : null));
  return () => off(r, 'value', handler);
}

// ---- Tournaments (RTDB) ----
// A tournament record carries its own denormalized leaderboard (`entries`),
// the same shape `ranking` uses, so the strip and the leaderboard page need a
// single read. See CHANGELOG_AI.md for the field list.
export async function loadTournaments() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'tournaments'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(tn => tn && tn.id && tn.status !== 'deleted');
}

export async function loadTournament(id) {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'tournaments/' + id));
  if (!snap.exists()) return null;
  const tn = snap.val();
  return tn.status === 'deleted' ? null : tn;
}

export async function saveTournament(tn) {
  if (!useFirebase || !db) return;
  if (!tn.id) tn.id = 'tn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await set(ref(db, 'tournaments/' + tn.id), { ...tn, updatedAt: Date.now() });
  return tn.id;
}

export async function deleteTournament(id) {
  if (!useFirebase || !db) return;
  await update(ref(db, 'tournaments/' + id), { status: 'deleted', deletedAt: Date.now() });
}

export function onTournamentsChanged(callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'tournaments');
  const handler = onValue(r, (snap) => {
    const list = snap.exists()
      ? Object.values(snap.val()).filter(tn => tn && tn.id && tn.status !== 'deleted')
      : [];
    callback(list);
  });
  return () => off(r, 'value', handler);
}

export function onTournamentChanged(id, callback) {
  if (!useFirebase || !db) return null;
  const r = ref(db, 'tournaments/' + id);
  const handler = onValue(r, (snap) => callback(snap.exists() ? snap.val() : null));
  return () => off(r, 'value', handler);
}

// ---- Match play (M Cup) ----
// The match play state lives under tournaments/{id}/mp — see src/matchplay.js
// for the model. Writes here are PARTIAL on purpose: saveTournament() sets the
// whole record, which would silently overwrite a scorer's concurrent hole
// entry, so match play admin edits and scoring go through update() instead.

export async function updateTournament(id, patch) {
  if (!useFirebase || !db || !id) return;
  await update(ref(db, 'tournaments/' + id), { ...patch, updatedAt: Date.now() });
}

// One scorer tap (spec §12) — or its undo (spec §13). `value` is the team key
// 'a' | 'b', 'h' for a halved hole, or null to clear the hole entirely. Every
// write leaves an audit entry (who, when, what it replaced), and RTDB queues
// the writes locally while the course has no signal, so nothing is lost to a
// dead spot (spec §21).
export async function saveTnMatchHole(tnId, matchId, hole, value, by) {
  if (!useFirebase || !db) return;
  const base = `tournaments/${tnId}/mp/matches/${matchId}`;
  const holeRef = ref(db, `${base}/holes/${hole}`);
  // The previous value is only for the audit trail — offline (where get()
  // rejects without a warm cache) the write itself must still go through.
  let prev = null;
  try { prev = (await get(holeRef)).val() ?? null; } catch (_) { }
  const audit = { at: Date.now(), by: by || null, matchId, hole, value: value ?? null, prev };
  if (value === null || value === undefined) {
    await remove(holeRef);
    remove(ref(db, `${base}/holeMeta/${hole}`)).catch(console.warn);
  } else {
    await set(holeRef, value);
    // Who entered the hole — what the correction-consent rule reads. Never
    // blocks the score itself.
    if (by) set(ref(db, `${base}/holeMeta/${hole}`), { by }).catch(console.warn);
  }
  push(ref(db, `tournaments/${tnId}/mp/audit`), audit).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// ---- Correction consent ----
// A player changing a hole SOMEBODY ELSE entered does not overwrite it: the
// proposal parks under pending/{hole} and only the original enterer (or an
// official) applies or rejects it. `value` is 'a' | 'b' | 'h', or 'clear' to
// propose removing the hole (RTDB cannot store null).

export async function proposeTnHoleChange(tnId, matchId, hole, value, user) {
  if (!useFirebase || !db) return;
  const base = `tournaments/${tnId}/mp/matches/${matchId}`;
  await set(ref(db, `${base}/pending/${hole}`), {
    value,
    by: user?.id || null,
    byName: user?.fullName || user?.name || user?.username || '',
    at: Date.now()
  });
  push(ref(db, `tournaments/${tnId}/mp/audit`), {
    at: Date.now(), by: user?.id || null, matchId, hole, action: 'propose', value
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

export async function resolveTnHoleChange(tnId, matchId, hole, approve, user) {
  if (!useFirebase || !db) return;
  const base = `tournaments/${tnId}/mp/matches/${matchId}`;
  const pendingRef = ref(db, `${base}/pending/${hole}`);
  const pending = (await get(pendingRef)).val();
  if (!pending) return;
  if (approve) {
    if (pending.value === 'clear') {
      await remove(ref(db, `${base}/holes/${hole}`));
      remove(ref(db, `${base}/holeMeta/${hole}`)).catch(console.warn);
    } else {
      await set(ref(db, `${base}/holes/${hole}`), pending.value);
      // Ownership passes to the proposer: it is their entry now, and the
      // next correction to it will come back to them for consent.
      if (pending.by) set(ref(db, `${base}/holeMeta/${hole}`), { by: pending.by }).catch(console.warn);
    }
  }
  await remove(pendingRef);
  push(ref(db, `tournaments/${tnId}/mp/audit`), {
    at: Date.now(), by: user?.id || null, matchId, hole,
    action: approve ? 'approve' : 'reject', value: pending.value ?? null, proposedBy: pending.by || null
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// Suspend or resume a match (spec §10) — weather and darkness are the usual
// reasons. Suspension is a human call, so unlike every other match state it
// is stored rather than derived; `suspended: false` clears it and the state
// goes back to whatever the holes say.
export async function setTnMatchSuspended(tnId, matchId, suspended, by) {
  if (!useFirebase || !db) return;
  const r = ref(db, `tournaments/${tnId}/mp/matches/${matchId}/stateOverride`);
  if (suspended) await set(r, 'SUSPENDED');
  else await remove(r);
  push(ref(db, `tournaments/${tnId}/mp/audit`), {
    at: Date.now(), by: by || null, matchId, action: suspended ? 'suspend' : 'resume'
  }).catch(console.warn);
  update(ref(db, 'tournaments/' + tnId), { updatedAt: Date.now() }).catch(console.warn);
}

// ---- Tournament notification subscriptions ----
// tnSubs/{tnId}/{userId}: {at} — who wants a push when a match in this
// tournament finishes. The Cloud Function fans results out to these users
// through the existing /notifications pipeline.

export async function isTnSubscribed(tnId, userId) {
  if (!useFirebase || !db || !tnId || !userId) return false;
  return (await get(ref(db, `tnSubs/${tnId}/${userId}`))).exists();
}

export async function setTnSubscribed(tnId, userId, on) {
  if (!useFirebase || !db || !tnId || !userId) return;
  const r = ref(db, `tnSubs/${tnId}/${userId}`);
  if (on) await set(r, { at: Date.now() });
  else await remove(r);
}

// ---- Device registry (anonymous-auth allowlist) ----
// The database rules let only allowlisted anonymous uids write under
// tournaments/. mpDevices holds the approved devices ({role, name, at} by
// uid, role 'admin'|'scorer' — only admin devices may edit the registry, and
// the FIRST device to claim while the registry is empty becomes admin, which
// is how the owner bootstraps after deploying the rules). mpDeviceRequests
// holds pending requests a device files for itself. With the Anonymous
// provider not enabled or the rules not deployed, none of this gates
// anything — the app behaves exactly as before.

export function getDeviceUid() { return deviceUid; }

export async function deviceStatus() {
  if (!useFirebase || !db || !deviceUid) return { uid: null, role: null, requested: false, registryEmpty: null };
  const [dev, req, reg] = await Promise.all([
    get(ref(db, 'mpDevices/' + deviceUid)),
    get(ref(db, 'mpDeviceRequests/' + deviceUid)),
    get(ref(db, 'mpDevices'))
  ]);
  return {
    uid: deviceUid,
    role: dev.exists() ? (dev.val()?.role || 'scorer') : null,
    requested: req.exists(),
    registryEmpty: !reg.exists()
  };
}

export async function requestDeviceAccess(name) {
  if (!useFirebase || !db || !deviceUid) throw new Error('no-device-uid');
  await set(ref(db, 'mpDeviceRequests/' + deviceUid), { name: name || '', at: Date.now() });
}

// Bootstrap: claims this device as admin. The rules only allow it while the
// registry is empty (or from a device that is already admin).
export async function claimAdminDevice(name) {
  if (!useFirebase || !db || !deviceUid) throw new Error('no-device-uid');
  await set(ref(db, 'mpDevices/' + deviceUid), { role: 'admin', name: name || '', at: Date.now() });
}

export async function loadDeviceRegistry() {
  if (!useFirebase || !db) return { devices: {}, requests: {} };
  const [dev, req] = await Promise.all([
    get(ref(db, 'mpDevices')),
    get(ref(db, 'mpDeviceRequests'))
  ]);
  return { devices: dev.exists() ? dev.val() : {}, requests: req.exists() ? req.val() : {} };
}

export async function approveDevice(uid, name, role = 'scorer') {
  if (!useFirebase || !db || !uid) return;
  await set(ref(db, 'mpDevices/' + uid), { role, name: name || '', at: Date.now() });
  remove(ref(db, 'mpDeviceRequests/' + uid)).catch(console.warn);
}

export async function revokeDevice(uid) {
  if (!useFirebase || !db || !uid) return;
  await remove(ref(db, 'mpDevices/' + uid));
}

export async function dismissDeviceRequest(uid) {
  if (!useFirebase || !db || !uid) return;
  await remove(ref(db, 'mpDeviceRequests/' + uid));
}

// ---- Tables (RTDB) ----
export async function loadTables() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'tables'));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).filter(t => t && t.id).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export async function saveTable(table) {
  if (!useFirebase || !db) return;
  if (!table.id) table.id = 'tbl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await set(ref(db, 'tables/' + table.id), table);
  return table.id;
}

export async function deleteTable(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'tables/' + id));
}

// ---- Orders (RTDB) ----
export async function createOrder(order) {
  if (!useFirebase || !db) throw new Error('Firebase not configured');
  const id = 'o_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const record = { ...order, id, notified: false, createdAt: Date.now() };
  await set(ref(db, 'orders/' + id), record);
  return id;
}

export async function updateOrderStatus(id, status) {
  if (!useFirebase || !db) return;
  await update(ref(db, 'orders/' + id), { status });
}

export async function loadOrder(id) {
  if (!useFirebase || !db) return null;
  const snap = await get(ref(db, 'orders/' + id));
  return snap.exists() ? { id, ...snap.val() } : null;
}

export function onOrdersChanged(cb) {
  if (!useFirebase || !db) return () => {};
  const ordersRef = ref(db, 'orders');
  onValue(ordersRef, (snap) => {
    if (!snap.exists()) { cb([]); return; }
    const orders = Object.entries(snap.val()).map(([id, val]) => ({ id, ...val }));
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    cb(orders);
  });
  return () => off(ordersRef);
}

export function onOrderChanged(id, cb) {
  if (!useFirebase || !db) return () => {};
  const r = ref(db, 'orders/' + id);
  onValue(r, (snap) => cb(snap.exists() ? { id, ...snap.val() } : null));
  return () => off(r);
}

// ---- QPay helpers (food orders only; tee-time QPay is owned by MTBogd) ----
export async function createQpayInvoice(orderId) {
  const res = await fetch('/api/qpay/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'QPay invoice failed');
  return data;
}

export async function checkQpayPayment(orderId) {
  const res = await fetch('/api/qpay/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'QPay check failed');
  return data;
}

// Remove an unpaid food order when the user backs out of payment.
// Guarded: only deletes while still 'pending', so a payment that landed in a
// race is never destroyed.
export async function cancelPendingPayment(id) {
  if (!useFirebase || !db) return false;
  const snap = await get(ref(db, `orders/${id}`));
  if (snap.exists() && snap.val().status === 'pending') {
    await remove(ref(db, `orders/${id}`));
    return true;
  }
  return false;
}

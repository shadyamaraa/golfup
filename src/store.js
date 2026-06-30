import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, remove, onValue, off } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { isFirebaseConfigured, firebaseConfig } from './config.js';

let db = null;
let auth = null;
export let firebaseApp = null;
let useFirebase = false;

export async function initStore() {
  if (isFirebaseConfigured()) {
    try {
      firebaseApp = initializeApp(firebaseConfig);
      db = getDatabase(firebaseApp);
      auth = getAuth(firebaseApp);
      useFirebase = true;
      console.log('Firebase connected');
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

export async function adminCreateUser(name, password, phone, role = 'user', communities = []) {
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const user = { 
    id, name, username: '', firstName: '', lastName: '', fullName: '', communities, password, phone, role, status: 'active',
    bankName: '', bankAccount: '', bankIban: '', avatar: '',
    createdAt: Date.now() 
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
    await set(ref(db, 'games/' + game.id), game);
  } else {
    const games = getLocalGames();
    games[game.id] = game;
    setLocalGames(games);
  }
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

// ---- News / announcements (RTDB) ----
export async function loadNews() {
  if (!useFirebase || !db) return [];
  const snap = await get(ref(db, 'news'));
  if (!snap.exists()) return [];
  return Object.values(snap.val())
    .filter(n => n && n.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveNewsItem(item) {
  if (!useFirebase || !db) return;
  if (!item.id) item.id = 'nws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  if (!item.createdAt) item.createdAt = Date.now();
  await set(ref(db, 'news/' + item.id), item);
  return item.id;
}

export async function deleteNewsItem(id) {
  if (!useFirebase || !db) return;
  await remove(ref(db, 'news/' + id));
}

export function onNewsChanged(cb) {
  if (!useFirebase || !db) return () => {};
  const r = ref(db, 'news');
  onValue(r, (snap) => {
    const data = snap.val();
    cb(data ? Object.values(data).filter(n => n && n.id).sort((a, b) => (a.order || 0) - (b.order || 0) || (b.createdAt || 0) - (a.createdAt || 0)) : []);
  });
  return () => off(r);
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

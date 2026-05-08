import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, remove, onValue, off } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { isFirebaseConfigured, firebaseConfig } from './config.js';

let db = null;
let auth = null;
let firebaseApp = null;
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

export async function adminCreateUser(name, password, phone, role = 'user') {
  const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const user = { 
    id, name, password, phone, role, status: 'active', 
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
      return Object.values(data).sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to load all games:', error);
      return [];
    }
  }
  const games = getLocalGames();
  return Object.values(games).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteGame(id) {
  if (useFirebase && db) {
    await remove(ref(db, 'games/' + id));
  } else {
    const games = getLocalGames();
    delete games[id];
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
      else callback(Object.values(data).sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => off(gamesRef);
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
    const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await set(ref(db, `notifications/${targetUserId}/${id}`), { ...notif, id, createdAt: Date.now() });
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

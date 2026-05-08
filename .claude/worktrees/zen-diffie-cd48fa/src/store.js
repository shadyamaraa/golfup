import { isFirebaseConfigured, firebaseConfig } from './config.js';

let db = null;
let firebaseApp = null;
let useFirebase = false;

export async function initStore() {
  if (isFirebaseConfigured()) {
    try {
      const { initializeApp } = await import('firebase/app');
      const { getDatabase } = await import('firebase/database');
      firebaseApp = initializeApp(firebaseConfig);
      db = getDatabase(firebaseApp);
      useFirebase = true;
;
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

export function saveUser(user) {
  localStorage.setItem('golfup_user', JSON.stringify(user));
}

export function createUser(name) {
  const user = { id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), name, createdAt: Date.now() };
  saveUser(user);
  return user;
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
  if (useFirebase) {
    const { ref, set } = await import('firebase/database');
    await set(ref(db, 'games/' + game.id), game);
  } else {
    const games = getLocalGames();
    games[game.id] = game;
    setLocalGames(games);
  }
}

export async function loadGame(gameId) {
  if (useFirebase) {
    const { ref, get } = await import('firebase/database');
    const snap = await get(ref(db, 'games/' + gameId));
    return snap.exists() ? snap.val() : null;
  }
  return getLocalGames()[gameId] || null;
}

export async function loadAllGames() {
  if (useFirebase) {
    const { ref, get } = await import('firebase/database');
    const snap = await get(ref(db, 'games'));
    if (!snap.exists()) return [];
    const data = snap.val();
    return Object.values(data).sort((a, b) => b.createdAt - a.createdAt);
  }
  return Object.values(getLocalGames()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteGame(gameId) {
  if (useFirebase) {
    const { ref, remove } = await import('firebase/database');
    await remove(ref(db, 'games/' + gameId));
  } else {
    const games = getLocalGames();
    delete games[gameId];
    setLocalGames(games);
  }
}

export function onGameChanged(gameId, callback) {
  if (!useFirebase) return () => {};
  let unsubscribeFn = () => {};
  import('firebase/database').then(({ ref, onValue }) => {
    unsubscribeFn = onValue(ref(db, 'games/' + gameId), (snap) => {
      callback(snap.exists() ? snap.val() : null);
    });
  });
  return () => unsubscribeFn();
}

export function onAllGamesChanged(callback) {
  if (!useFirebase) return () => {};
  let unsubscribeFn = () => {};
  import('firebase/database').then(({ ref, onValue }) => {
    unsubscribeFn = onValue(ref(db, 'games'), (snap) => {
      if (!snap.exists()) return callback([]);
      callback(Object.values(snap.val()).sort((a, b) => b.createdAt - a.createdAt));
    });
  });
  return () => unsubscribeFn();
}

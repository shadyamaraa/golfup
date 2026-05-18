importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAO8NzK55UF4U05e3dZoxkNomzNX3-Ybgc",
  authDomain: "golfup-app.firebaseapp.com",
  databaseURL: "https://golfup-app-default-rtdb.firebaseio.com",
  projectId: "golfup-app",
  storageBucket: "golfup-app.firebasestorage.app",
  messagingSenderId: "189599858941",
  appId: "1:189599858941:web:2dc317541d4ad4e9d33e94"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, gameId } = payload.data || {};
  self.registration.showNotification(title || 'GolfUp', {
    body: body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { gameId }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const gameId = event.notification.data?.gameId;
  const url = gameId ? `https://ubgolf.club/#/game/${gameId}` : 'https://ubgolf.club/';
  event.waitUntil(clients.openWindow(url));
});

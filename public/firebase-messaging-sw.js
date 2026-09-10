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
const APP_URL = 'https://ubgolf.club';

// Where a tap lands: the link the function sends, else the game page an
// older function named by id, else the app.
function linkOf(data) {
  if (data && data.link) return data.link;
  if (data && data.gameId) return `${APP_URL}/#/game/${data.gameId}`;
  return `${APP_URL}/`;
}

messaging.onBackgroundMessage((payload) => {
  // A message carrying a `notification` block has already been displayed
  // by the SDK — which also handles its tap — before this runs; showing it
  // again here is what made every push arrive twice. Only data-only
  // messages are ours to show.
  if (payload && payload.notification) return;
  const data = (payload && payload.data) || {};
  // Returned so the push event's waitUntil covers the display: Safari holds
  // a push that shows nothing against the site.
  return self.registration.showNotification(data.title || 'UB Golf', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/favicon-48.png',
    tag: data.tag || undefined,
    data: { link: linkOf(data) }
  });
});

// Only our own notifications carry data.link; the SDK's carry its own
// record and it stops the event before this listener sees it.
self.addEventListener('notificationclick', (event) => {
  const link = event.notification && event.notification.data && event.notification.data.link;
  if (!link) return;
  event.notification.close();
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url && w.url.indexOf(self.location.origin) === 0);
    if (win) {
      try {
        const nav = await win.navigate(link);
        return (nav || win).focus();
      } catch (_) { /* a window we may not steer — open a fresh one */ }
    }
    return clients.openWindow(link);
  })());
});

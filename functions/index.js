const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');

admin.initializeApp();

const MTBOGD_BASE = 'https://asia-east2-mt-b-993b7.cloudfunctions.net/api/external/v1';

// Verify the system-admin password server-side so it is never shipped in the
// client bundle. Password is stored in Secret Manager as ADMIN_PASSWORD.
// Reachable at /api/admin-login via a hosting rewrite.
exports.adminLogin = functions
  .runWith({ secrets: ['ADMIN_PASSWORD'] })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const expected = process.env.ADMIN_PASSWORD;
    const provided = (req.body && req.body.password) || '';
    if (expected && provided === expected) {
      res.status(200).json({ ok: true });
    } else {
      res.status(401).json({ ok: false });
    }
  });

// Proxy MTBogd external API — keeps the API key server-side.
// Reachable at /api/mtbogd/<path> via Firebase Hosting rewrite.
// The key is stored in Cloud Secret Manager as MTBOGD_API_KEY.
// Restricted to GET and POST only; destructive PATCH operations go
// through dedicated functions (cancelGameBooking, syncBookingPlayers).
exports.mtbogdProxy = functions
  .runWith({ secrets: ['MTBOGD_API_KEY'] })
  .https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (!['GET', 'POST'].includes(req.method)) { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.MTBOGD_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Proxy not configured' }); return; }

  // Strip /api/mtbogd prefix; forward remaining path + query string
  const subPath = req.path.replace(/^\/api\/mtbogd/, '');
  const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
  const upstream = `${MTBOGD_BASE}${subPath}${qs}`;

  const opts = {
    method: req.method,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  };
  if (req.method === 'POST') opts.body = JSON.stringify(req.body);

  try {
    const upRes = await fetch(upstream, opts);
    const data = await upRes.json();
    res.status(upRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Cancel an MTBogd booking by Firebase gameId.
// bookingId is read from RTDB server-side — client never supplies it directly.
exports.cancelGameBooking = functions
  .runWith({ secrets: ['MTBOGD_API_KEY'] })
  .https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { gameId } = req.body || {};
  if (!gameId) { res.status(400).json({ error: 'gameId required' }); return; }

  const snap = await admin.database().ref(`games/${gameId}`).once('value');
  const game = snap.val();
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!game.bookingId) { res.status(400).json({ error: 'No booking on this game' }); return; }

  const apiKey = process.env.MTBOGD_API_KEY;
  try {
    const upRes = await fetch(`${MTBOGD_BASE}/bookings/${game.bookingId}/cancel`, {
      method: 'PATCH',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await upRes.json();
    res.status(upRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Sync player list to MTBogd booking by Firebase gameId.
// bookingId is read from RTDB server-side — client never supplies it directly.
exports.syncBookingPlayers = functions
  .runWith({ secrets: ['MTBOGD_API_KEY'] })
  .https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { gameId, players } = req.body || {};
  if (!gameId || !Array.isArray(players)) { res.status(400).json({ error: 'gameId and players required' }); return; }

  const snap = await admin.database().ref(`games/${gameId}`).once('value');
  const game = snap.val();
  if (!game) { res.status(404).json({ error: 'Game not found' }); return; }
  if (!game.bookingId) { res.status(400).json({ error: 'No booking on this game' }); return; }

  const apiKey = process.env.MTBOGD_API_KEY;
  try {
    const upRes = await fetch(`${MTBOGD_BASE}/bookings/${game.bookingId}`, {
      method: 'PATCH',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ players }),
    });
    const data = await upRes.json();
    res.status(upRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const APP_URL = 'https://ubgolf.club';

// Triggered when a new notification is written to /notifications/{userId}/{notifId}
exports.sendPushOnNotification = functions.database
  .ref('/notifications/{userId}/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.val();
    const { userId, notifId } = context.params;

    const userSnap = await admin.database().ref(`users/${userId}`).once('value');
    const user = userSnap.val();

    if (!user || user.notifyWeb === false || !user.fcmToken) return null;

    const line1 = notif.type === 'invite'
      ? `${notif.from} таныг тоглолтод урьлаа!`
      : notif.type === 'player_joined'
        ? `${notif.from} тоглолтод нэгдлээ!`
        : notif.type === 'player_left'
          ? `${notif.from} тоглолтоос гарлаа!`
          : notif.type === 'game_updated'
            ? `Тоглолт засагдлаа${notif.changes ? ': ' + notif.changes : ''}`
            : notif.type === 'game_deleted'
              ? `${notif.from} тоглолтыг цуцаллаа`
              : `${notif.from} шинэ тоглолт үүсгэлээ!`;
    const body = `${notif.gameDate} ${notif.gameTime} - ${notif.gameLocation}`;

    await admin.messaging().send({
      token: user.fcmToken,
      data: {
        title: `UB Golf: ${line1}`,
        body,
        gameId: notif.gameId || ''
      },
      webpush: {
        notification: {
          title: `UB Golf: ${line1}`,
          body,
          icon: `${APP_URL}/icon.svg`
        },
        fcm_options: {
          link: notif.gameId ? `${APP_URL}/#/game/${notif.gameId}` : APP_URL
        }
      }
    });

    console.log(`FCM push sent to user ${userId} for notif ${notifId}`);
    return null;
  });

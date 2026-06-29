const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const qpay = require('./qpay');

admin.initializeApp();

const MTBOGD_BASE = 'https://asia-east2-mt-b-993b7.cloudfunctions.net/api/external/v1';

// Kitchen display password — stored in Secret Manager as KITCHEN_PASSWORD.
// Reachable at /api/kitchen-login via a hosting rewrite.
exports.kitchenLogin = functions
  .runWith({ secrets: ['KITCHEN_PASSWORD'] })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const expected = process.env.KITCHEN_PASSWORD;
    const provided = (req.body && req.body.password) || '';
    if (expected && provided === expected) {
      res.status(200).json({ ok: true });
    } else {
      res.status(401).json({ ok: false });
    }
  });

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

// ---- QPay v2 integration (preview-channel only; production flag is hostname-based on frontend) ----

const QPAY_SECRETS = ['QPAY_USERNAME', 'QPAY_PASSWORD', 'QPAY_INVOICE_CODE'];
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function setCors(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.set(k, v));
}

// Allowlisted RTDB collections a QPay record may live in. Prevents arbitrary
// path injection from the `collection` request parameter.
//   orders          — food orders (kitchen reads these)
//   bookingPayments — tee-time booking payments (kept out of the kitchen feed)
const QPAY_COLLECTIONS = ['orders', 'bookingPayments'];
function resolveCollection(value) {
  return QPAY_COLLECTIONS.includes(value) ? value : 'orders';
}

// Callback/check also confirm tee-time bookings, so they need the MTBogd key.
const QPAY_FULFILL_SECRETS = [...QPAY_SECRETS, 'MTBOGD_API_KEY'];

// Marks a paid QPay record. For tee-time bookingPayments that carry a deferred
// MTBogd booking (pendingBooking), it atomically claims the record, confirms
// the booking server-side, and writes the game — so payment and fulfilment are
// one step and survive the browser closing. Food orders take the simple path.
async function finalizePaidRecord(collection, orderId, record) {
  const recRef = admin.database().ref(`${collection}/${orderId}`);
  const pb = record && record.pendingBooking;
  const base = { status: 'paid', paymentMethod: 'qpay', paidAt: new Date().toISOString() };

  if (collection !== 'bookingPayments' || !pb) {
    if (record.status !== 'paid') await recRef.update(base);
    return;
  }

  // Claim the record so only one caller (QPay callback vs frontend poll) runs
  // the confirm. pending -> confirming wins; anything else aborts.
  // NOTE: if a confirm crashes after this point the record stays 'confirming';
  // such a payment needs manual reconciliation (rare).
  const claim = await recRef.child('status').transaction(cur => (cur === 'pending' ? 'confirming' : undefined));
  if (!claim.committed || claim.snapshot.val() !== 'confirming') return;

  try {
    const apiKey = process.env.MTBOGD_API_KEY;
    const upRes = await fetch(`${MTBOGD_BASE}/bookings`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdId: pb.holdId, customer: pb.customer, players: pb.players, notes: pb.notes || '' }),
    });
    const booking = await upRes.json();
    if (!upRes.ok) throw new Error(booking?.error?.message || booking?.message || `confirm ${upRes.status}`);

    const bookingCode = booking.bookingCode || null;
    const bookingId = booking.bookingId || null;
    const game = { ...pb.game, ...(bookingCode && { bookingCode, bookingId, bookingSlotId: pb.slotId }) };
    await admin.database().ref(`games/${game.id}`).set(game);

    await recRef.update({ ...base, bookingCode, bookingId });
  } catch (err) {
    console.error('finalizePaidRecord booking confirm failed', err);
    // Payment received but the booking could not be confirmed (e.g. hold
    // expired). Flag it so the client shows a warning and staff can reconcile.
    await recRef.update({ ...base, bookingError: err.message });
  }
}

// POST /api/qpay/invoice  body:{orderId, collection?}
// Creates a QPay invoice for the given record, stores invoice_id in
// <collection>/<id>/qpay, returns QR image + bank deeplinks to the frontend.
exports.qpayCreateInvoice = functions
  .runWith({ secrets: QPAY_SECRETS })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const { orderId } = req.body || {};
    const collection = resolveCollection(req.body && req.body.collection);
    if (!orderId) { res.status(400).json({ ok: false, error: 'orderId required' }); return; }

    try {
      const snap = await admin.database().ref(`${collection}/${orderId}`).once('value');
      const order = snap.val();
      if (!order) { res.status(404).json({ ok: false, error: 'Record not found' }); return; }

      const host = req.headers['x-forwarded-host'] || req.headers.host || 'ubgolf.club';
      const callbackUrl = `https://${host}/api/qpay/callback?order_id=${orderId}&col=${collection}`;

      const invoice = await qpay.createInvoice({
        orderId,
        amount: order.total,
        description: `UB Golf — ${collection === 'bookingPayments' ? 'захиалга' : 'хоол'} #${orderId.slice(-6)}`,
        callbackUrl,
        receiverPhone: order.customerPhone || 'guest',
      });

      await admin.database().ref(`${collection}/${orderId}/qpay`).set({
        invoice_id: invoice.invoice_id,
        createdAt: Date.now(),
      });

      res.status(200).json({ ok: true, ...invoice });
    } catch (err) {
      console.error('qpayCreateInvoice error', err);
      res.status(502).json({ ok: false, error: err.message });
    }
  });

// GET|POST /api/qpay/callback?order_id=…&col=…
// Called by QPay after payment. Verifies via payment/check, then finalizes
// (marks paid; for tee-time also confirms the MTBogd booking + creates the game).
exports.qpayCallback = functions
  .runWith({ secrets: QPAY_FULFILL_SECRETS })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const orderId = req.query.order_id;
    const collection = resolveCollection(req.query.col);
    if (!orderId) { res.status(400).send('order_id required'); return; }

    try {
      const snap = await admin.database().ref(`${collection}/${orderId}`).once('value');
      const order = snap.val();
      if (!order) { res.status(404).send('record not found'); return; }

      const invoiceId = order.qpay?.invoice_id;
      if (!invoiceId) { res.status(400).send('no invoice on record'); return; }

      const result = await qpay.checkPayment(invoiceId);
      if (result.paid) await finalizePaidRecord(collection, orderId, order);

      res.status(200).send('ok');
    } catch (err) {
      console.error('qpayCallback error', err);
      res.status(502).send(err.message);
    }
  });

// POST /api/qpay/check  body:{orderId, collection?}
// Frontend polling fallback — checks payment status and finalizes if paid.
exports.qpayCheckPayment = functions
  .runWith({ secrets: QPAY_FULFILL_SECRETS })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const { orderId } = req.body || {};
    const collection = resolveCollection(req.body && req.body.collection);
    if (!orderId) { res.status(400).json({ ok: false, error: 'orderId required' }); return; }

    try {
      const snap = await admin.database().ref(`${collection}/${orderId}`).once('value');
      const order = snap.val();
      if (!order) { res.status(404).json({ ok: false, error: 'Record not found' }); return; }

      const invoiceId = order.qpay?.invoice_id;
      if (!invoiceId) { res.status(400).json({ ok: false, error: 'No invoice on record' }); return; }

      const result = await qpay.checkPayment(invoiceId);
      if (result.paid) await finalizePaidRecord(collection, orderId, order);

      res.status(200).json({ ok: true, paid: result.paid, paidAmount: result.paidAmount });
    } catch (err) {
      console.error('qpayCheckPayment error', err);
      res.status(502).json({ ok: false, error: err.message });
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

const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');
const crypto = require('crypto');
const qpay = require('./qpay');

admin.initializeApp();

const MTBOGD_BASE = 'https://api-sci3zq7dca-df.a.run.app/external/v1';

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
  const reason = (req.body && req.body.reason) || 'Cancelled from UBGolf';
  try {
    const upRes = await fetch(`${MTBOGD_BASE}/bookings/${game.bookingId}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
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

// Marks a food order paid. (Tee-time payments are owned by MTBogd, not here.)
async function markOrderPaid(orderId, order) {
  if (order.status === 'paid') return;
  await admin.database().ref(`orders/${orderId}`).update({
    status: 'paid', paymentMethod: 'qpay', paidAt: new Date().toISOString(),
  });
}

// POST /api/qpay/invoice  body:{orderId}
// Creates a QPay invoice for a food order, stores invoice_id in orders/<id>/qpay,
// returns QR image + bank deeplinks to the frontend.
exports.qpayCreateInvoice = functions
  .runWith({ secrets: QPAY_SECRETS })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const { orderId } = req.body || {};
    if (!orderId) { res.status(400).json({ ok: false, error: 'orderId required' }); return; }

    try {
      const snap = await admin.database().ref(`orders/${orderId}`).once('value');
      const order = snap.val();
      if (!order) { res.status(404).json({ ok: false, error: 'Order not found' }); return; }

      const host = req.headers['x-forwarded-host'] || req.headers.host || 'ubgolf.club';
      const callbackUrl = `https://${host}/api/qpay/callback?order_id=${orderId}`;

      const invoice = await qpay.createInvoice({
        orderId,
        amount: order.total,
        description: `UB Golf — хоол #${orderId.slice(-6)}`,
        callbackUrl,
        receiverPhone: order.customerPhone || 'guest',
      });

      await admin.database().ref(`orders/${orderId}/qpay`).set({
        invoice_id: invoice.invoice_id,
        createdAt: Date.now(),
      });

      res.status(200).json({ ok: true, ...invoice });
    } catch (err) {
      console.error('qpayCreateInvoice error', err);
      res.status(502).json({ ok: false, error: err.message });
    }
  });

// GET|POST /api/qpay/callback?order_id=…
// Called by QPay after payment. Verifies via payment/check, then marks paid.
exports.qpayCallback = functions
  .runWith({ secrets: QPAY_SECRETS })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const orderId = req.query.order_id;
    if (!orderId) { res.status(400).send('order_id required'); return; }

    try {
      const snap = await admin.database().ref(`orders/${orderId}`).once('value');
      const order = snap.val();
      if (!order) { res.status(404).send('order not found'); return; }

      const invoiceId = order.qpay?.invoice_id;
      if (!invoiceId) { res.status(400).send('no invoice on order'); return; }

      const result = await qpay.checkPayment(invoiceId);
      if (result.paid) await markOrderPaid(orderId, order);

      res.status(200).send('ok');
    } catch (err) {
      console.error('qpayCallback error', err);
      res.status(502).send(err.message);
    }
  });

// POST /api/qpay/check  body:{orderId}
// Frontend polling fallback — checks payment status and marks paid.
exports.qpayCheckPayment = functions
  .runWith({ secrets: QPAY_SECRETS })
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }

    const { orderId } = req.body || {};
    if (!orderId) { res.status(400).json({ ok: false, error: 'orderId required' }); return; }

    try {
      const snap = await admin.database().ref(`orders/${orderId}`).once('value');
      const order = snap.val();
      if (!order) { res.status(404).json({ ok: false, error: 'Order not found' }); return; }

      const invoiceId = order.qpay?.invoice_id;
      if (!invoiceId) { res.status(400).json({ ok: false, error: 'No invoice on order' }); return; }

      const result = await qpay.checkPayment(invoiceId);
      if (result.paid) await markOrderPaid(orderId, order);

      res.status(200).json({ ok: true, paid: result.paid, paidAmount: result.paidAmount });
    } catch (err) {
      console.error('qpayCheckPayment error', err);
      res.status(502).json({ ok: false, error: err.message });
    }
  });

// POST /api/mtbogd-webhook
// MTBogd notifies us when a booking is created/paid/cancelled. We verify the
// HMAC signature, dedup by delivery id, and reflect the payment on the game.
exports.mtbogdWebhook = functions
  .runWith({ secrets: ['MTBOGD_WEBHOOK_SECRET'] })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const secret = process.env.MTBOGD_WEBHOOK_SECRET;
    const sigHeader = req.get('X-MTBogd-Signature') || '';
    // req.rawBody is the unparsed body Firebase preserves — required for HMAC.
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const ok = sigHeader.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
    if (!ok) { res.status(401).send('bad signature'); return; }

    const deliveryId = req.get('X-MTBogd-Delivery') || '';
    const event = req.get('X-MTBogd-Event') || (req.body && req.body.event) || '';
    const booking = (req.body && req.body.booking) || {};
    const bookingId = booking.bookingId;

    try {
      // Dedup: claim the delivery id; if already seen, ack and stop.
      if (deliveryId) {
        const dRef = admin.database().ref(`mtbogdDeliveries/${deliveryId}`);
        const claim = await dRef.transaction(cur => (cur ? undefined : { event, at: Date.now() }));
        if (!claim.committed) { res.status(200).send('duplicate'); return; }
      }

      if (bookingId) {
        const snap = await admin.database().ref('games').orderByChild('bookingId').equalTo(bookingId).once('value');
        const games = snap.val() || {};
        const gameId = Object.keys(games)[0];
        if (gameId) {
          if (event === 'paid') {
            await admin.database().ref(`games/${gameId}`).update({
              bookingPaid: true,
              paidAt: new Date().toISOString(),
              paidAmount: booking.paidAmount || null,
              paymentMethod: 'qpay',
            });
          } else if (event === 'cancelled') {
            await admin.database().ref(`games/${gameId}`).update({ bookingCancelled: true });
          }
        }
      }

      res.status(200).send('ok');
    } catch (err) {
      console.error('mtbogdWebhook error', err);
      res.status(500).send(err.message);
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

    // M Cup results carry their own ready-made text and link to a
    // tournament rather than a game.
    if (notif.type === 'mcup') {
      await admin.messaging().send({
        token: user.fcmToken,
        data: {
          title: notif.title || 'M Cup',
          body: notif.body || '',
          gameId: ''
        },
        webpush: {
          notification: {
            title: notif.title || 'M Cup',
            body: notif.body || '',
            icon: `${APP_URL}/icon.svg`
          },
          fcm_options: {
            link: notif.tnId ? `${APP_URL}/#/tournament/${notif.tnId}` : APP_URL
          }
        }
      });
      console.log(`FCM mcup push sent to user ${userId} for notif ${notifId}`);
      return null;
    }

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

// ---- M Cup: push when a match finishes ----
// Fires on every hole write of a match play tournament. The match play
// arithmetic is a compact copy of src/matchplay.js settleMatch() — the
// client bundle cannot be imported here, so the rules live twice; keep them
// in step. Duplicate sends are prevented by recording the result that was
// last announced under mp/notified/{matchId} (admin SDK, so the device
// allowlist rules do not apply): a correction that CHANGES a final result
// announces again, a same-result recompletion does not.

function mpSettle(holes, totalHoles) {
  const total = Number(totalHoles) || 18;
  const wins = { a: 0, b: 0 };
  let thru = 0;
  for (let hole = 1; hole <= total; hole++) {
    const v = holes && holes[hole];
    if (v !== 'a' && v !== 'b' && v !== 'h') break;
    if (v !== 'h') wins[v]++;
    thru = hole;
    if (Math.abs(wins.a - wins.b) > total - hole) break;
  }
  const margin = Math.abs(wins.a - wins.b);
  const leader = margin === 0 ? null : (wins.a > wins.b ? 'a' : 'b');
  const remaining = total - thru;
  const closedOut = remaining > 0 && margin > remaining;
  const finished = closedOut || thru === total;
  return {
    finished,
    winner: finished && leader ? leader : null,
    result: !finished ? null : !leader ? 'HALVED' : closedOut ? `${margin} & ${remaining}` : `${margin} UP`
  };
}

const mpPts = (n) => (n % 1 ? n.toFixed(1) : String(n));

exports.mcupMatchFinished = functions.database
  .ref('/tournaments/{tnId}/mp/matches/{matchId}/holes')
  .onWrite(async (change, context) => {
    const { tnId, matchId } = context.params;
    const db = admin.database();

    const [tnSnap, subsSnap] = await Promise.all([
      db.ref(`tournaments/${tnId}`).once('value'),
      db.ref(`tnSubs/${tnId}`).once('value')
    ]);
    const tn = tnSnap.val();
    const mp = tn && tn.mp;
    const match = mp && mp.matches && mp.matches[matchId];
    if (!tn || !match) return null;

    const settled = mpSettle(change.after.val(), match.totalHoles);
    if (!settled.finished) return null;

    const notifiedRef = db.ref(`tournaments/${tnId}/mp/notified/${matchId}`);
    if ((await notifiedRef.once('value')).val() === settled.result) return null;
    await notifiedRef.set(settled.result);

    const subs = subsSnap.val() || {};
    const userIds = Object.keys(subs);
    if (!userIds.length) return null;

    const names = (k) => ((match.players && match.players[k]) || [])
      .map((pid) => mp.roster && mp.roster[pid] && mp.roster[pid].name)
      .filter(Boolean).join(' / ');
    // Singles tournaments have no teams — the winning side is a player, so
    // the notification leads with their name instead of a team short.
    const short = (k) => (mp.teams && mp.teams[k] && (mp.teams[k].short || mp.teams[k].name))
      || names(k) || (k === 'a' ? 'A' : 'B');

    const title = settled.winner
      ? `${tn.name || 'M Cup'}: Match №${match.number || '?'} — ${short(settled.winner)} ${settled.result}`
      : `${tn.name || 'M Cup'}: Match №${match.number || '?'} — Тэнцэв`;
    let body = [names('a'), names('b')].filter(Boolean).join(' vs ');

    // When that was the last undecided match, lead with the tournament's
    // final score instead of burying it.
    const all = Object.values(mp.matches).filter(Boolean);
    const settledAll = all.map((m) => mpSettle(m.holes, m.totalHoles));
    if (settledAll.every((s) => s.finished)) {
      const total = { a: 0, b: 0 };
      settledAll.forEach((s) => {
        if (!s.winner) { total.a += 0.5; total.b += 0.5; }
        else total[s.winner] += 1;
      });
      body = `Эцсийн дүн: ${short('a')} ${mpPts(total.a)} — ${mpPts(total.b)} ${short('b')}`;
    }

    const now = Date.now();
    await Promise.all(userIds.map((uid) =>
      db.ref(`notifications/${uid}`).push({
        type: 'mcup',
        title,
        body,
        tnId,
        gameId: `tn:${tnId}`,
        createdAt: now
      })));

    console.log(`mcup: notified ${userIds.length} subscribers of ${tnId}/${matchId} (${settled.result})`);
    return null;
  });

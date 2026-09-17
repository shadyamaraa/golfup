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

// A data-only web push: the service worker (public/firebase-messaging-sw.js)
// displays it with the brand icon and opens `link` on tap. A `notification`
// block would make the FCM SDK display it as well, and every push arrived
// twice; the tag lets a redelivery replace the same notification instead.
function pushMessage(token, { title, body, link, gameId = '', tag }) {
  return {
    token,
    data: { title, body, link, gameId, tag: tag || '' },
    webpush: { headers: { Urgency: 'high' } }
  };
}

// Triggered when a new notification is written to /notifications/{userId}/{notifId}
exports.sendPushOnNotification = functions.database
  .ref('/notifications/{userId}/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.val();
    const { userId, notifId } = context.params;

    const userSnap = await admin.database().ref(`users/${userId}`).once('value');
    const user = userSnap.val();

    if (!user || user.notifyWeb === false || !user.fcmToken) return null;

    // Tournament notifications — an M Cup result, a stroke play tee time,
    // a published draw — carry their own ready-made text and link to the
    // tournament rather than a game. A stable tag (a tee time corrected
    // twice replaces itself on the lock screen) when the record has one.
    if (['mcup', 'tn_tee', 'tn_sched'].includes(notif.type)) {
      await admin.messaging().send(pushMessage(user.fcmToken, {
        title: notif.title || 'UB Golf',
        body: notif.body || '',
        link: notif.tnId ? `${APP_URL}/#/tournament/${notif.tnId}` : APP_URL,
        tag: notif.tag || notifId
      }));
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

    await admin.messaging().send(pushMessage(user.fcmToken, {
      title: `UB Golf: ${line1}`,
      body,
      gameId: notif.gameId || '',
      link: notif.gameId ? `${APP_URL}/#/game/${notif.gameId}` : APP_URL,
      tag: notifId
    }));

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

function mpSettle(holes, totalHoles, suddenDeath) {
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
  // The playoff cannot be halved: level after its holes, it plays on until
  // one is won. Same rule as settleMatch()'s suddenDeath option.
  let sd = false;
  if (suddenDeath && thru === total && wins.a === wins.b) {
    for (let hole = total + 1; ; hole++) {
      const v = holes && holes[hole];
      if (v !== 'a' && v !== 'b' && v !== 'h') break;
      thru = hole;
      if (v === 'h') continue;
      wins[v]++;
      sd = true;
      break;
    }
  }
  const margin = Math.abs(wins.a - wins.b);
  const leader = margin === 0 ? null : (wins.a > wins.b ? 'a' : 'b');
  const remaining = Math.max(0, total - thru);
  const closedOut = remaining > 0 && margin > remaining;
  const finished = closedOut || (thru >= total && !(suddenDeath && !leader));
  return {
    finished,
    suddenDeath: sd,
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

    const settled = mpSettle(change.after.val(), match.totalHoles, !!match.playoff);
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

    const label = match.playoff ? 'Playoff' : `Match №${match.number || '?'}`;
    const title = settled.winner
      ? `${tn.name || 'M Cup'}: ${label} — ${short(settled.winner)} ${settled.result}${settled.suddenDeath ? ' (sudden death)' : ''}`
      : `${tn.name || 'M Cup'}: ${label} — Тэнцэв`;
    let body = [names('a'), names('b')].filter(Boolean).join(' vs ');

    // When that was the last undecided match, lead with the tournament's
    // final score instead of burying it.
    const all = Object.values(mp.matches).filter(Boolean);
    const settledAll = all.map((m) => mpSettle(m.holes, m.totalHoles, !!m.playoff));
    if (settledAll.every((s) => s.finished)) {
      // The playoff decides the cup, not the score: it is left out of the
      // total, exactly as matchPoints() leaves it out on the client.
      const total = { a: 0, b: 0 };
      all.forEach((m, i) => {
        if (m.playoff) return;
        const s = settledAll[i];
        if (!s.winner) { total.a += 0.5; total.b += 0.5; }
        else total[s.winner] += 1;
      });
      body = `Эцсийн дүн: ${short('a')} ${mpPts(total.a)} — ${mpPts(total.b)} ${short('b')}`;
      const po = all.findIndex((m) => m.playoff);
      if (po >= 0 && settledAll[po].winner) {
        body += ` · ${short(settledAll[po].winner)} playoff-оор ялав`;
      }
    }

    // The record carries its own key as `id`: the client reads the list
    // with Object.values() and dismisses by n.id, so a record without one
    // could never be cleared from the bell.
    const now = Date.now();
    await Promise.all(userIds.map((uid) => {
      const ref = db.ref(`notifications/${uid}`).push();
      return ref.set({
        id: ref.key,
        type: 'mcup',
        title,
        body,
        tnId,
        gameId: `tn:${tnId}`,
        createdAt: now
      });
    }));

    console.log(`mcup: notified ${userIds.length} subscribers of ${tnId}/${matchId} (${settled.result})`);
    return null;
  });

// ---- Stroke play: push when a flight's tee time is set or changed ----
// Fires once per round of a stroke play draw on every admin save (the
// editor writes sp/groups/{round} whole). The round is read back fresh
// after a short wait, so three saves in a row wake up looking at one
// settled draw; who is told is decided against a ledger of what each
// player was last told (sp/notified/{round}, admin SDK, the same idea as
// mp/notified), so a retry, a redelivery or a redraw that keeps someone's
// time sends them nothing. The players themselves get their own time;
// subscribers (tnSubs) get one «хуваарь зарлагдлаа» per round, on its
// first publish only. The rules that read the draw are a copy of
// src/strokeplay.js — the client bundle cannot be imported here; keep the
// marked block identical (scripts/test-tee-notify.mjs checks).
const TEE_DEBOUNCE_MS = Number(process.env.TEE_DEBOUNCE_MS === undefined ? 60000 : process.env.TEE_DEBOUNCE_MS);
const TEE_FANOUT_CAP = 300;

// >>> tee-notify (shared with functions/index.js — keep the two copies identical)
// A round's draw read as instructions to people: for every player in a
// flight that has a tee time, the time and the start hole (with the flight's
// number and id for the message). A team entry opens up into its members,
// WD/DQ and unknown pids are dropped, and a flight with no time is not an
// instruction yet.
function spTeeSlots(groups, players) {
  const roster = players || {};
  const out = {};
  const dropped = (p) => ['WD', 'DQ'].includes(String((p && p.status) || '').toUpperCase());
  Object.entries(groups || {}).forEach(([gid, g]) => {
    if (!g || !/^\d{1,2}:\d{2}$/.test(String(g.teeTime || ''))) return;
    Object.keys(g.players || {}).forEach((pid) => {
      const p = roster[pid];
      if (!p) return;
      const members = p.kind === 'team' ? Object.keys(p.members || {}) : [pid];
      members.forEach((m) => {
        const mp = roster[m];
        if (!mp || dropped(mp)) return;
        out[m] = {
          teeTime: g.teeTime,
          startHole: g.startHole ? Number(g.startHole) : null,
          number: g.number === undefined || g.number === null ? null : g.number,
          gid
        };
      });
    });
  });
  return out;
}

// What a slot says to the person: the time and the start hole. The flight's
// number is left out on purpose — a renumbering that keeps everyone's time
// is not news.
function spTeeSig(slot) {
  return slot ? `${slot.teeTime}|${slot.startHole === null || slot.startHole === undefined ? '' : slot.startHole}` : '';
}

// The account a roster entry reaches: a member's pid is their userId, an
// older entry carries it, a hand-added guest (p_…) has none.
function spTeeUid(pid, players) {
  const p = (players || {})[pid];
  return (p && p.userId) || (String(pid).startsWith('p_') ? null : pid);
}

// Who to tell, given the round's draw before and after a write, the roster,
// and the ledger of what each player was last told — `prev`, or null on a
// round the ledger has never seen, when what the record said before the
// write stands in for it, so a round published before the ledger existed is
// not re-announced whole on its first edit.
//   sigs: what everyone is told now; notify: [{ pid, slot, prevSig }] whose
//   instruction changed; firstPublish: the round had no times before this
//   write and has them now.
function spTeeAnnounce({ before, after, players, prev }) {
  const slots = spTeeSlots(after, players);
  const sigs = {};
  Object.keys(slots).forEach((pid) => { sigs[pid] = spTeeSig(slots[pid]); });
  const wasSlots = spTeeSlots(before, players);
  const base = prev || Object.fromEntries(Object.keys(wasSlots).map((pid) => [pid, spTeeSig(wasSlots[pid])]));
  const notify = Object.keys(slots)
    .filter((pid) => base[pid] !== sigs[pid])
    .map((pid) => ({ pid, slot: slots[pid], prevSig: base[pid] || '' }));
  const firstPublish = !Object.keys(wasSlots).length && !!Object.keys(slots).length;
  return { sigs, notify, firstPublish };
}
// <<< tee-notify

// A round's calendar day: the start date plus one day per round — the
// client's spRoundDate (src/strokeplay.js), which is the M Cup's
// sessionDate. Date strings only, so the server's UTC clock never enters.
function spRoundDate(tn, round) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((tn && tn.startDate) || ''));
  const r = Math.max(1, Number(round) || 1);
  if (!m) return '';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + r - 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// Today in Ulaanbaatar (UTC+8): Cloud Functions run on UTC, and a round's
// day is compared as a date string.
const ubToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

// The client's tnStatus reading of "final": a stored status wins, else the
// day after the end date.
function tnFinal(tn) {
  if (tn.status === 'final') return true;
  if (tn.status === 'live' || tn.status === 'upcoming') return false;
  const end = tn.endDate || tn.startDate;
  return !!end && ubToday() > end;
}

exports.spScheduleChanged = functions
  .runWith({ timeoutSeconds: 180 })
  .database.ref('/tournaments/{tnId}/sp/groups/{round}')
  .onWrite(async (change, context) => {
    const { tnId, round } = context.params;
    if (!/^[1-9]\d*$/.test(String(round))) return null;
    const beforeVal = change.before.val();
    // Every save rewrites every round, most of them unchanged: the cheapest
    // and by far the most frequent exit.
    if (JSON.stringify(beforeVal) === JSON.stringify(change.after.val())) return null;

    if (TEE_DEBOUNCE_MS > 0) await new Promise((r) => setTimeout(r, TEE_DEBOUNCE_MS));

    const db = admin.database();
    const [tnSnap, subsSnap] = await Promise.all([
      db.ref(`tournaments/${tnId}`).once('value'),
      db.ref(`tnSubs/${tnId}`).once('value')
    ]);
    const tn = tnSnap.val();
    if (!tn || tn.status === 'deleted' || tnFinal(tn)) return null;
    if (Number(round) > Math.max(1, Number(tn.rounds) || 1)) return null;
    const date = spRoundDate(tn, round);
    if (date && date < ubToday()) return null;   // a round already played

    // The settled draw, not the one this event carried.
    const after = (tn.sp && tn.sp.groups && tn.sp.groups[round]) || null;
    const players = (tn.sp && tn.sp.players) || {};

    // One compare-and-set on the ledger, before anything is sent: a crash
    // after it under-sends rather than double-sends.
    const ledgerRef = db.ref(`tournaments/${tnId}/sp/notified/${round}`);
    let plan = null;
    let hadLedger = false;
    const res = await ledgerRef.transaction((cur) => {
      hadLedger = !!(cur && cur.subsAt !== undefined);
      plan = spTeeAnnounce({ before: beforeVal, after, players, prev: cur && cur.p ? cur.p : null });
      const sameSigs = !!cur && JSON.stringify(cur.p || {}) === JSON.stringify(plan.sigs);
      if (sameSigs && hadLedger) return undefined;   // nothing new: abort
      const subsAt = hadLedger ? cur.subsAt : (plan.firstPublish ? Date.now() : 0);
      return { p: plan.sigs, subsAt, at: Date.now() };
    });
    if (!res.committed || !plan) return null;
    // Subscribers hear of a round once, on its first publish. A round the
    // ledger first meets already published (subsAt claimed as 0 above) is
    // never announced — it was out before the function existed.
    const announce = plan.firstPublish && !hadLedger;

    const seen = new Set();
    const targets = [];
    plan.notify.forEach((n) => {
      const uid = spTeeUid(n.pid, players);
      if (!uid || seen.has(uid)) return;
      seen.add(uid);
      targets.push({ uid, ...n });
    });
    const subs = announce ? Object.keys(subsSnap.val() || {}).filter((uid) => !seen.has(uid)) : [];
    if (targets.length + subs.length > TEE_FANOUT_CAP) {
      console.error(`tee: refusing to notify ${targets.length + subs.length} people for ${tnId} R${round}`);
      return null;
    }

    const name = tn.name || 'Тэмцээн';
    const now = Date.now();
    const writes = [];
    targets.forEach(({ uid, slot, prevSig }) => {
      const moved = !!prevSig;
      const prevTime = moved ? prevSig.split('|')[0] : '';
      const body = [
        `R${round}`,
        moved && prevTime && prevTime !== slot.teeTime ? `${prevTime} → ${slot.teeTime}` : slot.teeTime,
        slot.startHole ? `${slot.startHole}-р нүх` : '',
        slot.number !== null ? `Флайт ${slot.number}` : ''
      ].filter(Boolean).join(' · ');
      const ref = db.ref(`notifications/${uid}`).push();
      writes.push(ref.set({
        id: ref.key,
        type: 'tn_tee',
        tnId,
        round: Number(round),
        title: `${name} — ${moved ? 'Tee time өөрчлөгдлөө' : 'Таны tee time'}`,
        body,
        teeTime: slot.teeTime,
        startHole: slot.startHole,
        number: slot.number,
        kind: moved ? 'moved' : 'new',
        // Grouped per round in the bell; expires by itself once the flight
        // has gone off (the client drops a notification whose date and
        // time have passed).
        gameId: `tn:${tnId}:tee:${round}`,
        gameDate: date || null,
        gameTime: slot.teeTime,
        tag: `tn:${tnId}:tee:${round}`,
        createdAt: now
      }));
    });
    if (subs.length) {
      const slots = spTeeSlots(after, players);
      const times = Object.keys(slots).map((pid) => slots[pid].teeTime).sort();
      const flights = Object.values(after || {}).filter((g) => g && g.teeTime).length;
      const body = `${flights} флайт${times.length ? ` · ${times[0]}–${times[times.length - 1]}` : ''}`;
      subs.forEach((uid) => {
        const ref = db.ref(`notifications/${uid}`).push();
        writes.push(ref.set({
          id: ref.key,
          type: 'tn_sched',
          tnId,
          round: Number(round),
          title: `${name}: R${round}-ийн хуваарь зарлагдлаа`,
          body,
          gameId: `tn:${tnId}:sched:${round}`,
          gameDate: date || null,
          gameTime: times[0] || null,
          tag: `tn:${tnId}:sched:${round}`,
          createdAt: now
        }));
      });
    }
    await Promise.all(writes);
    console.log(`tee: ${tnId} R${round} — ${targets.length} players told, ${subs.length} subscribers announced`);
    return null;
  });

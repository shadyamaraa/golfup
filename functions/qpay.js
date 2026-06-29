const admin = require('firebase-admin');

const QPAY_BASE = 'https://merchant.qpay.mn/v2';

async function getToken() {
  const db = admin.database();
  const cacheRef = db.ref('qpay/_token');
  const snap = await cacheRef.once('value');
  const cached = snap.val();
  const nowSec = Math.floor(Date.now() / 1000);

  if (cached && cached.access_token && nowSec < cached.expires_in - 60) {
    return cached.access_token;
  }

  const username = process.env.QPAY_USERNAME;
  const password = process.env.QPAY_PASSWORD;
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');

  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay auth failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  await cacheRef.set({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  });

  return data.access_token;
}

async function createInvoice({ orderId, amount, description, callbackUrl, receiverPhone }) {
  const token = await getToken();
  const invoiceCode = process.env.QPAY_INVOICE_CODE;

  const body = {
    invoice_code: invoiceCode,
    sender_invoice_no: orderId,
    invoice_receiver_code: receiverPhone || 'guest',
    invoice_description: description || `Order ${orderId}`,
    amount,
    callback_url: callbackUrl,
  };

  const res = await fetch(`${QPAY_BASE}/invoice`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay createInvoice failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    invoice_id: data.invoice_id,
    qr_text: data.qr_text,
    qr_image: data.qr_image,
    urls: data.urls || [],
  };
}

async function checkPayment(invoiceId) {
  const token = await getToken();

  const res = await fetch(`${QPAY_BASE}/payment/check`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ object_type: 'INVOICE', object_id: invoiceId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay checkPayment failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const paid = data.count > 0;
  return {
    paid,
    paidAmount: data.paid_amount || 0,
    rows: data.rows || [],
  };
}

module.exports = { getToken, createInvoice, checkPayment };

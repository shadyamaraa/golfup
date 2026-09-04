// All calls go through our Firebase Function proxy (/api/mtbogd/*).
// The MTBogd external API key lives server-side in Functions config.

const BASE = '/api/mtbogd';

async function checkOk(r) {
  if (r.ok) return r.json();
  let msg = `${r.status}`;
  try {
    const body = await r.json();
    msg = body?.error?.message || body?.message || msg;
  } catch (_) {}
  const err = new Error(msg);
  err.status = r.status; // the booking log records the HTTP status alongside the message
  throw err;
}

export async function getPublicSettings() {
  return checkOk(await fetch('https://asia-east2-mt-b-993b7.cloudfunctions.net/api/settings/public'));
}

export async function getTeeTimes(date, players, holes) {
  return checkOk(await fetch(`${BASE}/tee-times?date=${date}&players=${players}&holes=${holes}`));
}

export async function createHold(slotId, players, holes, cartCount = 0) {
  return checkOk(await fetch(`${BASE}/booking-holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId, players, holes, cartCount }),
  }));
}

export async function confirmBooking(holdId, customer, players, notes = '') {
  return checkOk(await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdId, customer, players, notes }),
  }));
}

// QPay invoice for a confirmed booking (MTBogd owns the QPay merchant + lifecycle).
export async function createQpayInvoice(bookingId) {
  return checkOk(await fetch(`${BASE}/bookings/${bookingId}/qpay-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
}

// Payment status polling fallback (webhook is the primary signal).
export async function getQpayStatus(bookingId) {
  return checkOk(await fetch(`${BASE}/bookings/${bookingId}/qpay-status`));
}

// MTBogd's own record of a booking, by bookingId or by the member-facing
// bookingCode (the response says which matched). 404 → error with status 404.
export async function getBooking(idOrCode) {
  const data = await checkOk(await fetch(`${BASE}/bookings/${encodeURIComponent(String(idOrCode).trim())}`));
  // MTBogd wraps the record ({ booking, matchedBy }); tolerate a flat one too.
  return data && data.booking && typeof data.booking === 'object'
    ? { ...data.booking, matchedBy: data.matchedBy ?? null }
    : data;
}

// gameId (Firebase) is sent; server looks up bookingId from RTDB.
export async function updateBookingPlayers(gameId, players) {
  return checkOk(await fetch('/api/sync-players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, players }),
  }));
}

export async function cancelBooking(gameId) {
  return checkOk(await fetch('/api/cancel-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId }),
  }));
}

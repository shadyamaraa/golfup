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
  throw new Error(msg);
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

export async function updateBookingPlayers(bookingId, players) {
  return checkOk(await fetch(`${BASE}/bookings/${bookingId}/players`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players }),
  }));
}

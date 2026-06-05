import { MTBOGD_CONFIG } from './config.js';

const BASE = MTBOGD_CONFIG.apiUrl;

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
  return checkOk(await fetch(`${BASE}/settings/public`));
}

export async function getTeeTimes(date, players, holes) {
  return checkOk(await fetch(`${BASE}/v1/tee-times?date=${date}&players=${players}&holes=${holes}`));
}

export async function createHold(slotId, players, holes, cartCount = 0) {
  return checkOk(await fetch(`${BASE}/v1/booking-holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId, players, holes, cartCount }),
  }));
}

export async function confirmBooking(holdId, customer, players, notes = '') {
  return checkOk(await fetch(`${BASE}/v1/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdId, customer, players, notes }),
  }));
}

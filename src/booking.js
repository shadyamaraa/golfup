import { MTBOGD_CONFIG } from './config.js';

const BASE = MTBOGD_CONFIG.apiUrl;

export async function getPublicSettings() {
  const r = await fetch(`${BASE}/settings/public`);
  if (!r.ok) throw new Error(`Settings fetch failed: ${r.status}`);
  return r.json();
}

export async function getTeeTimes(date, players, holes) {
  const r = await fetch(`${BASE}/v1/tee-times?date=${date}&players=${players}&holes=${holes}`);
  if (!r.ok) throw new Error(`Tee times fetch failed: ${r.status}`);
  return r.json();
}

export async function createHold(slotId, players, holes, cartCount = 0) {
  const r = await fetch(`${BASE}/v1/booking-holds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId, players, holes, cartCount }),
  });
  if (!r.ok) throw new Error(`Hold creation failed: ${r.status}`);
  return r.json();
}

export async function confirmBooking(holdId, customer, players, notes = '') {
  const r = await fetch(`${BASE}/v1/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdId, customer, players, notes }),
  });
  if (!r.ok) throw new Error(`Booking confirmation failed: ${r.status}`);
  return r.json();
}

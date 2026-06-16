// All calls go through our Firebase Function proxy (/api/acuity/*).
// The Acuity User ID + API Key live server-side in Secret Manager;
// the browser never sees them. Auth is HTTP Basic, handled by the proxy.

const BASE = '/api/acuity';

async function checkOk(r) {
  if (r.ok) return r.json();
  let msg = `${r.status}`;
  try {
    const body = await r.json();
    // Acuity puts the human-readable text in `message`; `error` is a short code.
    msg = body?.message || body?.error || msg;
  } catch (_) {}
  throw new Error(msg);
}

// Account info for the authenticated user — handy as a connectivity test.
export async function getMe() {
  return checkOk(await fetch(`${BASE}/me`));
}

// Bookable services (each has an id, name, duration, price).
export async function getAppointmentTypes() {
  return checkOk(await fetch(`${BASE}/appointment-types`));
}

// Days with open slots in a given month (YYYY-MM) for an appointment type.
export async function getAvailabilityDates(month, appointmentTypeID, calendarID) {
  const qs = new URLSearchParams({ month, appointmentTypeID });
  if (calendarID) qs.set('calendarID', calendarID);
  return checkOk(await fetch(`${BASE}/availability/dates?${qs.toString()}`));
}

// Open time slots on a given day (YYYY-MM-DD) for an appointment type.
export async function getAvailabilityTimes(date, appointmentTypeID, calendarID) {
  const qs = new URLSearchParams({ date, appointmentTypeID });
  if (calendarID) qs.set('calendarID', calendarID);
  return checkOk(await fetch(`${BASE}/availability/times?${qs.toString()}`));
}

// Appointments currently scheduled for the authenticated user.
export async function listAppointments() {
  return checkOk(await fetch(`${BASE}/appointments`));
}

// Create a real appointment. Not used by the PoC connectivity test —
// kept here for the upcoming in-app booking flow.
// payload: { datetime, appointmentTypeID, firstName, lastName, email, phone, fields }
export async function createAppointment(payload) {
  return checkOk(await fetch(`${BASE}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
}

// src/weather.js
// Weather forecast via Open-Meteo (https://open-meteo.com) — no API key,
// no signup, CORS-open, free for non-commercial use. Players never see a
// permission prompt or an error: every failure path resolves to `null` so
// callers simply hide the weather UI.
//
// Caching: one fetch per course per hour, shared through localStorage +
// an in-memory map. When the network fails, cached data up to 6 hours old
// is served silently.

// Course coordinates. Approximate for now — refine with exact Google Maps
// values when available (a few km of drift barely changes the forecast).
const UB_FALLBACK = { lat: 47.9188, lon: 106.9176 }; // Ulaanbaatar centre
export const COURSE_GEO = {
  'Sky Resort Golf Club': { lat: 47.8674, lon: 107.0075 },
  'Chinggis Khaan Golf Course': { lat: 47.8, lon: 107.2 },
};

// Open-Meteo serves hourly + daily data up to 16 days out; games further
// away show no weather at all rather than an unreliable guess.
export const FORECAST_DAYS = 16;

const TTL_MS = 60 * 60 * 1000; // fresh for 1 hour
const STALE_MS = 6 * 60 * 60 * 1000; // still usable while offline
const FETCH_TIMEOUT_MS = 6000;
const memCache = {};

export function geoForLocation(location) {
  return COURSE_GEO[location] || UB_FALLBACK;
}

// Resolve the current date (YYYY-MM-DD) and hour (HH) in Ulaanbaatar time,
// matching the timestamps the API returns with timezone=Asia/Ulaanbaatar.
export function ubNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
}

export async function getForecast(location) {
  const { lat, lon } = geoForLocation(location);
  const key = `golfup_wx_${lat}_${lon}`;
  const now = Date.now();

  const mem = memCache[key];
  if (mem && now - mem.at < TTL_MS) return mem.data;

  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { /* ignore */ }
  if (stored && stored.data && now - stored.at < TTL_MS) {
    memCache[key] = stored;
    return stored.data;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      + `&timezone=Asia%2FUlaanbaatar&forecast_days=${FORECAST_DAYS}`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('weather http ' + res.status);
    const data = await res.json();
    const entry = { at: now, data };
    memCache[key] = entry;
    try { localStorage.setItem(key, JSON.stringify(entry)); } catch (_) { /* quota — memory cache still works */ }
    return data;
  } catch (_) {
    if (stored && stored.data && now - stored.at < STALE_MS) {
      memCache[key] = stored;
      return stored.data;
    }
    return null;
  }
}

// Hourly snapshot for a game's date + tee time. Wind arrives as km/h and is
// converted to m/s (the unit Mongolian forecasts use).
export function pickHour(data, dateStr, timeStr) {
  const h = data?.hourly;
  if (!h?.time || !dateStr) return null;
  const hh = String(parseInt((timeStr || '12:00').split(':')[0], 10) || 0).padStart(2, '0');
  const idx = h.time.indexOf(`${dateStr}T${hh}:00`);
  if (idx < 0) return null;
  return {
    temp: Math.round(h.temperature_2m?.[idx] ?? 0),
    feels: Math.round(h.apparent_temperature?.[idx] ?? h.temperature_2m?.[idx] ?? 0),
    rainPct: h.precipitation_probability?.[idx] ?? null,
    windMs: Math.round((h.wind_speed_10m?.[idx] ?? 0) / 3.6),
    code: h.weather_code?.[idx] ?? 0,
  };
}

export function pickDay(data, dateStr) {
  const d = data?.daily;
  if (!d?.time || !dateStr) return null;
  const idx = d.time.indexOf(dateStr);
  if (idx < 0) return null;
  return {
    max: Math.round(d.temperature_2m_max?.[idx] ?? 0),
    min: Math.round(d.temperature_2m_min?.[idx] ?? 0),
    rainPct: d.precipitation_probability_max?.[idx] ?? null,
    code: d.weather_code?.[idx] ?? 0,
  };
}

// WMO weather code → icon name (src/icons.js) + i18n label key.
export function wmoInfo(code) {
  if (code === 0) return { icon: 'wx-sun', key: 'wxClear' };
  if (code === 1) return { icon: 'wx-cloud-sun', key: 'wxMostlyClear' };
  if (code === 2) return { icon: 'wx-cloud-sun', key: 'wxPartlyCloudy' };
  if (code === 3) return { icon: 'wx-cloud', key: 'wxCloudy' };
  if (code === 45 || code === 48) return { icon: 'wx-fog', key: 'wxFog' };
  if (code >= 51 && code <= 55) return { icon: 'wx-rain', key: 'wxDrizzle' };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { icon: 'wx-rain', key: 'wxFreezingRain' };
  if (code === 61 || code === 63) return { icon: 'wx-rain', key: 'wxRain' };
  if (code === 65) return { icon: 'wx-rain', key: 'wxHeavyRain' };
  if (code >= 71 && code <= 77) return { icon: 'wx-snow', key: 'wxSnow' };
  if (code >= 80 && code <= 82) return { icon: 'wx-rain', key: 'wxShowers' };
  if (code === 85 || code === 86) return { icon: 'wx-snow', key: 'wxSnowShowers' };
  if (code >= 95) return { icon: 'wx-thunder', key: 'wxThunder' };
  return { icon: 'wx-cloud', key: 'wxCloudy' };
}

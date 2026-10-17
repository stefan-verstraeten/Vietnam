// The weather for a day page, from Open-Meteo (free, no key): the forecast up to
// 16 days ahead, and for days further away the weather on the same date last
// year, as an impression of what to expect. Results are kept on the phone so the
// last forecast still shows offline.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max';
const PAST = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';
export const HORIZON_DAYS = 15;
const DAY_MS = 86400000;

const CODES = [
  [[0], '☀️', 'Zonnig'], [[1], '🌤️', 'Overwegend zonnig'], [[2], '⛅', 'Half bewolkt'], [[3], '☁️', 'Bewolkt'],
  [[45, 48], '🌫️', 'Mist'], [[51, 53, 55, 56, 57], '🌦️', 'Motregen'], [[61, 66], '🌧️', 'Lichte regen'],
  [[63], '🌧️', 'Regen'], [[65, 67], '🌧️', 'Zware regen'], [[71, 73, 75, 77, 85, 86], '❄️', 'Sneeuw'],
  [[80], '🌦️', 'Enkele buien'], [[81], '🌦️', 'Buien'], [[82], '⛈️', 'Zware buien'], [[95, 96, 99], '⛈️', 'Onweer'],
];
export const describe = (code) => { const c = CODES.find(([list]) => list.includes(code)); return c ? { icon: c[1], text: c[2] } : { icon: '🌡️', text: '' }; };

const daysAhead = (iso) => Math.round((new Date(`${iso}T12:00:00`) - new Date(new Date().toDateString())) / DAY_MS);
const lastYear = (iso) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

async function get(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  if (!d.daily?.time?.length) throw new Error('geen gegevens');
  const v = (k) => d.daily[k]?.[0] ?? null;
  return { code: v('weather_code'), max: v('temperature_2m_max'), min: v('temperature_2m_min'), rain: v('precipitation_sum'),
    rainChance: v('precipitation_probability_max'), wind: v('wind_speed_10m_max'), uv: v('uv_index_max') };
}

// kind: 'forecast' (this date), 'past' (this date, measured) or 'lastyear' (same date a year earlier).
export async function spotWeather({ lat, lon }, iso, store) {
  const ahead = daysAhead(iso);
  const kind = ahead > HORIZON_DAYS ? 'lastyear' : ahead < -60 ? 'past' : 'forecast';
  const key = `weather:${kind}:${lat},${lon}:${iso}`;
  const cached = store.get(key);
  // Last year's numbers and measured days never change; a forecast is refreshed after an hour.
  if (cached && (kind !== 'forecast' || Date.now() - cached.at < 3600000)) return cached;
  const day = kind === 'lastyear' ? lastYear(iso) : iso;
  const q = `latitude=${lat}&longitude=${lon}&timezone=auto&start_date=${day}&end_date=${day}`;
  try {
    const w = await get(kind === 'forecast' ? `${FORECAST}?${q}&daily=${DAILY}` : `${ARCHIVE}?${q}&daily=${PAST}`);
    const out = { ...w, kind, day, at: Date.now() };
    store.set(key, out);
    return out;
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw e;
  }
}

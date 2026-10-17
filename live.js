// Live information fetched on demand: local news around the phone's position,
// Vietnamese history on today's date, and flight status. All of these need
// internet; callers show fallback links when a service can't be reached.

const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SL = /Vietnam|Viet Nam|Vietnamese|Annam|Tonkin|Cochinchina|Indochina|Saigon|Ho Chi Minh|Hanoi|Hue|Da Nang|Hoi An|Haiphong|Dien Bien Phu|Mekong|Nguyen dynasty|Viet Minh|Viet Cong|Vo Nguyen Giap|Ngo Dinh Diem|Tet Offensive/i;

async function getJSON(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout || 15000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error(text.slice(0, 120)); }
  } finally {
    clearTimeout(timer);
  }
}

// Town or district name for a position (OpenStreetMap Nominatim).
export async function placeName(lat, lon) {
  const d = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=en&lat=${lat}&lon=${lon}`);
  const a = d.address || {};
  return {
    town: a.city || a.town || a.village || a.suburb || a.municipality || a.county || '',
    district: (a.state_district || a.county || '').replace(/ District$/, ''),
    province: a.state || '',
  };
}

const gdelt = (query, days) => getJSON(
  `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=20&sort=datedesc&timespan=${days}d`,
);

function articles(d) {
  const seen = new Set();
  return (d?.articles || []).filter((a) => {
    const k = a.title?.toLowerCase().slice(0, 60);
    if (!a.title || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((a) => ({
    title: a.title,
    url: a.url,
    source: a.domain,
    date: a.seendate ? new Date(a.seendate.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z')) : null,
    lang: a.language,
  }));
}

// News from Vietnamese sources mentioning the town (or district), else national news.
export async function localNews({ town, district }) {
  const names = [...new Set([town, district].filter(Boolean))];
  if (names.length) {
    const q = names.length > 1 ? `(${names.map((n) => `"${n}"`).join(' OR ')})` : `"${names[0]}"`;
    const local = articles(await gdelt(`${q} sourcecountry:vietnam`, 14));
    if (local.length) return { scope: names.join(' / '), items: local };
    await new Promise((r) => setTimeout(r, 5500)); // GDELT allows one request per 5 seconds
  }
  return { scope: 'Vietnam', items: articles(await gdelt('sourcecountry:vietnam sourcelang:english', 2)) };
}

// Wikipedia's anniversaries for a date, split into Vietnamese ones and the rest.
export async function onThisDay(month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`, {
    headers: { 'Api-User-Agent': 'VietnamTravelCompanion/1.0 (personal trip app)' },
  });
  // The feed repeats events across its lists (and sometimes in other words):
  // treat entries from the same year about the same article, or with mostly
  // the same words, as one.
  const words = (t) => new Set(fold(t).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };
  const all = [];
  for (const kind of ['selected', 'events', 'births', 'deaths', 'holidays']) {
    for (const e of d[kind] || []) {
      const page = e.pages?.[0];
      const title = page?.titles?.normalized || page?.title?.replace(/_/g, ' ') || '';
      const w = words(e.text);
      if (all.some((x) => x.year === e.year && ((title && x.page === title) || overlap(x.w, w) > 0.6))) continue;
      const extract = page?.extract || '';
      all.push({
        kind,
        year: e.year,
        text: e.text,
        w,
        url: page?.content_urls?.mobile?.page,
        page: title,
        extract: extract && overlap(words(extract.split(/(?<=\.)\s/)[0]), w) < 0.5 ? extract : '',
        sl: SL.test(e.text) || (e.pages || []).some((p) => SL.test(`${p.title} ${p.description || ''}`)),
      });
    }
  }
  const byYear = (a, b) => (a.year ?? 9999) - (b.year ?? 9999);
  return {
    sl: all.filter((x) => x.sl).sort(byYear),
    world: all.filter((x) => !x.sl && (x.kind === 'selected' || x.kind === 'events')).sort(byYear),
  };
}

// Flight status with gate and terminal via AeroDataBox (needs a RapidAPI key).
export async function flightStatus(no, date, key) {
  const d = await getJSON(`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(no.replace(/\s+/g, ''))}/${date}?withAircraftImage=false&withLocation=false`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
  });
  const f = Array.isArray(d) ? d[0] : d;
  if (!f) throw new Error('Geen gegevens voor deze vlucht.');
  const leg = (x) => ({
    airport: x?.airport?.iata || x?.airport?.name || '',
    terminal: x?.terminal || '',
    gate: x?.gate || '',
    checkIn: x?.checkInDesk || '',
    baggage: x?.baggageBelt || '',
    scheduled: x?.scheduledTime?.local || x?.scheduledTimeLocal || '',
    revised: x?.revisedTime?.local || x?.actualTime?.local || x?.predictedTime?.local || '',
  });
  return { status: f.status || '', dep: leg(f.departure), arr: leg(f.arrival) };
}

// Public pages with live departure information (gate, terminal, delays).
export function flightLinks(no) {
  const n = no.replace(/\s+/g, '').toUpperCase();
  const icao = n.replace(/^TK/, 'THY');
  return [
    ['FlightAware', `https://www.flightaware.com/live/flight/${icao}`],
    ['Flightradar24', `https://www.flightradar24.com/data/flights/${n.toLowerCase()}`],
    ['Turkish Airlines', 'https://www.turkishairlines.com/en-int/flight-status/'],
  ];
}

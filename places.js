// Gazetteer used by the literary companion: passages are tagged with these ids,
// and "In de buurt" matches the phone's position against these coordinates.

export const PLACES = [
];

const byId = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id) => byId.get(id);

export const fold = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();

export function findPlaces(query) {
  const q = fold(query);
  if (!q) return [];
  return PLACES.filter((p) => [p.name, p.id, ...(p.aliases || [])].some((n) => {
    const f = fold(n);
    return f === q || f.includes(q) || (q.length > 3 && q.includes(f));
  }));
}

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function nearestPlaces(lat, lon, count = 4) {
  return PLACES.map((p) => ({ ...p, km: km(lat, lon, p.lat, p.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}

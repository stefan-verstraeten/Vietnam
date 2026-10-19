// Trip map: every route place as a marker and each day's leg as a line.
// Leaflet is vendored (vendor/) and loaded on first use; map tiles come from
// OpenStreetMap and are cached by the service worker once seen.

import { PLACES, placeById } from './places.js';

let leaflet = null;
let map = null;

function loadLeaflet() {
  if (!leaflet) {
    leaflet = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'vendor/leaflet.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = 'vendor/leaflet.js';
      s.onload = () => resolve(window.L);
      s.onerror = () => { leaflet = null; reject(new Error('De kaart kon niet geladen worden.')); };
      document.head.append(s);
    });
  }
  return leaflet;
}

// A day's route is a list of place ids; a leading "~" means that leg goes by
// train, boat or plane (drawn dashed).
export function legs(day) {
  const out = [];
  const stops = (day.route || []).map((s) => ({ id: s.replace(/^~/, ''), dashed: s.startsWith('~') }));
  for (let i = 1; i < stops.length; i++) {
    const a = placeById(stops[i - 1].id);
    const b = placeById(stops[i].id);
    if (a && b && a !== b) out.push({ from: a, to: b, dashed: stops[i].dashed });
  }
  return out;
}

export const routeIds = (day) => (day.route || []).map((s) => s.replace(/^~/, ''));

// Where we sleep (last stop of a day with a stay, not the night train):
// these places get a permanent label.
const overnight = (days) => new Set(days.filter((d) => d.stay && !/trein/i.test(d.stay.name)).map((d) => routeIds(d).at(-1)).filter(Boolean));

export async function drawMap(el, { days, popup, onRead, focus }) {
  if (map) { map.remove(); map = null; }
  const L = await loadLeaflet();
  if (!el.isConnected) return null;
  const css = getComputedStyle(document.documentElement);
  const brand = css.getPropertyValue('--brand').trim() || '#aa0924';
  const accent = css.getPropertyValue('--accent').trim() || '#d9822b';

  map = L.map(el, { zoomSnap: 0.5 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, crossOrigin: true,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // Leaflet needs a view before vector layers can be added.
  const used = new Set(days.flatMap((d) => [...routeIds(d), ...(d.places || [])]));
  const all = L.latLngBounds(PLACES.filter((x) => used.has(x.id)).map((p) => [p.lat, p.lon]));
  const fit = (b) => map.fitBounds(b, { padding: [28, 28], maxZoom: 11 });
  fit(all);

  const lines = new Map();
  for (const day of days) {
    const group = L.layerGroup();
    for (const leg of legs(day)) {
      L.polyline([[leg.from.lat, leg.from.lon], [leg.to.lat, leg.to.lon]], {
        color: brand, weight: 4, opacity: 0.85, dashArray: leg.dashed ? '2 9' : null, lineCap: 'round',
      }).addTo(group);
    }
    group.addTo(map);
    lines.set(day.iso, group);
  }

  const stays = overnight(days);
  const markers = new Map();
  for (const p of PLACES.filter((x) => used.has(x.id))) {
    const big = stays.has(p.id);
    const m = L.circleMarker([p.lat, p.lon], {
      radius: big ? 8 : 5, color: '#fff', weight: 2, fillColor: big ? brand : accent, fillOpacity: 1,
    }).addTo(map).bindPopup(() => popup(p), { maxWidth: 260 });
    if (big) m.bindTooltip(p.name, { permanent: true, direction: 'right', offset: [8, 0], className: 'map-label' });
    markers.set(p.id, m);
  }

  // Leaflet stops clicks inside popups from bubbling, so wire their buttons here.
  map.on('popupopen', (e) => {
    e.popup.getElement()?.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', () => onRead(b.dataset.read)));
  });

  let me = null;
  const api = {
    showAll: () => { highlight(null); fit(all); },
    showDay(iso) {
      const day = days.find((d) => d.iso === iso);
      const pts = day ? [...new Set([...routeIds(day), ...(day.places || [])])].map(placeById).filter(Boolean) : [];
      if (!pts.length) return;
      highlight(iso);
      if (pts.length === 1) map.setView([pts[0].lat, pts[0].lon], 10);
      else fit(L.latLngBounds(pts.map((p) => [p.lat, p.lon])));
      if (pts.length === 1) markers.get(pts[0].id)?.openPopup();
    },
    showMe(lat, lon) {
      if (me) me.remove();
      me = L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map).bindTooltip('Jij');
      map.setView([lat, lon], Math.max(map.getZoom(), 10));
    },
  };

  function highlight(iso) {
    for (const [k, g] of lines) {
      g.eachLayer((l) => l.setStyle({ weight: k === iso ? 7 : 4, opacity: !iso || k === iso ? 0.85 : 0.35 }));
    }
  }

  if (focus) api.showDay(focus);
  return api;
}

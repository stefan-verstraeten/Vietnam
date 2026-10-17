import { decryptJSON, importContentKey, decryptBytes } from './crypto.js';
import { placeById, findPlaces, nearestPlaces, fold } from './places.js';
import { createNotes } from './notes.js';
import { media, preparePhoto } from './media.js';
import { canRecord, makeReel, makeCard } from './reel.js';
import { placeName, localNews, onThisDay, flightStatus, flightLinks } from './live.js';

const $ = (sel, el = document) => el.querySelector(sel);

// Icons in the app color (white on a colored button). The lotus, Vietnam's
// national flower, marks every action; the rest keep a meaning of their own.
const ICONS = {
  lotus: '<g fill="currentColor"><path transform="rotate(-62 12 16)" d="M12 3.2C14.1 6.6 14.3 10.9 12 15.6 9.7 10.9 9.9 6.6 12 3.2z"/><path transform="rotate(-31 12 16)" d="M12 3.2C14.1 6.6 14.3 10.9 12 15.6 9.7 10.9 9.9 6.6 12 3.2z"/><path transform="rotate(0 12 16)" d="M12 3.2C14.1 6.6 14.3 10.9 12 15.6 9.7 10.9 9.9 6.6 12 3.2z"/><path transform="rotate(31 12 16)" d="M12 3.2C14.1 6.6 14.3 10.9 12 15.6 9.7 10.9 9.9 6.6 12 3.2z"/><path transform="rotate(62 12 16)" d="M12 3.2C14.1 6.6 14.3 10.9 12 15.6 9.7 10.9 9.9 6.6 12 3.2z"/><path d="M3 17.6c3 2.6 15 2.6 18 0-1.2 3.4-16.8 3.4-18 0z"/></g>',
  pin: '<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z"/>',
  phone: '<path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/>',
  mail: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="m3.6 6.4 8.4 6.4 8.4-6.4"/></g>',
  lock: '<rect fill="currentColor" x="5" y="10.5" width="14" height="10.5" rx="2"/><path fill="none" stroke="currentColor" stroke-width="2.2" d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect fill="currentColor" x="5" y="10.5" width="14" height="10.5" rx="2"/><path fill="none" stroke="currentColor" stroke-width="2.2" d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
  plane: '<path fill="currentColor" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
};
const ic = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// localStorage can throw (private mode) or be wiped; the app must work without it.
// Keys are prefixed: other trip apps may be served from the same origin and share it.
const NS = 'vietnam:';
const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(NS + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(NS + k); } catch { /* ignore */ } },
};

let DATA = null;
let KEY = null;
let NOTES = null;
const reading = { query: '', mode: 'start', near: null, message: '' };
const noteFilter = { who: 'all' };
let editingNote = null;

/* ---------- dates ---------- */

const DAY_MS = 86400000;
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoOf(new Date());
const fmt = (d, opts) => d.toLocaleDateString('nl-BE', opts);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

function tripDays() {
  const byDate = new Map((DATA.days || []).map((d) => [d.date, d]));
  const out = [];
  for (let d = parseDate(DATA.trip.start), n = 1; d <= parseDate(DATA.trip.end); d = new Date(d.getTime() + DAY_MS), n++) {
    const iso = isoOf(d);
    out.push({ n, iso, d, ...(byDate.get(iso) || { title: 'Programma volgt', items: [] }) });
  }
  return out;
}

function tripStatus() {
  const start = parseDate(DATA.trip.start);
  const end = parseDate(DATA.trip.end);
  const now = parseDate(todayIso());
  const total = Math.round((end - start) / DAY_MS) + 1;
  if (now < start) {
    const n = Math.round((start - now) / DAY_MS);
    return n === 1 ? 'Morgen vertrekken jullie!' : `Nog ${n} dagen tot vertrek`;
  }
  if (now > end) return 'Welkom thuis';
  return `Dag ${Math.round((now - start) / DAY_MS) + 1} van ${total}`;
}

// The day to feature: today during the trip, otherwise the first day.
function featuredDay() {
  const days = tripDays();
  return days.find((d) => d.iso === todayIso()) || (todayIso() > days[days.length - 1].iso ? days[days.length - 1] : days[0]);
}

const dayImages = (day) => [...(day.items || []).map((i) => i.img), day.stay?.img, day.heroImg].filter(Boolean);

/* ---------- small helpers ---------- */

const telHref = (p) => `tel:${p.replace(/[^+\d]/g, '')}`;
const mapsQuery = (q) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
const mapsAt = (lat, lon, label) => `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(label || 'Hier')}`;
const googleQuery = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const paras = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Gekopieerd'); } catch { toast(text); }
}

function getPosition(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Locatie wordt niet ondersteund'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => reject(new Error(e.code === 1 ? 'Geen toestemming voor je locatie. Zet ze aan via Instellingen › Privacy › Locatievoorzieningen.' : 'Je locatie kon niet bepaald worden.')),
      { enableHighAccuracy: false, timeout, maximumAge: 300000 },
    );
  });
}

/* ---------- encrypted photos ---------- */

const imgUrls = new Map();

function imageUrl(name) {
  const meta = DATA.images?.[name];
  if (!meta) return Promise.resolve(null);
  if (!imgUrls.has(name)) {
    imgUrls.set(name, fetch(`data/img/${meta.id}.bin`)
      .then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
      .then((buf) => decryptBytes(KEY, buf))
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type: meta.type })))
      .catch(() => { imgUrls.delete(name); return null; }));
  }
  return imgUrls.get(name);
}

const photo = (name, cls = 'photo') => (name && DATA.images?.[name] ? `<div class="${cls}"><img data-img="${esc(name)}" alt=""></div>` : '');

function hydrateImages(root = document) {
  root.querySelectorAll('img[data-img]:not([src])').forEach(async (el) => {
    const url = await imageUrl(el.dataset.img);
    if (url) { el.src = url; el.closest('.photo, .thumb, .hero')?.classList.add('loaded'); }
  });
}

// Fetch every photo once so the whole trip works offline (the service worker keeps them).
async function prefetchImages() {
  for (const { id } of Object.values(DATA.images || {})) {
    try { await fetch(`data/img/${id}.bin`); } catch { return; }
  }
}

/* ---------- views ---------- */

function viewStart() {
  const day = featuredDay();
  const me = store.get('me');
  const people = DATA.trip.people || [];
  const st = NOTES.status();
  const isToday = day.iso === todayIso();
  const tiles = [
    ['#/reis', 'Reisplan', `Alle ${tripDays().length} dagen`],
    ['#/notities', 'Notities', `${textNotes().length} ${textNotes().length === 1 ? 'notitie' : 'notities'} · ${allPhotos().length} foto’s`],
    ['#/lezen', 'Lezen', 'Teksten per plaats'],
    ['#/boekingen', 'Boekingen', 'Vluchten, hotels, verzekering'],
    ['#/nood', 'Nood', 'Hulpdiensten en ambassade'],
  ];
  return `
    <section class="start">
      <div class="start-hero">
        <div class="start-title">
          <h1>Vietnam</h1>
          <p>${esc(tripStatus())}</p>
        </div>
      </div>
      ${!me ? `
        <div class="card who">
          <h3>Wie gebruikt deze telefoon?</h3>
          <p class="note">Zo weet de app wie een notitie schreef.</p>
          <div class="btn-row">${people.map((p) => `<button class="btn primary" data-me="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        </div>` : ''}
      <a class="card today-card" href="#/dag/${day.iso}">
        <div class="eyebrow">${isToday ? 'Vandaag' : todayIso() < day.iso ? 'Eerste dag' : 'Laatste dag'} · dag ${day.n}</div>
        <h3>${esc(day.title)}</h3>
        <p class="note">${esc(fmt(day.d, { weekday: 'long', day: 'numeric', month: 'long' }))}${day.stay ? ` · ${esc(day.stay.name)}` : ''}</p>
      </a>
      ${clocksHtml()}
      <nav class="tiles">
        ${tiles.map(([href, t, s]) => `<a class="tile" href="${href}"><b>${t}</b><small>${esc(s)}</small></a>`).join('')}
      </nav>
      <p class="foot-note">${me ? `Je bent <b>${esc(me)}</b> · <button class="link" data-me="">wijzig</button><br>` : ''}${esc(st.text)}<br>Versie ${APP_VERSION} · <button class="link" data-refresh>App vernieuwen</button></p>
    </section>`;
}

// Two analog clocks: local time in Vietnam and at home in Belgium.
const CLOCKS = [['Asia/Ho_Chi_Minh', 'Vietnam'], ['Europe/Brussels', 'België']];

function clocksHtml() {
  const ticks = Array.from({ length: 12 }, (_, i) => `<line class="tick${i % 3 ? '' : ' major'}" x1="50" y1="${i % 3 ? 8 : 6}" x2="50" y2="13" transform="rotate(${i * 30} 50 50)"/>`).join('');
  return `<div class="clocks">${CLOCKS.map(([tz, label]) => `
    <figure class="clock" data-tz="${tz}">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="face" cx="50" cy="50" r="46"/>${ticks}
        <line class="hand h" x1="50" y1="54" x2="50" y2="28"/>
        <line class="hand m" x1="50" y1="56" x2="50" y2="16"/>
        <line class="hand s" x1="50" y1="58" x2="50" y2="12"/>
        <circle class="pin" cx="50" cy="50" r="2.6"/>
      </svg>
      <figcaption><b>${label}</b><span class="clock-time"></span></figcaption>
    </figure>`).join('')}</div>`;
}

function zoned(tz, now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { h: +p.hour, m: +p.minute, s: +p.second, wd: p.weekday };
}

function tickClocks() {
  const els = document.querySelectorAll('.clock');
  if (!els.length) return;
  const now = new Date();
  const days = new Set();
  const all = [...els].map((el) => { const t = zoned(el.dataset.tz, now); days.add(t.wd); return [el, t]; });
  for (const [el, t] of all) {
    const rot = (sel, deg) => el.querySelector(sel).setAttribute('transform', `rotate(${deg} 50 50)`);
    rot('.h', (t.h % 12) * 30 + t.m / 2);
    rot('.m', t.m * 6 + t.s / 10);
    rot('.s', t.s * 6);
    el.classList.toggle('night', t.h < 6 || t.h >= 19);
    el.querySelector('.clock-time').textContent = `${days.size > 1 ? `${t.wd} ` : ''}${t.h}:${String(t.m).padStart(2, '0')}`;
  }
}

function viewReis() {
  const today = todayIso();
  return `<div class="day-list">${tripDays().map((day) => {
    const img = dayImages(day)[0];
    return `
      <a class="day-row${day.iso === today ? ' today' : ''}${day.iso < today ? ' past' : ''}" href="#/dag/${day.iso}" id="d-${day.iso}">
        <div class="thumb">${img && DATA.images?.[img] ? `<img data-img="${esc(img)}" alt="">` : ''}<span class="thumb-date"><b>${day.d.getDate()}</b>${esc(fmt(day.d, { month: 'short' }))}</span></div>
        <div class="day-row-text">
          <small>Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'long' }))}</small>
          <h3>${esc(day.title)}</h3>
          ${day.stay ? `<p>${esc(day.stay.name)}</p>` : ''}
        </div>
      </a>`;
  }).join('')}</div>`;
}

function noteMeta(n) {
  const bits = [esc(n.author || '?'), fmtTime(n.created)];
  if (n.date) {
    const d = parseDate(n.date);
    bits.splice(1, 0, esc(fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })));
  }
  const where = n.place ? (n.lat != null ? `<a href="${mapsAt(n.lat, n.lon, n.place)}">${esc(n.place)}</a>` : esc(n.place)) : '';
  return `${bits.join(' · ')}${where ? ` · ${ic('pin')} ${where}` : ''}${n.private ? ` · ${ic('lock')} privé, niet in de reel` : ''}`;
}

const privateBtn = (n) => `<button class="btn small" data-private="${esc(n.id)}">${n.private ? `${ic('unlock')} Privé uit` : `${ic('lock')} Privé`}</button>`;

function noteCard(n, { actions = true } = {}) {
  const mine = n.author === store.get('me');
  return `
    <article class="card note-card${n.private ? ' private' : ''}" data-note="${esc(n.id)}">
      <div class="note-text">${paras(n.text)}</div>
      <div class="note-meta">${noteMeta(n)}</div>
      ${mine && actions ? `<div class="btn-row"><button class="btn small" data-edit="${esc(n.id)}">Bewerk</button>${privateBtn(n)}<button class="btn small" data-del="${esc(n.id)}">Verwijder</button></div>` : ''}
    </article>`;
}

const textNotes = () => NOTES.list().filter((n) => n.type !== 'photo');
const allPhotos = () => NOTES.list().filter((n) => n.type === 'photo');

// Selecting photos to delete several at once (per day page).
const selecting = { date: null, ids: new Set() };

function photoGrid(list, { selectable = false } = {}) {
  if (!list.length) return '';
  const on = selectable && selecting.date === list[0].date;
  return `<div class="photo-grid${on ? ' selecting' : ''}">${list.map((ph) => `<button class="pthumb${on && selecting.ids.has(ph.id) ? ' picked' : ''}${ph.private ? ' private' : ''}" data-photo="${esc(ph.id)}" aria-label="Foto"><img data-ph="${esc(ph.id)}" alt=""></button>`).join('')}</div>`;
}

function dayNotesHtml(iso) {
  const photos = allPhotos().filter((n) => n.date === iso);
  const notes = textNotes().filter((n) => n.date === iso);
  if (!photos.length && !notes.length) return '<p class="note">Nog geen foto’s of notities voor deze dag.</p>';
  const on = selecting.date === iso;
  const tools = photos.length && store.get('me') ? `
    <div class="photo-tools">
      ${on ? `<span class="note">${selecting.ids.size} geselecteerd</span>
        <button class="btn small" data-select-all="${iso}">Alles</button>
        <button class="btn small danger" data-del-selected="${iso}"${selecting.ids.size ? '' : ' disabled'}>Verwijder</button>
        <button class="btn small" data-select-done>Klaar</button>`
      : `<button class="link" data-select="${iso}">Foto’s selecteren om te verwijderen</button>`}
    </div>` : '';
  return photoGrid(photos, { selectable: true }) + tools + notes.map((n) => noteCard(n)).join('');
}

function refreshDayNotes() {
  const box = $('#day-notes');
  if (box) { box.innerHTML = dayNotesHtml(currentRoute().arg); hydratePhotos(box); }
}

// Photo thumbnails come from the phone (or once from the other phone's upload).
const photoUrls = new Map();
function photoUrl(id) {
  if (!photoUrls.has(id)) {
    photoUrls.set(id, NOTES.photo(id).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  }
  return photoUrls.get(id).then((u) => { if (!u) photoUrls.delete(id); return u; });
}
function hydratePhotos(root = document) {
  root.querySelectorAll('img[data-ph]:not([src])').forEach(async (el) => {
    const url = await photoUrl(el.dataset.ph);
    if (url) el.src = url; else el.closest('.pthumb')?.classList.add('missing');
  });
}

function viewDag(iso) {
  const days = tripDays();
  const i = days.findIndex((d) => d.iso === iso);
  if (i < 0) return viewReis();
  const day = days[i];
  const prev = days[i - 1];
  const next = days[i + 1];
  const hero = dayImages(day)[0];
  const me = store.get('me');
  const editing = editingNote && NOTES.list().find((n) => n.id === editingNote);

  const flights = (day.flights || []).map((f) => `
    <div class="flight">
      <div><b>${esc(f.dep)}</b><small>${esc(f.from)}</small></div>
      <div class="dur">${ic('plane')} ${esc(f.no || '')}<br>${esc(f.dur)}</div>
      <div class="end"><b>${esc(f.arr)}</b><small>${esc(f.to)}</small></div>
    </div>
    ${f.no ? `<div class="flight-live">
      <button class="btn small primary" data-flight="${esc(f.no)}" data-date="${day.iso}">${ic('lotus')} Live: gate &amp; status</button>
      ${f.noUnconfirmed ? '<span class="note">Vluchtnummer nog niet bevestigd: controleer op je e-ticket.</span>' : ''}
    </div>` : ''}`).join('');

  const items = (day.items || []).map((it, k) => `
    <section class="block">
      ${it.img && !(k === 0 && it.img === hero) ? photo(it.img) : ''}
      <h3>${it.time ? `<span class="time">${esc(it.time)}</span>` : ''}${esc(it.title)}</h3>
      <div class="prose">${paras(it.text)}</div>
    </section>`).join('');

  const stay = day.stay ? `
    <section class="block stay">
      ${day.stay.img && day.stay.img !== hero ? photo(day.stay.img) : ''}
      <div class="eyebrow">Overnachting · ${day.stay.nights} ${day.stay.nights === 1 ? 'nacht' : 'nachten'}</div>
      <h3>${esc(day.stay.name)}</h3>
      <p class="note">${esc(day.stay.area)}${day.stay.room ? ` · kamer: ${esc(day.stay.room)}` : ''}</p>
      <div class="prose">${paras(day.stay.info)}</div>
      <div class="btn-row">
        <a class="btn small" href="${mapsQuery(`${day.stay.name}, ${day.stay.area}, Vietnam`)}">Apple Kaarten</a>
        <a class="btn small" href="${googleQuery(`${day.stay.name} ${day.stay.area} Vietnam`)}">Google Maps</a>
      </div>
    </section>` : '';

  const reads = (day.places || []).map(placeById).filter(Boolean)
    .map((p) => `<button class="chip" data-read="${esc(p.name)}">${ic('lotus')} ${esc(p.name)}</button>`).join(' ');

  return `
    <article class="day-page">
      ${hero ? `<div class="hero"><img data-img="${esc(hero)}" alt="">${day.heroCredit && hero === day.heroImg ? `<small class="credit">${esc(day.heroCredit)}</small>` : ''}</div>` : ''}
      <header class="day-title">
        <div class="eyebrow">Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <h2>${esc(day.title)}</h2>
      </header>
      ${flights}${items}${stay}
      ${reads ? `<section class="block"><div class="eyebrow">Lezen over</div><div class="btn-row">${reads}</div></section>` : ''}
      <section class="block">${clocksHtml()}</section>
      <section class="block">
        <div class="eyebrow">Ter plaatse</div>
        <div class="btn-row">
          <button class="btn" data-live-news="${day.iso}">${ic('lotus')} Lokaal nieuws</button>
          <button class="btn" data-live-history="${day.iso}">${ic('lotus')} Op deze dag</button>
        </div>
      </section>
      <section class="block notes-block">
        <h3>Foto’s & notities</h3>
        <div id="day-notes">${dayNotesHtml(day.iso)}</div>
        ${me ? `
          <div class="btn-row">
            <label class="btn">${ic('lotus')} Foto’s toevoegen<input type="file" id="photo-input" data-date="${day.iso}" accept="image/*" multiple hidden></label>
            <button class="btn" id="make-reel" data-date="${day.iso}">${ic('lotus')} Dagreel</button>
          </div>` : ''}
        ${me ? `
          <form id="note-form" data-date="${day.iso}">
            <textarea id="note-text" rows="4" placeholder="Wat wil je onthouden van vandaag?">${editing ? esc(editing.text) : ''}</textarea>
            <div class="btn-row">
              <button class="btn primary" type="submit">${editing ? 'Wijziging bewaren' : 'Bewaar notitie'}</button>
              ${editing ? '<button class="btn" type="button" id="note-cancel">Annuleer</button>' : ''}
            </div>
            <p class="note">Notitie van ${esc(me)}. Je locatie wordt toegevoegd als je dat toestaat.</p>
          </form>` : '<p class="note">Kies eerst op het startscherm wie deze telefoon gebruikt.</p>'}
      </section>
      <nav class="pager">
        ${prev ? `<a class="btn" href="#/dag/${prev.iso}">‹ Dag ${prev.n}</a>` : '<span></span>'}
        ${next ? `<a class="btn" href="#/dag/${next.iso}">Dag ${next.n} ›</a>` : '<span></span>'}
      </nav>
    </article>`;
}

function viewNotities() {
  const people = DATA.trip.people || [];
  const all = NOTES.list().filter((n) => noteFilter.who === 'all' || n.author === noteFilter.who);
  const isPhoto = (n) => n.type === 'photo';
  const days = tripDays();
  const groups = days.map((day) => ({ day, notes: all.filter((n) => n.date === day.iso) })).filter((g) => g.notes.length);
  const st = NOTES.status();
  return `
    <div class="filters">
      <button class="chip${noteFilter.who === 'all' ? ' on' : ''}" data-who="all">Iedereen</button>
      ${people.map((p) => `<button class="chip${noteFilter.who === p ? ' on' : ''}" data-who="${esc(p)}">${esc(p)}</button>`).join('')}
    </div>
    <p class="status sync-${st.kind}">${esc(st.text)}</p>
    ${groups.length ? groups.map(({ day, notes }) => `
      <h2 class="section-title"><a href="#/dag/${day.iso}">Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${esc(day.title)}</a></h2>
      ${photoGrid(notes.filter(isPhoto))}
      ${notes.filter((n) => !isPhoto(n)).map((n) => noteCard(n, { actions: false })).join('')}`).join('')
    : '<div class="empty"><h3>Nog geen notities</h3><p>Open een dag in het reisplan en schrijf onderaan je eerste notitie of voeg foto’s toe.</p></div>'}`;
}

function viewBoekingen() {
  const cards = (DATA.bookings || []).map((b) => `
    <div class="card">
      <h3>${esc(b.title)}</h3>
      <dl class="rows">${b.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${/^[A-Z0-9-]{5,}$/.test(v) ? `<button class="copy" data-copy="${esc(v)}">${esc(v)}</button>` : esc(v)}</dd>`).join('')}</dl>
      ${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}
    </div>`).join('');
  const practical = (DATA.practical || []).length ? `
    <h2 class="section-title">Praktisch</h2>
    <div class="card"><dl class="rows">${DATA.practical.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : '';
  return `${cards}${practical}<p class="note" style="margin:16px 4px">Tik op een nummer om het te kopiëren.</p>`;
}

function viewNood() {
  const groups = (DATA.contacts || []).map((g) => `
    <h2 class="section-title">${esc(g.group)}</h2>
    ${g.items.map((c) => `
      <div class="card contact">
        <h3>${esc(c.name)}</h3>
        ${c.role ? `<div class="role">${esc(c.role)}</div>` : ''}
        ${c.address ? `<p><a href="${mapsQuery(c.address)}">${esc(c.address)}</a></p>` : ''}
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
        <div class="btn-row">
          ${c.phone ? `<a class="btn call" href="${telHref(c.phone)}">${ic('phone')} ${esc(c.phone)}</a>` : ''}
          ${c.phoneAlt ? `<a class="btn call alt" href="${telHref(c.phoneAlt)}">${ic('phone')} ${esc(c.phoneAlt)}${c.phoneAltLabel ? ` · ${esc(c.phoneAltLabel)}` : ''}</a>` : ''}
          ${c.email ? `<a class="btn small" href="mailto:${esc(c.email)}">${ic('mail')} ${esc(c.email)}</a>` : ''}
        </div>
      </div>`).join('')}`).join('');
  return `
    <div class="sos">
      <a href="tel:113"><b>113</b><small>Politie</small></a>
      <a href="tel:115"><b>115</b><small>Ambulance</small></a>
      <a href="tel:114"><b>114</b><small>Brandweer</small></a>
    </div>
    <div class="btn-row"><button class="btn" id="share-loc" style="width:100%">${ic('pin')} Deel mijn locatie</button></div>
    ${groups}`;
}

/* ---------- literary companion ---------- */

const passages = () => DATA.passages || [];
const favs = () => new Set(store.get('favs', []));

function routePlaces() {
  const seen = new Set();
  const out = [];
  for (const d of DATA.days || []) for (const id of d.places || []) if (!seen.has(id) && placeById(id)) { seen.add(id); out.push(placeById(id)); }
  return out;
}

function passagesForPlaces(ids) {
  return passages().filter((p) => (p.places || []).some((id) => ids.includes(id)));
}

function searchPassages(q) {
  const placeIds = findPlaces(q).map((p) => p.id);
  const fq = fold(q);
  const toks = fq.split(/\s+/).filter(Boolean);
  return passages().map((p) => {
    let score = 0;
    if ((p.places || []).some((id) => placeIds.includes(id))) score += 10;
    if ((p.tags || []).some((t) => fold(t) === fq)) score += 6;
    const hay = fold([p.text, p.title, p.source, p.author, ...(p.tags || []), ...(p.places || []).map((id) => placeById(id)?.name)].join(' '));
    if (toks.length && toks.every((t) => hay.includes(t))) score += 3;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.p);
}

function passageCard(p, f) {
  const where = [p.author, p.source, p.where].filter(Boolean).map(esc).join(' · ');
  const chips = [
    ...(p.places || []).map((id) => placeById(id)?.name).filter(Boolean),
    ...(p.tags || []),
  ].map((t) => `<button class="chip" data-read="${esc(t)}">${esc(t)}</button>`).join('');
  return `
    <article class="card passage">
      ${p.title ? `<h3 style="margin-bottom:8px">${esc(p.title)}</h3>` : ''}
      <blockquote${p.text.length > 900 ? ' class="long"' : ''}>${esc(p.text)}</blockquote>
      ${p.text.length > 900 ? '<button class="link more" data-more>Lees verder</button>' : ''}
      ${where ? `<cite>${where}</cite>` : ''}
      <div class="foot">
        <div class="tags">${chips}</div>
        <button class="star" data-fav="${esc(p.id)}" aria-label="Favoriet">${f.has(p.id) ? '★' : '☆'}</button>
      </div>
    </article>`;
}

const KINDS = [['literatuur', 'Literatuur'], ['poëzie', 'Poëzie'], ['cultuur', 'Cultuur & geschiedenis']];
const sourceKind = (src) => (DATA.sources || []).find((x) => x.source === src && x.kind !== 'poëzie')?.kind || 'cultuur';
const kindOf = (p) => ((p.tags || []).includes('poëzie') ? 'poëzie' : sourceKind(p.source));

// Passages in the order you meet their places on the trip.
function routeOrder(list) {
  const order = new Map();
  (DATA.days || []).forEach((d, i) => (d.places || []).forEach((id) => { if (!order.has(id)) order.set(id, i); }));
  const rank = (p) => Math.min(99, ...(p.places || []).map((id) => order.get(id) ?? 99));
  return [...list].sort((a, b) => rank(a) - rank(b));
}

function viewBronnen() {
  const groups = KINDS.map(([kind, label]) => {
    const cards = (DATA.sources || []).filter((x) => x.kind === kind).map((x) => {
      const n = passages().filter((p) => p.source === x.source && kindOf(p) === kind).length;
      if (!n) return '';
      return `
        <button class="card source" data-src="${esc(x.source)}" data-kind="${kind}">
          <h3>${esc(x.title || x.source)}</h3>
          <div class="role">${esc(x.author)}${x.year ? ` · ${esc(x.year)}` : ''}</div>
          <p>${esc(x.about)}</p>
          <p class="note">${n} ${n === 1 ? 'fragment' : 'fragmenten'} · ${esc(x.rights)}</p>
        </button>`;
    }).join('');
    return cards ? `<h2 class="section-title">${label}</h2>${cards}` : '';
  }).join('');
  return `<p class="note" style="margin:4px 4px 0">Alle bronnen achter de teksten in Lezen. Tik op een bron om de fragmenten te lezen, in de volgorde van de reis.</p>${groups}`;
}

function readingResults() {
  const f = favs();
  if (reading.mode === 'source') {
    const list = routeOrder(passages().filter((p) => p.source === reading.query && kindOf(p) === reading.kind));
    return { title: `${reading.query} · ${list.length} ${list.length === 1 ? 'fragment' : 'fragmenten'}`, list };
  }
  if (reading.mode === 'fav') return { title: `Favorieten (${f.size})`, list: passages().filter((p) => f.has(p.id)) };
  if (reading.mode === 'near' && reading.near) {
    const ids = reading.near.map((p) => p.id);
    const rank = (p) => Math.min(...p.places.map((id) => ids.indexOf(id)).filter((i) => i >= 0));
    const list = passagesForPlaces(ids).sort((a, b) => rank(a) - rank(b));
    const here = reading.near[0];
    return { title: `Je bent bij ${here.name} (${Math.round(here.km)} km). Ook dichtbij: ${reading.near.slice(1).map((p) => p.name).join(', ')}.`, list };
  }
  if (reading.mode === 'search' && reading.query) {
    const list = searchPassages(reading.query);
    return { title: `${list.length} ${list.length === 1 ? 'resultaat' : 'resultaten'} voor “${reading.query}”`, list };
  }
  const today = (DATA.days || []).find((d) => d.date === todayIso());
  if (today?.places?.length) {
    const names = today.places.map((id) => placeById(id)?.name).filter(Boolean).join(', ');
    return { title: `Vandaag: ${names}`, list: passagesForPlaces(today.places) };
  }
  return null;
}

function viewLezen() {
  const res = readingResults();
  const route = routePlaces().map((p) => `<button class="chip" data-read="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  let body;
  if (!passages().length) {
    body = '<div class="empty"><h3>Nog geen teksten</h3><p>Zodra de bronteksten toegevoegd zijn, verschijnen hier citaten, beschrijvingen en weetjes per plaats.</p></div>';
  } else if (reading.message) {
    body = `<p class="status">${esc(reading.message)}</p>`;
  } else if (!res) {
    body = '<div class="empty"><h3>Waar ben je?</h3><p>Tik op <b>In de buurt</b>, zoek een plaats of een woord, of kies een halte van de reis hierboven.</p></div>';
  } else {
    body = `<p class="status">${esc(res.title)}</p>${res.list.length ? res.list.map((p) => passageCard(p, favs())).join('') : '<div class="empty"><p>Nog niets gevonden. Probeer een andere plaats of een ruimer woord.</p></div>'}`;
  }
  return `
    <form class="search" id="search-form">
      <input id="q" type="search" placeholder="Plaats of trefwoord" value="${esc(reading.mode === 'search' ? reading.query : '')}" enterkeyhint="search" autocapitalize="none" autocorrect="off">
      <button type="button" class="btn primary" id="near">${ic('pin')} In de buurt</button>
    </form>
    <div class="filters"><a class="chip on" href="#/bronnen">${ic('lotus')} Bronnen</a>${route}<button class="chip" id="favs"><span class="glyph">★</span> Favorieten</button></div>
    ${body}`;
}

/* ---------- shell & routing ---------- */

const ROUTES = {
  '': { tab: 'start', title: 'Vietnam', view: viewStart },
  reis: { tab: 'reis', title: 'Reisplan', view: viewReis },
  dag: { tab: 'reis', title: 'Reisplan', view: viewDag, back: '#/reis' },
  notities: { tab: 'notities', title: 'Notities', view: viewNotities },
  lezen: { tab: 'lezen', title: 'Lezen', view: viewLezen },
  boekingen: { tab: 'start', title: 'Boekingen', view: viewBoekingen, back: '#/' },
  nood: { tab: 'nood', title: 'Nood', view: viewNood },
  bronnen: { tab: 'lezen', title: 'Bronnen', view: viewBronnen, back: '#/lezen' },
};

function currentRoute() {
  const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : '', arg };
}

function render({ keepScroll = false } = {}) {
  const { name, arg } = currentRoute();
  const r = ROUTES[name];
  const y = window.scrollY;
  document.body.dataset.route = name || 'start';
  $('#top').hidden = !name;
  $('#top-title').textContent = r.title;
  $('#top-sub').textContent = tripStatus();
  $('#back').hidden = !r.back;
  $('#back').href = r.back || '#/';
  $('#view').innerHTML = r.view(arg);
  document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === r.tab ? 'page' : 'false'));
  hydrateImages($('#view'));
  hydratePhotos($('#view'));
  tickClocks();
  if (keepScroll) window.scrollTo(0, y);
}

function onRoute() {
  editingNote = null;
  selecting.date = null;
  selecting.ids.clear();
  closeOverlay();
  render();
  if (['notities', 'dag', ''].includes(currentRoute().name)) NOTES.syncNow();
  window.scrollTo(0, 0);
  if (currentRoute().name === 'reis') document.getElementById(`d-${todayIso()}`)?.scrollIntoView({ block: 'center' });
}

// Notes changed (saved here or synced from the other phone): refresh without
// touching a note that is being typed.
function onNotesChange() {
  const { name } = currentRoute();
  if (name === 'dag') {
    refreshDayNotes();
  } else if (name === 'notities' || name === '') {
    render({ keepScroll: true });
  }
}

function readAbout(q) {
  reading.mode = 'search';
  reading.query = q;
  reading.message = '';
  location.hash = '#/lezen';
}

async function nearMe() {
  reading.mode = 'near';
  reading.message = 'Locatie bepalen…';
  render({ keepScroll: true });
  try {
    const c = await getPosition();
    reading.near = nearestPlaces(c.latitude, c.longitude, 4);
    reading.message = '';
  } catch (e) {
    reading.message = e.message;
  }
  render({ keepScroll: true });
}

async function shareLocation() {
  try {
    const c = await getPosition();
    const text = `Mijn locatie: ${mapsAt(c.latitude.toFixed(5), c.longitude.toFixed(5), 'Hier')}`;
    if (navigator.share) await navigator.share({ text });
    else await copy(text);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message);
  }
}

async function saveNote(form) {
  const text = $('#note-text').value.trim();
  if (!text) return;
  const date = form.dataset.date;
  const day = (DATA.days || []).find((d) => d.date === date);
  const fallbackPlace = placeById(day?.places?.[0])?.name || day?.stay?.area || '';
  const existing = editingNote && NOTES.list().find((n) => n.id === editingNote);
  const note = existing
    ? NOTES.save({ ...existing, text })
    : NOTES.save({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, date, text, author: store.get('me'), place: fallbackPlace });
  editingNote = null;
  render({ keepScroll: true });
  toast('Notitie bewaard');
  if (existing) return;
  // Add the real position when the phone gives it; the day's place stands in until then.
  try {
    const c = await getPosition(8000);
    const near = nearestPlaces(c.latitude, c.longitude, 1)[0];
    const place = near && near.km < 25 ? `bij ${near.name}` : `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`;
    NOTES.save({ ...note, place, lat: +c.latitude.toFixed(5), lon: +c.longitude.toFixed(5) });
  } catch { /* keep the day's place */ }
}

/* ---------- photos & day reel ---------- */

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const dayPlace = (iso) => {
  const day = (DATA.days || []).find((d) => d.date === iso);
  return placeById(day?.places?.[0])?.name || day?.stay?.area || '';
};

async function addPhotos(input) {
  const files = [...input.files];
  const date = input.dataset.date;
  input.value = '';
  if (!files.length) return;
  toast(`${files.length} ${files.length === 1 ? 'foto' : 'foto’s'} bewaren…`);
  const saved = [];
  for (const file of files) {
    try {
      const { blob, w, h } = await preparePhoto(file);
      const id = newId();
      await media.put(id, blob);
      saved.push(NOTES.save({ id, type: 'photo', date, author: store.get('me'), caption: '', place: dayPlace(date), w, h }));
    } catch {
      toast('Een foto kon niet gelezen worden.');
    }
  }
  if (saved.length) toast(`${saved.length} ${saved.length === 1 ? 'foto' : 'foto’s'} bewaard`);
  try {
    const c = await getPosition(8000);
    const near = nearestPlaces(c.latitude, c.longitude, 1)[0];
    const place = near && near.km < 25 ? `bij ${near.name}` : `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`;
    for (const ph of saved) NOTES.save({ ...ph, place, lat: +c.latitude.toFixed(5), lon: +c.longitude.toFixed(5) });
  } catch { /* keep the day's place */ }
}

function overlay(html) {
  closeOverlay();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'overlay';
  el.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.append(el);
  el.addEventListener('click', onOverlayClick);
  return el;
}
function closeOverlay() { $('#overlay')?.remove(); }

async function openPhoto(id) {
  const ph = NOTES.list().find((n) => n.id === id);
  if (!ph) return;
  const mine = ph.author === store.get('me');
  overlay(`
    <img class="big-photo" alt="" id="big-photo">
    ${ph.caption ? `<p class="caption">${esc(ph.caption)}</p>` : ''}
    <div class="note-meta">${noteMeta(ph)}</div>
    <div class="btn-row">
      ${mine ? `<button class="btn small" data-caption="${esc(id)}">Bijschrift</button>${privateBtn(ph)}` : ''}
      ${store.get('me') ? `<button class="btn small danger" data-delphoto="${esc(id)}">Verwijder</button>` : ''}
      <button class="btn small primary" data-close>Sluiten</button>
    </div>`);
  const url = await photoUrl(id);
  if (url && $('#big-photo')) $('#big-photo').src = url;
}

/* ---------- live: local news, on this day, flights ---------- */

const fmtShort = (d) => d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });

function newsLinks(place) {
  const q = encodeURIComponent(`${place || ''} Vietnam`.trim());
  return `
    <div class="eyebrow" style="margin-top:14px">Verder lezen</div>
    <div class="btn-row">
      <a class="btn small" href="https://news.google.com/search?q=${q}&hl=en-LK&gl=LK&ceid=LK:en" target="_blank" rel="noopener">Google Nieuws</a>
      <a class="btn small" href="https://www.adaderana.lk/" target="_blank" rel="noopener">Ada Derana</a>
      <a class="btn small" href="https://www.dailymirror.lk/" target="_blank" rel="noopener">Daily Mirror</a>
      <a class="btn small" href="https://www.newsfirst.lk/" target="_blank" rel="noopener">News 1st</a>
    </div>`;
}

async function showNews(iso) {
  overlay(`<h3>${ic('lotus')} Lokaal nieuws</h3><p class="note" id="live-status">Locatie bepalen…</p><div id="live-out"></div>
    <div class="btn-row"><button class="btn small" data-close>Sluiten</button></div>`);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  let where = { town: dayPlace(iso), district: '' };
  try {
    const c = await getPosition(10000);
    set('live-status', 'Plaats opzoeken…');
    try { where = await placeName(c.latitude, c.longitude); } catch {
      const near = nearestPlaces(c.latitude, c.longitude, 1)[0];
      where = { town: near?.name || where.town, district: '' };
    }
  } catch {
    set('live-status', `Geen locatie; nieuws over ${esc(where.town)} (dagprogramma).`);
  }
  set('live-status', `Nieuws zoeken rond ${esc([where.town, where.district].filter(Boolean).join(', ') || 'Vietnam')}…`);
  try {
    const res = await localNews(where);
    const list = res.items.slice(0, 15).map((a) => `
      <a class="news-item" href="${esc(a.url)}" target="_blank" rel="noopener">
        <b>${esc(a.title)}</b>
        <small>${esc(a.source || '')}${a.date ? ` · ${esc(a.date.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }))}` : ''}</small>
      </a>`).join('');
    set('live-status', res.items.length ? `Recent nieuws: ${esc(res.scope)}` : 'Geen recente berichten gevonden.');
    set('live-out', list + newsLinks(where.town));
  } catch (e) {
    set('live-status', `Het nieuws kon niet geladen worden (${esc(e.message || 'geen verbinding')}).`);
    set('live-out', newsLinks(where.town));
  }
}

async function showHistory(iso, useDayDate = false) {
  const tripDate = parseDate(iso);
  const date = useDayDate ? tripDate : new Date();
  const other = isoOf(tripDate) !== todayIso();
  overlay(`<h3>${ic('lotus')} Op ${esc(fmtShort(date))}</h3>
    ${other ? `<div class="filters"><button class="chip${useDayDate ? '' : ' on'}" data-hist="${iso}" data-histday="0">Vandaag</button><button class="chip${useDayDate ? ' on' : ''}" data-hist="${iso}" data-histday="1">Deze reisdag (${esc(fmtShort(tripDate))})</button></div>` : ''}
    <p class="note" id="live-status">Wikipedia raadplegen…</p><div id="live-out"></div>
    <div class="btn-row"><button class="btn small" data-close>Sluiten</button></div>`);
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  try {
    const r = await onThisDay(date.getMonth() + 1, date.getDate());
    const row = (x) => `<div class="hist-item"><b>${x.year ?? ''}</b><div>
      <p>${esc(x.text)}</p>
      ${x.extract ? `<p class="hist-more">${x.page ? `<i>${esc(x.page)}</i> — ` : ''}${esc(x.extract)}</p>` : ''}
      ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">Lees op Wikipedia ›</a>` : ''}
    </div></div>`;
    const world = r.world.slice(0, r.sl.length ? 6 : 10);
    set('live-status', r.sl.length ? `Vietnam op ${esc(fmtShort(date))}` : `Wikipedia’s kalender vermeldt voor ${esc(fmtShort(date))} niets over Vietnam.`);
    set('live-out', r.sl.map(row).join('')
      + (world.length ? `<div class="eyebrow hist-head">Elders in de wereld</div>${world.map(row).join('')}` : ''));
  } catch (e) {
    set('live-status', `Wikipedia kon niet geladen worden (${esc(e.message || 'geen verbinding')}).`);
  }
}

async function showFlight(no, iso) {
  const key = DATA.flightApiKey;
  const links = flightLinks(no).map(([n, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join('');
  overlay(`<h3>${ic('lotus')} ${esc(no)} · ${esc(fmtShort(parseDate(iso)))}</h3>
    <p class="note" id="live-status">${key ? 'Live gegevens ophalen…' : 'Gate, terminal en vertraging staan live op deze pagina’s:'}</p>
    <div id="live-out"></div>
    <div class="btn-row">${links}</div>
    <div class="btn-row"><button class="btn small" data-close>Sluiten</button></div>`);
  if (!key) return;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  try {
    const f = await flightStatus(no, iso, key);
    const t = (x) => (x ? x.slice(11, 16) : '');
    const leg = (label, x) => `
      <div class="card">
        <div class="eyebrow">${label} · ${esc(x.airport)}</div>
        <dl class="rows">
          <dt>Gepland</dt><dd>${esc(t(x.scheduled))}${x.revised && t(x.revised) !== t(x.scheduled) ? ` → <b>${esc(t(x.revised))}</b>` : ''}</dd>
          ${x.terminal ? `<dt>Terminal</dt><dd>${esc(x.terminal)}</dd>` : ''}
          <dt>Gate</dt><dd>${x.gate ? `<b>${esc(x.gate)}</b>` : 'nog niet bekend'}</dd>
          ${x.checkIn ? `<dt>Check-in</dt><dd>${esc(x.checkIn)}</dd>` : ''}
          ${x.baggage ? `<dt>Bagageband</dt><dd>${esc(x.baggage)}</dd>` : ''}
        </dl>
      </div>`;
    set('live-status', `Status: <b>${esc(f.status || 'onbekend')}</b>`);
    set('live-out', leg('Vertrek', f.dep) + leg('Aankomst', f.arr));
  } catch (e) {
    set('live-status', `Live gegevens niet beschikbaar (${esc(e.message || 'geen verbinding')}). Gebruik een van deze pagina’s:`);
  }
}

// Private notes and photos stay in the app but are left out of the reel and the day card.
function togglePrivate(id) {
  const n = NOTES.list().find((x) => x.id === id);
  if (n) NOTES.save({ ...n, private: !n.private });
}

let lastReel = null;

async function makeDayReel(iso, asCard = false) {
  const day = tripDays().find((d) => d.iso === iso);
  const all = NOTES.list().filter((n) => n.date === iso);
  const entries = all.filter((n) => !n.private).sort((a, b) => a.created.localeCompare(b.created));
  if (!entries.length) { toast(all.length ? 'Alles van deze dag staat op privé.' : 'Voeg eerst foto’s of notities toe aan deze dag.'); return; }
  const recording = !asCard && canRecord();
  overlay(`
    <h3>${recording ? 'Dagreel maken' : 'Dagkaart maken'}</h3>
    <p class="note">${recording ? 'De film wordt op je telefoon opgenomen en duurt even lang als de reel zelf. Houd het scherm open.' : asCard ? 'Eén afbeelding met de dag, tot vier foto’s en een notitie.' : 'Je telefoon kan hier geen film opnemen, dus je krijgt één afbeelding met de foto’s en een notitie.'}</p>
    <div class="progress"><div id="reel-bar"></div></div>
    <div id="reel-out"></div>
    <div class="btn-row"><button class="btn small" data-close>Annuleer</button></div>`);
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
  try {
    const items = [];
    for (const n of entries) {
      if (n.type === 'photo') {
        const blob = await NOTES.photo(n.id);
        if (blob) items.push({ ...n, blob });
      } else items.push({ ...n, type: 'note' });
    }
    const people = (DATA.trip.people || []).join(' & ');
    const opts = {
      eyebrow: `Dag ${day.n} · ${fmt(day.d, { weekday: 'long', day: 'numeric', month: 'long' })}`,
      title: day.title,
      sub: day.stay?.area || (day.places || []).map((id) => placeById(id)?.name).filter(Boolean).join(', '),
      signature: people ? `${people} · Vietnam 2026` : 'Vietnam 2026',
      items,
    };
    const bar = (p) => { const b = $('#reel-bar'); if (b) b.style.width = `${Math.round(p * 100)}%`; };
    const out = recording ? await makeReel(opts, bar) : (bar(1), await makeCard(opts));
    if (!$('#overlay')) return;
    const name = `Vietnam-dag-${day.n}.${out.ext}`;
    lastReel = new File([out.blob], name, { type: out.blob.type });
    const url = URL.createObjectURL(out.blob);
    $('#reel-out').innerHTML = `
      ${out.ext === 'jpg' ? `<img class="big-photo" src="${url}" alt="">` : `<video class="big-photo" src="${url}" controls playsinline loop></video>`}
      <div class="btn-row">
        <button class="btn primary" data-share-reel>Delen (WhatsApp…)</button>
        <a class="btn" href="${url}" download="${name}">Bewaar</a>
        ${recording ? `<button class="btn" data-card="${iso}">Liever één foto</button>` : ''}
      </div>`;
  } catch (e) {
    if ($('#reel-out')) $('#reel-out').innerHTML = `<p class="sync-error">Het maken lukte niet: ${esc(e.message || e)}</p>`;
  } finally {
    lock?.release?.().catch(() => {});
  }
}

async function shareReel() {
  if (!lastReel) return;
  const data = { files: [lastReel], title: lastReel.name };
  try {
    if (navigator.canShare?.(data)) await navigator.share(data);
    else toast('Delen gaat hier niet; tik op Bewaar en deel het bestand daarna.');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Delen lukte niet.');
  }
}

function onOverlayClick(e) {
  const t = e.target.closest('[data-close],[data-caption],[data-delphoto],[data-private],[data-share-reel],[data-card],[data-hist]');
  if (e.target.id === 'overlay') { closeOverlay(); return; }
  if (!t) return;
  if (t.dataset.close !== undefined) closeOverlay();
  else if (t.dataset.caption) {
    const ph = NOTES.list().find((n) => n.id === t.dataset.caption);
    const c = prompt('Bijschrift bij deze foto:', ph?.caption || '');
    if (ph && c !== null) { NOTES.save({ ...ph, caption: c.trim() }); openPhoto(ph.id); }
  } else if (t.dataset.delphoto) {
    if (confirm('Deze foto verwijderen? Ook op de andere telefoon.')) { NOTES.remove(t.dataset.delphoto); closeOverlay(); }
  } else if (t.dataset.shareReel !== undefined) shareReel();
  else if (t.dataset.card) makeDayReel(t.dataset.card, true);
  else if (t.dataset.private) { togglePrivate(t.dataset.private); openPhoto(t.dataset.private); }
  else if (t.dataset.hist) showHistory(t.dataset.hist, t.dataset.histday === '1');
}

function wire() {
  window.addEventListener('hashchange', onRoute);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) NOTES.syncNow(); });
  window.addEventListener('online', () => NOTES.syncNow());
  setInterval(() => { if (!document.hidden) NOTES.syncNow(); }, 120000);
  setInterval(() => { if (!document.hidden) tickClocks(); }, 1000);

  $('#view').addEventListener('click', (e) => {
    const t = e.target.closest('[data-live-news],[data-live-history],[data-flight],[data-refresh],[data-select],[data-select-all],[data-select-done],[data-del-selected],[data-photo],[data-src],#make-reel,[data-more],[data-read],[data-fav],[data-copy],[data-me],[data-who],[data-edit],[data-private],[data-del],#near,#favs,#share-loc,#note-cancel');
    if (!t) return;
    if (t.dataset.liveNews) showNews(t.dataset.liveNews);
    else if (t.dataset.liveHistory) showHistory(t.dataset.liveHistory);
    else if (t.dataset.flight) showFlight(t.dataset.flight, t.dataset.date);
    else if (t.dataset.refresh !== undefined) hardRefresh();
    else if (t.dataset.photo && selecting.date && t.closest('.selecting')) {
      const id = t.dataset.photo;
      selecting.ids.has(id) ? selecting.ids.delete(id) : selecting.ids.add(id);
      refreshDayNotes();
    } else if (t.dataset.select) { selecting.date = t.dataset.select; selecting.ids.clear(); refreshDayNotes(); }
    else if (t.dataset.selectAll) {
      allPhotos().filter((n) => n.date === t.dataset.selectAll).forEach((n) => selecting.ids.add(n.id));
      refreshDayNotes();
    } else if (t.dataset.selectDone !== undefined) { selecting.date = null; selecting.ids.clear(); refreshDayNotes(); }
    else if (t.dataset.delSelected) {
      const n = selecting.ids.size;
      if (n && confirm(`${n} ${n === 1 ? 'foto' : 'foto’s'} verwijderen? Ook op de andere telefoon.`)) {
        [...selecting.ids].forEach((id) => NOTES.remove(id));
        selecting.date = null;
        selecting.ids.clear();
        refreshDayNotes();
        toast(`${n} ${n === 1 ? 'foto' : 'foto’s'} verwijderd`);
      }
    } else if (t.dataset.photo) openPhoto(t.dataset.photo);
    else if (t.dataset.src) {
      reading.mode = 'source';
      reading.query = t.dataset.src;
      reading.kind = t.dataset.kind;
      reading.message = '';
      location.hash = '#/lezen';
    } else if (t.id === 'make-reel') makeDayReel(t.dataset.date);
    else if (t.dataset.more !== undefined) {
      const open = t.previousElementSibling.classList.toggle('open');
      t.textContent = open ? 'Minder tonen' : 'Lees verder';
    } else if (t.dataset.read) { e.preventDefault(); readAbout(t.dataset.read); }
    else if (t.dataset.fav) {
      const f = favs();
      f.has(t.dataset.fav) ? f.delete(t.dataset.fav) : f.add(t.dataset.fav);
      store.set('favs', [...f]);
      t.textContent = f.has(t.dataset.fav) ? '★' : '☆';
    } else if (t.dataset.copy) copy(t.dataset.copy);
    else if (t.dataset.me !== undefined) {
      if (t.dataset.me) store.set('me', t.dataset.me); else store.del('me');
      render({ keepScroll: true });
    } else if (t.dataset.who) { noteFilter.who = t.dataset.who; render({ keepScroll: true }); }
    else if (t.dataset.edit) {
      editingNote = t.dataset.edit;
      render({ keepScroll: true });
      $('#note-text')?.focus();
    } else if (t.dataset.private) togglePrivate(t.dataset.private);
    else if (t.dataset.del) {
      if (confirm('Deze notitie verwijderen?')) NOTES.remove(t.dataset.del);
    } else if (t.id === 'note-cancel') { editingNote = null; render({ keepScroll: true }); }
    else if (t.id === 'near') nearMe();
    else if (t.id === 'favs') { reading.mode = 'fav'; reading.message = ''; render({ keepScroll: true }); }
    else if (t.id === 'share-loc') shareLocation();
  });

  $('#view').addEventListener('change', (e) => {
    if (e.target.id === 'photo-input') addPhotos(e.target);
  });

  $('#view').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'note-form') { saveNote(e.target); return; }
    if (e.target.id !== 'search-form') return;
    const q = $('#q').value.trim();
    reading.mode = q ? 'search' : 'start';
    reading.query = q;
    reading.message = '';
    render({ keepScroll: true });
    $('#q').blur();
  });
}

async function showApp() {
  KEY = await importContentKey(DATA.contentKey);
  NOTES = createNotes({ key: KEY, sync: DATA.sync, store, onChange: onNotesChange });
  $('#lock').hidden = true;
  for (const id of ['view', 'tabs']) $(`#${id}`).hidden = false;
  wire();
  onRoute();
  setTimeout(prefetchImages, 1500);
}

/* ---------- unlock ---------- */

async function loadBox() {
  const res = await fetch('data/trip.enc.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function showLock(box, msg = '') {
  $('#lock').hidden = false;
  $('#lock-msg').textContent = msg;
  $('#lock-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!box) { location.reload(); return; }
    const pass = $('#pass').value;
    $('#lock-msg').textContent = 'Openen…';
    try {
      DATA = await decryptJSON(box, pass);
      store.set('pass', pass);
      await showApp();
    } catch {
      $('#lock-msg').textContent = 'Dat wachtwoord klopt niet.';
      $('#pass').select();
    }
  };
}

// iPhone home-screen apps are often resumed rather than restarted, so check for
// a new version whenever the app comes to the foreground and reload into it,
// unless a note is being typed.
const APP_VERSION = '2026-10-17.1';

const APP_FILES = ['./', 'index.html', 'styles.css', 'app.js', 'crypto.js', 'places.js', 'notes.js', 'media.js', 'reel.js', 'live.js', 'manifest.webmanifest', 'data/trip.enc.json'];

// Safety net next to the service worker: ask the server which version is live
// (bypassing every cache) and offer a hard refresh when this copy is older.
async function checkVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const { version } = await res.json();
    if (version && version !== APP_VERSION && !document.getElementById('update-bar')) {
      const bar = document.createElement('div');
      bar.id = 'update-bar';
      bar.className = 'update-bar';
      bar.innerHTML = `Nieuwe versie beschikbaar (${version}). <button class="btn small">Bijwerken</button>`;
      bar.querySelector('button').onclick = hardRefresh;
      document.body.append(bar);
    }
  } catch { /* offline */ }
}

// Drops the service worker and the cached app files (not the photos or notes) and reloads.
async function hardRefresh() {
  try {
    // Only this app's own worker and caches: other apps may share the origin.
    await (await navigator.serviceWorker?.getRegistration?.())?.unregister();
    for (const k of await caches.keys()) if (k.startsWith('vietnam-') && k !== 'vietnam-photos') await caches.delete(k);
    // The browser's own HTTP cache may still hold old copies; overwrite them.
    await Promise.all(APP_FILES.map((f) => fetch(f, { cache: 'reload' }).catch(() => {})));
  } catch { /* reload anyway */ }
  location.replace(`./?v=${Date.now()}${location.hash}`);
}

function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); checkVersion(); } });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const typing = document.querySelector('#note-text')?.value.trim();
    if (typing) { toast('Nieuwe versie klaar: herstart de app na het bewaren.'); return; }
    reloading = true;
    location.reload();
  });
}

async function start() {
  watchForUpdates();
  checkVersion();
  let box;
  try {
    box = await loadBox();
  } catch {
    showLock(null, 'De reisgegevens konden niet geladen worden. Open de app één keer met internet.');
    return;
  }
  const saved = store.get('pass');
  if (saved) {
    try { DATA = await decryptJSON(box, saved); await showApp(); return; } catch { store.del('pass'); }
  }
  showLock(box);
}

start();

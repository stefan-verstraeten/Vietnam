// A day's photos and notes as a short video ("reel") that can be shared to
// WhatsApp, drawn on a canvas and recorded on the phone itself (MediaRecorder).
// The reel is landscape when most of the day's photos are, portrait otherwise.
// Where recording isn't available, makeCard() produces a single portrait image instead.

const PORTRAIT = [720, 1280];
const LANDSCAPE = [1280, 720];
let [W, H] = PORTRAIT;
const FPS = 30;
const SECS = { title: 3.2, photo: 3.6, note: 4.5, end: 2.6 };
const FADE = 0.5;

const INK = '#1d2422';
const PAPER = '#f3ead6';
const ACCENT = '#d9822b';
const SERIF = '"Iowan Old Style", Palatino, Georgia, serif';
const SANS = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split(/\n+/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

// Shrinks the font until the text fits the box; returns the lines and the size used.
function fitText(ctx, text, font, maxW, maxH, start, min, lh = 1.35) {
  for (let size = start; size >= min; size -= 2) {
    ctx.font = font(size);
    const lines = wrap(ctx, text, maxW);
    if (lines.length * size * lh <= maxH) return { lines, size };
  }
  ctx.font = font(min);
  const lines = wrap(ctx, text, maxW);
  const fit = Math.max(1, Math.floor(maxH / (min * lh)));
  if (lines.length > fit) { lines.length = fit; lines[fit - 1] = `${lines[fit - 1].replace(/\s+\S*$/, '')} …`; }
  return { lines, size: min };
}

function cover(ctx, img, zoom = 1, dx = 0, dy = 0) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (W - w) / 2 + dx, (H - h) / 2 + dy, w, h);
}

function shade(ctx, from, to) {
  const g = ctx.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = g;
  ctx.fillRect(0, from, W, to - from);
}

function meta(item) {
  const t = new Date(item.created).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  return [item.author, t, item.place].filter(Boolean).join(' · ');
}

function drawTitle(ctx, s, p) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // The block (eyebrow, title, subtitle) sits around the middle and rises slowly.
  const t = fitText(ctx, s.title, (z) => `600 ${z}px ${SERIF}`, W - 160, 220, 72, 44, 1.15);
  const blockH = 60 + t.lines.length * t.size * 1.15 + 50;
  const top = (H - blockH) / 2 + 20 - p * 20;
  ctx.textAlign = 'center';
  ctx.font = `600 34px ${SANS}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText(s.eyebrow.toUpperCase(), W / 2, top);
  ctx.fillStyle = INK;
  ctx.font = `600 ${t.size}px ${SERIF}`;
  t.lines.forEach((l, i) => ctx.fillText(l, W / 2, top + 60 + t.size + i * t.size * 1.15));
  ctx.font = `30px ${SANS}`;
  ctx.fillStyle = '#5b625f';
  ctx.fillText(s.sub, W / 2, top + 60 + t.lines.length * t.size * 1.15 + 60);
}

function drawPhoto(ctx, s, p) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // Slow zoom, alternating direction per photo.
  const z = s.zoomIn ? 1 + 0.09 * p : 1.09 - 0.09 * p;
  ctx.save();
  ctx.filter = 'blur(28px)';
  cover(ctx, s.img, 1.2);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, W, H);
  // A photo shaped like the reel fills it; any other photo is shown whole.
  const shape = (s.img.width / s.img.height) / (W / H);
  const fill = shape > 0.7 && shape < 1.45;
  const sc = (fill ? Math.max(W / s.img.width, H / s.img.height) : Math.min(W / s.img.width, H / s.img.height)) * z;
  ctx.drawImage(s.img, (W - s.img.width * sc) / 2, (H - s.img.height * sc) / 2, s.img.width * sc, s.img.height * sc);
  const text = s.caption;
  shade(ctx, H * 0.62, H);
  ctx.textAlign = 'left';
  if (text) {
    ctx.fillStyle = '#fff';
    const t = fitText(ctx, text, (z2) => `500 ${z2}px ${SANS}`, W - 96, Math.min(210, H * 0.2), 40, 28);
    const top = H - 110 - t.lines.length * t.size * 1.35;
    t.lines.forEach((l, i) => ctx.fillText(l, 48, top + i * t.size * 1.35 + t.size));
  }
  ctx.font = `26px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(meta(s.item), 48, H - 64);
}

function drawNote(ctx, s, p) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ACCENT;
  ctx.font = `600 160px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.globalAlpha = Math.min(1, p * 3);
  const x = W > H ? 120 : 60;
  const top = W > H ? 150 : 260;
  ctx.fillText('“', x - 16, top);
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  const t = fitText(ctx, s.item.text, (z) => `${z}px ${SERIF}`, W - 2 * x, H - top - 200, 52, 30, 1.4);
  t.lines.forEach((l, i) => ctx.fillText(l, x, top + 60 + i * t.size * 1.4));
  ctx.font = `600 28px ${SANS}`;
  ctx.fillStyle = '#5b625f';
  ctx.fillText(meta(s.item), x, H - (W > H ? 70 : 120));
}

function drawEnd(ctx, s) {
  ctx.fillStyle = '#aa0924';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `600 64px ${SERIF}`;
  ctx.fillText('Vietnam', W / 2, H / 2 - 20);
  ctx.font = `30px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(s.sub, W / 2, H / 2 + 40);
}

const DRAW = { title: drawTitle, photo: drawPhoto, note: drawNote, end: drawEnd };

async function scenes({ eyebrow, title, sub, items, signature }) {
  const list = [{ kind: 'title', eyebrow, title, sub }];
  let flip = false;
  for (const item of items) {
    if (item.type === 'photo') {
      const url = URL.createObjectURL(item.blob);
      const img = await loadImage(url);
      list.push({ kind: 'photo', img, url, item, caption: item.caption, zoomIn: (flip = !flip) });
    } else list.push({ kind: 'note', item });
  }
  list.push({ kind: 'end', sub: signature });
  const photos = list.filter((s) => s.kind === 'photo');
  const wide = photos.filter((s) => s.img.width > s.img.height).length;
  [W, H] = wide > photos.length - wide ? LANDSCAPE : PORTRAIT;
  let t = 0;
  for (const s of list) { s.start = t; s.dur = SECS[s.kind]; t += s.dur; }
  return { list, total: t };
}

function frame(ctx, list, t) {
  const i = list.findIndex((s) => t < s.start + s.dur);
  const s = list[i < 0 ? list.length - 1 : i];
  const p = Math.min(1, (t - s.start) / s.dur);
  ctx.save();
  DRAW[s.kind](ctx, s, p);
  ctx.restore();
  // Cross-fade into the next scene.
  const next = list[list.indexOf(s) + 1];
  const left = s.start + s.dur - t;
  if (next && left < FADE) {
    ctx.save();
    ctx.globalAlpha = 1 - left / FADE;
    DRAW[next.kind](ctx, next, 0);
    ctx.restore();
  }
}

export function canRecord() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

function pickType() {
  for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

// Records in real time, so a 30-second reel takes about 30 seconds to make.
export async function makeReel(opts, onProgress = () => {}) {
  const { list, total } = await scenes(opts);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  frame(ctx, list, 0);
  const type = pickType();
  const stream = canvas.captureStream(FPS);
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start(500);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      frame(ctx, list, Math.min(t, total));
      onProgress(Math.min(1, t / total));
      if (t >= total) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  list.forEach((s) => s.url && URL.revokeObjectURL(s.url));
  const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type: mime }), ext: mime.includes('mp4') ? 'mp4' : 'webm', seconds: total };
}

// One tall image with the title, up to four photos and the first note.
export async function makeCard(opts) {
  const { list } = await scenes(opts);
  [W, H] = PORTRAIT;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'left';
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(opts.eyebrow.toUpperCase(), 40, 70);
  ctx.fillStyle = INK;
  const t = fitText(ctx, opts.title, (z) => `600 ${z}px ${SERIF}`, W - 80, 120, 50, 34, 1.15);
  t.lines.forEach((l, i) => ctx.fillText(l, 40, 120 + i * t.size * 1.15));
  const photos = list.filter((s) => s.kind === 'photo').slice(0, 4);
  const note = list.find((s) => s.kind === 'note');
  const top = 150 + t.lines.length * t.size * 1.15;
  // Measure the note first, then give the photos all the remaining height.
  let nt = null;
  if (note) nt = fitText(ctx, `“${note.item.text}”`, (z) => `${z}px ${SERIF}`, W - 80, photos.length ? 330 : H - top - 160, 34, 22, 1.4);
  const noteH = nt ? nt.lines.length * nt.size * 1.4 + 70 : 0;
  const gap = 12;
  const cols = photos.length > 1 ? 2 : 1;
  const rows = Math.ceil(photos.length / cols);
  const cell = (W - 80 - (cols - 1) * gap) / cols;
  const ch = rows ? (H - top - noteH - 90 - (rows - 1) * gap) / rows : 0;
  photos.forEach((s, i) => {
    const wide = photos.length === 3 && i === 2;
    const cw = wide ? W - 80 : cell;
    const x = 40 + (wide ? 0 : (i % cols) * (cell + gap));
    const y = top + Math.floor(i / cols) * (ch + gap);
    const sc = Math.max(cw / s.img.width, ch / s.img.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cw, ch);
    ctx.clip();
    ctx.drawImage(s.img, x + (cw - s.img.width * sc) / 2, y + (ch - s.img.height * sc) / 2, s.img.width * sc, s.img.height * sc);
    ctx.restore();
  });
  if (nt) {
    const ny = top + (rows ? rows * (ch + gap) : 0) + 16;
    ctx.fillStyle = INK;
    ctx.font = `${nt.size}px ${SERIF}`;
    nt.lines.forEach((l, i) => ctx.fillText(l, 40, ny + nt.size + i * nt.size * 1.4));
    ctx.font = `24px ${SANS}`;
    ctx.fillStyle = '#5b625f';
    ctx.fillText(`— ${meta(note.item)}`, 40, ny + nt.size + nt.lines.length * nt.size * 1.4 + 14);
  }
  ctx.font = `600 24px ${SERIF}`;
  ctx.fillStyle = '#aa0924';
  ctx.textAlign = 'right';
  ctx.fillText(opts.signature, W - 40, H - 40);
  list.forEach((s) => s.url && URL.revokeObjectURL(s.url));
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  return { blob, ext: 'jpg' };
}

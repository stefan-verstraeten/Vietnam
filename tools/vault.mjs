#!/usr/bin/env node
// Encrypts private/ into data/ (committed), or decrypts it back.
//
//   TRIP_PASSPHRASE='...' node tools/vault.mjs encrypt
//   TRIP_PASSPHRASE='...' node tools/vault.mjs decrypt
//
// private/trip.json  -> data/trip.enc.json  (passphrase)
// private/img/*.jpg  -> data/img/<id>.bin   (content key stored inside the trip data)
//
// Image ids are a hash of key and content, so published file names reveal nothing
// and unchanged photos are not rewritten. private/ is git-ignored.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptJSON, decryptJSON, newContentKey, importContentKey, encryptBytes, decryptBytes } from '../crypto.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plainPath = join(root, 'private', 'trip.json');
const plainImg = join(root, 'private', 'img');
const boxPath = join(root, 'data', 'trip.enc.json');
const boxImg = join(root, 'data', 'img');

const [cmd] = process.argv.slice(2);
const pass = process.env.TRIP_PASSPHRASE;
if (!pass || !['encrypt', 'decrypt'].includes(cmd)) {
  console.error("usage: TRIP_PASSPHRASE='...' node tools/vault.mjs encrypt|decrypt");
  process.exit(1);
}

const listDir = (d) => readdir(d).catch(() => []);

if (cmd === 'encrypt') {
  const trip = JSON.parse(await readFile(plainPath, 'utf8'));
  if (!trip.contentKey) {
    trip.contentKey = await newContentKey();
    await writeFile(plainPath, JSON.stringify(trip, null, 2) + '\n');
  }
  const key = await importContentKey(trip.contentKey);

  await mkdir(boxImg, { recursive: true });
  const images = {};
  for (const f of (await listDir(plainImg)).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort()) {
    const bytes = await readFile(join(plainImg, f));
    const id = createHash('sha256').update(trip.contentKey).update(bytes).digest('hex').slice(0, 20);
    const out = join(boxImg, `${id}.bin`);
    if (!(await readFile(out).then(() => true, () => false))) await writeFile(out, await encryptBytes(key, bytes));
    images[basename(f, extname(f))] = { id, type: extname(f).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg' };
  }
  const keep = new Set(Object.values(images).map((i) => `${i.id}.bin`));
  for (const f of await listDir(boxImg)) if (!keep.has(f)) await unlink(join(boxImg, f));

  const box = await encryptJSON({ ...trip, images }, pass);
  await decryptJSON(box, pass); // round-trip check before overwriting
  await writeFile(boxPath, JSON.stringify(box) + '\n');
  console.log(`encrypted trip data and ${Object.keys(images).length} images`);
} else {
  const trip = await decryptJSON(JSON.parse(await readFile(boxPath, 'utf8')), pass);
  const { images = {}, ...rest } = trip;
  await mkdir(plainImg, { recursive: true });
  if (trip.contentKey) {
    const key = await importContentKey(trip.contentKey);
    for (const [name, { id, type }] of Object.entries(images)) {
      const bytes = await decryptBytes(key, await readFile(join(boxImg, `${id}.bin`)));
      await writeFile(join(plainImg, `${name}${type === 'image/png' ? '.png' : '.jpg'}`), bytes);
    }
  }
  await writeFile(plainPath, JSON.stringify(rest, null, 2) + '\n');
  console.log(`decrypted trip data and ${Object.keys(images).length} images into private/`);
}

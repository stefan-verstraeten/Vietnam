# Vietnam

Travel companion for a trip to Vietnam. It is a web app
that installs on an iPhone from Safari (Share › Add to Home Screen) and works offline.

Screens: **Start**, **Reisplan** (a page per day with the full program, photos
and notes), **Notities** (all notes by day, author and place), **Lezen** (literary
companion: passages by nearby place or search term), **Boekingen** and **Nood**
(emergency numbers, Belgian embassy and consulate, tap to call, share location).

## Private data

There is no trip data yet: the app shows its lock screen until a first
`data/trip.enc.json` is made with `tools/vault.mjs` (see below).

All trip details live in `data/trip.enc.json`, encrypted with a passphrase
(PBKDF2 + AES-GCM, see `crypto.js`). Photos are in `data/img/`, encrypted with a
random content key stored inside the trip data. The plaintext `private/` folder
is git-ignored and never committed.

## Photos and day reels

Photos added on a day page are scaled to 1600 px and kept in IndexedDB on the
phone (`media.js`). With sharing set up they are uploaded encrypted as
`photos/<id>.bin` next to the notes. `reel.js` turns a day's photos and notes into
a portrait video (canvas + MediaRecorder, recorded in real time) or, as a
fallback, a single image, which can be shared to WhatsApp via the share sheet.

## Shared notes

Notes are saved on each phone. When the trip data contains a `sync` entry
(`owner`, `repo`, `branch`, `token`: a fine-grained GitHub token with Contents
read/write on this repository only), notes are also stored encrypted as
`notes/<id>.json` on that branch, so both phones see each other's notes.

```sh
TRIP_PASSPHRASE='...' node tools/vault.mjs decrypt   # data/ -> private/ (trip.json and img/)
# edit private/trip.json
TRIP_PASSPHRASE='...' node tools/vault.mjs encrypt   # private/ -> data/
```

## Literary passages

Passages go in the `passages` array of the trip data:

```json
{ "id": "auteur-1", "text": "…", "author": "…", "source": "…",
  "where": "ch. 2", "places": ["hoi-an"], "tags": ["geschiedenis"] }
```

`places` uses the ids from `places.js`.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

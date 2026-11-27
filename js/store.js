// Persistence in this browser's localStorage: the garden when it can't reach
// the shared room (js/shared.js), and this browser's copy of the flowers kept
// in it (the album itself is shared, js/album.js).

import { ART, BASE } from './config.js';

const KEY = 'grain-garden/v1';
const ALBUM_KEY = 'grain-garden/album/v1';

// Run-length encode a palette buffer: [value, run, value, run, ...] -> base64.
export function encode(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const v = buf[i];
    let run = 1;
    while (i + run < buf.length && buf[i + run] === v && run < 255) run++;
    out.push(v, run);
    i += run;
  }
  let s = '';
  for (let k = 0; k < out.length; k++) s += String.fromCharCode(out[k]);
  return btoa(s);
}

export function decode(str, length) {
  const s = atob(str);
  const buf = new Uint8Array(length);
  let p = 0;
  for (let k = 0; k + 1 < s.length; k += 2) {
    const v = s.charCodeAt(k);
    const run = s.charCodeAt(k + 1);
    buf.fill(v, p, p + run);
    p += run;
  }
  return buf;
}

// Scale a square palette buffer `from` px per side to `to` px per side,
// nearest neighbour (no colours get mixed, it's a palette).
export function resample(buf, from, to) {
  if (from === to) return buf;
  const out = new Uint8Array(to * to);
  const k = from / to;
  for (let y = 0; y < to; y++) {
    const row = Math.min(from - 1, Math.floor((y + 0.5) * k)) * from;
    for (let x = 0; x < to; x++) out[y * to + x] = buf[row + Math.min(from - 1, Math.floor((x + 0.5) * k))];
  }
  return out;
}

// The grid a stored drawing was made on: records from before they said are BASE.
export const sizeOf = (r) => (Number.isInteger(r?.size) && r.size >= 16 && r.size <= 1024 ? r.size : BASE);

// A stored drawing's pixels on this page's grid (ART px per side).
export function decodeGrid(str, size = BASE) {
  return resample(decode(str, size * size), size, ART);
}

// Returns null on a first visit (nothing stored yet), otherwise an array.
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    return JSON.parse(raw).map((r) => ({ ...r, pixels: decodeGrid(r.pixels, sizeOf(r)) }));
  } catch {
    return null;
  }
}

// A flower as stored, here and in the shared room.
export function toRecord(f) {
  return {
    id: f.id,
    rev: f.rev, // changes whenever the drawing does
    nx: f.nx,
    ny: f.ny,
    colors: [...f.colors],
    seed: f.seed,
    // time spent being tended doesn't count toward withering
    tendedAt: f.pausedAt == null ? f.tendedAt : f.tendedAt + (Date.now() - f.pausedAt),
    size: ART, // the grid it's drawn on (see DETAIL in js/config.js)
    pixels: encode(f.pixels),
  };
}

// Is this a flower record we can grow (it may have come from anyone)?
export function isRecord(r) {
  return (
    !!r && typeof r.id === 'string' && typeof r.pixels === 'string' && Array.isArray(r.colors) &&
    r.colors.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) &&
    [r.nx, r.ny, r.seed, r.tendedAt].every(Number.isFinite)
  );
}

export function save(flowers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(flowers.map(toRecord)));
  } catch {
    /* storage full or blocked: the garden still works for this visit */
  }
}

// The album: kept flowers, stored as they were (pixels stay encoded).
export function loadAlbum() {
  try {
    const list = JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Returns false when the browser refuses (storage full or blocked).
export function saveAlbum(entries) {
  try {
    localStorage.setItem(ALBUM_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

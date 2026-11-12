// Flower records: the compact form a flower travels in, over the socket to
// the shared garden's server, or into localStorage when there is no server.
// The album always stays in this browser.

import { ART } from './config.js';
import { now } from './clock.js';

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

export function decode(str, length = ART * ART) {
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

export function toRecord(f) {
  return {
    id: f.id,
    nx: f.nx,
    ny: f.ny,
    colors: f.colors,
    seed: f.seed,
    tendedAt: f.tendedAt,
    pausedAt: f.pausedAt,
    pixels: encode(f.pixels),
  };
}

// Record → options for new Flower() (pixels decoded).
export const fromRecord = (r) => ({ ...r, pixels: decode(r.pixels), pixelsKey: r.pixels });

// ---------- offline fallback: this browser only ----------

// Returns null on a first visit (nothing stored yet), otherwise an array.
export function load(length) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    return JSON.parse(raw).map((r) => ({ ...r, pixels: decode(r.pixels, length) }));
  } catch {
    return null;
  }
}

export function save(flowers) {
  try {
    const t = now();
    const records = flowers.map((f) => {
      const r = toRecord(f);
      // time spent being tended doesn't count toward withering
      if (f.pausedAt != null) r.tendedAt = f.tendedAt + (t - f.pausedAt);
      r.pausedAt = null;
      return r;
    });
    localStorage.setItem(KEY, JSON.stringify(records));
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

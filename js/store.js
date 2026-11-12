// Persistence. Right now the garden lives in this browser's localStorage.
// To make one shared garden for everyone, swap load/save for calls to a
// backend that stores the same records.

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
    const records = flowers.map((f) => ({
      id: f.id,
      nx: f.nx,
      ny: f.ny,
      colors: f.colors,
      seed: f.seed,
      // time spent being tended doesn't count toward withering
      tendedAt: f.pausedAt == null ? f.tendedAt : f.tendedAt + (Date.now() - f.pausedAt),
      pixels: encode(f.pixels),
    }));
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

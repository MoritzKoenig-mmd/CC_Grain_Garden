// Fixed constants. Everything people can tweak lives in settings.js (dev mode).

// Resolution of a flower drawing (art pixels per side). Drawings are stored
// at this size and scaled up with hard edges, which gives the chunky grain.
export const ART = 144;

// Width of the "drying" edge in front of the erosion (0..1 of the noise range).
export const DRY_BAND = 0.08;

// A flower withers slowly until this much of it is gone, then falls apart
// over the last COLLAPSE_MS of its lifespan.
export const COLLAPSE_AT = 0.7;
export const COLLAPSE_MS = 3000;

export const DUST = [146, 124, 100];
export const ASH = [228, 218, 200];

// Flowers saved before each flower kept its own colours used this palette.
export const LEGACY_PALETTE = [
  '#e8141c', '#a9adf5', '#161418', '#f5a524', '#f6dc3c', '#f48cc0', '#3fae55', '#8fd3f0',
];

// The colours went neon. Flowers, album pages and settings saved with the old
// softer colours are shown in the neon version of each.
const NEON = {
  '#e8141c': '#ff1744', // red
  '#a9adf5': '#7c3aff', // lavender → violet
  '#f5a524': '#ff6a00', // orange
  '#f6dc3c': '#ffd000', // yellow
  '#f48cc0': '#ff1fb4', // pink
  '#3fae55': '#00e65c', // green
  '#8fd3f0': '#00b4ff', // light blue → sky
};
export const toNeon = (colors) => colors.map((c) => NEON[c.toLowerCase()] ?? c);

export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// [null, rgb, rgb, ...] so that pixel value v maps to colours[v - 1].
export const toRgbTable = (colors) => [null, ...colors.map(hexToRgb)];

// ---------- the shared garden ----------

// Where the socket server (server.js) runs. When server.js serves this page
// itself (npm start → localhost:3000) the socket connects to the same address.
// GitHub Pages only hosts files, so there the page has to be told where the
// server lives: put the deployed server's address here,
// e.g. 'https://grain-garden.onrender.com'.
export const PAGES_SERVER = '';
const LOCAL_PORT = '3000'; // where `npm start` runs the server

// ?server=https://… overrides it (handy for testing). Returns undefined for
// "same address as this page", or null when there is no server to talk to.
export function serverUrl() {
  const forced = new URLSearchParams(location.search).get('server');
  if (forced) return forced;
  if (location.hostname.endsWith('github.io')) return PAGES_SERVER || null;
  // opened from the file or another local server (e.g. VS Code Live Server)
  const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local && location.port !== LOCAL_PORT) return `http://localhost:${LOCAL_PORT}`;
  return undefined;
}

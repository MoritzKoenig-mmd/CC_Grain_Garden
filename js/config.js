// Fixed constants. Everything people can tweak lives in settings.js (dev mode).

// Resolution of a flower drawing (art pixels per side). Drawings are stored
// at this size and scaled up with hard edges, which gives the grain.
//
// BASE is the grid everything was first laid out on: brush radii, stem shapes,
// the seed flowers and the drawing's size on screen are all given in BASE px.
// DETAIL (the "fineness" in dev mode) splits each of those into DETAIL×DETAIL
// finer art px, so the same strokes come out with a finer grain. Each flower
// records the grid it was drawn on (js/store.js), so flowers drawn at another
// fineness are resampled to this one.
export const BASE = 144;
export const DEFAULT_DETAIL = 2;
export const DETAILS = [1, 1.5, 2, 2.5, 3];
function readDetail() {
  try {
    const saved = JSON.parse(localStorage.getItem('grain-garden/settings') || 'null');
    // a fineness picked while it was being tried out (before settings version 16) gives way to the default
    const d = (saved?.version || 0) >= 16 ? saved.detail : undefined;
    return DETAILS.includes(d) ? d : DEFAULT_DETAIL;
  } catch {
    return DEFAULT_DETAIL;
  }
}
export const ART = Math.round(BASE * readDetail());
// art px per BASE px (exact, from the rounded grid)
export const DETAIL = ART / BASE;

// Screen px per BASE px (divide by DETAIL for one art px of a drawing).
// Everything sprayed (flowers, the gate, the tree) is laid out at this one
// size; it only follows the size of the screen. The flowers' grain is DETAIL
// times finer than the gate's and the tree's.
export const artScale = (w, h) => 1.9 * Math.min(1.3, Math.max(0.5, Math.min(h / 850, w / 900)));

// Width of the "drying" edge in front of the erosion (0..1 of the noise range).
export const DRY_BAND = 0.08;


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

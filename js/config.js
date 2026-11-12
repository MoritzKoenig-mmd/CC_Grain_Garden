// Fixed constants. Everything people can tweak lives in settings.js (dev mode).

// Resolution of a flower drawing (art pixels per side). Drawings are stored
// at this size and scaled up with hard edges, which gives the chunky grain.
export const ART = 144;

// Width of the "drying" edge in front of the erosion (0..1 of the noise range).
export const DRY_BAND = 0.08;

export const DUST = [146, 124, 100];
export const ASH = [228, 218, 200];

// Flowers saved before each flower kept its own colours used this palette.
export const LEGACY_PALETTE = [
  '#e8141c', '#a9adf5', '#161418', '#f5a524', '#f6dc3c', '#f48cc0', '#3fae55', '#8fd3f0',
];

export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// [null, rgb, rgb, ...] so that pixel value v maps to colours[v - 1].
export const toRgbTable = (colors) => [null, ...colors.map(hexToRgb)];

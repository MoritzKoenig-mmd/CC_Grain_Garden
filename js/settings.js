// Everything adjustable from dev mode. Stored in this browser's localStorage.

import { toNeon, DEFAULT_DETAIL, DETAIL } from './config.js';

const KEY = 'grain-garden/settings';
const VERSION = 16;

export const DEFAULTS = {
  version: VERSION,
  background: '#ffffff',
  grain: 0, // film grain overlay strength, 0..0.6
  lifespanMin: 10, // minutes for an untended flower to wither away
  // The petals wither first, slowly, until only fastAt (0..1) of them is left;
  // that last bit goes quickly, in fastMs. The stem stays fresh all the while,
  // and once the petals are gone it withers in stemMs. From then on the flower
  // is past saving: it can't be opened and redrawn any more.
  fastAt: 0.1,
  fastMs: 3000,
  stemMs: 3000,
  colorPer: 'stroke', // new random colour every 'stroke', or one per 'flower'
  brushPer: 'flower', // random brush size once per 'flower', or every 'stroke'
  // neon: saturated enough to shine, deep enough to hold up on white
  colors: ['#ff1744', '#ff1fb4', '#ff6a00', '#ffd000', '#00e65c', '#00b4ff', '#2d5bff', '#7c3aff'],
  brushes: [2.6, 4.2, 6.2], // brush radii in BASE px (js/config.js), whatever the fineness
  // How fine the grain is: each BASE px of a drawing is split into detail×detail
  // art px (one of DETAILS in js/config.js). Read when the page loads.
  detail: DEFAULT_DETAIL,
  // how each speck lands (see FRINGE in js/brush.js)
  brushSpread: 0.42, // width of a stroke's dense core, in brush radii
  brushDensity: 1.7, // specks per art px² of the brush
  brushSpeck: 1, // size of one speck, in art px
  sprayAmount: 0.01, // share of each stroke's specks that stray out around it, 0..0.9
  // how far each brush's stray specks reach, as a multiple of its radius (one per brush)
  sprayRanges: [0.5, 0.5, 0.3],
  albumColumns: 3, // how many columns the album lays its flowers out in
  albumGap: 15, // px of empty space above and below the album's paper
  albumTitleSpace: 63, // px from the top of the album's paper to the word "album"
  // the fine spray on the album's words (#spray-fine in index.html)
  textSpray: {
    thick: 1.1, // px each letter is thickened by
    soft: 0.85, // how soft its edge is before the grain breaks it up
    grain: 1.15, // how fine the specks are (higher is finer)
    ink: 1.02, // how much of each letter survives (higher keeps more)
  },
  stems: true, // new drawings start with one of the predefined stems
  stemColor: '#00e65c',
  tools: { erase: false, undo: false, clear: false }, // which studio tools are shown
  beeSize: 44, // width of the bee cursor in screen px
  beeFollow: true, // the bee flies along the pointer's trail instead of being the pointer
  beeOffset: 70, // how far behind the pointer, along its trail, the following bee flies (px)
  beeSmooth: 0.18, // how long the following bee takes to catch up (s); 0 is no smoothing
};

const BLACK = '#161418';
const clone = (o) => JSON.parse(JSON.stringify(o));

// Bring settings saved by older versions of the site up to date.
function migrate(saved) {
  // old lavender and off-white defaults
  if (['#b4b8e0', '#f3efe7'].includes(saved.background)) delete saved.background;
  delete saved.depthScale; // every flower is drawn at the same size now
  delete saved.stemWitherAt; // the stem now waits for the petals (fastAt, fastMs, stemMs)
  delete saved.stemAfterMs;
  // the film grain was turned down; drop the old saved strength
  if ((saved.version || 0) < 6) delete saved.grain;
  // the bee follows the pointer by default now, a little further back
  if ((saved.version || 0) < 7) {
    delete saved.beeFollow;
    delete saved.beeOffset;
  }
  // the spray defaults went down; settings saved with the old ones take the new
  if ((saved.version || 0) < 8) {
    if (saved.sprayAmount === 0.05) delete saved.sprayAmount;
    if (saved.sprayRange === 0.95) delete saved.sprayRange;
  }
  // the fineness went to 2× by default; one picked while trying it out takes it
  if ((saved.version || 0) < 16) delete saved.detail;
  // the brushes got new default sizes; settings saved with the old ones take them
  if ((saved.version || 0) < 14 && JSON.stringify(saved.brushes) === '[2.6,4.6,8]') delete saved.brushes;
  // the room above the album's title went down to 63 px
  if ((saved.version || 0) < 13 && saved.albumTitleSpace === 96) delete saved.albumTitleSpace;
  // the album words' spray got new defaults; settings saved with the old ones take them
  const t = saved.textSpray;
  if ((saved.version || 0) < 12 && t && t.thick === 1 && t.soft === 0.9 && t.grain === 0.9 && t.ink === 0.95) delete saved.textSpray;
  // the album's gap went down to 15 px; settings saved with the old 48 take it
  if ((saved.version || 0) < 11 && saved.albumGap === 48) delete saved.albumGap;
  // the album went to three columns by default; settings saved with the old one take it
  if ((saved.version || 0) < 10 && saved.albumColumns === 1) delete saved.albumColumns;
  // the spray range went from one for all brushes to one per brush
  if ((saved.version || 0) < 9) delete saved.sprayRange;
  if ((saved.version || 0) < 4) {
    // the palette went neon
    if (Array.isArray(saved.colors)) saved.colors = toNeon(saved.colors);
    if (typeof saved.stemColor === 'string') [saved.stemColor] = toNeon([saved.stemColor]);
  }
  if (!saved.version || saved.version < 2) {
    // black is out, and colours now change with every stroke
    if (Array.isArray(saved.colors)) {
      saved.colors = saved.colors.filter((c) => c.toLowerCase() !== BLACK);
      if (!saved.colors.length) delete saved.colors;
    }
    delete saved.randomPer;
  }
  saved.version = VERSION;
  return saved;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return clone(DEFAULTS);
    migrate(saved);
    const merged = { ...clone(DEFAULTS), ...saved };
    merged.tools = { ...DEFAULTS.tools, ...(saved.tools || {}) };
    merged.textSpray = { ...DEFAULTS.textSpray, ...(saved.textSpray || {}) };
    return merged;
  } catch {
    return clone(DEFAULTS);
  }
}

export const settings = load();
const listeners = new Set();

export function update(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
  listeners.forEach((fn) => fn(settings));
}

export const reset = () => update(clone(DEFAULTS));
export const onSettings = (fn) => listeners.add(fn);
export const lifespanMs = () => Math.max(0.05, settings.lifespanMin) * 60 * 1000;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// The stem's colour is the stem's alone: it's how a flower knows which of its
// pixels are stem (they wither last), so nothing else is drawn in it.
export const isStemColor = (hex) => hex.toLowerCase() === settings.stemColor.toLowerCase();

// A random colour, never the stem's, and never the same as `previous` when
// there is a choice.
export function randomColor(previous) {
  const all = settings.colors.length ? settings.colors : ['#e8141c'];
  const free = all.filter((c) => !isStemColor(c));
  const list = free.length ? free : ['#e8141c'];
  const others = list.filter((c) => c !== previous);
  return pick(others.length ? others : list);
}
// How a drawn stroke is sprayed, as sprayStamp takes it.
export const sprayFringe = (range) => ({
  amount: settings.sprayAmount,
  range,
  spread: settings.brushSpread,
  density: settings.brushDensity,
  speck: settings.brushSpeck,
});

// The spray range of brush i (brushes added before it had one get the usual).
export const sprayRangeOf = (i) => (Number.isFinite(settings.sprayRanges?.[i]) ? settings.sprayRanges[i] : 0.5);

// A random brush: its radius (in art px, at this page's fineness) and its spray range.
export function randomBrush() {
  if (!settings.brushes.length) return { r: 4.2 * DETAIL, range: 0.5 };
  const i = Math.floor(Math.random() * settings.brushes.length);
  return { r: settings.brushes[i] * DETAIL, range: sprayRangeOf(i) };
}

// Everything adjustable from dev mode. Stored in this browser's localStorage.

import { toNeon } from './config.js';

const KEY = 'grain-garden/settings';
const VERSION = 8;

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
  brushes: [2.6, 4.6, 8], // brush radii in art pixels
  sprayAmount: 0.01, // share of each stroke's specks that stray out around it, 0..0.9
  sprayRange: 0.5, // how far the stray specks reach, as a multiple of the brush radius
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
// The spray around a drawn stroke, as sprayStamp takes it.
export const sprayFringe = () => ({ amount: settings.sprayAmount, range: settings.sprayRange });
export const randomBrush = () => pick(settings.brushes.length ? settings.brushes : [4.6]);

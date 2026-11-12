// Everything adjustable from dev mode. Stored in this browser's localStorage.

const KEY = 'grain-garden/settings';
const VERSION = 2;

export const DEFAULTS = {
  version: VERSION,
  background: '#f3efe7', // off-white
  grain: 0.2, // film grain overlay strength, 0..0.6
  depthScale: true, // flowers lower on screen (closer) are drawn bigger
  lifespanMin: 10, // minutes for an untended flower to wither away
  colorPer: 'stroke', // new random colour every 'stroke', or one per 'flower'
  brushPer: 'flower', // random brush size once per 'flower', or every 'stroke'
  colors: ['#e8141c', '#a9adf5', '#f5a524', '#f6dc3c', '#f48cc0', '#3fae55', '#8fd3f0'],
  brushes: [2.6, 4.6, 8], // brush radii in art pixels
  stems: true, // new drawings start with one of the predefined stems
  stemColor: '#3fae55',
  tools: { erase: false, undo: false, clear: false }, // which studio tools are shown
};

const BLACK = '#161418';
const clone = (o) => JSON.parse(JSON.stringify(o));

// Bring settings saved by older versions of the site up to date.
function migrate(saved) {
  if (saved.background === '#b4b8e0') delete saved.background; // old lavender default
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

// A random colour, never the same as `previous` when there is a choice.
export function randomColor(previous) {
  const list = settings.colors.length ? settings.colors : ['#e8141c'];
  const others = list.filter((c) => c !== previous);
  return pick(others.length ? others : list);
}
export const randomBrush = () => pick(settings.brushes.length ? settings.brushes : [4.6]);

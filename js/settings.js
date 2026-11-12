// Everything adjustable from dev mode. In the shared garden these live on the
// server and apply to everyone; offline they stay in this browser's localStorage.

import { toNeon } from './config.js';

const KEY = 'grain-garden/settings';
const VERSION = 4;

export const DEFAULTS = {
  version: VERSION,
  background: '#ffffff',
  grain: 0.2, // film grain overlay strength, 0..0.6
  lifespanMin: 10, // minutes for an untended flower to wither away
  colorPer: 'stroke', // new random colour every 'stroke', or one per 'flower'
  brushPer: 'flower', // random brush size once per 'flower', or every 'stroke'
  // neon: saturated enough to shine, deep enough to hold up on white
  colors: ['#ff1744', '#ff1fb4', '#ff6a00', '#ffd000', '#00e65c', '#00b4ff', '#2d5bff', '#7c3aff'],
  brushes: [2.6, 4.6, 8], // brush radii in art pixels
  stems: true, // new drawings start with one of the predefined stems
  stemColor: '#00e65c',
  tools: { erase: false, undo: false, clear: false }, // which studio tools are shown
};

const BLACK = '#161418';
const clone = (o) => JSON.parse(JSON.stringify(o));

// Bring settings saved by older versions of the site up to date.
function migrate(saved) {
  // old lavender and off-white defaults
  if (['#b4b8e0', '#f3efe7'].includes(saved.background)) delete saved.background;
  delete saved.depthScale; // every flower is drawn at the same size now
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

// When the garden is shared, `remote` sends a change to the server.
let remote = null;
export const setRemote = (fn) => (remote = fn);
export const isShared = () => !!remote;

export function update(patch) {
  Object.assign(settings, patch);
  if (remote) remote(patch);
  else {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {}
  }
  listeners.forEach((fn) => fn(settings));
}

// Take the garden-wide settings from the server (defaults fill the gaps).
export function replaceAll(shared = {}) {
  const merged = { ...clone(DEFAULTS), ...migrate({ ...shared, version: shared.version || VERSION }) };
  merged.tools = { ...DEFAULTS.tools, ...(shared.tools || {}) };
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, merged);
  listeners.forEach((fn) => fn(settings));
}

// The dev key unlocks changing the shared settings (DEV_KEY on the server).
const DEV_KEY_STORE = 'grain-garden/devkey';
export function devKey() {
  try {
    return localStorage.getItem(DEV_KEY_STORE) || '';
  } catch {
    return '';
  }
}
export function setDevKey(k) {
  try {
    localStorage.setItem(DEV_KEY_STORE, k);
  } catch {}
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

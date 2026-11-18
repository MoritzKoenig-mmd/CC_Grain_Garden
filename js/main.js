import { ART } from './config.js';
import { Flower } from './flower.js';
import { Garden } from './garden.js';
import { Studio } from './studio.js';
import { DevPanel } from './dev.js';
import { Album } from './album.js';
import { Intro } from './intro.js';
import { TreeScene } from './tree.js';
import { TreePlace, GatePlace } from './places.js';
import { seedFlowers } from './seed.js';
import { settings, onSettings, lifespanMs } from './settings.js';
import * as store from './store.js';

// ---------- static film grain ----------
// Two tiles: dark specks to multiply over light backgrounds, light specks to
// screen over dark ones. Generated once, never moves.
function grainTile(dark) {
  const n = 256;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(n, n);
  for (let j = 0; j < img.data.length; j += 4) {
    const r = Math.random();
    const k = r * r * 170; // mostly faint, a few strong specks
    const v = dark ? 255 - k : k;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return `url(${c.toDataURL()})`;
}
const GRAIN = { light: grainTile(true), dark: grainTile(false) };

// ---------- page-level settings ----------
function applyLook() {
  document.querySelector(".grain").style.opacity = String(settings.grain);
  const n = parseInt(settings.background.slice(1), 16);
  const lum = 0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255);
  document.documentElement.dataset.dark = String(lum < 110);
  const grain = document.querySelector(".grain");
  grain.style.backgroundImage = lum < 110 ? GRAIN.dark : GRAIN.light;
  grain.style.mixBlendMode = lum < 110 ? "screen" : "multiply";
  document.body.style.background = settings.background;
}

// ---------- wiring ----------

const save = () => store.save(garden.flowers);

const garden = new Garden(document.getElementById('garden'), {
  onTend(flower) {
    const now = Date.now();
    flower.pause(now); // tending holds back the withering
    studio.open(flower, flower.remaining(now));
    settle();
  },
  onChange: save,
});

const studio = new Studio({
  onPlant(pixels, colors, flower) {
    settle();
    if (!flower) {
      garden.plant(pixels, colors);
      return;
    }
    if (!pixels.some((v) => v)) {
      garden.remove(flower);
      return;
    }
    flower.tend(pixels, colors, Date.now());
    save();
  },
  onLeave(flower) {
    settle();
    if (flower) flower.resume(Date.now());
  },
  // keeping a flower picks it: into the album, out of the garden
  onKeep(pixels, colors, flower) {
    if (!album.add(pixels, colors)) return false;
    garden.remove(flower);
    return true;
  },
});

const album = new Album({ onOpen: () => settle(), onClose: () => settle() });

document.getElementById('draw').addEventListener('click', () => {
  studio.open(null);
  settle();
});

let records = store.load(ART * ART);
if (records === null) records = seedFlowers();
garden.setFlowers(records.map((r) => new Flower(r)));
save();

// When the withering speed changes, every flower keeps how far along it is.
let lastLifespan = lifespanMs();
onSettings(() => {
  applyLook();
  const next = lifespanMs();
  if (next !== lastLifespan) {
    const now = Date.now();
    for (const f of garden.flowers) {
      const at = f.pausedAt ?? now;
      const progress = (at - f.tendedAt) / lastLifespan;
      f.tendedAt = at - progress * next;
    }
    lastLifespan = next;
    save();
  }
});

applyLook();
new DevPanel();

// keep the stored state fresh if the tab is closed mid-tend
window.addEventListener('pagehide', save);

// ---------- the world ----------

// Three places, joined up: the gate (the way in), the garden, and the tree at
// the back of it. The gate and the tree are laid over the garden, growing in
// when you go to them and withering away when you leave (scene.js). Each place
// has its own address, so the browser's back and forward walk between them:
// the gate is the bare address, the others are #garden and #tree. /#draw opens
// straight into the studio and /#album into the album, both in the garden.

const dock = document.querySelector('.dock');
const ways = document.querySelector('.places');

const intro = new Intro(document.getElementById('intro'), { onEnter: () => go('garden') });
const tree = new TreeScene(document.getElementById('tree'), { onBack: () => go('garden') });
const scenes = { gate: intro, tree };

const toTree = new TreePlace(document.getElementById('to-tree'), () => go('tree'));
const toGate = new GatePlace(document.getElementById('to-gate'), () => go('gate'));
for (const place of [toTree, toGate]) place.ready.then(() => garden.addPlace(place), () => {});

const placeOf = (hash) => (hash === '#tree' ? 'tree' : ['#garden', '#draw', '#album'].includes(hash) ? 'garden' : 'gate');
const addressOf = (place) => (place === 'gate' ? location.pathname + location.search : `#${place}`);

let here = placeOf(location.hash);

// The garden only answers when it's the place you're in and nothing's open on it.
function settle() {
  const inGarden = here === 'garden';
  garden.active = inGarden && !studio.isOpen && !album.isOpen;
  dock.inert = !inGarden;
  ways.inert = !inGarden;
}

function go(place, { remember = true } = {}) {
  if (place === here) return;
  const from = here;
  here = place;
  if (remember) history.pushState(null, '', addressOf(place));
  for (const [name, scene] of Object.entries(scenes)) {
    if (name === place) scene.show();
    else scene.hide();
  }
  settle();
  // back in the garden by keyboard: carry on from the way you went out
  if (place === 'garden') ({ tree: toTree, gate: toGate })[from]?.button.focus({ preventScroll: true });
}

window.addEventListener('popstate', () => go(placeOf(location.hash), { remember: false }));

// where this visit starts
for (const [name, scene] of Object.entries(scenes)) {
  if (name === here) scene.show({ instant: true });
  else scene.hide({ instant: true });
}
if (location.hash === '#draw') studio.open(null);
else if (location.hash === '#album') album.open();
settle();

// handy for poking at the garden from the console
window.__garden = garden;
window.__studio = studio;
window.__album = album;
window.__go = go;

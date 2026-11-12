import { ART, toRgbTable } from './config.js';
import { Flower } from './flower.js';
import { Garden } from './garden.js';
import { Studio } from './studio.js';
import { DevPanel } from './dev.js';
import { Album } from './album.js';
import { sprayStamp, bufferToImage } from './brush.js';
import { seedFlowers } from './seed.js';
import { settings, onSettings, lifespanMs, randomColor } from './settings.js';
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

// ---------- grainy dot on the draw button, in a colour from the hat ----------
function drawDot() {
  const c = document.querySelector('#draw .dot');
  const buf = new Uint8Array(c.width * c.height);
  for (let i = 0; i < 3; i++) sprayStamp(buf, c.width, 5.5, 5.5, 4.2, 1);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  bufferToImage(buf, img, toRgbTable([randomColor()]));
  ctx.putImageData(img, 0, 0);
}

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
    garden.active = false;
    studio.open(flower, flower.remaining(now));
  },
  onChange: save,
});

const studio = new Studio({
  onPlant(pixels, colors, flower) {
    garden.active = true;
    drawDot();
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
    garden.active = true;
    if (flower) flower.resume(Date.now());
  },
  onKeep: (pixels, colors) => album.add(pixels, colors),
});

const album = new Album({
  onOpen() {
    garden.active = false;
  },
  onClose() {
    garden.active = true;
  },
});

document.getElementById('draw').addEventListener('click', () => {
  garden.active = false;
  studio.open(null);
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
drawDot();
new DevPanel();

// keep the stored state fresh if the tab is closed mid-tend
window.addEventListener('pagehide', save);

// /#draw opens straight into the studio, /#album into the album
if (location.hash === '#draw') {
  garden.active = false;
  studio.open(null);
} else if (location.hash === '#album') {
  album.open();
}

// handy for poking at the garden from the console
window.__garden = garden;
window.__studio = studio;
window.__album = album;

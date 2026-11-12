import { ART, toRgbTable } from './config.js';
import { Flower } from './flower.js';
import { Garden } from './garden.js';
import { Studio } from './studio.js';
import { DevPanel } from './dev.js';
import { Album } from './album.js';
import { sprayStamp, bufferToImage } from './brush.js';
import { seedFlowers } from './seed.js';
import {
  settings, onSettings, lifespanMs, randomColor, setRemote, replaceAll, isShared, devKey,
} from './settings.js';
import { now as clockNow, syncClock } from './clock.js';
import { connect } from './net.js';
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

// Replaced by the real connection below; until then (and offline) emits go nowhere.
let net = { online: false, emit() {} };

// Offline (no server reachable) the garden is kept in this browser instead.
const save = () => {
  if (!net.online) store.save(garden.flowers);
};

// Drags are shared live, but at most ~20 times a second per flower.
const lastSent = new Map();
function sendMove(f, final) {
  if (!net.online) return;
  const t = performance.now();
  if (!final && t - (lastSent.get(f.id) || 0) < 50) return;
  lastSent.set(f.id, t);
  net.emit('move', { id: f.id, nx: f.nx, ny: f.ny });
}

function share(event, flower) {
  const r = store.toRecord(flower);
  flower.pixelsKey = r.pixels;
  net.emit(event, r);
}

const garden = new Garden(document.getElementById('garden'), {
  onTend(flower) {
    const now = clockNow();
    flower.pause(now); // tending holds back the withering, for everyone
    net.emit('pause', flower.id);
    garden.active = false;
    studio.open(flower, flower.remaining(now));
  },
  onChange: save,
  onMove: sendMove,
});

const studio = new Studio({
  onPlant(pixels, colors, flower) {
    garden.active = true;
    drawDot();
    // someone else's flower may have withered away while this one was redrawn
    if (flower && !garden.flowers.includes(flower)) flower = null;
    if (!flower) {
      share('plant', garden.plant(pixels, colors));
      return;
    }
    if (!pixels.some((v) => v)) {
      garden.remove(flower);
      net.emit('remove', flower.id);
      return;
    }
    flower.tend(pixels, colors, clockNow());
    share('tend', flower);
    save();
  },
  onLeave(flower) {
    garden.active = true;
    if (!flower) return;
    flower.resume(clockNow());
    net.emit('resume', flower.id);
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

const dev = new DevPanel();

// ---------- the shared garden (socket.io, see server.js) ----------

net = connect({
  // like the template's history: the whole garden, on every (re)connect
  onState(s) {
    syncClock(s.serverNow);
    setRemote((patch) => net.emit('settings', { key: devKey(), patch }));
    replaceAll(s.settings);
    garden.setFlowers(s.flowers.map((r) => new Flower(store.fromRecord(r))));
    // the very first visitor plants the starter flowers for everyone
    if (!s.seeded) {
      const seeds = seedFlowers().map((r) => ({ ...store.toRecord(new Flower(r)), age: r.age }));
      net.emit('seed', seeds);
    }
    dev.setStatus(true);
  },
  onFlower(r) {
    const f = garden.byId(r.id);
    if (f) {
      f.applyRecord(r, { keepPlace: garden.dragging === f });
      garden.resort();
    } else {
      garden.add(new Flower(store.fromRecord(r)));
    }
  },
  onMove(m) {
    const f = garden.byId(m.id);
    if (!f || garden.dragging === f) return; // my own drag wins on my screen
    f.nx = m.nx;
    f.ny = m.ny;
    garden.resort();
  },
  onRemove(id) {
    const f = garden.byId(id);
    if (f) garden.remove(f);
  },
  onSettings: (s) => replaceAll(s),
  onPresence: (n) => dev.setPresence(n),
  onDenied: () => dev.denied(),
  onStatus: (connected) => dev.setStatus(connected),
  onOffline() {
    let records = store.load(ART * ART);
    if (records === null) records = seedFlowers();
    garden.setFlowers(records.map((r) => new Flower(r)));
    save();
    dev.setStatus(false);
  },
});

// When the withering speed changes, every flower keeps how far along it is
// (in the shared garden the server does this for everyone).
let lastLifespan = lifespanMs();
onSettings(() => {
  applyLook();
  const next = lifespanMs();
  if (next !== lastLifespan && !isShared()) {
    const now = clockNow();
    for (const f of garden.flowers) {
      const at = f.pausedAt ?? now;
      const progress = (at - f.tendedAt) / lastLifespan;
      f.tendedAt = at - progress * next;
    }
    save();
  }
  lastLifespan = next;
});

applyLook();
drawDot();

// keep the stored state fresh if the tab is closed mid-tend (offline only)
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

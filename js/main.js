import { Flower } from './flower.js';
import { Garden } from './garden.js';
import { Studio } from './studio.js';
import { DevPanel } from './dev.js';
import { Bee } from './bee.js';
import { OtherBees } from './bees.js';
import { Album } from './album.js';
import { Intro } from './intro.js';
import { TreeScene } from './tree.js';
import { TreePlace, GatePlace } from './places.js';
import { seedFlowers } from './seed.js';
import { settings, onSettings, lifespanMs, update, DEFAULTS } from './settings.js';
import * as store from './store.js';
import { connect } from './shared.js';

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
  applyTextSpray();
}

// The fine spray on the album's words, as set in dev mode.
function applyTextSpray() {
  const f = document.getElementById('spray-fine');
  if (!f) return;
  const { thick, soft, grain, ink } = settings.textSpray;
  f.querySelector('feMorphology').setAttribute('radius', String(thick));
  f.querySelector('feGaussianBlur').setAttribute('stdDeviation', String(soft));
  f.querySelector('feTurbulence').setAttribute('baseFrequency', String(grain));
  f.querySelector('feComposite[operator="arithmetic"]').setAttribute('k4', String(ink));
}

// ---------- one garden for everyone ----------

// The garden lives in a shared room (js/shared.js) that everyone's garden
// follows. Until it answers, nothing is shown (the gate covers the garden on
// arrival anyway); if it can't be reached, this browser gardens alone, in its
// own localStorage, the way it used to.
let mode = 'connecting'; // → 'shared' | 'alone'
let room = null;
const early = []; // flowers planted before the room answered

// localStorage keeps only the garden of someone gardening alone, so the shared
// garden never overwrites it
const save = () => {
  if (mode === 'alone') store.save(garden.flowers);
};

// Something happened to some flowers here: tell the room.
function changed(kind, flowers) {
  if (mode === 'alone') return save();
  if (mode === 'connecting') {
    for (const f of flowers) {
      const i = early.indexOf(f);
      if (kind === 'plant') early.push(f);
      else if (kind !== 'move' && i >= 0) early.splice(i, 1);
    }
    return;
  }
  if (kind === 'plant') room.flowers.putMany(flowers.map(store.toRecord));
  else if (kind === 'move') room.flowers.patch(Object.fromEntries(flowers.map((f) => [f.id, { nx: f.nx, ny: f.ny }])));
  else for (const f of flowers) room.flowers.remove(f.id);
}

// A flower was redrawn here.
function redrawn(f) {
  if (mode === 'shared') room.flowers.put(store.toRecord(f));
  else save();
}

// The room changed (anyone's doing, ours included): make the garden match it.
function fromRoom(records) {
  const here = new Map(garden.flowers.map((f) => [f.id, f]));
  const next = [];
  for (const r of Object.values(records)) {
    if (!store.isRecord(r)) continue;
    try {
      let f = here.get(r.id);
      if (!f) {
        f = new Flower({ ...r, pixels: store.decodeGrid(r.pixels, store.sizeOf(r)) });
      } else {
        if (f.rev !== r.rev) f.replace({ ...r, pixels: store.decodeGrid(r.pixels, store.sizeOf(r)) });
        // being tended here, its clock is held back until we let go of it
        else if (f.pausedAt == null) f.tendedAt = r.tendedAt;
        // the one we're carrying stays in our hand
        if (f !== garden.dragging) Object.assign(f, { nx: r.nx, ny: r.ny });
      }
      next.push(f);
    } catch {
      /* a record we can't read: leave it out */
    }
  }
  garden.setFlowers(next);
}

// The withering settings are the room's, so a flower withers on the same
// clock for everyone.
const WITHERING = ['lifespanMin', 'fastAt', 'fastMs', 'stemMs'];
const witheringOf = (s) => Object.fromEntries(WITHERING.map((k) => [k, s[k]]));
let fromTheRoom = false; // a settings change that came from the room, not from here

function witheringFromRoom(values) {
  const patch = {};
  for (const k of WITHERING) if (Number.isFinite(values[k]) && values[k] !== settings[k]) patch[k] = values[k];
  if (!Object.keys(patch).length) return;
  fromTheRoom = true;
  try {
    update(patch);
  } finally {
    fromTheRoom = false;
  }
}

async function joinRoom() {
  try {
    room = await connect();
  } catch (err) {
    console.info('[garden] the shared garden is out of reach, gardening alone:', err?.message || err);
    gardenAlone();
    return;
  }
  // a new room starts with the default withering
  const w = room.withering.get();
  if (WITHERING.some((k) => !Number.isFinite(w[k]))) room.withering.set(witheringOf(DEFAULTS));
  witheringFromRoom(room.withering.get());

  mode = 'shared';
  // a brand-new room gets a few flowers, so the first visitor isn't alone
  if (!room.meta.get().seeded && !Object.keys(room.flowers.get()).length) {
    room.meta.set({ seeded: true });
    room.flowers.putMany(seedFlowers().map((r) => store.toRecord(new Flower(r))));
  }
  room.flowers.putMany(early.splice(0).map(store.toRecord));
  fromRoom(room.flowers.get());
  room.flowers.onChange(fromRoom);
  room.withering.onChange(witheringFromRoom);
  // the album is everyone's too
  album.useRoom(room.album);
  // and everyone else's bees, wherever we are both
  new OtherBees(room.people, bee, () => (studio.isOpen ? 'studio' : album.isOpen ? 'album' : here), garden);
  console.info('[garden] in the shared garden');
}

// Every flower out of the garden (from dev mode): out of everyone's, in the
// shared garden. It stays empty; it isn't sown again with the first flowers.
function clearGarden() {
  early.length = 0;
  if (mode === 'shared') room.flowers.clear();
  else {
    garden.setFlowers([]);
    save();
  }
}

function gardenAlone() {
  mode = 'alone';
  let records = store.load();
  if (records === null) records = seedFlowers();
  garden.setFlowers([...records.map((r) => new Flower(r)), ...early.splice(0)]);
  save();
}

// ---------- wiring ----------

const garden = new Garden(document.getElementById('garden'), {
  onTend(flower) {
    const now = Date.now();
    flower.pause(now); // tending holds back the withering
    studio.open(flower, flower.remaining(now));
    settle();
  },
  onChange: changed,
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
    redrawn(flower);
  },
  onLeave(flower) {
    settle();
    if (!flower) return;
    flower.resume(Date.now());
    // the time spent tending it doesn't count, for anyone
    if (mode === 'shared') room.flowers.patch({ [flower.id]: { tendedAt: flower.tendedAt } });
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

joinRoom();

// When the withering speed is changed here, every flower keeps how far along
// it is, for everyone. (A change from the room comes with the flowers' clocks
// already moved by whoever made it.)
let lastLifespan = lifespanMs();
onSettings(() => {
  applyLook();
  const next = lifespanMs();
  if (next !== lastLifespan && !fromTheRoom) {
    const now = Date.now();
    for (const f of garden.flowers) {
      const at = f.pausedAt ?? now;
      const progress = (at - f.tendedAt) / lastLifespan;
      f.tendedAt = at - progress * next;
    }
    if (mode === 'shared') room.flowers.patch(Object.fromEntries(garden.flowers.map((f) => [f.id, { tendedAt: f.pausedAt == null ? f.tendedAt : f.tendedAt + (now - f.pausedAt) }])));
    else save();
  }
  lastLifespan = next;
  if (mode === 'shared' && !fromTheRoom) {
    const mine = witheringOf(settings);
    const theirs = room.withering.get();
    if (WITHERING.some((k) => mine[k] !== theirs[k])) room.withering.set(mine);
  }
});

applyLook();
new DevPanel({ exportAlbum: () => album.downloadPng(), clearGarden, clearAlbum: () => album.clear() });
const bee = new Bee();

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

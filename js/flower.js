import { ART, DRY_BAND, DUST, ASH, LEGACY_PALETTE, COLLAPSE_AT, COLLAPSE_MS, toRgbTable, toNeon } from "./config.js";
import { lifespanMs } from "./settings.js";
import { now as clockNow } from './clock.js';
import { decode } from './store.js';
import { makeWitherField, randomSeed } from './noise.js';
import { addGlow } from './glow.js';

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export class Flower {
  constructor({ id, nx, ny, seed, tendedAt, pausedAt, pixels, pixelsKey, colors }) {
    this.id = id || Math.random().toString(36).slice(2, 10);
    this.nx = nx;
    this.ny = ny;
    this.seed = seed ?? randomSeed();
    this.tendedAt = tendedAt ?? clockNow();
    // pixel value v is drawn in colors[v - 1]; each flower keeps its own
    this.colors = toNeon(colors && colors.length ? colors : LEGACY_PALETTE);
    this.pixels = pixels;
    this.pixelsKey = pixelsKey || null; // encoded pixels as last received, to spot redraws
    this.pausedAt = pausedAt ?? null;
    this.phase = Math.random() * Math.PI * 2;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ART;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(ART, ART);

    this.#rebuild();
  }

  #rebuild() {
    this.rgb = toRgbTable(this.colors);
    Object.assign(this, makeWitherField(ART, this.seed));
    this.level = -1;
    this.#measure();
  }

  // Bounding box of the drawing, used to stand it on the ground.
  #measure() {
    let minX = ART, minY = ART, maxX = -1, maxY = -1;
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        if (!this.pixels[y * ART + x]) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) { minX = minY = 0; maxX = maxY = ART - 1; }
    this.box = { minX, minY, maxX, maxY, cx: (minX + maxX + 1) / 2, bottom: maxY + 1 };
  }

  // How far gone the flower is, 0..1. It withers slowly up to COLLAPSE_AT over
  // most of its lifespan, then the rest falls apart in its last few seconds.
  // Only depends on time, so it picks up where it was after a reload.
  witherAt(now) {
    const age = (this.pausedAt ?? now) - this.tendedAt;
    if (age <= 0) return 0;
    const life = lifespanMs();
    const fall = Math.min(COLLAPSE_MS, life * 0.25); // very short dev lifespans still wither first
    const slow = life - fall;
    if (age < slow) return (COLLAPSE_AT * age) / slow;
    return Math.min(1, COLLAPSE_AT + ((1 - COLLAPSE_AT) * (age - slow)) / fall);
  }

  isGone(now) {
    return this.witherAt(now) >= 1;
  }

  // Repaint the sprite only when the wither level has visibly moved.
  update(now) {
    const w = Math.round(this.witherAt(now) * 600) / 600;
    if (w === this.level) return;
    this.level = w;
    this.#paint(w);
  }

  #paint(w) {
    const { pixels, field, grainA, grainB } = this;
    const d = this.img.data;
    // the whole flower fades toward dust as it ages
    const fade = Math.pow(w, 1.4) * 0.45;
    const live = this.rgb.map((c) => c && mix(c, DUST, fade));
    const dry = this.rgb.map((c) => c && mix(c, DUST, 0.62));

    for (let i = 0, j = 0; i < pixels.length; i++, j += 4) {
      const v = pixels[i];
      const f = field[i];
      if (!v || f <= w) {
        d[j + 3] = 0;
        continue;
      }
      let c = live[v];
      if (w > 0 && f < w + DRY_BAND) {
        // inside the drying edge: the closer to the erosion, the more grains turn
        const t = (f - w) / DRY_BAND;
        if (grainA[i] > t) c = grainB[i] < 0.4 ? ASH : dry[v];
      }
      d[j] = c[0];
      d[j + 1] = c[1];
      d[j + 2] = c[2];
      d[j + 3] = 255;
    }
    addGlow(d, ART, ART);
    this.ctx.putImageData(this.img, 0, 0);
  }

  // What is still standing right now (for tending in the studio).
  remaining(now) {
    const w = this.witherAt(now);
    const out = new Uint8Array(this.pixels.length);
    for (let i = 0; i < out.length; i++) {
      if (this.pixels[i] && this.field[i] > w) out[i] = this.pixels[i];
    }
    return out;
  }

  pause(now) {
    if (this.pausedAt == null) this.pausedAt = now;
  }

  resume(now) {
    if (this.pausedAt == null) return;
    this.tendedAt += now - this.pausedAt;
    this.pausedAt = null;
  }

  // Someone redrew it: new body, fresh life, new pattern of decay.
  tend(pixels, colors, now) {
    this.pixels = pixels;
    this.colors = colors;
    this.tendedAt = now;
    this.pausedAt = null;
    this.seed = randomSeed();
    this.#rebuild();
  }

  // Take on an update from the server: someone else moved, paused or redrew it.
  applyRecord(r, { keepPlace = false } = {}) {
    if (!keepPlace) {
      this.nx = r.nx;
      this.ny = r.ny;
    }
    this.tendedAt = r.tendedAt;
    this.pausedAt = r.pausedAt ?? null;
    if (r.pixels && (r.pixels !== this.pixelsKey || r.seed !== this.seed)) {
      this.pixels = decode(r.pixels);
      this.pixelsKey = r.pixels;
      this.colors = toNeon(r.colors && r.colors.length ? r.colors : LEGACY_PALETTE);
      this.seed = r.seed;
      this.#rebuild();
    }
    this.level = -1; // repaint at the (possibly new) wither level
  }

  hitTest(lx, ly) {
    const ix = Math.floor(lx);
    const iy = Math.floor(ly);
    const R = 4;
    for (let dy = -R; dy <= R; dy++) {
      const y = iy + dy;
      if (y < 0 || y >= ART) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = ix + dx;
        if (x < 0 || x >= ART) continue;
        const i = y * ART + x;
        if (this.pixels[i] && this.field[i] > this.level) return true;
      }
    }
    return false;
  }
}

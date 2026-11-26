import { ART, DRY_BAND, DUST, ASH, LEGACY_PALETTE, toRgbTable, toNeon } from "./config.js";
import { settings, lifespanMs, isStemColor } from "./settings.js";
import { makeWitherField, makeDissolveField, randomSeed } from './noise.js';
import { growStem } from './stems.js';

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Paint a palette drawing into RGBA data as it looks at wither level w (0..1):
// gone where its field has dropped below w, a grainy drying edge in front of
// that, and everything left fading toward dust. Flowers use it, and so does
// the gate on the way in. With `stem` ({ mask, w }), the pixels in its mask
// are painted at its own level instead.
export function paintWithered(d, pixels, rgb, { field, grainA, grainB }, w, stem = null) {
  const dry = rgb.map((c) => c && mix(c, DUST, 0.62));
  const look = (w) => ({ w, live: rgb.map((c) => c && mix(c, DUST, Math.pow(w, 1.4) * 0.45)) });
  const main = look(w);
  const other = stem ? look(stem.w) : main;

  for (let i = 0, j = 0; i < pixels.length; i++, j += 4) {
    const v = pixels[i];
    const f = field[i];
    const { w, live } = stem && stem.mask[i] ? other : main;
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
}

const newRev = () => Math.random().toString(36).slice(2, 10);

export class Flower {
  constructor({ id, rev, nx, ny, seed, tendedAt, pixels, colors }) {
    this.id = id || Math.random().toString(36).slice(2, 10);
    this.rev = rev || newRev();
    this.nx = nx;
    this.ny = ny;
    this.seed = seed ?? randomSeed();
    this.tendedAt = tendedAt ?? Date.now();
    // pixel value v is drawn in colors[v - 1]; each flower keeps its own
    this.colors = toNeon(colors && colors.length ? colors : LEGACY_PALETTE);
    this.pixels = pixels;
    this.pausedAt = null;
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
    this.bloomGone = -1;
    this.stemGone = -1;
    this.stemLevel = -1;
    this.extLevel = -1;
    this.#measure();
    this.#grow();
  }

  // Which pixels are stem goes by colour: everything in the stem's colour,
  // wherever it was drawn, withers on the stem's own clock (stemGoneAt);
  // everything else is bloom. A drawing all in that colour (some of the old
  // ones) has nothing to tell apart and withers as one.
  //
  // In the garden a stem drawn off the bottom of the paper also grows on below
  // it (see growStem). That part is never stored or shown on the sheet: it
  // comes from the drawing and the seed, and withers with the stem.
  #grow() {
    const v = this.colors.findIndex(isStemColor) + 1;
    const mixed = v > 0 && this.pixels.some((p) => p === v) && this.pixels.some((p) => p && p !== v);
    this.stemMask = mixed ? this.pixels.map((p) => (p === v ? 1 : 0)) : null;
    // the bloom's and the stem's pixels by when they go (see #cut)
    const bloom = [], drawn = [];
    for (let i = 0; i < this.pixels.length; i++) {
      if (this.pixels[i]) (this.stemMask?.[i] ? drawn : bloom).push(this.field[i]);
    }
    this.bloomCuts = Float32Array.from(bloom).sort();
    this.stemCuts = Float32Array.from(drawn).sort();
    const stem = growStem(this.pixels, this.seed, mixed ? v : 0);
    this.lift = stem ? stem.lift : 0;
    this.stem = null;
    if (!stem) return;
    const canvas = document.createElement('canvas');
    canvas.width = ART;
    canvas.height = stem.h;
    const ctx = canvas.getContext('2d');
    const decay = makeDissolveField(ART, stem.h, (this.seed + 1) >>> 0);
    this.stem = {
      ...stem,
      ...decay,
      cuts: Float32Array.from(stem.pixels.reduce((a, p, i) => (p && a.push(decay.field[i]), a), [])).sort(),
      top: this.box.bottom + this.lift - stem.h, // its first row, in the drawing's rows
      canvas,
      ctx,
      img: ctx.createImageData(ART, stem.h),
    };
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

  // How much of the bloom is gone, 0..1 of its pixels. It withers slowly for
  // most of its lifespan; the last settings.fastAt of it goes quickly, in
  // settings.fastMs. Only depends on time, so it picks up where it was after
  // a reload.
  bloomGoneAt(now) {
    const age = this.#age(now);
    if (age <= 0) return 0;
    const { slow, fast } = this.#timing();
    const last = settings.fastAt;
    if (age < slow) return ((1 - last) * age) / slow;
    return Math.min(1, 1 - last + (last * (age - slow)) / fast);
  }

  // How much of the stem is gone, 0..1: none of it while there are petals
  // left, then all of it in settings.stemMs once they are gone.
  stemGoneAt(now) {
    const age = this.#age(now) - lifespanMs();
    return Math.min(1, Math.max(0, age / Math.max(1, this.#timing().stem)));
  }

  #age(now) {
    return (this.pausedAt ?? now) - this.tendedAt;
  }

  #timing() {
    const life = lifespanMs();
    // very short dev lifespans still wither slowly first
    const fast = Math.min(settings.fastMs, life * 0.25);
    return { slow: life - fast, fast, stem: settings.stemMs };
  }

  // The wither level that takes away `gone` (0..1) of the pixels whose field
  // values are `sorted`: a pixel is gone once the level reaches its value.
  static #cut(sorted, gone) {
    if (gone <= 0) return 0;
    if (gone >= 1 || !sorted.length) return 1;
    return sorted[Math.ceil(gone * sorted.length) - 1];
  }

  // The levels the bloom, the drawn stem and the grown stem are painted at,
  // for how much of the bloom and of the stem is gone. Without a stem of its
  // own colour, a flower's grown stem goes with the bloom.
  #levels(bloom, stem) {
    const ext = this.stem?.cuts;
    if (!this.stemMask) return [Flower.#cut(this.bloomCuts, bloom), 1, ext ? Flower.#cut(ext, bloom) : 1];
    return [Flower.#cut(this.bloomCuts, bloom), Flower.#cut(this.stemCuts, stem), ext ? Flower.#cut(ext, stem) : 1];
  }

  // Can it still be opened and redrawn? Not once its petals are gone and the
  // stem has begun to go.
  canTend(now) {
    return this.bloomGoneAt(now) < 1;
  }

  isGone(now) {
    return this.bloomGoneAt(now) >= 1 && (!this.stemMask || this.stemGoneAt(now) >= 1);
  }

  // Repaint the sprite only when what is gone has visibly moved.
  update(now) {
    const bloom = Math.round(this.bloomGoneAt(now) * 2000) / 2000;
    const stem = this.stemMask ? Math.round(this.stemGoneAt(now) * 600) / 600 : 0;
    if (bloom === this.bloomGone && stem === this.stemGone) return;
    this.bloomGone = bloom;
    this.stemGone = stem;
    [this.level, this.stemLevel, this.extLevel] = this.#levels(bloom, stem);
    this.#paint();
  }

  #paint() {
    const st = this.stem;
    paintWithered(this.img.data, this.pixels, this.rgb, this, this.level, this.stemMask && { mask: this.stemMask, w: this.stemLevel });
    this.ctx.putImageData(this.img, 0, 0);
    if (st) {
      paintWithered(st.img.data, st.pixels, this.rgb, st, this.extLevel);
      st.ctx.putImageData(st.img, 0, 0);
    }
  }

  // What is still standing right now (for tending in the studio).
  remaining(now) {
    const [w, sw] = this.#levels(this.bloomGoneAt(now), this.stemMask ? this.stemGoneAt(now) : 0);
    const mask = this.stemMask;
    const out = new Uint8Array(this.pixels.length);
    for (let i = 0; i < out.length; i++) {
      if (this.pixels[i] && this.field[i] > (mask?.[i] ? sw : w)) out[i] = this.pixels[i];
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
    this.rev = newRev();
    this.#rebuild();
  }

  // Someone elsewhere redrew it: take their version as it is.
  replace({ rev, pixels, colors, seed, tendedAt }) {
    this.rev = rev;
    this.pixels = pixels;
    this.colors = toNeon(colors.length ? colors : LEGACY_PALETTE);
    this.seed = seed;
    this.tendedAt = tendedAt;
    this.#rebuild();
  }

  // (lx, ly) in the drawing's px; rows past its bottom are the grown stem.
  hitTest(lx, ly) {
    const ix = Math.floor(lx);
    const iy = Math.floor(ly);
    const st = this.stem;
    const R = 4;
    for (let dy = -R; dy <= R; dy++) {
      const y = iy + dy;
      for (let dx = -R; dx <= R; dx++) {
        const x = ix + dx;
        if (x < 0 || x >= ART) continue;
        if (y >= 0 && y < ART) {
          const i = y * ART + x;
          if (this.pixels[i] && this.field[i] > (this.stemMask?.[i] ? this.stemLevel : this.level)) return true;
        }
        const sy = y - (st ? st.top : 0);
        if (st && sy >= 0 && sy < st.h) {
          const i = sy * ART + x;
          if (st.pixels[i] && st.field[i] > this.extLevel) return true;
        }
      }
    }
    return false;
  }
}

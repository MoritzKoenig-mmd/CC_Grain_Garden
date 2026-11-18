// A place of its own, laid over the garden: sprayed pictures on plain paper.
// Going there, the paper and the pictures grow in grain by grain over the
// garden; leaving, the pictures wither away the way a flower does and the paper
// lifts off in the same grains, so the garden shows through underneath. The
// gate (js/intro.js) and the tree (js/tree.js) are both one.
//
// A scene says what it is made of by filling in:
//   loadPictures()   load its pictures (async)
//   layout(w, h)     place everything for this screen; sets this.s (screen px per art px)
//   pieces           the pictures that wither and grow
//   draw(ctx, t)     draw them
//   changed()        optional: the state just changed (this.state)
//   failed()         optional: the pictures wouldn't load

import { hexToRgb } from './config.js';
import { makeDissolveField, randomSeed } from './noise.js';
import { settings } from './settings.js';

const WITHER_MS = 1900; // leaving: the picture withers away over this long
const GROW_MS = 1500; // arriving: it grows in a little quicker
const SPREAD = 0.12; // the pieces start withering (and growing) a little apart
const LIFT_FROM = 0.4; // the paper under it starts lifting this far in

const clamp = (v) => Math.min(1, Math.max(0, v));
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));

export class Scene {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A scene that isn't hidden in the page is there from the start (the gate).
    // away → growing → here → leaving → withering → away
    this.state = root.hidden ? 'away' : 'here';
    this.gone = root.hidden ? 1 : 0; // 0: all there … 1: withered away entirely
    this.loaded = false;
    this.broken = false;
    this.running = false;
    this.s = 1;
    this.onResize = () => this.resize();
  }

  // Subclasses call this once their constructor is done.
  async boot() {
    try {
      await this.loadPictures();
    } catch {
      this.broken = true;
      this.#away();
      this.failed?.();
      return;
    }
    this.loaded = true;
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.#look();
    if (this.state !== 'away') this.#run();
    // work out how everything will wither while nobody's going anywhere yet,
    // so leaving starts the moment it's asked for
    idle(() => this.#prepare());
  }

  get isHere() {
    return this.state === 'here';
  }

  // ---------- coming and going ----------

  // Grow in over the garden (or be there at once, with `instant`).
  show({ instant = false } = {}) {
    if (this.broken) return false;
    this.root.hidden = false;
    if (instant) {
      this.gone = 0;
      this.state = 'here';
    } else if (this.state === 'leaving') {
      this.state = 'here'; // hadn't started withering yet
    } else if (this.state !== 'here') {
      if (this.gone >= 1) this.#spread();
      this.state = 'growing';
    }
    this.#look();
    if (this.loaded) this.#run();
    return true;
  }

  // Wither away. `hold` waits that long first, with everything still there.
  hide({ instant = false, hold = 0 } = {}) {
    if (this.state === 'away') return;
    if (instant || !this.loaded) {
      this.#away();
      return;
    }
    if (this.state === 'here') {
      this.#spread();
      this.state = hold > 0 ? 'leaving' : 'withering';
      this.leaveAt = performance.now() + hold;
    } else if (this.state === 'growing') {
      this.state = 'withering'; // turn round from wherever it had got to
    }
    this.#look();
    this.#run();
  }

  // Each piece starts a little apart from the others.
  #spread() {
    if (!this.loaded) return;
    for (const pic of this.pieces) pic.delay = Math.random() * SPREAD;
  }

  #away() {
    this.state = 'away';
    this.gone = 1;
    this.root.hidden = true;
    this.#look();
    // a new pattern of decay for next time
    if (this.loaded) {
      idle(() => {
        for (const pic of this.pieces) pic.reseed();
        this.paperKept = null;
        if (this.state === 'away') this.#prepare();
      });
    }
  }

  // The paper is solid while everything's there; otherwise it's on the canvas,
  // coming or going in grains.
  #look() {
    const whole = this.state === 'here' || this.state === 'leaving';
    this.root.style.background = whole ? settings.background : 'transparent';
    this.root.classList.toggle('here', whole);
    this.root.classList.toggle('withering', this.state === 'withering');
    this.changed?.();
  }

  #prepare() {
    for (const pic of this.pieces) pic.prepare();
    this.#paper();
  }

  // ---------- layout ----------

  resize() {
    if (!this.loaded) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    Object.assign(this, { dpr, w, h });
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.layout(w, h);
  }

  // The plain paper behind it all, at art resolution so it can lift off in
  // the same grains and uncover the garden. Kept until the screen changes size.
  #paper() {
    const w = Math.ceil(this.w / this.s);
    const h = Math.ceil(this.h / this.s);
    const kept = this.paperKept;
    if (kept && kept.w === w && kept.h === h && kept.color === settings.background) return kept;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const [r, g, b] = hexToRgb(settings.background);
    for (let j = 0; j < img.data.length; j += 4) {
      img.data[j] = r;
      img.data[j + 1] = g;
      img.data[j + 2] = b;
      img.data[j + 3] = 255;
    }
    const { field } = makeDissolveField(w, h, randomSeed());
    this.paperKept = { canvas, ctx, img, field, w, h, color: settings.background, level: -1 };
    return this.paperKept;
  }

  #liftPaper(paper, level) {
    if (paper.level === level) return;
    paper.level = level;
    const { img, field, ctx } = paper;
    const d = img.data;
    for (let i = 0, j = 3; i < field.length; i++, j += 4) d[j] = field[i] > level ? 255 : 0;
    ctx.putImageData(img, 0, 0);
  }

  // ---------- frames ----------

  #run() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(() => this.#frame());
  }

  #frame() {
    if (this.state === 'away') {
      this.running = false;
      return;
    }
    const now = performance.now();
    const dt = Math.min(100, now - this.last); // a hidden tab doesn't jump to the end
    this.last = now;

    if (this.state === 'leaving' && now >= this.leaveAt) {
      this.state = 'withering';
      this.#look();
    }
    if (this.state === 'growing') {
      this.gone = Math.max(0, this.gone - dt / GROW_MS);
      if (this.gone <= 0) {
        this.state = 'here';
        this.#look();
      }
    } else if (this.state === 'withering') {
      this.gone = Math.min(1, this.gone + dt / WITHER_MS);
      if (this.gone >= 1) {
        this.#away();
        this.running = false;
        return;
      }
    }

    for (const pic of this.pieces) pic.paint(clamp((this.gone - (pic.delay || 0)) / (1 - SPREAD)));
    this.#draw(now / 1000);
    requestAnimationFrame(() => this.#frame());
  }

  #draw(t) {
    const { ctx, dpr, s } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.imageSmoothingEnabled = false;
    if (this.gone > 0) {
      const p = this.#paper();
      this.#liftPaper(p, clamp((this.gone - LIFT_FROM) / (1 - LIFT_FROM)));
      ctx.drawImage(p.canvas, 0, 0, Math.max(this.w, p.w * s), Math.max(this.h, p.h * s));
    }
    this.draw(ctx, t);
  }
}

import { ART } from './config.js';
import { Flower } from './flower.js';
import { settings } from "./settings.js";

// The garden is exactly one screen: no scrolling, flowers are placed by
// fractions of the viewport so they keep their spots when it resizes.
export class Garden {
  constructor(canvas, { onTend, onChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTend = onTend;
    this.onChange = onChange;
    this.flowers = [];
    this.hovered = null;
    this.active = true;

    this.#bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => this.#frame(t));
  }

  // ---------- layout ----------

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    // every flower is drawn at the same size, which only follows the screen
    this.scale = 1.9 * Math.min(1.3, Math.max(0.5, Math.min(this.h / 850, this.w / 900)));
  }

  // ny 0..1 spans the strip of ground new flowers are planted in; people can
  // drag them anywhere, up into the sky too. Lower flowers are drawn in front.
  groundY(ny) {
    return this.h * (0.6 + 0.36 * ny);
  }

  nyFor(y) {
    return (y / this.h - 0.6) / 0.36;
  }

  // ---------- flowers ----------

  setFlowers(list) {
    this.flowers = list;
    this.#sort();
  }

  #sort() {
    this.flowers.sort((a, b) => a.ny - b.ny);
  }

  // Find the most open patch of ground on screen.
  findSpot() {
    const groundH = this.h * 0.36;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 64; i++) {
      const nx = 0.06 + Math.random() * 0.88;
      const ny = 0.1 + Math.random() * 0.85;
      let nearest = Infinity;
      for (const f of this.flowers) {
        const dx = (f.nx - nx) * this.w;
        const dy = (f.ny - ny) * groundH * 2.2;
        nearest = Math.min(nearest, Math.hypot(dx, dy));
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = { nx, ny };
      }
    }
    return best;
  }

  plant(pixels, colors) {
    const f = new Flower({ ...this.findSpot(), pixels, colors, tendedAt: Date.now() });
    this.flowers.push(f);
    this.#sort();
    this.onChange();
    return f;
  }

  remove(flower) {
    this.flowers = this.flowers.filter((f) => f !== flower);
    if (this.hovered === flower) this.hovered = null;
    this.onChange();
  }

  #placement(f) {
    return { x: f.nx * this.w, y: this.groundY(f.ny), s: this.scale };
  }

  // Put the flower so that its grabbed point (gx, gy, in art px from its base)
  // sits under the pointer.
  #moveTo(f, px, py, gx, gy) {
    const s = this.scale;
    const y = Math.min(this.h, Math.max(this.h * 0.06, py - gy * s));
    f.ny = this.nyFor(y);
    f.nx = Math.min(1, Math.max(0, (px - gx * s) / this.w));
  }

  flowerAt(px, py) {
    for (let i = this.flowers.length - 1; i >= 0; i--) {
      const f = this.flowers[i];
      const { x, y, s } = this.#placement(f);
      const lx = (px - x) / s + f.box.cx;
      const ly = (py - y) / s + f.box.bottom;
      if (lx < -4 || ly < -4 || lx > ART + 4 || ly > ART + 4) continue;
      if (f.hitTest(lx, ly)) return f;
    }
    return null;
  }

  // ---------- input ----------

  // Press a flower and release in place → tend it. Press and drag → move it.
  #bindInput() {
    const c = this.canvas;
    let g = null; // the current press: one flower, one pointer

    c.addEventListener('pointerdown', (e) => {
      if (!this.active || g) return;
      const f = this.flowerAt(e.clientX, e.clientY);
      if (!f) return;
      try { c.setPointerCapture(e.pointerId); } catch {}
      const p = this.#placement(f);
      g = {
        f,
        id: e.pointerId,
        moved: false,
        sx: e.clientX,
        sy: e.clientY,
        // where on the flower it was grabbed, in its own pixels
        gx: (e.clientX - p.x) / p.s,
        gy: (e.clientY - p.y) / p.s,
      };
    });

    c.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (!g) {
        if (e.pointerType === 'mouse') {
          this.hovered = this.flowerAt(e.clientX, e.clientY);
          c.classList.toggle('over-flower', !!this.hovered);
        }
        return;
      }
      if (e.pointerId !== g.id) return;
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) {
        g.moved = true;
        this.dragging = g.f;
        c.classList.add('dragging');
      }
      if (g.moved) this.#moveTo(g.f, e.clientX, e.clientY, g.gx, g.gy);
    });

    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const { f, moved } = g;
      g = null;
      if (!moved) {
        if (e.type === 'pointerup') this.onTend(f);
        return;
      }
      this.dragging = null;
      c.classList.remove('dragging');
      this.#sort();
      this.onChange();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    c.addEventListener('pointerleave', () => {
      if (g) return;
      this.hovered = null;
      c.classList.remove('over-flower');
    });
  }

  // ---------- render ----------

  #frame(ms) {
    const t = ms / 1000;
    const now = Date.now();
    const ctx = this.ctx;
    const { w, h, dpr } = this;

    // let the dead go
    const dead = this.flowers.filter((f) => f.isGone(now));
    if (dead.length) {
      this.flowers = this.flowers.filter((f) => !dead.includes(f));
      if (dead.includes(this.hovered)) this.hovered = null;
      this.onChange();
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = settings.background;
    ctx.fillRect(0, 0, w, h);

    // the flower being dragged is drawn on top until it is set down
    const order = this.dragging ? [...this.flowers.filter((f) => f !== this.dragging), this.dragging] : this.flowers;
    for (const f of order) {
      const { x, y, s } = this.#placement(f);
      const half = ART * s;
      if (x + half < 0 || x - half > w) continue;
      f.update(now);

      const amp = (f === this.hovered || f === this.dragging ? 0.07 : 0.022);
      const shear =
        Math.sin(t * 0.85 + f.phase) * amp + Math.sin(t * 1.9 + f.phase * 2) * amp * 0.25;

      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.transform(1, 0, shear, 1, 0, 0);
      ctx.drawImage(f.canvas, -f.box.cx * s, -f.box.bottom * s, ART * s, ART * s);
      ctx.restore();
    }

    requestAnimationFrame((tt) => this.#frame(tt));
  }
}

import { ART, artScale } from './config.js';
import { Flower } from './flower.js';
import { settings } from "./settings.js";

// The garden is exactly one screen: no scrolling, flowers are placed by
// fractions of the viewport so they keep their spots when it resizes. At the
// back of it stand the places it leads to (places.js), behind the flowers.
export class Garden {
  constructor(canvas, { onTend, onChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTend = onTend;
    this.onChange = onChange;
    this.flowers = [];
    this.hovered = null;
    this.places = [];
    this.hotPlace = null; // the place the pointer is over
    this.active = true;
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    this.scale = artScale(this.w, this.h);
    for (const p of this.places) p.layout(this.w, this.h, this.scale);
  }

  // ny 0..1 spans the strip of ground new flowers are planted in; people can
  // drag them anywhere, up into the sky too. Lower flowers are drawn in front.
  groundY(ny) {
    return this.h * (0.6 + 0.36 * ny);
  }

  nyFor(y) {
    return (y / this.h - 0.6) / 0.36;
  }

  // ---------- places ----------

  addPlace(place) {
    this.places.push(place);
    place.layout(this.w, this.h, this.scale);
  }

  placeAt(px, py) {
    return this.places.find((p) => p.hit(px, py)) || null;
  }

  // ---------- flowers ----------

  setFlowers(list) {
    this.flowers = list;
    this.#sort();
  }

  #sort() {
    this.flowers.sort((a, b) => a.ny - b.ny);
  }

  // Would a flower standing here hide one of the places at the back?
  #inTheWay(nx, ny) {
    const s = this.scale;
    const x = nx * this.w;
    const y = this.groundY(ny);
    const box = { x: x - 50 * s, y: y - 120 * s, w: 100 * s, h: 120 * s };
    return this.places.some(({ rect: r }) => r && box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y);
  }

  // Find the most open patch of ground on screen, out of the way of the places.
  findSpot() {
    const groundH = this.h * 0.36;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < 64; i++) {
      const nx = 0.06 + Math.random() * 0.88;
      const ny = 0.1 + Math.random() * 0.85;
      if (i < 48 && this.#inTheWay(nx, ny)) continue; // if nowhere's free, anywhere will do
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
      const ly = (py - y) / s + f.box.bottom + f.lift;
      if (lx < -4 || ly < -4 || lx > ART + 4 || ly > f.box.bottom + f.lift + 4) continue;
      if (f.hitTest(lx, ly)) return f;
    }
    return null;
  }

  // ---------- input ----------

  // Press a flower and release in place → tend it. Press and drag → move it.
  // Press a place and release in place → go there. Flowers are in front.
  #bindInput() {
    const c = this.canvas;
    let g = null; // the current press: one flower or place, one pointer

    c.addEventListener('pointerdown', (e) => {
      if (!this.active || g) return;
      const f = this.flowerAt(e.clientX, e.clientY);
      if (!f) {
        const place = this.placeAt(e.clientX, e.clientY);
        if (place) g = { place, id: e.pointerId, moved: false, sx: e.clientX, sy: e.clientY };
        return;
      }
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
          this.hotPlace = this.hovered ? null : this.placeAt(e.clientX, e.clientY);
          c.classList.toggle('over-flower', !!(this.hovered || this.hotPlace));
        }
        return;
      }
      if (e.pointerId !== g.id) return;
      if (g.place) {
        // places stay put: wandering off the press calls it off
        if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 12) g.moved = true;
        return;
      }
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) {
        g.moved = true;
        this.dragging = g.f;
        c.classList.add('dragging');
      }
      if (g.moved) this.#moveTo(g.f, e.clientX, e.clientY, g.gx, g.gy);
    });

    const end = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const { f, place, moved } = g;
      g = null;
      if (place) {
        if (moved || e.type !== 'pointerup') return;
        this.hotPlace = null;
        c.classList.remove('over-flower');
        place.go();
        return;
      }
      if (!moved) {
        // a flower whose stem has begun to go is past saving
        if (e.type === 'pointerup' && f.canTend(Date.now())) this.onTend(f);
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
      if (g?.f) return;
      g = null;
      this.hovered = null;
      this.hotPlace = null;
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

    // the places at the back, far off behind the flowers
    for (const p of this.places) p.draw(ctx, t, this.active && (p === this.hotPlace || p.focused), this.still);

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
      // the grown stem first, so it shows through the grain at the paper's edge
      if (f.stem) ctx.drawImage(f.stem.canvas, -f.box.cx * s, -f.stem.h * s, ART * s, f.stem.h * s);
      ctx.drawImage(f.canvas, -f.box.cx * s, -(f.box.bottom + f.lift) * s, ART * s, ART * s);
      ctx.restore();
    }

    requestAnimationFrame((tt) => this.#frame(tt));
  }
}

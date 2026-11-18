// Sprayed pictures from image files (the gate, the tree, ...), kept as palette
// drawings like the flowers so they can wither and grow back the same way.

import { toRgbTable } from './config.js';
import { paintWithered } from './flower.js';
import { bufferToImage } from './brush.js';
import { makeDissolveField, randomSeed } from './noise.js';

// A palette drawing of any size that can be painted at any wither level.
export class Picture {
  constructor(pixels, w, h, colors) {
    Object.assign(this, { pixels, w, h, colors, rgb: toRgbTable(colors), decay: null, level: -1 });
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.paint(0);
  }

  // Work out its pattern of decay ahead of time.
  prepare() {
    this.decay ??= makeDissolveField(this.w, this.h, randomSeed());
  }

  // Forget the pattern, so next time it withers some other way.
  reseed() {
    this.decay = null;
  }

  paint(level) {
    if (level === this.level) return;
    this.level = level;
    if (level <= 0) {
      bufferToImage(this.pixels, this.img, this.rgb);
    } else {
      this.prepare();
      paintWithered(this.img.data, this.pixels, this.rgb, this.decay, level);
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  // Bounding box of what's drawn: [x0, y0, x1, y1] in its own pixels.
  get box() {
    if (this._box) return this._box;
    const { w, h, pixels } = this;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < pixels.length; i++) {
      if (!pixels[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return (this._box = x1 < 0 ? [0, 0, w - 1, h - 1] : [x0, y0, x1, y1]);
  }
}

// An image file turned into a palette drawing: every solid colour gets a number.
export async function loadPicture(src) {
  const im = new Image();
  im.src = src;
  await im.decode();
  const w = im.naturalWidth;
  const h = im.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  const pixels = new Uint8Array(w * h);
  const colors = [];
  for (let i = 0, j = 0; i < pixels.length; i++, j += 4) {
    if (d[j + 3] < 128) continue;
    const hex = '#' + ((d[j] << 16) | (d[j + 1] << 8) | d[j + 2]).toString(16).padStart(6, '0');
    let v = colors.indexOf(hex) + 1;
    if (!v) v = colors.length < 255 ? colors.push(hex) : 255;
    pixels[i] = v;
  }
  return new Picture(pixels, w, h, colors);
}

// A new picture made of the given columns of another, in that order.
export function copyColumns(pic, cols) {
  const { w, h, pixels } = pic;
  const W = cols.length;
  const out = new Uint8Array(W * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) out[y * W + x] = pixels[y * w + cols[x]];
  }
  return new Picture(out, W, h, pic.colors);
}

// n column numbers walking from a to b, back to a, and so on.
export function bounce(a, b, n) {
  const len = Math.abs(b - a) + 1;
  const dir = Math.sign(b - a);
  return Array.from({ length: n }, (_, d) => {
    const m = d % (2 * len);
    return m < len ? a + dir * m : b - dir * (m - len);
  });
}

// A fence drawn up to column `cut` and going on to the left: the stretch from
// `cut` to `turn` (halfway between two posts each) is repeated `more` columns
// out, every other copy mirrored so each seam meets itself and the rails run
// on unbroken. The drawn end of the fence left of the cut is left out.
export function runLeft(pic, cut, turn, more) {
  const cols = bounce(cut, turn, more).reverse();
  for (let x = cut; x < pic.w; x++) cols.push(x);
  return copyColumns(pic, cols);
}

// The same, going on to the right of column `cut`.
export function runRight(pic, cut, turn, more) {
  const cols = [];
  for (let x = 0; x <= cut; x++) cols.push(x);
  cols.push(...bounce(cut, turn, more));
  return copyColumns(pic, cols);
}

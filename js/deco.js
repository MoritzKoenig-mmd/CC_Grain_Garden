// The album's paper and its frame: one yellow line drawn by hand all the way
// round the paper (after the Figma frame MMD_CC, node 161:36), and the paper's
// own edge following it, so the sheet swells and dips with the line. The line
// leaves a gap at the top for the word "album" and rolls into a little curl
// either side of it.
//
// The album is as long as there are flowers in it, so neither is a fixed
// drawing: both are laid out for the paper's size each time. The line is
// sprayed with the brush the flowers are drawn with (js/brush.js) at the
// album's art-pixel size, so it has their grain; the paper is solid white that
// breaks up into grain towards its edge, at the scale of the paper strip it
// replaces (img/strip.png). The same seed gives the same line, the same paper
// and the same specks every time.

import { sprayLine, bufferToImage } from './brush.js';
import { toRgbTable } from './config.js';
import { mulberry32 } from './noise.js';

const COLOR = '#ffd000'; // the garden's yellow
const PAPER = '#ffffff';
const RADIUS = 3.5; // art px: the line's brush, between the two smaller flower brushes
const SEED = 1611;
const TILE = 1024; // px: everything is painted in canvases this tall, stacked
const STEP = 2; // css px between the points laid along the line
const STRIP = 244; // the paper strip's width in its own px, at its one-column size of 460 css px

// Smooth 1-d noise in -1..1, the same for a seed every time.
function noise1(seed) {
  const rand = mulberry32(seed);
  const knots = [];
  return (t) => {
    const i = Math.floor(t);
    while (knots.length <= i + 1) knots.push(rand() * 2 - 1);
    let f = t - i;
    f = f * f * (3 - 2 * f);
    return knots[i] + (knots[i + 1] - knots[i]) * f;
  };
}

// A number in 0..1 for a pixel, the same every time (so tiles meet without a seam).
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 2-d value noise in 0..1 on a lattice `cell` px apart, built from hash().
function noise2(x, y, cell, seed) {
  const fx = x / cell;
  const fy = y / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  let tx = fx - x0;
  let ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// A curl the line rolls into at one end of the gap: it arrives at `end`
// heading towards the word and winds up and round itself above the line.
// `dir` is +1 at the left end (heading right) and -1 at the right end.
function curl(end, dir, size) {
  const pts = [];
  const cx = end[0];
  const cy = end[1] - size;
  const turn = (Math.PI * 2 * 410) / 360;
  const n = Math.ceil((turn * size) / STEP);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = Math.PI / 2 - t * turn; // from below the centre, on round towards the word
    const r = size * (1 - 0.62 * t);
    pts.push({ x: cx + dir * Math.cos(a) * r, y: cy + Math.sin(a) * r, w: 1 - 0.45 * t });
  }
  return pts;
}

// The shape of it all for a paper `width` × `height` css px, with the title's
// box { x, y, w, h } (css px, from the paper's top left).
function layOut(width, height, title) {
  const sheet = Math.min(460, width); // the paper's grain scales with this
  const grain = sheet * 0.06; // how deep the paper's edge breaks up into grain
  const white = Math.min(24, Math.max(12, width * 0.02)); // solid paper outside the line, before the grain
  const sway = Math.min(14, Math.max(6, width * 0.011)); // how far the line wanders
  const reach = white + grain; // from the line to the paper's outermost grain
  // the line sits in far enough that the paper's grain, wandering with it, stays on the strip
  const margin = 2 + grain * 0.3 + sway; // from the strip's edge to the paper's outermost grain
  const side = margin + reach;
  const top = title.y + title.h * 0.55; // the top runs level with the word
  // above the word the paper reaches further, up to the same margin as at the
  // sides, so there's clear paper over it rather than the edge's grain
  const above = Math.max(0, top - margin - reach);
  const bottom = height - side;
  const round = Math.min(56, Math.max(22, width * 0.05)); // corners
  const mid = title.x + title.w / 2;
  const half = title.w / 2 + 30; // half the gap
  const L = side;
  const R = width - side;

  // the line's path: from the gap's right end, round the paper, to its left end
  const legs = [];
  const straight = (x0, y0, x1, y1) =>
    legs.push({ len: Math.hypot(x1 - x0, y1 - y0), at: (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t] });
  const arc = (cx, cy, a0) =>
    legs.push({
      len: (Math.PI / 2) * round,
      at: (t) => [cx + Math.cos(a0 + (t * Math.PI) / 2) * round, cy + Math.sin(a0 + (t * Math.PI) / 2) * round],
    });
  straight(mid + half, top, R - round, top);
  arc(R - round, top + round, -Math.PI / 2);
  straight(R, top + round, R, bottom - round);
  arc(R - round, bottom - round, 0);
  straight(R - round, bottom, L + round, bottom);
  arc(L + round, bottom - round, Math.PI / 2);
  straight(L, bottom - round, L, top + round);
  arc(L + round, top + round, Math.PI);
  straight(L + round, top, mid - half, top);
  let past = 0;
  for (const leg of legs) {
    leg.from = past;
    past += leg.len;
  }
  const total = past;

  // How far the line is pushed into (+) or out of (-) the plain rounded shape
  // at `s` css px along it: slow waves, like a hand that wanders a little, with
  // a finer tremble on top, both fading out towards the gap so the curls sit
  // level with the word.
  const wave = noise1(SEED);
  const tremble = noise1(SEED + 1);
  const press = noise1(SEED + 2);
  const shift = (s) => {
    if (s < 0 || s > total) return 0; // in the gap
    const ease = Math.min(1, Math.min(s, total - s) / 90);
    return ease * ease * (3 - 2 * ease) * (sway * wave(s / 210) + 1.6 * tremble(s / 36));
  };

  // the line itself
  const n = Math.max(2, Math.ceil(total / STEP));
  const base = [];
  for (let i = 0, k = 0; i <= n; i++) {
    const s = (i / n) * total;
    while (k < legs.length - 1 && s > legs[k].from + legs[k].len) k++;
    base.push(legs[k].at(Math.min(1, (s - legs[k].from) / legs[k].len)));
  }
  const pts = base.map(([x, y], i) => {
    const s = (i / n) * total;
    const [ax, ay] = base[Math.max(0, i - 1)];
    const [bx, by] = base[Math.min(n, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const d = shift(s); // (the path runs clockwise, so this normal points into the paper)
    return { x: x - ((by - ay) / len) * d, y: y + ((bx - ax) / len) * d, w: 0.86 + 0.24 * press(s / 90) };
  });
  const size = Math.min(15, Math.max(9, title.h * 0.42));
  const line = [...curl([mid + half, top], -1, size).reverse(), ...pts, ...curl([mid - half, top], 1, size)];

  // For a point of the paper: how far outside the plain rounded shape it is
  // (css px, negative inside), how far along the line its nearest point is
  // (-1 above the word) and how much it's on the top side (1 along the top,
  // easing to 0 round the top corners). Null deep inside, where the paper is
  // plain white.
  const ix0 = L + round;
  const ix1 = R - round;
  const iy0 = top + round;
  const iy1 = bottom - round;
  const along = (k, t) => legs[k].from + Math.min(1, Math.max(0, t)) * legs[k].len;
  const q = Math.PI / 2;
  const where = (x, y) => {
    const cx = Math.min(ix1, Math.max(ix0, x));
    const cy = Math.min(iy1, Math.max(iy0, y));
    const dx = x - cx;
    const dy = y - cy;
    if (!dx && !dy) return null;
    if (dx && dy) {
      // round a corner
      const out = Math.hypot(dx, dy) - round;
      const a = Math.atan2(dy, dx);
      const ease = (t) => t * t * (3 - 2 * t);
      if (dx > 0 && dy < 0) return [out, along(1, (a + q) / q), ease(Math.min(1, -a / q))];
      if (dx > 0) return [out, along(3, a / q), 0];
      if (dy > 0) return [out, along(5, (a - q) / q), 0];
      return [out, along(7, (a + Math.PI) / q), ease(Math.min(1, (a + Math.PI) / q))];
    }
    if (dx > 0) return [x - R, along(2, (y - iy0) / (iy1 - iy0 || 1)), 0];
    if (dx < 0) return [L - x, along(6, (iy1 - y) / (iy1 - iy0 || 1)), 0];
    if (dy > 0) return [y - bottom, along(4, (ix1 - x) / (ix1 - ix0 || 1)), 0];
    if (x >= mid + half) return [top - y, along(0, (x - mid - half) / (legs[0].len || 1)), 1];
    if (x <= mid - half) return [top - y, along(8, (x - ix0) / (legs[8].len || 1)), 1];
    return [top - y, -1, 1];
  };

  // How much of the paper there is at a point: 1 solid, 0 none, grain between.
  // (gx, gy) is the paper pixel, for the noise that keeps the edge hand-sprayed.
  const cover = (x, y, gx, gy) => {
    const w = where(x, y);
    if (!w) return 1;
    const [out, s, onTop] = w;
    const edge = reach + above * onTop - shift(s); // where the grain gives out, from the plain shape
    const depth = edge - out + (noise2(gx, gy, 9, SEED) - 0.5) * grain * 0.6;
    const t = Math.min(1, Math.max(0, depth / grain));
    return t * t * (3 - 2 * t);
  };

  return { line, cover, paperPx: sheet / STRIP };
}

// Paint into `box` (an element over the paper) the paper and its frame for a
// paper `width` × `height` css px, with the title's box, one of the album's
// art px being `px` css px.
export function drawFrame(box, width, height, title, px) {
  const { line, cover, paperPx } = layOut(width, height, title);
  const canvases = [];
  // paint(buf, w, tileHeight, y0) fills one tile's buffer and says if it drew anything
  const stack = (w, h, cssPx, rgb, paint) => {
    for (let y0 = 0; y0 < h; y0 += TILE) {
      const th = Math.min(TILE, h - y0);
      const buf = new Uint8Array(w * th);
      if (!paint(buf, w, th, y0)) continue;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = th;
      Object.assign(canvas.style, { top: `${y0 * cssPx}px`, width: `${w * cssPx}px`, height: `${th * cssPx}px` });
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(w, th);
      bufferToImage(buf, img, rgb);
      ctx.putImageData(img, 0, 0);
      canvases.push(canvas);
    }
  };

  // the paper, at the strip's own grain
  stack(Math.ceil(width / paperPx), Math.ceil(height / paperPx), paperPx, toRgbTable([PAPER]), (buf, w, th, y0) => {
    for (let y = 0; y < th; y++) {
      const gy = y + y0;
      for (let x = 0; x < w; x++) {
        const t = cover((x + 0.5) * paperPx, (gy + 0.5) * paperPx, x, gy);
        if (t >= 1 || (t > 0 && hash(x, gy, SEED + 9) < t)) buf[y * w + x] = 1;
      }
    }
    return true;
  });

  // the line on it, at the flowers' grain. Each stretch of the line gets its
  // own seed, so a stretch crossing two tiles sprays the same specks into both.
  const spread = RADIUS * 3;
  const segs = [];
  for (let i = 1; i < line.length; i++) {
    const [ax, ay, bx, by] = [line[i - 1].x / px, line[i - 1].y / px, line[i].x / px, line[i].y / px];
    const r = (RADIUS * (line[i - 1].w + line[i].w)) / 2;
    segs.push({ ax, ay, bx, by, r, lo: Math.min(ay, by) - spread, hi: Math.max(ay, by) + spread });
  }
  stack(Math.max(1, Math.round(width / px)), Math.max(1, Math.round(height / px)), px, toRgbTable([COLOR]), (buf, w, th, y0) => {
    let any = false;
    segs.forEach((s, i) => {
      if (s.hi < y0 || s.lo > y0 + th) return;
      any = true;
      sprayLine(buf, w, s.ax, s.ay - y0, s.bx, s.by - y0, s.r, 1, mulberry32(SEED * 7919 + i), undefined, th);
    });
    return any;
  });

  box.replaceChildren(...canvases);
}

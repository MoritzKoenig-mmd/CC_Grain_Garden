// Sprays the tree and the garden's landmarks with the same brush people draw
// flowers with (js/brush.js), and saves them as PNGs in img/:
//
//   tree.png         the big tree, its fruit and the branch the swing hangs from
//   swing.png        the swing on its own, so it can sway
//   note.png         the note left on the swing seat
//   tree-small.png   the tree as it looks from the garden, far off, simplified
//   swing-small.png  its little swing, on its own so it can swing
//   gate-small.png   the gate as it looks from the garden
//   arrow-small.png  a little sprout that comes up in that gate's gap
//
// and the whole tree in one picture in _assets/tree.png.
//
//   node tools/make-assets.mjs        same pictures every time
//   node tools/make-assets.mjs 12     different fruit (and every wobble)
//
// Nothing is drawn with a ruler or a compass: every line is pushed about by a
// "hand" (see below), so lines bow, loops don't quite close and no two bumps
// are the same. Where things join up (the swing's knots, the note on the seat,
// the gap in the gate) stays put whatever the seed, so the spots js/tree.js
// and js/places.js measure stay true.

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sprayLine, sprayStamp } from '../js/brush.js';
import { mulberry32 } from '../js/noise.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = Number(process.argv[2] ?? 2026) >>> 0;
const TAU = Math.PI * 2;

const GREEN = '#16e600'; // the fence
const BLUE = '#0072e6'; // the arrow
const INK = '#2a2530';
const PAPER = '#ffffff';
// the flower palette, without its green
const FRUIT = ['#ff1744', '#ff1fb4', '#ff6a00', '#ffd000', '#00b4ff', '#2d5bff', '#7c3aff'];

const pick = (list, rand) => list[Math.floor(rand() * list.length)];
const others = (c) => FRUIT.filter((f) => f !== c);

// ---------- a hand ----------

// Smooth random wandering between -1 and 1 over t = 0..1, turning about
// `bends` times. It's what keeps a line from being straight and a circle from
// being round: a hand drifts slowly and trembles a little, it doesn't jitter.
function drift(rand, bends = 2) {
  const n = Math.max(1, Math.round(bends));
  const k = Array.from({ length: n + 3 }, () => rand() * 2 - 1);
  return (t) => {
    const x = 1 + Math.min(1, Math.max(0, t)) * n;
    const i = Math.min(n, Math.floor(x));
    const f = x - i;
    const [p0, p1, p2, p3] = [k[i - 1], k[i], k[i + 1], k[i + 2]];
    return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (3 * p1 - p0 - 3 * p2 + p3) * f * f * f);
  };
}

// A soft curve through the points (Catmull-Rom), n + 1 samples.
function spline(pts, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const k = (i / n) * (pts.length - 1);
    const a = Math.min(pts.length - 2, Math.floor(k));
    const f = k - a;
    const p0 = pts[Math.max(0, a - 1)];
    const p1 = pts[a];
    const p2 = pts[a + 1];
    const p3 = pts[Math.min(pts.length - 1, a + 2)];
    const cr = (q0, q1, q2, q3) =>
      0.5 * (2 * q1 + (q2 - q0) * f + (2 * q0 - 5 * q1 + 4 * q2 - q3) * f * f + (3 * q1 - q0 - 3 * q2 + q3) * f * f * f);
    out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

const lengthOf = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

// A line drawn by hand through the given points: it bows to one side and
// back, trembles, and sometimes runs on a bit past where it meant to stop.
// The ends stay where they're put unless `over` lets them run on.
function hand(pts, rand, { bow = 1.6, tremble = 0.45, over = 0 } = {}) {
  pts = pts.map((p) => [...p]);
  if (over) {
    const run = (a, b, k) => [a[0] + (a[0] - b[0]) * k, a[1] + (a[1] - b[1]) * k];
    const [a, b] = [pts[0], pts[1]];
    const [y, z] = [pts.at(-1), pts.at(-2)];
    pts[0] = run(a, b, (over * rand()) / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1));
    pts[pts.length - 1] = run(y, z, (over * rand()) / (Math.hypot(y[0] - z[0], y[1] - z[1]) || 1));
  }
  const len = lengthOf(pts);
  const n = Math.max(10, Math.round(len / 1.3));
  const base = spline(pts, n);
  const swerve = drift(rand, 1 + rand() * 2.5);
  const shake = drift(rand, Math.max(3, len / 7));
  return base.map(([x, y], i) => {
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(n, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const t = i / n;
    const o = swerve(t) * bow * Math.sin(Math.PI * t) + shake(t) * tremble;
    return [x - (ty / l) * o, y + (tx / l) * o];
  });
}

// A loop drawn by hand round (cx, cy): `radius(θ)` says how far out it means
// to go at each angle. It starts anywhere, goes lumpy where the hand drifts,
// and carries on past where it started (`over`, in radians) without meeting
// itself again.
function handShape(cx, cy, rot, radius, rand, { lump = 0.1, over = 0.5, tremble = 0.4, bends = 3 } = {}) {
  const start = rand() * TAU;
  const sweep = TAU + over * (0.4 + 0.6 * rand());
  const swell = drift(rand, bends);
  const size = radius(0) + radius(Math.PI / 2);
  const n = Math.max(24, Math.round((size * sweep) / 2.4));
  const shake = drift(rand, Math.max(4, (size * sweep) / 14));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = start + t * sweep;
    const r = radius(th) * (1 + lump * swell(t)) + shake(t) * tremble;
    pts.push([cx + Math.cos(th + rot) * r, cy + Math.sin(th + rot) * r]);
  }
  return pts;
}

// An ellipse, as a hand draws one.
function handLoop(cx, cy, rx, ry, rot, rand, opts) {
  const radius = (th) => (rx * ry) / Math.hypot(ry * Math.cos(th), rx * Math.sin(th));
  return handShape(cx, cy, rot, radius, rand, opts);
}

// A scalloped cloud, the way a tree's crown gets drawn: one bump after
// another all the way round, each its own width and height, the whole thing
// a bit lopsided, and the last bump running on past the first.
function handCloud(cx, cy, rx, ry, rand, { depth = 0.13, widths = [0.42, 0.82], over = 0.4, tremble = 0.6 } = {}) {
  const a0 = rand() * TAU;
  const bumps = [];
  for (let a = 0; a < TAU + over; ) {
    const w = widths[0] + rand() * (widths[1] - widths[0]);
    bumps.push([a, w, 0.55 + rand() * 0.9]);
    a += w;
  }
  const end = bumps.at(-1)[0] + bumps.at(-1)[1];
  const lopsided = drift(rand, 3);
  const shake = drift(rand, 40);
  const pts = [];
  for (const [b0, w, tall] of bumps) {
    const m = Math.max(6, Math.round((w * Math.max(rx, ry)) / 1.4));
    for (let j = 0; j < m; j++) {
      const u = j / m;
      const a = b0 + u * w;
      const t = a / end;
      const k = 1 - depth + 2 * depth * tall * Math.pow(Math.sin(Math.PI * u), 0.65) + 0.07 * lopsided(t);
      const off = shake(t) * tremble;
      pts.push([cx + Math.cos(a0 + a) * (rx * k + off), cy + Math.sin(a0 + a) * (ry * k + off)]);
    }
  }
  return pts;
}

// ---------- a sheet to spray on ----------

// Every picture gets this much empty paper all round, so a hand that runs on
// past where it meant to, or spray that drifts out, isn't cut off at the edge.
// Shapes are drawn in w × h, the PNG is PAD bigger on every side: a point
// (x, y) in the drawing is at (x + PAD, y + PAD) in the PNG. Pictures that are
// laid on each other have the same margin, so their offsets don't change.
const PAD = 8;

// brush.js works on square buffers, so each sheet is a square cropped on export.
class Sheet {
  constructor(w, h) {
    this.pad = PAD;
    this.w = w + 2 * PAD;
    this.h = h + 2 * PAD;
    this.size = Math.max(this.w, this.h);
    this.buf = new Uint8Array(this.size * this.size);
    this.colors = [];
  }

  #in(pts) {
    return pts.map(([x, y]) => [x + this.pad, y + this.pad]);
  }

  v(hex) {
    let i = this.colors.indexOf(hex);
    if (i < 0) i = this.colors.push(hex) - 1;
    return i + 1;
  }

  // Spray along a line. The hand presses harder and lighter as it goes and
  // lifts a little at the ends; `to` thins (or fattens) it toward the end.
  draw(pts, r, hex, rand, { to = r, press = 0.2 } = {}) {
    pts = this.#in(pts);
    const v = this.v(hex);
    const p = drift(rand, 2 + rand() * 3);
    const n = pts.length - 1;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const ends = 0.82 + 0.18 * Math.min(1, t * 8, (1 - t) * 8);
      const rr = (r + (to - r) * t) * (1 + press * p(t)) * ends;
      sprayLine(this.buf, this.size, ...pts[i - 1], ...pts[i], Math.max(0.9, rr), v, rand);
    }
  }

  stamp(x, y, r, hex, rand) {
    sprayStamp(this.buf, this.size, x + this.pad, y + this.pad, r, this.v(hex), rand);
  }

  // Spray the inside of an outline solid (the outline closes itself).
  fill(poly, r, hex, rand) {
    poly = this.#in(poly);
    const v = this.v(hex);
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const step = r * 0.6;
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
        if (inside(poly, x, y)) sprayStamp(this.buf, this.size, x, y, r * 0.75, v, rand);
      }
    }
  }

  // Lay another sheet over this one, its top left at (ox, oy) in PNG pixels.
  put(other, ox, oy) {
    for (let y = 0; y < other.h; y++) {
      for (let x = 0; x < other.w; x++) {
        const v = other.buf[y * other.size + x];
        const X = x + ox;
        const Y = y + oy;
        if (!v || X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
        this.buf[Y * this.size + X] = this.v(other.colors[v - 1]);
      }
    }
  }

  save(file) {
    const { w, h } = this;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    const rgb = this.colors.map((c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = this.buf[y * this.size + x];
        if (!v) continue;
        raw.set([...rgb[v - 1], 255], y * (w * 4 + 1) + 1 + x * 4);
      }
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8 bit RGBA
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    fs.writeFileSync(path.resolve(ROOT, file), png);
    console.log(`${file}  ${w}×${h}`);
  }
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ---------- fruit ----------

// Funny fruit: every one a different shape, colour and way of being sprayed,
// none of them quite even. Each hangs from its stalk at (cx, cy - R) and is
// about 2R across.
const FRUITS = {
  // a fat lumpy blob, sprayed solid
  blob(s, cx, cy, R, c, rand) {
    s.fill(handLoop(cx, cy + R * 0.1, R * (0.8 + rand() * 0.35), R * (0.75 + rand() * 0.35), rand() * TAU, rand, { lump: 0.22, over: 0 }), 4.6, c, rand);
  },
  // a star with a few too many points, none the same length, drawn edge by
  // edge so the corners cross over
  star(s, cx, cy, R, c, rand) {
    const k = 5 + Math.floor(rand() * 3);
    const rot = rand() * TAU;
    const pts = [];
    for (let i = 0; i < 2 * k; i++) {
      const a = rot + ((i + (rand() - 0.5) * 0.45) / (2 * k)) * TAU;
      const r = i % 2 ? R * (0.42 + rand() * 0.16) : R * (0.95 + rand() * 0.3);
      pts.push([cx + Math.cos(a) * r, cy + R * 0.15 + Math.sin(a) * r]);
    }
    if (rand() < 0.45) s.fill(pts, 3, c, rand);
    const r = rand() < 0.5 ? 2.2 : 2.8;
    pts.forEach((a, i) => s.draw(hand([a, pts[(i + 1) % pts.length]], rand, { bow: 0.7, tremble: 0.25, over: 1.5 }), r, c, rand, { press: 0.1 }));
  },
  // a lumpy outline with polka dots of another colour
  dotty(s, cx, cy, R, c, rand) {
    s.draw(handLoop(cx, cy + R * 0.1, R * 0.95, R * 0.85, rand() * TAU, rand, { lump: 0.2, bends: 5, over: 0.7 }), 2.6, c, rand);
    const dot = pick(others(c), rand);
    for (let i = 0; i < 3 + Math.floor(rand() * 4); i++) {
      const a = rand() * TAU;
      const d = rand() * R * 0.5;
      const r = 1.8 + rand() * 1.6;
      s.stamp(cx + Math.cos(a) * d, cy + R * 0.1 + Math.sin(a) * d, r, dot, rand);
      if (r > 2.6) s.stamp(cx + Math.cos(a) * d + 1, cy + R * 0.1 + Math.sin(a) * d, r, dot, rand);
    }
  },
  // a snail-shell spiral that loses its way a little
  spiral(s, cx, cy, R, c, rand) {
    const turns = 1.6 + rand() * 0.7;
    const dir = rand() < 0.5 ? 1 : -1;
    const a0 = rand() * TAU;
    const swell = drift(rand, 4);
    const pace = drift(rand, 3);
    const pts = [];
    for (let i = 0; i <= 110; i++) {
      const t = i / 110;
      const a = a0 + dir * (t + 0.05 * pace(t)) * turns * TAU;
      const r = R * (1 - t * 0.85) * (1 + 0.12 * swell(t));
      pts.push([cx + Math.cos(a) * r * 1.05, cy + R * 0.1 + Math.sin(a) * r * 0.92]);
    }
    s.draw(pts, 1.9, c, rand, { to: 1.5 });
  },
  // a pear: a small loop sat crooked on a big one
  pear(s, cx, cy, R, c, rand) {
    const tilt = (rand() - 0.5) * 0.7;
    s.draw(handLoop(cx + tilt * 2, cy - R * 0.25, R * 0.4, R * 0.5, tilt, rand, { lump: 0.18, over: 0.6 }), 2.8, c, rand);
    s.fill(handLoop(cx + tilt * R * 0.6, cy + R * 0.45, R * 0.74, R * 0.62, tilt, rand, { lump: 0.18, over: 0 }), 4, c, rand);
  },
  // a crescent, like a banana that went round the bend, fatter at one end
  moon(s, cx, cy, R, c, rand) {
    const rot = rand() * TAU;
    const outer = drift(rand, 3);
    const inner = drift(rand, 3);
    const span = Math.PI * (1.1 + rand() * 0.3);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * span - Math.PI * 0.12;
      pts.push([Math.cos(a) * R * (1 + 0.1 * outer(i / 40)), Math.sin(a) * R * (1 + 0.1 * outer(i / 40))]);
    }
    for (let i = 40; i >= 0; i--) {
      const a = (i / 40) * span - Math.PI * 0.12;
      const r = R * (0.5 + 0.12 * (i / 40)) * (1 + 0.12 * inner(i / 40));
      pts.push([Math.cos(a) * r + R * 0.28, Math.sin(a) * r - R * 0.06]);
    }
    s.fill(pts.map(([x, y]) => [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]), 3.4, c, rand);
  },
  // a bunch of grapes in two colours, heaped any old how
  grapes(s, cx, cy, R, c, rand) {
    const other = pick(others(c), rand);
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const row = i / (n - 1);
      const x = cx + (rand() - 0.5) * R * 1.4 * (1 - row * 0.5);
      const y = cy - R * 0.55 + row * R * 1.5 + (rand() - 0.5) * 3;
      const r = R * (0.22 + rand() * 0.14);
      s.draw(handLoop(x, y, r, r * (0.85 + rand() * 0.3), rand() * TAU, rand, { lump: 0.15, over: 0.8, tremble: 0.25 }), 1.8, rand() < 0.5 ? c : other, rand);
    }
  },
  // a striped melon with uneven teeth
  melon(s, cx, cy, R, c, rand) {
    const rot = (rand() - 0.5) * 0.8;
    s.draw(handLoop(cx, cy + R * 0.15, R, R * 0.72, rot, rand, { lump: 0.12, over: 0.6 }), 2.6, c, rand);
    const zig = [];
    const teeth = 6 + Math.floor(rand() * 4);
    for (let i = 0; i <= teeth; i++) {
      const x = cx - R * 0.72 + (i / teeth) * R * 1.44 + (rand() - 0.5) * 2;
      zig.push([x, cy + R * 0.15 + (i % 2 ? -1 : 1) * R * (0.18 + rand() * 0.2)]);
    }
    s.draw(hand(zig, rand, { bow: 1, tremble: 0.3 }), 2, pick(others(c), rand), rand);
  },
  // a lemon, pointier at one end, coloured in a bit outside its own line
  lemon(s, cx, cy, R, c, rand) {
    const rot = (rand() - 0.5) * 1.2;
    const sharp = 0.45 + rand() * 0.3;
    const radius = (th) => R * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos(th)), sharp)) * (Math.cos(th) > 0 ? 1.12 : 0.92);
    s.fill(handShape(cx, cy + R * 0.15, rot, radius, rand, { lump: 0.12, over: 0 }), 3, c, rand);
    const off = [(rand() - 0.5) * 4, (rand() - 0.5) * 4];
    s.draw(handShape(cx + off[0], cy + R * 0.15 + off[1], rot + (rand() - 0.5) * 0.2, radius, rand, { lump: 0.12, over: 0.5 }), 1.8, pick(others(c), rand), rand);
  },
  // a drop leaning over, with a hole that isn't in the middle
  drop(s, cx, cy, R, c, rand) {
    const lean = (rand() - 0.5) * 0.8;
    const radius = (th) => R * (0.62 + 0.53 * Math.pow(Math.abs(Math.sin(th / 2 + Math.PI / 2)), 3));
    s.draw(handShape(cx, cy + R * 0.25, -Math.PI / 2 + lean, radius, rand, { lump: 0.1, over: 0.5 }), 3, c, rand);
    s.fill(handLoop(cx + (rand() - 0.5) * R * 0.4, cy + R * (0.35 + rand() * 0.2), R * 0.24, R * 0.2, rand(), rand, { lump: 0.25, over: 0 }), 2.4, c, rand);
  },
};

// The stalk the fruit hangs from, never quite straight, and sometimes a leaf.
function stalk(s, x, y, len, rand) {
  const top = [x + (rand() - 0.5) * 6, y - len];
  s.draw(hand([top, [x + (rand() - 0.5) * 3, y - len * 0.5], [x, y]], rand, { bow: 1.2, tremble: 0.3 }), 1.9, GREEN, rand, { to: 1.5 });
  if (rand() < 0.55) {
    const side = rand() < 0.5 ? -1 : 1;
    const a = side > 0 ? -0.4 - rand() * 0.4 : Math.PI + 0.4 + rand() * 0.4;
    const sz = 4.5 + rand() * 2.5;
    s.draw(handLoop(top[0] + Math.cos(a) * sz, top[1] + len * 0.35 + Math.sin(a) * sz, sz, sz * 0.42, a, rand, { lump: 0.2, over: 0.7, tremble: 0.2 }), 1.7, GREEN, rand);
  }
}

// A fruit on its stalk. Without a `color`, any colour of the palette.
function fruit(s, cx, cy, R, rand, kinds = Object.keys(FRUITS), color) {
  stalk(s, cx, cy - R * 0.75, 8 + rand() * 6, rand);
  const kind = pick(kinds, rand);
  const any = pick(FRUIT, rand); // drawn either way, so the rest of the tree comes out the same
  FRUITS[kind](s, cx, cy, R, color ?? any, rand);
}

// Colours for a tree full of fruit, so it comes out a rainbow: every colour
// at least once, and the fruit left over warm (red, pink, orange, yellow come
// round first), so the tree leans warm. Then each fruit gets the colour whose
// twin is farthest away, so they're mixed all over the crown.
function rainbow(spots, rand) {
  const deck = [];
  while (deck.length < spots.length) deck.push(...FRUIT); // FRUIT lists the warm ones first
  deck.length = spots.length;
  const dealt = [];
  return spots.map(([x, y]) => {
    let best = null;
    let far = -1;
    for (const c of new Set(deck)) {
      const same = dealt.filter((d) => d.c === c).map((d) => Math.hypot(d.x - x, d.y - y));
      const d = (same.length ? Math.min(...same) : 1e6) + rand() * 12;
      if (d > far) [best, far] = [c, d];
    }
    deck.splice(deck.indexOf(best), 1);
    dealt.push({ x, y, c: best });
    return best;
  });
}

// Quick flicks of grass.
function grass(s, x, y, h, rand) {
  for (const lean of [-0.9, 0, 0.8]) {
    if (rand() < 0.25) continue;
    const l = lean + (rand() - 0.5) * 0.5;
    const tall = h * (0.6 + rand() * 0.5);
    s.draw(hand([[x + l * 2, y], [x + l * tall * 0.2, y - tall * 0.55], [x + l * tall * 0.6, y - tall]], rand, { bow: 1, tremble: 0.2 }), 2.2, GREEN, rand, { to: 1.2 });
  }
}

// ---------- the tree ----------

// Where the swing hangs and the note sits. TREE, SWING and NOTE are the
// drawing sizes (each PNG is 2 × PAD bigger); the _AT offsets are the same in
// the drawings and the PNGs, since all three have the same margin. The ropes
// are tied on 3 px down the swing drawing, where the branch is drawn to pass,
// which is 3 + PAD down swing.png (KNOT in js/tree.js, which keeps these numbers).
export const TREE = { w: 360, h: 384 };
export const SWING_AT = [48, 228]; // top left of swing.png on tree.png
export const SWING = { w: 112, h: 124 };
export const NOTE_AT = [30, 58]; // top left of note.png on swing.png
export const NOTE = { w: 54, h: 50 };

function tree(rand) {
  const s = new Sheet(TREE.w, TREE.h);

  // the trunk: a few fat strokes side by side, each its own way, leaning a bit
  const lean = (rand() - 0.5) * 10;
  const spine = [[236, 380], [235 + lean * 0.3, 318], [231 + lean, 252], [226 + lean * 0.7, 196], [225, 150]];
  for (const [o0, o1, r] of [[-11, -5, 7], [0, 0, 7.6], [10, 5, 6.6]]) {
    const pts = spine.map(([x, y], i) => [x + o0 + ((o1 - o0) * i) / (spine.length - 1) + (rand() - 0.5) * 2.5, y]);
    s.draw(hand(pts, rand, { bow: 2.6, tremble: 0.6 }), r, GREEN, rand, { to: r * 0.72 });
  }
  // roots, curling off to either side
  s.draw(hand([[228, 364], [214, 374], [198, 377], [186, 382]], rand, { bow: 2 }), 6, GREEN, rand, { to: 2.8 });
  s.draw(hand([[244, 362], [258, 372], [274, 376], [290, 381]], rand, { bow: 2 }), 6, GREEN, rand, { to: 2.8 });

  // the branch the swing hangs from, low and long to the left, curling up at the end
  s.draw(hand([[228, 250], [180, 241], [120, 235], [64, 232], [34, 224], [24, 210], [30, 199]], rand, { bow: 1.2, tremble: 0.5 }), 8.2, GREEN, rand, { to: 3.2 });

  // branches up into the leaves, crooked
  s.draw(hand([[226, 178], [200, 136], [170, 104], [140, 66]], rand, { bow: 4 }), 6.4, GREEN, rand, { to: 2.6 });
  s.draw(hand([[228, 172], [258, 132], [292, 102], [314, 72]], rand, { bow: 4 }), 6.4, GREEN, rand, { to: 2.6 });
  s.draw(hand([[226, 160], [234, 116], [222, 62]], rand, { bow: 3.5 }), 5.6, GREEN, rand, { to: 2.4 });
  s.draw(hand([[184, 116], [200, 84], [198, 50]], rand, { bow: 2.5 }), 3.8, GREEN, rand, { to: 2 });

  // the crown: one big scalloped cloud, and a stretch of it gone over twice
  const crown = handCloud(184, 104, 146, 82, rand);
  s.draw(crown, 5.4, GREEN, rand, { press: 0.28 });
  const from = Math.floor(rand() * crown.length * 0.7);
  const again = crown.slice(from, from + Math.floor(crown.length * (0.12 + rand() * 0.1)));
  s.draw(hand(again.filter((_, i) => i % 6 === 0), rand, { bow: 2.5 }), 3, GREEN, rand);

  // fruit all over the crown, never too close together
  const placed = [];
  for (let tries = 0; placed.length < 12 && tries < 6000; tries++) {
    const x = 184 + (rand() * 2 - 1) * 146 * 0.8;
    const y = 110 + (rand() * 2 - 1) * 82 * 0.72;
    if (((x - 184) / (146 * 0.8)) ** 2 + ((y - 110) / (82 * 0.72)) ** 2 > 1) continue;
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 46)) continue;
    placed.push([x, y]);
  }
  // the colours, the whole rainbow (dealt with their own dice, so the shapes
  // don't change when the colours do)
  const hanging = [190, 276];
  const fallen = [302, 368];
  const colors = rainbow([...placed, hanging, fallen], mulberry32(SEED + 1));

  // every shape at least once before any comes round again
  const kinds = Object.keys(FRUITS);
  const deck = [];
  placed.forEach(([x, y], i) => {
    if (!deck.length) deck.push(...[...kinds].sort(() => rand() - 0.5));
    fruit(s, x, y, 14 + rand() * 5, rand, [deck.pop()], colors[i]);
  });

  // one hanging off the swing branch, one already fallen
  fruit(s, ...hanging, 12, rand, undefined, colors.at(-2));
  const kind = pick(['blob', 'star', 'pear', 'moon'], rand);
  pick(FRUIT, rand); // (as above)
  FRUITS[kind](s, ...fallen, 9, colors.at(-1), rand);

  for (const x of [176, 204, 272, 318, 338]) grass(s, x + (rand() - 0.5) * 6, 381, 8 + rand() * 6, rand);
  return s;
}

function swing(rand) {
  const s = new Sheet(SWING.w, SWING.h);
  // two ropes, knotted round the branch, down to the seat
  for (const [x0, x1] of [[16, 13], [92, 96]]) {
    s.draw(hand([[x0, 3], [x0 + (x1 - x0) * 0.5, 56], [x1, 106]], rand, { bow: 2.6, tremble: 0.4 }), 2, BLUE, rand, { press: 0.12 });
    s.draw(handLoop(x0, 4, 4.4, 3, (rand() - 0.5) * 0.6, rand, { lump: 0.25, over: 1, tremble: 0.2 }), 1.8, BLUE, rand);
  }
  // the seat: a plank, not quite level, its two edges not quite together
  const tilt = (rand() - 0.5) * 3;
  s.draw(hand([[3, 108 - tilt], [56, 108], [109, 107 + tilt]], rand, { bow: 1.4, over: 2 }), 4.6, BLUE, rand);
  s.draw(hand([[8, 115 - tilt], [56, 116], [104, 114 + tilt]], rand, { bow: 1.4, over: 2 }), 3.2, BLUE, rand);
  s.draw(hand([[4, 107 - tilt], [6, 116 - tilt]], rand, { bow: 0.5 }), 2.4, BLUE, rand);
  s.draw(hand([[108, 106 + tilt], [105, 115 + tilt]], rand, { bow: 0.5 }), 2.4, BLUE, rand);
  return s;
}

// A line of pretend handwriting: humps up and down, words with gaps between.
function scribble(x0, y0, len, rand) {
  const lines = [];
  let x = x0;
  while (x < x0 + len - 4) {
    const word = Math.min(x0 + len - x, 6 + rand() * 10);
    const pts = [];
    let i = 0;
    for (let wx = x; wx < x + word; wx += 1.3 + rand() * 1.8, i++) {
      pts.push([wx, y0 + (wx - x0) * -0.04 - (i % 2 ? 1.6 + rand() * 2.6 : 0) + (rand() - 0.5) * 0.6]);
    }
    if (pts.length > 2) lines.push(hand(pts, rand, { bow: 0.5, tremble: 0.2 }));
    x += word + 2.5 + rand() * 2;
  }
  return lines;
}

function note(rand) {
  const s = new Sheet(NOTE.w, NOTE.h);
  // a card leaning on the rope, its top corner folded down, drawn edge by edge
  const j = () => (rand() - 0.5) * 2;
  const card = [[6 + j(), 10 + j()], [36 + j(), 4 + j()], [46 + j(), 14 + j()], [48 + j(), 44 + j()], [8 + j(), 47 + j()]];
  s.fill(card, 3, PAPER, rand);
  card.forEach((a, i) => {
    const b = card[(i + 1) % card.length];
    s.draw(hand([a, b], rand, { bow: 0.9, tremble: 0.25, over: 2.5 }), 2.2, INK, rand);
  });
  s.draw(hand([card[1], [37, 14], card[2]], rand, { bow: 0.5, tremble: 0.2 }), 1.7, INK, rand);
  // scribbled lines of writing
  for (const [y, len] of [[21, 26], [29, 31], [37, 22]]) {
    for (const line of scribble(13, y, len, rand)) s.draw(line, 1.3, INK, rand, { press: 0.1 });
  }
  return s;
}

// ---------- the landmarks seen from the garden ----------

// The little swing hangs from the small tree's branch at SWING_SMALL_AT (the
// same in the drawings and the PNGs), tied on 3 px down its drawing, 3 + PAD
// down swing-small.png. The tree stands at row 150 of its drawing, 150 + PAD
// of tree-small.png. js/places.js keeps the same numbers.
export const TREE_SMALL = { w: 132, h: 152 };
export const SWING_SMALL_AT = [23, 104];
export const SWING_SMALL = { w: 34, h: 36 };

function treeSmall(rand) {
  const s = new Sheet(TREE_SMALL.w, TREE_SMALL.h);
  s.draw(hand([[66, 150], [65, 122], [63, 92]], rand, { bow: 2 }), 6.4, GREEN, rand, { to: 4.4 });
  s.draw(hand([[72, 150], [70, 122], [68, 94]], rand, { bow: 2 }), 5, GREEN, rand, { to: 3.4 });
  // a little branch for the swing, flat where the ropes go
  s.draw(hand([[65, 113], [48, 109], [31, 107], [18, 100], [16, 92]], rand, { bow: 0.8, tremble: 0.3 }), 4, GREEN, rand, { to: 2.2 });
  // the crown, kept narrow enough that its biggest bumps stay on the paper
  s.draw(handCloud(66, 50, 44, 34, rand, { depth: 0.15, widths: [0.55, 1.05], tremble: 0.5 }), 4.2, GREEN, rand, { press: 0.25 });
  // fruit as dabs of colour, none the same size
  const spots = [[40, 38], [68, 26], [94, 44], [55, 62], [83, 68]];
  const colors = [...FRUIT].sort(() => rand() - 0.5);
  spots.forEach(([x, y], i) => {
    const r = 4.5 + rand() * 2.5;
    s.fill(handLoop(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6, r, r * (0.8 + rand() * 0.4), rand() * TAU, rand, { lump: 0.25, over: 0 }), 3, colors[i], rand);
  });
  for (const x of [52, 82]) grass(s, x + (rand() - 0.5) * 4, 150, 7, rand);
  return s;
}

function swingSmall(rand) {
  const s = new Sheet(SWING_SMALL.w, SWING_SMALL.h);
  s.draw(hand([[7, 3], [6, 30]], rand, { bow: 0.8, tremble: 0.25 }), 1.6, BLUE, rand);
  s.draw(hand([[25, 3], [26, 30]], rand, { bow: 0.8, tremble: 0.25 }), 1.6, BLUE, rand);
  s.draw(hand([[2, 31], [16, 32], [31, 30]], rand, { bow: 0.8, over: 1.5 }), 2.6, BLUE, rand);
  return s;
}

// Where things are on the small gate's drawing; add PAD for gate-small.png,
// which is what js/places.js counts in (hinge 112, gap 158–190, ground 104,
// run 28–100).
export const GATE_SMALL = { w: 214, h: 104, hinge: 104, gap: [150, 182], ground: 96, run: [20, 92] };

function gateSmall(rand) {
  const s = new Sheet(GATE_SMALL.w, GATE_SMALL.h);
  // posts lean a little and aren't all as tall; the ones in the fence stay
  // clear of the columns where it's repeated (run), so the copies join up
  const post = (x, top, bottom, r = 4.2, lean = 2) =>
    s.draw(hand([[x, top], [x + (rand() - 0.5) * lean * 2, bottom]], rand, { bow: 1.4, tremble: 0.4, over: 2 }), r, GREEN, rand);
  for (const x of [8, 32, 56, 80, 104]) post(x + (rand() - 0.5) * 3, 22 + rand() * 6, 92 + rand() * 4);
  // rails sag between the posts
  s.draw(hand([[-2, 42], [30, 43 + rand() * 2], [60, 41], [112, 43]], rand, { bow: 2.2 }), 4.4, GREEN, rand);
  s.draw(hand([[-2, 78], [40, 80 + rand() * 2], [80, 78], [112, 79]], rand, { bow: 2.2 }), 4.4, GREEN, rand);
  // the gate swung open toward us: posts closer together, taller as they come near
  [[114, 18, 94], [124, 13, 96], [134, 9, 98], [144, 5, 100]].forEach(([x, t, b]) => post(x, t + (rand() - 0.5) * 3, b, 3.6, 1.5));
  s.draw(hand([[110, 36], [128, 31], [147, 26]], rand, { bow: 1.4, over: 2 }), 4, GREEN, rand);
  s.draw(hand([[110, 76], [128, 79], [147, 82]], rand, { bow: 1.4, over: 2 }), 4, GREEN, rand);
  // the gap, then the other gatepost and a stub of fence
  post(187, 19, 96, 4.6, 1.5);
  post(208, 26, 94, 4.2, 1.5);
  s.draw(hand([[186, 42], [212, 44]], rand, { bow: 1, over: 2 }), 4.4, GREEN, rand);
  s.draw(hand([[186, 78], [212, 79]], rand, { bow: 1, over: 2 }), 4.4, GREEN, rand);
  return s;
}

function arrowSmall(rand) {
  const s = new Sheet(28, 62);
  s.draw(hand([[14, 60], [11, 42], [15, 22], [14, 6]], rand, { bow: 1.5, tremble: 0.3 }), 2, BLUE, rand);
  s.draw(hand([[5, 15], [14, 5]], rand, { bow: 0.8, over: 1.5 }), 2, BLUE, rand);
  s.draw(hand([[14, 5], [23, 14]], rand, { bow: 0.8, over: 1.5 }), 2, BLUE, rand);
  s.draw(handLoop(7, 38, 5.5, 2.4, Math.PI + 0.6, rand, { lump: 0.2, over: 0.8, tremble: 0.2 }), 1.6, BLUE, rand);
  s.draw(handLoop(21, 28, 5.5, 2.4, -0.6, rand, { lump: 0.2, over: 0.8, tremble: 0.2 }), 1.6, BLUE, rand);
  return s;
}

// ---------- go ----------

// (the pieces are exported too, for trying out new fruit)
export { Sheet, FRUITS, fruit };

if (import.meta.main) {
  const rand = mulberry32(SEED);
  const t = tree(rand);
  const sw = swing(rand);
  const nt = note(rand);
  t.save('img/tree.png');
  sw.save('img/swing.png');
  nt.save('img/note.png');
  treeSmall(rand).save('img/tree-small.png');
  swingSmall(rand).save('img/swing-small.png');
  gateSmall(rand).save('img/gate-small.png');
  arrowSmall(rand).save('img/arrow-small.png');

  // the whole thing in one picture
  const all = new Sheet(TREE.w, TREE.h);
  all.put(t, 0, 0);
  const seat = new Sheet(SWING.w, SWING.h);
  seat.put(sw, 0, 0);
  seat.put(nt, ...NOTE_AT);
  all.put(seat, ...SWING_AT);
  all.save('_assets/tree.png');
}

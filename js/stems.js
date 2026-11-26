// Predefined stems a new drawing starts with. Each shape is picked at random,
// sometimes mirrored, and drawn with a little hand wobble, so no two match.

import { ART } from './config.js';
import { sprayPath } from './brush.js';
import { loop, wobble } from './seed.js';
import { mulberry32 } from './noise.js';

const MID = ART / 2;

// How much of each shape below is drawn: the stem is only a hint coming up
// out of the bottom of the paper, so the sheet stays free for the flower.
// Height and sideways bends shrink toward the stem's base, by a different
// amount every time (REACH, from..to), so some hints come up further than others.
const REACH = [0.5, 0.8];
const LEAF = 0.8;

// top: where the stem ends (x, y in art px) · bend: sideways bulge ·
// s: S-curve amount · leaves: [position along stem 0..1, side -1|1, size]
// The shapes are drawn shrunk toward their base (REACH, above).
export const STEMS = [
  { name: 'straight', top: [72, 84], bend: 0, s: 0, leaves: [] },
  { name: 'lean, one leaf', top: [79, 83], bend: 6, s: 0, leaves: [[0.45, -1, 11]] },
  { name: 'arc, one leaf', top: [66, 86], bend: -7, s: 0, leaves: [[0.5, 1, 10]] },
  { name: 's-curve, two leaves', top: [72, 82], bend: 0, s: 6, leaves: [[0.35, 1, 9], [0.62, -1, 8]] },
  { name: 'tall, leaves at the base', top: [72, 77], bend: 2, s: 0, leaves: [[0.16, -1, 12], [0.24, 1, 11]] },
  { name: 'drooping', top: [87, 90], bend: 13, s: 0, leaves: [[0.4, -1, 8]] },
  { name: 'short, big leaf', top: [71, 102], bend: -3, s: 0, leaves: [[0.5, 1, 14]] },
  { name: 'wavy, three leaves', top: [73, 82], bend: -4, s: -4, leaves: [[0.25, 1, 7], [0.45, -1, 7], [0.66, 1, 7]] },
];

function stemPath(x0, y0, x1, y1, bend, s, rand) {
  const wb = wobble(rand, 1.1);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bend + Math.sin(t * Math.PI * 2) * s + wb(t * 4);
    pts.push([x, y0 + (y1 - y0) * t]);
  }
  return pts;
}

// A leaf as an outlined loop, pointing outward and a little upward.
function leaf(buf, pts, at, side, size, value, r, rand) {
  const [x, y] = pts[Math.round(at * (pts.length - 1))];
  const ang = side > 0 ? -0.55 : Math.PI + 0.55;
  const cx = x + Math.cos(ang) * size;
  const cy = y + Math.sin(ang) * size;
  sprayPath(buf, ART, loop(cx, cy, size, size * 0.42, ang, rand, 0.7), r * 0.85, value, rand);
}

// Spray a random stem into `buf` using pixel value `value`.
export function drawStem(buf, value, rand = Math.random) {
  const def = STEMS[Math.floor(rand() * STEMS.length)];
  const m = rand() < 0.5 ? -1 : 1; // mirror half of the time
  const reach = REACH[0] + rand() * (REACH[1] - REACH[0]);
  const x0 = MID + (rand() - 0.5) * 8;
  const y0 = ART - 3;
  const tx = x0 + ((def.top[0] - MID) * m + (rand() - 0.5) * 6) * reach;
  const ty = y0 - (y0 - def.top[1] + (rand() - 0.5) * 6) * reach;
  const r = 2.3 + rand() * 0.5; // thinner than a flower stroke: a hint, not a stalk
  const pts = stemPath(x0, y0, tx, ty, def.bend * m * reach, def.s * m * reach, rand);
  sprayPath(buf, ART, pts, r, value, rand);
  for (const [at, side, size] of def.leaves) {
    leaf(buf, pts, at, side * m, size * LEAF * (0.85 + rand() * 0.3), value, r, rand);
  }
}

// ---------- in the garden ----------

// On the sheet the stem is only a hint. Planted, it grows on below the
// drawing by STEM_GROW times the bloom's size (its width or height, whichever
// is bigger), so a big flower stands a little taller than a small one.
// STEM_MAX caps it (art px).
const STEM_GROW = 0.24;
const STEM_MAX = 30;
const OVERLAP = 8; // rows it reaches up behind the drawing, to fill the paper's grainy edge

// The rest of a stem that runs off the bottom of the paper: a buffer as wide
// as the drawing and `h` rows tall, standing in the ground. Its top OVERLAP
// rows lie behind the drawing's bottom rows; the drawing stands `lift` art px
// above the ground. It is sprayed in pixel value `prefer` (the stem's colour)
// if that is where the drawing leaves the paper. Null when the drawing doesn't come off the paper's bottom edge as a stem
// (nothing is grown under a flower that floats, or one whose bottom is wide).
// The same drawing and seed always grow the same stem.
export function growStem(pixels, seed, prefer = 0) {
  const minX = new Int16Array(ART).fill(ART);
  const maxX = new Int16Array(ART).fill(-1);
  const sumX = new Float64Array(ART);
  const n = new Uint16Array(ART);
  let top = ART, bottom = -1, left = ART, right = -1;
  for (let y = 0; y < ART; y++) {
    for (let x = 0; x < ART; x++) {
      if (!pixels[y * ART + x]) continue;
      if (x < minX[y]) minX[y] = x;
      if (x > maxX[y]) maxX[y] = x;
      sumX[y] += x;
      n[y]++;
    }
    if (n[y]) {
      if (y < top) top = y;
      bottom = y;
      left = Math.min(left, minX[y]);
      right = Math.max(right, maxX[y]);
    }
  }
  if (bottom < ART - 8) return null;

  // the stem already drawn: everything under the bloom, which ends where the
  // drawing first narrows to a neck below its widest row (leaves further
  // down the stem don't count)
  const width = right - left + 1;
  const span = (r) => (n[r] ? maxX[r] - minX[r] + 1 : 0);
  let widest = 0, at = top;
  for (let r = top; r <= bottom; r++) if (span(r) > widest) [widest, at] = [span(r), r];
  let y = at;
  while (y <= bottom && span(y) >= Math.max(10, widest * 0.4)) y++;
  const drawn = bottom + 1 - y;
  if (drawn < 3) return null;
  const bloom = Math.max(width, y - top);
  const lift = Math.max(4, Math.min(STEM_MAX, Math.round(bloom * STEM_GROW)));

  // carry on where the drawn stem leaves the paper: same place, colour,
  // thickness and lean
  const centre = (y0, y1) => {
    let s = 0, c = 0;
    for (let r = Math.max(0, y0); r <= y1; r++) { s += sumX[r]; c += n[r]; }
    return c ? s / c : null;
  };
  const foot = bottom - Math.min(OVERLAP, drawn) + 1;
  const sx = centre(foot, bottom);
  const up = centre(foot - 10, foot - 1) ?? sx;
  const lean = Math.max(-0.6, Math.min(0.6, (sx - up) / 10)); // x per row, going down
  const counts = new Map();
  let thick = 0, rows = 0;
  for (let r = foot; r <= bottom; r++) {
    if (!n[r]) continue;
    thick += span(r);
    rows++;
    for (let x = minX[r]; x <= maxX[r]; x++) {
      const v = pixels[r * ART + x];
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  const value = counts.has(prefer) ? prefer : [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const radius = Math.max(2, Math.min(5, thick / rows / 1.7));

  const rand = mulberry32(seed ^ 0x5bd1e995);
  const h = OVERLAP + lift;
  const buf = new Uint8Array(ART * h);
  const wb = wobble(rand, 1);
  const bow = (rand() - 0.5) * 6;
  const L = h - 1 - (bottom + 1 - foot);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    // the lean straightens out toward the ground
    const x = sx + lean * L * (t - (t * t) / 2) + Math.sin(t * Math.PI) * bow + wb(t * 3) * t;
    pts.push([x, OVERLAP - (bottom + 1 - foot) + t * L]);
  }
  sprayPath(buf, ART, pts, radius, value, rand);
  return { pixels: buf, h, lift };
}

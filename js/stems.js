// Predefined stems a new drawing starts with. Each shape is picked at random,
// sometimes mirrored, and drawn with a little hand wobble, so no two match.

import { ART } from './config.js';
import { sprayPath } from './brush.js';
import { loop, wobble } from './seed.js';

const MID = ART / 2;

// top: where the stem ends (x, y in art px) · bend: sideways bulge ·
// s: S-curve amount · leaves: [position along stem 0..1, side -1|1, size]
export const STEMS = [
  { name: 'straight', top: [72, 60], bend: 0, s: 0, leaves: [] },
  { name: 'lean, one leaf', top: [82, 58], bend: 8, s: 0, leaves: [[0.45, -1, 13]] },
  { name: 'arc, one leaf', top: [64, 62], bend: -10, s: 0, leaves: [[0.5, 1, 12]] },
  { name: 's-curve, two leaves', top: [72, 56], bend: 0, s: 9, leaves: [[0.35, 1, 11], [0.62, -1, 10]] },
  { name: 'tall, leaves at the base', top: [72, 50], bend: 3, s: 0, leaves: [[0.14, -1, 15], [0.2, 1, 14]] },
  { name: 'drooping', top: [94, 68], bend: 18, s: 0, leaves: [[0.4, -1, 10]] },
  { name: 'short, big leaf', top: [70, 86], bend: -4, s: 0, leaves: [[0.5, 1, 17]] },
  { name: 'wavy, three leaves', top: [74, 56], bend: -5, s: -6, leaves: [[0.25, 1, 9], [0.45, -1, 9], [0.66, 1, 8]] },
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
  const x0 = MID + (rand() - 0.5) * 8;
  const y0 = ART - 3;
  const tx = MID + (def.top[0] - MID) * m + (rand() - 0.5) * 6;
  const ty = def.top[1] + (rand() - 0.5) * 6;
  const r = 3.4 + rand() * 0.8;
  const pts = stemPath(x0, y0, tx, ty, def.bend * m, def.s * m, rand);
  sprayPath(buf, ART, pts, r, value, rand);
  for (const [at, side, size] of def.leaves) {
    leaf(buf, pts, at, side * m, size * (0.85 + rand() * 0.3), value, r, rand);
  }
}

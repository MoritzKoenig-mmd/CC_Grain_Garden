// Small deterministic randomness + value noise, so every flower has its own
// stable withering pattern that can be rebuilt from a seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

// Smooth value noise (w×h) on a lattice with the given cell size. A square one
// draws the same numbers as before it took a height, so saved flowers keep
// their pattern of decay.
function valueNoise(w, h, cell, rand) {
  const gx = Math.ceil(w / cell) + 2;
  const gy = Math.ceil(h / cell) + 2;
  const lattice = new Float32Array(gx * gy);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell;
    const y0 = Math.floor(fy);
    let ty = fy - y0;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const x0 = Math.floor(fx);
      let tx = fx - x0;
      tx = tx * tx * (3 - 2 * tx);
      const a = lattice[y0 * gx + x0];
      const b = lattice[y0 * gx + x0 + 1];
      const c = lattice[(y0 + 1) * gx + x0];
      const d = lattice[(y0 + 1) * gx + x0 + 1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

// A stencil for the drawing sheet: 1 where paint may land, 0 where it may not.
// Toward a rounded border it dissolves into grain, like the sprayed paper
// frame, so a drawing never ends in a hard square edge. `band` is how wide the
// dissolving border is and `radius` how round its corners are (art px).
export function sprayedEdge(size, seed, band = 22, radius = 30) {
  const rand = mulberry32(seed);
  const wobble = valueNoise(size, size, 23, rand); // keeps the outline hand-sprayed, not geometric
  const mask = new Uint8Array(size * size);
  const h = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // how far inside the rounded square this pixel is
      const qx = Math.abs(x + 0.5 - h) - (h - radius);
      const qy = Math.abs(y + 0.5 - h) - (h - radius);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
      const depth = -outside + (wobble[y * size + x] - 0.5) * band * 0.6;
      let t = Math.min(1, Math.max(0, depth / band));
      t = t * t * (3 - 2 * t);
      mask[y * size + x] = rand() < t ? 1 : 0;
    }
  }
  return mask;
}

// The wither field: layered noise plus per-pixel grain, then rank-normalised so
// values are uniformly spread over 0..1. That way a wither level of 0.3 erases
// ~30% of the flower, and 1.0 erases all of it.
export function makeWitherField(size, seed) {
  const rand = mulberry32(seed);
  const n1 = valueNoise(size, size, 19, rand);
  const n2 = valueNoise(size, size, 9, rand);
  const n3 = valueNoise(size, size, 4, rand);
  const n = size * size;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = 0.42 * n1[i] + 0.3 * n2[i] + 0.15 * n3[i] + 0.2 * rand();
  }
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => raw[a] - raw[b]);
  const field = new Float32Array(n);
  for (let r = 0; r < n; r++) field[order[r]] = (r + 0.5) / n;

  // Two extra grain channels used for the drying edge.
  const grainA = new Float32Array(n);
  const grainB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    grainA[i] = rand();
    grainB[i] = rand();
  }
  return { field, grainA, grainB };
}

// The same kind of field for a picture of any size (w×h) in art px, like the
// gate on the way in. Ranked through a fine histogram instead of a full sort,
// which keeps big pictures quick.
export function makeDissolveField(w, h, seed) {
  const rand = mulberry32(seed);
  const n1 = valueNoise(w, h, 19, rand);
  const n2 = valueNoise(w, h, 9, rand);
  const n3 = valueNoise(w, h, 4, rand);
  const n = w * h;
  const raw = new Float32Array(n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = 0.42 * n1[i] + 0.3 * n2[i] + 0.15 * n3[i] + 0.2 * rand();
    raw[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const BINS = 4096;
  const k = (BINS - 1e-3) / (hi - lo || 1);
  const count = new Uint32Array(BINS);
  for (let i = 0; i < n; i++) count[Math.floor((raw[i] - lo) * k)]++;
  const below = new Uint32Array(BINS);
  for (let b = 1; b < BINS; b++) below[b] = below[b - 1] + count[b - 1];
  const field = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const at = (raw[i] - lo) * k;
    const b = Math.floor(at);
    field[i] = (below[b] + (at - b) * count[b] + 0.5) / (n + 1);
  }

  const grainA = new Float32Array(n);
  const grainB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    grainA[i] = rand();
    grainB[i] = rand();
  }
  return { field, grainA, grainB };
}

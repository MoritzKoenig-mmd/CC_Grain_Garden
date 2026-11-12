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

// Smooth value noise on a lattice with the given cell size.
function valueNoise(size, cell, rand) {
  const g = Math.ceil(size / cell) + 2;
  const lattice = new Float32Array(g * g);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = y / cell;
    const y0 = Math.floor(fy);
    let ty = fy - y0;
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = x / cell;
      const x0 = Math.floor(fx);
      let tx = fx - x0;
      tx = tx * tx * (3 - 2 * tx);
      const a = lattice[y0 * g + x0];
      const b = lattice[y0 * g + x0 + 1];
      const c = lattice[(y0 + 1) * g + x0];
      const d = lattice[(y0 + 1) * g + x0 + 1];
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
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
  const wobble = valueNoise(size, 23, rand); // keeps the outline hand-sprayed, not geometric
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
  const n1 = valueNoise(size, 19, rand);
  const n2 = valueNoise(size, 9, rand);
  const n3 = valueNoise(size, 4, rand);
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

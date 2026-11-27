// Spray-can brush on a palette-indexed pixel buffer. Points are scattered with
// a gaussian falloff so strokes get a dense core and a speckled fringe, like
// the reference drawings.

function gauss(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// How a stroke is sprayed (all but `amount` and `range` can be left out):
// - amount: the share of specks that stray from the core (0..0.9)
// - range: how far they travel, as a multiple of the radius. More fringe adds
//   specks rather than taking them from the core, so the core stays as dense.
// - spread: how wide the core is, as a multiple of the radius. Lower gives a
//   tight stroke with a crisp edge, higher a soft, misty one.
// - density: specks per art px² of the brush. Lower lets the paper show
//   through the stroke, higher fills it in.
// - speck: each speck's size in art px (1 is the finest grain there is).
export const FRINGE = { amount: 0.05, range: 0.95, spread: 0.42, density: 1.7, speck: 1 };

// `size` is the buffer's width; a buffer that isn't square passes its `height` too.
export function sprayStamp(buf, size, cx, cy, r, value, rand = Math.random, fringe = FRINGE, height = size) {
  const amount = Math.min(0.9, Math.max(0, fringe.amount));
  const spread = fringe.spread ?? FRINGE.spread;
  const density = fringe.density ?? FRINGE.density;
  const speck = Math.max(1, Math.round(fringe.speck ?? 1));
  // bigger specks cover more each, so fewer of them land
  const count = Math.ceil(((r * r * density + 2) * (1 - FRINGE.amount)) / (1 - amount) / (speck * speck));
  const off = (speck - 1) / 2;
  for (let i = 0; i < count; i++) {
    // a few stray specks travel further out
    const sd = rand() < amount ? r * fringe.range : r * spread;
    const x0 = Math.round(cx + gauss(rand) * sd - off);
    const y0 = Math.round(cy + gauss(rand) * sd - off);
    if (speck === 1) {
      if (x0 < 0 || y0 < 0 || x0 >= size || y0 >= height) continue;
      buf[y0 * size + x0] = value;
      continue;
    }
    for (let y = Math.max(0, y0); y < Math.min(height, y0 + speck); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + speck); x++) buf[y * size + x] = value;
    }
  }
}

export function sprayLine(buf, size, x0, y0, x1, y1, r, value, rand = Math.random, fringe = FRINGE, height = size) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.6, r * 0.3)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    sprayStamp(buf, size, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, value, rand, fringe, height);
  }
}

export function sprayPath(buf, size, points, r, value, rand = Math.random, fringe = FRINGE) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    sprayLine(buf, size, ax, ay, bx, by, r, value, rand, fringe);
  }
}

// Paint a palette buffer into ImageData (transparent where empty).
export function bufferToImage(buf, img, rgb) {
  const d = img.data;
  for (let i = 0, j = 0; i < buf.length; i++, j += 4) {
    const v = buf[i];
    if (v) {
      const c = rgb[v];
      d[j] = c[0];
      d[j + 1] = c[1];
      d[j + 2] = c[2];
      d[j + 3] = 255;
    } else {
      d[j + 3] = 0;
    }
  }
}

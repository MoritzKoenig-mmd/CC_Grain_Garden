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

// The fringe: `amount` is the share of specks that stray from the core (0..1)
// and `range` how far they travel, as a multiple of the radius. More fringe
// adds specks rather than taking them from the core, so the core stays as dense.
export const FRINGE = { amount: 0.05, range: 0.95 };

export function sprayStamp(buf, size, cx, cy, r, value, rand = Math.random, fringe = FRINGE) {
  const amount = Math.min(0.9, Math.max(0, fringe.amount));
  const count = Math.ceil(((r * r * 1.7 + 2) * (1 - FRINGE.amount)) / (1 - amount));
  for (let i = 0; i < count; i++) {
    // a few stray specks travel further out
    const spread = rand() < amount ? r * fringe.range : r * 0.42;
    const x = Math.round(cx + gauss(rand) * spread);
    const y = Math.round(cy + gauss(rand) * spread);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    buf[y * size + x] = value;
  }
}

export function sprayLine(buf, size, x0, y0, x1, y1, r, value, rand = Math.random, fringe = FRINGE) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.6, r * 0.3)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    sprayStamp(buf, size, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, value, rand, fringe);
  }
}

export function sprayPath(buf, size, points, r, value, rand = Math.random) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    sprayLine(buf, size, ax, ay, bx, by, r, value, rand);
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

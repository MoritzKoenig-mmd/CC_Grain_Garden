// Neon shine: every painted pixel bleeds a halo of its own colour into the
// empty pixels around it. It's worked out at art resolution, so the halo is
// made of the same chunky pixels as the drawing rather than a smooth blur.
// Only the picture glows; the stored drawing never changes.

const RADIUS = 4; // box blur radius in art px; three passes ≈ a gaussian
const STRENGTH = 0.8; // how opaque the halo is right next to the paint

// How far the halo can reach beyond the paint (art px).
export const GLOW_REACH = RADIUS * 3;

// One box-blur pass along rows (step 1) or columns (step w), running sums.
function boxPass(src, dst, w, h, horizontal) {
  const k = 1 / (2 * RADIUS + 1);
  const lines = horizontal ? h : w;
  const len = horizontal ? w : h;
  const step = horizontal ? 1 : w;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * w : line;
    let sum = 0;
    for (let i = 0; i <= RADIUS && i < len; i++) sum += src[start + i * step];
    for (let i = 0; i < len; i++) {
      dst[start + i * step] = sum * k;
      if (i + RADIUS + 1 < len) sum += src[start + (i + RADIUS + 1) * step];
      if (i - RADIUS >= 0) sum -= src[start + (i - RADIUS) * step];
    }
  }
}

// Add the halo to RGBA pixel data (w×h) in place, under the painted pixels.
export function addGlow(data, w, h) {
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  let any = false;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (!data[j + 3]) continue;
    any = true;
    const a = data[j + 3] / 255; // premultiplied, so colours mix properly
    ch[0][i] = data[j] * a;
    ch[1][i] = data[j + 1] * a;
    ch[2][i] = data[j + 2] * a;
    ch[3][i] = a;
  }
  if (!any) return;
  const tmp = new Float32Array(n);
  for (const c of ch) {
    for (let pass = 0; pass < 3; pass++) {
      boxPass(c, tmp, w, h, true);
      boxPass(tmp, c, w, h, false);
    }
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (data[j + 3]) continue; // paint stays on top
    const a = ch[3][i];
    if (a < 0.004) continue;
    data[j] = ch[0][i] / a;
    data[j + 1] = ch[1][i] / a;
    data[j + 2] = ch[2][i] / a;
    data[j + 3] = Math.min(255, a * 255 * STRENGTH);
  }
}

// A handful of hand-drawn-looking flowers so a first visit isn't an empty
// field. They are drawn with the same spray brush people use, and start at
// different ages so the withering is visible straight away.

import { ART, LEGACY_PALETTE } from './config.js';
import { lifespanMs } from './settings.js';
import { sprayPath } from './brush.js';
import { mulberry32 } from './noise.js';
import { now as clockNow } from './clock.js';

const TAU = Math.PI * 2;

export function wobble(rand, amt) {
  const a = rand() * TAU, b = rand() * TAU, c = rand() * TAU;
  return (t) => amt * (Math.sin(t * 3 + a) * 0.6 + Math.sin(t * 7 + b) * 0.3 + Math.sin(t * 13 + c) * 0.1);
}

export function loop(cx, cy, rx, ry, rot, rand, wob = 1.5) {
  const pts = [];
  const wb = wobble(rand, wob);
  const n = 48;
  const start = rand() * TAU;
  for (let i = 0; i <= n + 3; i++) {
    const t = start + (i / n) * TAU;
    const ex = Math.cos(t) * (rx + wb(t));
    const ey = Math.sin(t) * (ry + wb(t + 1));
    pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  return pts;
}

function stem(x0, y0, x1, y1, bend, rand) {
  const pts = [];
  const wb = wobble(rand, 1.2);
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI) * bend + wb(t * 4);
    pts.push([x, y0 + (y1 - y0) * t]);
  }
  return pts;
}

function petalFlower(buf, rand, { cx, cy, petals, pr, color, r }) {
  const rot = rand() * TAU;
  for (let k = 0; k < petals; k++) {
    const a = rot + (k / petals) * TAU;
    const d = pr * 1.05;
    sprayPath(buf, ART, loop(cx + Math.cos(a) * d, cy + Math.sin(a) * d, pr * 0.78, pr * 0.52, a, rand), r, color, rand);
  }
  sprayPath(buf, ART, loop(cx, cy, pr * 0.42, pr * 0.42, 0, rand, 0.8), r, color, rand);
  sprayPath(buf, ART, stem(cx, cy + pr * 1.7, cx + (rand() - 0.5) * 24, ART - 3, (rand() - 0.5) * 18, rand), r, color, rand);
}

function starFlower(buf, rand, { cx, cy, R, color, r }) {
  const rot = -Math.PI / 2 + (rand() - 0.5) * 0.4;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = rot + (i / 10) * TAU;
    const rr = (i % 2 ? R * 0.45 : R) * (0.9 + rand() * 0.2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  sprayPath(buf, ART, pts, r, color, rand);
  sprayPath(buf, ART, stem(cx, cy + R * 0.5, cx - 18, ART - 3, 10, rand), r, color, rand);
}

function clover(buf, rand, { cx, cy, pr, color, r }) {
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k / 4) * TAU;
    sprayPath(buf, ART, loop(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr, pr * 0.85, pr * 0.85, 0, rand), r, color, rand);
  }
  sprayPath(buf, ART, stem(cx, cy + pr * 1.6, cx + 6, ART - 3, -8, rand), r, color, rand);
}

function tulip(buf, rand, { cx, cy, s, color, r }) {
  const cup = [
    [cx - s, cy - s * 0.9], [cx - s * 0.9, cy + s * 0.4], [cx - s * 0.4, cy + s],
    [cx + s * 0.4, cy + s], [cx + s * 0.9, cy + s * 0.4], [cx + s, cy - s * 0.9],
    [cx + s * 0.45, cy - s * 0.3], [cx, cy - s * 1.05], [cx - s * 0.45, cy - s * 0.3], [cx - s, cy - s * 0.9],
  ];
  sprayPath(buf, ART, cup, r, color, rand);
  sprayPath(buf, ART, stem(cx, cy + s, cx + 4, ART - 3, 6, rand), r, color, rand);
  sprayPath(buf, ART, loop(cx - 16, ART - 30, 12, 5, -0.6, rand, 0.6), r * 0.8, color, rand);
}

export function seedFlowers() {
  const now = clockNow();
  const make = (draw, opts, seed) => {
    const buf = new Uint8Array(ART * ART);
    draw(buf, mulberry32(seed), opts);
    return buf;
  };
  return [
    { nx: 0.12, ny: 0.55, age: 0.08, pixels: make(petalFlower, { cx: 70, cy: 50, petals: 5, pr: 22, color: 1, r: 5 }, 11) },
    { nx: 0.24, ny: 0.15, age: 0.42, pixels: make(petalFlower, { cx: 68, cy: 52, petals: 4, pr: 24, color: 2, r: 5.2 }, 23) },
    { nx: 0.33, ny: 0.8, age: 0.62, pixels: make(starFlower, { cx: 74, cy: 54, R: 44, color: 1, r: 5 }, 5) },
    { nx: 0.46, ny: 0.35, age: 0.22, pixels: make(clover, { cx: 72, cy: 50, pr: 20, color: 7, r: 4.4 }, 42) },
    { nx: 0.56, ny: 0.7, age: 0.8, pixels: make(tulip, { cx: 72, cy: 56, s: 26, color: 6, r: 4.8 }, 9) },
    { nx: 0.68, ny: 0.25, age: 0.35, pixels: make(petalFlower, { cx: 72, cy: 48, petals: 6, pr: 18, color: 4, r: 4.4 }, 77) },
  ].map(({ age, ...rest }) => ({ ...rest, age, colors: LEGACY_PALETTE, tendedAt: now - age * lifespanMs() }));
}

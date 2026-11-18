// The places you can go from the garden, drawn far off at the back of it,
// behind the flowers: the gate you came in by, its fence running off the left
// edge, and the tree in the top right corner, running off the right edge,
// simpler from here (the close-up is js/tree.js). The garden draws them and takes the pointer for
// them, like it does for flowers: hovering one shows it can be pressed,
// pressing it goes there. Each also has an invisible button over it, so a
// keyboard can get there too.

import { loadPicture, runLeft } from './picture.js';

// Where things stand, as a share of the screen's height: the gate high up at
// the back, out of the flowers' way, and the tree. New flowers are planted in
// front of both (garden.js).
const GATE_LINE = 0.26;
const TREE_LINE = 0.5;

class Place {
  constructor(button, go) {
    this.button = button;
    this.go = go;
    this.focused = false;
    this.rect = null;
    button.addEventListener('click', () => go());
    button.addEventListener('focus', () => (this.focused = button.matches(':focus-visible')));
    button.addEventListener('blur', () => (this.focused = false));
    this.ready = this.load();
  }

  hit(px, py) {
    const r = this.rect;
    return !!r && px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
  }

  // The keyboard's button sits over what it's for (the part on screen), so a
  // screen reader's outline lands in the right place too.
  placeButton() {
    const r = this.rect;
    const x0 = Math.max(0, r.x);
    const x1 = Math.min(window.innerWidth, r.x + r.w);
    Object.assign(this.button.style, { left: `${x0}px`, top: `${r.y}px`, width: `${x1 - x0}px`, height: `${r.h}px` });
  }
}

// ---------- the tree, far off ----------

// The pictures are drawn K times their drawings' size, with 8 px of empty
// paper all round (tools/make-assets.mjs). In img/tree-small.png: where the
// tree stands, where its little swing hangs (the top left of
// img/swing-small.png) and how far down that the ropes are tied on.
const K = 1.3;
const FOOT = 150 * K + 8;
const SWING_AT = [23 * K, 104 * K];
const KNOT = 3 * K + 8;
const SHOWN = 0.64; // how much of the picture is on screen; the rest runs off the right edge

export class TreePlace extends Place {
  async load() {
    [this.pic, this.swing] = await Promise.all([loadPicture('img/tree-small.png'), loadPicture('img/swing-small.png')]);
    this.push = 0; // how hard the swing is going
    this.phase = 0;
    this.last = null;
  }

  layout(w, h, s) {
    const { pic } = this;
    const pw = pic.w * s;
    const ph = pic.h * s;
    const ground = Math.max(8 + FOOT * s, h * TREE_LINE);
    this.s = s;
    this.at = { x: Math.round(w - pw * SHOWN), y: Math.round(ground - FOOT * s) };
    this.rect = { x: this.at.x, y: this.at.y, w: pw, h: ph };
    this.placeButton();
  }

  // The tree stands still. Wanting to go there gives its swing a push; let
  // go, and the swing slows down and stops by itself.
  draw(ctx, t, hot, still) {
    const { pic, swing, s, at } = this;
    ctx.drawImage(pic.canvas, at.x, at.y, pic.w * s, pic.h * s);

    const dt = this.last == null ? 0 : Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    // a gentle push: a small swing, about one there-and-back every three seconds
    const want = hot && !still ? 0.13 : 0;
    this.push += (want - this.push) * Math.min(1, dt * (hot ? 1.2 : 0.6));
    if (this.push < 0.002 && !hot) this.push = this.phase = 0;
    this.phase += dt * 2.1;

    ctx.save();
    ctx.translate(at.x + SWING_AT[0] * s, at.y + (SWING_AT[1] + KNOT) * s);
    ctx.transform(1, 0, Math.sin(this.phase) * this.push, 1, 0, 0);
    ctx.drawImage(swing.canvas, 0, Math.round(-KNOT * s), swing.w * s, swing.h * s);
    ctx.restore();
  }
}

// ---------- the gate, from the inside ----------

// In img/gate-small.png's columns and rows: drawn at G times its drawing's
// size, with the same 8 px of paper (tools/make-assets.mjs draws it so).
const G = 0.75;
const HINGE = 104 * G + 8; // the last fence post, where the gate is hung
const GAP = [150 * G + 8, 182 * G + 8]; // the open way out, between the gate and the far post
const GROUND = 96 * G + 8; // where the posts stand
const RUN = [20 * G + 8, 92 * G + 8]; // the fence is repeated from here to here, off to the left
const SPROUT_FOOT = 60 * G + 8; // the bottom of the stem in img/sprout-small.png

export class GatePlace extends Place {
  async load() {
    [this.drawing, this.arrow] = await Promise.all([loadPicture('img/gate-small.png'), loadPicture('img/sprout-small.png')]);
  }

  layout(w, h, s) {
    const hinge = Math.round(Math.max(w * 0.06, 24 + 12 * s));
    // the fence runs on past the left edge, however wide the screen
    const [cut, turn] = RUN;
    const need = Math.max(0, Math.ceil(hinge / s) - (HINGE - cut) + 8);
    if (!this.pic || this.more < need) {
      this.more = need + 48;
      this.pic = runLeft(this.drawing, cut, turn, this.more);
    }
    const left = this.more - cut; // added columns, less the ones cut off
    // high up at the back, but never off the top of the screen
    const ground = Math.round(Math.max(h * GATE_LINE, 12 + GROUND * s));
    this.s = s;
    this.at = { x: hinge - (left + HINGE) * s, y: ground - GROUND * s };
    // pressable from the gate's hinge to the far post
    this.rect = { x: hinge - 6 * s, y: this.at.y, w: (this.drawing.w - HINGE + 6) * s, h: (GROUND + 8) * s };
    this.foot = { x: Math.round(this.at.x + (left + (GAP[0] + GAP[1]) / 2) * s), y: ground };
    this.placeButton();
  }

  // Wanted, the little sprout comes up in the gap, as it does at the big gate.
  draw(ctx, t, hot, still) {
    const { pic, s, at, arrow } = this;
    ctx.drawImage(pic.canvas, Math.round(at.x), at.y, pic.w * s, pic.h * s);
    if (!hot) return;
    const shear = still ? 0 : Math.sin(t * 0.85) * 0.03 + Math.sin(t * 1.9) * 0.0075;
    ctx.save();
    ctx.translate(this.foot.x, this.foot.y);
    ctx.transform(1, 0, shear, 1, 0, 0);
    ctx.drawImage(arrow.canvas, Math.round((-arrow.w * s) / 2), Math.round(-SPROUT_FOOT * s), arrow.w * s, arrow.h * s);
    ctx.restore();
  }
}

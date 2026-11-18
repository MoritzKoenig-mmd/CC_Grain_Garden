// The way in. The sprayed fence with its gate swung open (img/gate.png and
// img/fence.png, cut from the original export in _assets), running on past
// both edges of the screen. Hovering the gap between gate and fence brings up
// the leafy arrow from the "enter the garden" drawing (img/arrow.png),
// pointing in; pressing it makes the whole picture wither away the way a
// flower does, and the garden shows through underneath. Going back out
// through the little gate in the garden grows it all back again.

import { artScale } from './config.js';
import { loadPicture, runLeft, runRight } from './picture.js';
import { Scene } from './scene.js';

// Where things sit, in art px (one pixel of the original gate export).
const GAP = 138; // open space between the gate and the fence
const GATE_LEAF = 120; // how much of the open gate must be on screen, left of the gap
const FENCE_SHOWN = 90; // ...and how much fence right of it
const GROUND = 296; // where the fence posts end; the arrow stands here
const DOOR = [40, GROUND + 18]; // top and bottom of the pressable gap

// The fence goes on: a stretch of each drawing, from halfway between two
// posts to halfway between two others, is repeated out past the screen's
// edge (see runLeft in picture.js). Each is [where the drawing is cut, where
// the copies turn back], in columns.
const GATE_RUN = [72, 184]; // img/gate.png, running off to the left
const FENCE_RUN = [201, 71]; // img/fence.png, running off to the right

const HOLD = 260; // after a tap, how long the arrow shows before it all goes

export class Intro extends Scene {
  constructor(root, { onEnter }) {
    super(root);
    this.onEnter = onEnter;
    this.door = root.querySelector('.door');
    this.hovering = false;
    this.focused = false;
    this.#bind();
    this.boot();
  }

  async loadPictures() {
    [this.gateDrawing, this.fenceDrawing, this.arrow] = await Promise.all([
      loadPicture('img/gate.png'),
      loadPicture('img/fence.png'),
      loadPicture('img/arrow.png'),
    ]);
  }

  // without the gate there's no way in to show: straight to the garden
  failed() {
    this.onEnter();
  }

  get pieces() {
    return [this.left, this.right, this.arrow];
  }

  // the arrow is showing in the gap
  get up() {
    return this.state === 'leaving' || this.state === 'withering' || this.hovering || this.focused;
  }

  #bind() {
    const door = this.door;
    // touch has no hover: a tap shows the arrow and then goes in
    door.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') this.hovering = true;
    });
    door.addEventListener('pointerleave', () => (this.hovering = false));
    door.addEventListener('focus', () => (this.focused = door.matches(':focus-visible')));
    door.addEventListener('blur', () => (this.focused = false));
    door.addEventListener('click', () => {
      if (this.isHere) this.onEnter();
    });
  }

  changed() {
    this.door.setAttribute('aria-disabled', String(!this.isHere));
    if (this.state === 'away') this.hovering = this.focused = false;
    // back out at the gate by keyboard: on the gap, ready to go in again
    if (this.isHere && this.focusOnArrival) {
      this.focusOnArrival = false;
      this.door.focus({ preventScroll: true });
    }
  }

  show(opts = {}) {
    this.focusOnArrival = !opts.instant;
    return super.show(opts);
  }

  // Going in: already showing (the pointer was resting on it), go straight
  // away; otherwise let the arrow be seen for a moment first.
  hide(opts = {}) {
    super.hide({ hold: this.up ? 0 : HOLD, ...opts });
  }

  // ---------- layout ----------

  layout(w, h) {
    const sceneH = Math.max(this.gateDrawing.h, this.fenceDrawing.h);
    const m = 16;
    // as big as the garden draws its flowers, as long as it fits the height and
    // the open gate, the gap and a bit of fence past it fit the width
    const s = Math.min(artScale(w, h), (h * 0.86) / sceneH, (w - 2 * m) / (GATE_LEAF + GAP + FENCE_SHOWN));
    // the gap a little right of the middle, as in the sketch
    let gap = w * 0.57 - (GAP * s) / 2;
    gap = Math.min(w - m - (GAP + FENCE_SHOWN) * s, Math.max(m + GATE_LEAF * s, gap));

    this.s = s;
    this.at = { gap, top: Math.round((h - sceneH * s) / 2) };
    Object.assign(this.door.style, {
      left: `${gap - 4}px`,
      top: `${this.at.top + DOOR[0] * s}px`,
      width: `${GAP * s + 8}px`,
      height: `${(DOOR[1] - DOOR[0]) * s}px`,
    });
    this.#runFence();
  }

  // Make sure the fence reaches past both edges of the screen, growing it if a
  // bigger screen needs more (it never shrinks; the rest is just off screen).
  // Not while it's coming or going: the pieces would change under it.
  #runFence() {
    if (this.left && this.state !== 'here' && this.state !== 'away') return;
    const { s, at, w } = this;
    const spare = 64; // a little more than needed, so small resizes don't rebuild it

    const gate = this.gateDrawing;
    const [gCut, gTurn] = GATE_RUN;
    const needL = Math.max(0, Math.ceil(at.gap / s) - (gate.w - gCut) + 8);
    if (!this.left || this.moreLeft < needL) {
      this.moreLeft = needL + spare;
      this.left = runLeft(gate, gCut, gTurn, this.moreLeft);
    }

    const fence = this.fenceDrawing;
    const [fCut, fTurn] = FENCE_RUN;
    const needR = Math.max(0, Math.ceil((w - at.gap) / s) - GAP - (fCut + 1) + 8);
    if (!this.right || this.moreRight < needR) {
      this.moreRight = needR + spare;
      this.right = runRight(fence, fCut, fTurn, this.moreRight);
    }
  }

  // ---------- frames ----------

  draw(ctx, t) {
    const { s, at, arrow } = this;
    const put = (pic, x, y) => ctx.drawImage(pic.canvas, Math.round(x), Math.round(y), pic.w * s, pic.h * s);
    put(this.left, at.gap - this.left.w * s, at.top);
    put(this.right, at.gap + GAP * s, at.top);
    if (!this.up) return;

    // the arrow stands in the middle of the gap like a sprout, swaying a little
    const shear = this.still ? 0 : Math.sin(t * 0.85) * 0.03 + Math.sin(t * 1.9) * 0.0075;
    ctx.save();
    ctx.translate(Math.round(at.gap + (GAP * s) / 2), Math.round(at.top + GROUND * s));
    ctx.transform(1, 0, shear, 1, 0, 0);
    ctx.drawImage(arrow.canvas, Math.round((-arrow.w * s) / 2), Math.round(-arrow.h * s), arrow.w * s, arrow.h * s);
    ctx.restore();
  }
}

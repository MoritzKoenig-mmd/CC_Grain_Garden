// The tree: a place of its own, off in the top right corner of the garden.
// A big sprayed tree full of funny fruit (img/tree.png, sprayed by
// tools/make-assets.mjs), with a swing hanging off its lowest branch and a note
// left on the seat. Pressing the note takes it off the swing and opens it: it
// says what this garden is. The little arrow in the corner leads back to the
// garden. Like the gate, the whole place grows in over the garden and withers
// away again when you leave (see scene.js).

import { artScale } from './config.js';
import { loadPicture } from './picture.js';
import { Scene } from './scene.js';

// Where things are, in art px of the PNGs (each has 8 px of empty paper all
// round). tools/make-assets.mjs draws them to match.
const TREE = [376, 400]; // img/tree.png
const SWING_AT = [48, 228]; // top left of img/swing.png on the tree
const KNOT = 11; // how far down swing.png the ropes are tied to the branch: it swings from there
const NOTE_AT = [30, 58]; // top left of img/note.png on the swing

export class TreeScene extends Scene {
  constructor(root, { onBack }) {
    super(root);
    this.onBack = onBack;
    this.noteBtn = root.querySelector('.note-btn');
    this.way = root.querySelector('.way');
    this.reader = root.querySelector('.reader');
    this.sheet = this.reader.querySelector('.reader-sheet');
    this.closeBtn = this.reader.querySelector('.reader-close');
    this.ui = root.querySelector('.tree-ui');
    this.hover = { note: false, way: false };
    this.reading = false;
    this.#bind();
    this.boot();
  }

  async loadPictures() {
    [this.tree, this.swing, this.note, this.arrow] = await Promise.all([
      loadPicture('img/tree.png'),
      loadPicture('img/swing.png'),
      loadPicture('img/note.png'),
      loadPicture('img/arrow-small.png'),
    ]);
  }

  get pieces() {
    return [this.tree, this.swing, this.note, this.arrow];
  }

  #bind() {
    // hovering a pointer or a keyboard focus both count, like the gate's gap
    for (const [key, btn] of [['note', this.noteBtn], ['way', this.way]]) {
      btn.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'touch') this.hover[key] = true;
      });
      btn.addEventListener('pointerleave', () => (this.hover[key] = false));
      btn.addEventListener('focus', () => (this.hover[key] = btn.matches(':focus-visible')));
      btn.addEventListener('blur', () => (this.hover[key] = false));
    }
    this.noteBtn.addEventListener('click', () => this.read());
    this.way.addEventListener('click', () => this.isHere && this.onBack());
    this.closeBtn.addEventListener('click', () => this.putBack());
    // the reader is a pop-up: pressing the veil around the paper puts it back too
    this.reader.addEventListener('click', (e) => {
      if (e.target === this.reader) this.putBack();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isHere || e.key !== 'Escape' || e.target.closest?.('#dev')) return;
      if (this.reading) this.putBack();
      else this.onBack();
    });
  }

  changed() {
    // nothing to press while it's coming or going, or while the note's open
    this.ui.inert = !this.isHere || this.reading;
    if (this.state === 'away') {
      this.hover.note = this.hover.way = false;
      this.putBack({ now: true });
    }
    // arriving by keyboard: start on the note
    if (this.isHere && this.focusOnArrival) {
      this.focusOnArrival = false;
      this.noteBtn.focus({ preventScroll: true });
    }
  }

  show(opts = {}) {
    this.focusOnArrival = !opts.instant;
    return super.show(opts);
  }

  // ---------- the note ----------

  // Take the note off the swing and open it out.
  read() {
    if (!this.isHere || this.reading) return;
    this.reading = true;
    this.ui.inert = true;
    this.reader.hidden = false;
    this.root.classList.add('reading');
    this.flight?.cancel();
    const from = this.noteBtn.getBoundingClientRect();
    this.flight = this.#fly(from, false);
    this.closeBtn.focus({ preventScroll: true });
  }

  // Fold it up and put it back on the seat.
  putBack({ now = false } = {}) {
    if (!this.reading) return;
    this.flight?.cancel();
    const done = () => {
      this.reading = false;
      this.reader.hidden = true;
      this.reader.classList.remove('closing');
      this.root.classList.remove('reading');
      this.ui.inert = !this.isHere;
      this.flight = null;
    };
    if (now) return done();
    this.flight = this.#fly(this.noteBtn.getBoundingClientRect(), true);
    if (!this.flight) {
      done();
      this.noteBtn.focus({ preventScroll: true });
      return;
    }
    this.reader.classList.add('closing');
    this.flight.onfinish = () => {
      done();
      this.noteBtn.focus({ preventScroll: true });
    };
  }

  // The paper flies between the swing seat and the middle of the screen.
  #fly(note, back) {
    if (this.still) return null;
    const a = this.sheet.getBoundingClientRect();
    const dx = note.left + note.width / 2 - (a.left + a.width / 2);
    const dy = note.top + note.height / 2 - (a.top + a.height / 2);
    const k = Math.max(0.05, note.width / a.width);
    const small = { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-12deg)`, opacity: 0.6 };
    const big = { transform: 'none', opacity: 1 };
    return this.sheet.animate(back ? [big, small] : [small, big], {
      duration: back ? 360 : 460,
      easing: back ? 'cubic-bezier(.55,0,.75,.2)' : 'cubic-bezier(.2,.8,.2,1)',
      fill: 'both',
    });
  }

  // ---------- layout ----------

  layout(w, h) {
    const m = 16;
    const [W, H] = TREE;
    // the same grain as the garden, as long as the whole tree fits
    const s = Math.min(artScale(w, h), (h * 0.84) / H, (w - 2 * m) / W);
    this.s = s;
    this.at = { x: Math.round((w - W * s) / 2), y: Math.round((h - H * s) / 2) };

    // the swing hangs from its knots on the branch
    this.pivot = { x: Math.round(this.at.x + SWING_AT[0] * s), y: Math.round(this.at.y + (SWING_AT[1] + KNOT) * s) };
    const note = this.note;
    this.noteBox = {
      x: NOTE_AT[0] * s,
      y: (NOTE_AT[1] - KNOT) * s,
      w: note.w * s,
      h: note.h * s,
    };
    const pad = 10;
    Object.assign(this.noteBtn.style, {
      left: `${this.pivot.x + this.noteBox.x - pad}px`,
      top: `${this.pivot.y + this.noteBox.y - pad}px`,
      width: `${this.noteBox.w + 2 * pad}px`,
      height: `${this.noteBox.h + 2 * pad}px`,
    });

    // the way back: the little sprout lying down in the bottom corner, pointing left
    const arrow = this.arrow;
    this.wayBox = { w: arrow.h * s, h: arrow.w * s };
    this.way.style.setProperty('--arrow-w', `${this.wayBox.w}px`);
    this.way.style.setProperty('--arrow-h', `${this.wayBox.h}px`);
  }

  // ---------- frames ----------

  draw(ctx, t) {
    const { s, at } = this;
    const put = (pic, x, y) => ctx.drawImage(pic.canvas, Math.round(x), Math.round(y), pic.w * s, pic.h * s);
    put(this.tree, at.x, at.y);

    // the swing goes gently to and fro, by itself
    const still = this.still || this.reading;
    const sway = still ? 0 : Math.sin(t * 1.25) * 0.045 + Math.sin(t * 2.7) * 0.006;
    ctx.save();
    ctx.translate(this.pivot.x, this.pivot.y);
    ctx.transform(1, 0, sway, 1, 0, 0);
    put(this.swing, 0, -KNOT * s);
    // the note sits on the seat (not while it's being read), lifting a touch when wanted
    const lift = this.hover.note ? -2 * s : 0;
    if (!this.reading) put(this.note, this.noteBox.x, this.noteBox.y + lift);
    ctx.restore();
    // its button goes along with it
    this.noteBtn.style.translate = `${Math.round(sway * (this.noteBox.y + this.noteBox.h / 2))}px 0`;

    // the sprout pointing back to the garden, wagging when wanted (and out of
    // the way while the note's open)
    if (this.reading) return;
    const r = this.way.getBoundingClientRect();
    const wag = this.hover.way && !this.still ? Math.sin(t * 7) * 0.08 : 0;
    const { w, h } = this.wayBox;
    ctx.save();
    ctx.translate(Math.round(r.left + 8 + w), Math.round(r.top + r.height / 2));
    ctx.rotate(-Math.PI / 2); // up becomes left; its foot is now on the right
    ctx.transform(1, 0, wag, 1, 0, 0);
    ctx.drawImage(this.arrow.canvas, Math.round(-h / 2), Math.round(-w), h, w);
    ctx.restore();
  }
}

import { ART, toRgbTable } from './config.js';
import { sprayStamp, sprayLine, bufferToImage } from './brush.js';
import { settings, onSettings, randomColor, randomBrush } from './settings.js';
import { drawStem } from './stems.js';
import { sprayedEdge, randomSeed } from './noise.js';
import { addGlow } from './glow.js';

// The drawing sheet. Nobody chooses a colour or a brush: they are picked at
// random from the dev-mode lists, once per drawing or anew for every stroke.
export class Studio {
  constructor({ onPlant, onLeave, onKeep }) {
    this.onPlant = onPlant;
    this.onLeave = onLeave;
    this.onKeep = onKeep;
    this.el = document.getElementById('studio');
    this.paper = document.getElementById('paper');
    this.ctx = this.paper.getContext('2d');
    this.img = this.ctx.createImageData(ART, ART);
    this.buf = new Uint8Array(ART * ART);
    this.colors = []; // this drawing's colours; pixel v → colors[v - 1]
    this.history = [];
    this.erasing = false;
    this.flower = null;
    this.dirty = false;

    this.plantBtn = document.getElementById('plant');
    this.keepBtn = document.getElementById('keep');
    this.sheet = this.el.querySelector('.sheet');
    this.eraseBtn = this.el.querySelector('[data-tool="erase"]');

    this.#bindPaper();
    this.#bindButtons();
    this.#applyTools();
    onSettings(() => this.#applyTools());
  }

  // Show only the tools switched on in dev mode (all off by default).
  #applyTools() {
    for (const name of ['erase', 'undo', 'clear']) {
      this.el.querySelector(`[data-tool="${name}"]`).hidden = !settings.tools[name];
    }
    if (!settings.tools.erase && this.erasing) this.#setErasing(false);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open(flower, pixels) {
    this.flower = flower;
    this.buf = pixels ? new Uint8Array(pixels) : new Uint8Array(ART * ART);
    // every drawing gets its own grainy border, so no two edges match
    this.stencil = sprayedEdge(ART, randomSeed());
    this.colors = flower ? [...flower.colors] : [];
    this.rgb = toRgbTable(this.colors);
    this.history = [];
    this.strokes = 0;
    this.hex = null;
    this.#setErasing(false);
    // a new drawing starts from one of the predefined stems
    if (!flower && settings.stems) {
      drawStem(this.buf, this.#indexOf(settings.stemColor));
      this.hex = settings.stemColor; // so the first stroke differs from the stem
    }
    this.#clip();
    if (flower) this.#pickColorOnFlower();
    else this.#pickColor();
    this.#pickBrush();
    this.plantBtn.textContent = flower ? 'replant' : 'plant';
    // only a flower from the garden can be kept in the album
    this.keepBtn.hidden = !flower;
    this.keepBtn.textContent = 'keep';
    this.flight?.cancel();
    this.el.inert = false;
    this.el.classList.remove('flying');
    this.el.hidden = false;
    this.#render();
  }

  close() {
    this.el.hidden = true;
    this.flower = null;
  }

  // Pixel value for a colour, adding it to this drawing's colours if new.
  #indexOf(hex) {
    let idx = this.colors.indexOf(hex);
    if (idx < 0) {
      this.colors.push(hex);
      this.rgb = toRgbTable(this.colors);
      idx = this.colors.length - 1;
    }
    return idx + 1;
  }

  // Draw a fresh colour from the hat (never the one just used).
  #pickColor() {
    this.hex = randomColor(this.hex);
    this.value = this.#indexOf(this.hex);
  }

  // Tending a flower: the first stroke carries on in one of the colours still
  // on it (not ones that have withered away), so a blue flower with a green
  // stem starts with blue or green.
  #pickColorOnFlower() {
    const present = [...new Set(this.buf)].filter((v) => v);
    if (!present.length) return this.#pickColor();
    this.value = present[Math.floor(Math.random() * present.length)];
    this.hex = this.colors[this.value - 1];
  }

  #pickBrush() {
    this.radius = randomBrush();
  }

  // ---------- ui ----------

  #setErasing(on) {
    this.erasing = on;
    this.eraseBtn.setAttribute('aria-pressed', String(on));
  }

  #bindButtons() {
    this.eraseBtn.addEventListener('click', () => this.#setErasing(!this.erasing));
    this.el.querySelector('[data-tool="undo"]').addEventListener('click', () => this.#undo());
    this.el.querySelector('[data-tool="clear"]').addEventListener('click', () => {
      this.#snapshot();
      this.buf.fill(0);
      this.#render();
    });
    document.getElementById('leave').addEventListener('click', () => this.#leave());
    this.plantBtn.addEventListener('click', () => this.#plant());
    this.keepBtn.addEventListener('click', () => this.#keep());

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || this.el.inert || e.target.closest?.('#dev')) return;
      if (e.key === 'Escape') this.#leave();
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (settings.tools.undo) this.#undo();
      } else if (e.key === 'e' && settings.tools.erase) this.#setErasing(!this.erasing);
    });
  }

  #leave() {
    const f = this.flower;
    this.close();
    this.onLeave(f);
  }

  // Drop colours that ended up unused and renumber the pixels to match.
  #compact() {
    const used = new Set(this.buf);
    used.delete(0);
    const keep = [...used].sort((a, b) => a - b);
    const remap = new Uint8Array(256);
    keep.forEach((v, k) => (remap[v] = k + 1));
    const pixels = this.buf.map((v) => remap[v]);
    return { pixels, colors: keep.map((v) => this.colors[v - 1]) };
  }

  #plant() {
    const f = this.flower;
    const { pixels, colors } = this.#compact();
    this.close();
    this.onPlant(pixels, colors, f);
  }

  // Put what's on the paper into the album. The flower in the garden goes on
  // living as it was; the album keeps this copy.
  #keep() {
    const { pixels, colors } = this.#compact();
    if (!this.onKeep(pixels, colors)) {
      this.keepBtn.textContent = 'album full'; // the browser refused to store more
      return;
    }
    this.el.inert = true; // nothing to press while it flies
    this.el.classList.add('flying');
    this.#flyInto(document.getElementById('album-open'), () => this.#leave());
  }

  // The sheet shrinks away into the album word.
  #flyInto(target, done) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    const a = this.sheet.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    this.flight = this.sheet.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(-14deg)`, opacity: 0.5 },
      ],
      { duration: 520, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'forwards' },
    );
    this.flight.onfinish = done;
  }

  #snapshot() {
    this.history.push(new Uint8Array(this.buf));
    if (this.history.length > 40) this.history.shift();
  }

  #undo() {
    const prev = this.history.pop();
    if (!prev) return;
    this.buf = prev;
    this.#render();
  }

  // ---------- drawing ----------

  // Paint only lands where the stencil allows: the edge dissolves into grain.
  #clip() {
    const { buf, stencil } = this;
    for (let i = 0; i < buf.length; i++) if (!stencil[i]) buf[i] = 0;
  }

  #toArt(e) {
    const r = this.paper.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * ART - 0.5, ((e.clientY - r.top) / r.height) * ART - 0.5];
  }

  #radius(e) {
    const base = this.radius * (this.erasing ? 1.4 : 1);
    return e.pointerType === 'pen' && e.pressure > 0 ? base * (0.45 + e.pressure * 1.1) : base;
  }

  #bindPaper() {
    let last = null;
    const p = this.paper;

    p.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { p.setPointerCapture(e.pointerId); } catch {}
      if (!this.erasing) {
        // the first stroke uses what was picked on opening; later ones may re-pick
        if (this.strokes > 0 && settings.colorPer === 'stroke') this.#pickColor();
        if (this.strokes > 0 && settings.brushPer === 'stroke') this.#pickBrush();
        this.strokes++;
      }
      this.#snapshot();
      last = this.#toArt(e);
      sprayStamp(this.buf, ART, last[0], last[1], this.#radius(e), this.erasing ? 0 : this.value);
      this.#clip();
      this.#render();
    });

    p.addEventListener('pointermove', (e) => {
      if (!last) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) {
        const pt = this.#toArt(ev);
        sprayLine(this.buf, ART, last[0], last[1], pt[0], pt[1], this.#radius(ev), this.erasing ? 0 : this.value);
        last = pt;
      }
      this.#clip();
      this.#render();
    });

    const end = () => { last = null; };
    p.addEventListener('pointerup', end);
    p.addEventListener('pointercancel', end);
  }

  #render() {
    if (this.dirty) return;
    this.dirty = true;
    requestAnimationFrame(() => {
      this.dirty = false;
      bufferToImage(this.buf, this.img, this.rgb);
      addGlow(this.img.data, ART, ART);
      this.ctx.putImageData(this.img, 0, 0);
      const empty = !this.buf.some((v) => v);
      // a new flower needs at least one stroke of its own (the stem alone isn't one);
      // an existing one may be cleared away entirely
      this.plantBtn.disabled = !this.flower && (empty || this.strokes === 0);
      this.keepBtn.disabled = empty;
    });
  }
}

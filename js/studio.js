import { ART, toRgbTable } from './config.js';
import { sprayStamp, sprayLine, bufferToImage } from './brush.js';
import { settings, onSettings, randomColor, randomBrush } from './settings.js';
import { drawStem } from './stems.js';

// The drawing sheet. Nobody chooses a colour or a brush: they are picked at
// random from the dev-mode lists, once per drawing or anew for every stroke.
export class Studio {
  constructor({ onPlant, onLeave }) {
    this.onPlant = onPlant;
    this.onLeave = onLeave;
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
    this.#pickColor();
    this.#pickBrush();
    this.plantBtn.textContent = flower ? 'replant' : 'plant';
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

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.target.closest?.('#dev')) return;
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
      this.ctx.putImageData(this.img, 0, 0);
      const empty = !this.buf.some((v) => v);
      // a new flower needs at least one stroke of its own (the stem alone isn't one);
      // an existing one may be cleared away entirely
      this.plantBtn.disabled = !this.flower && (empty || this.strokes === 0);
    });
  }
}

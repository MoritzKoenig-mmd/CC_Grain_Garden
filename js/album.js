import { ART, toRgbTable, toNeon } from './config.js';
import * as store from './store.js';

// The album: a pop-up over the garden like the drawing sheet, with a stream of
// paper running off the top and bottom of the screen and every kept flower
// laid down it, newest first. Kept flowers are picked from the garden (they
// leave it), never wither here and are there for good: nothing in the album
// can be taken out again. Each is cropped to its drawing but drawn at one shared
// pixel size, so a small flower stays small next to a big one.

const dateLabel = (ms) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase();

// Bounding box of the drawn pixels: [x0, y0, x1, y1], or null if empty.
function boxOf(pixels) {
  let x0 = ART, y0 = ART, x1 = -1, y1 = -1;
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i]) continue;
    const x = i % ART, y = (i / ART) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

export class Album {
  constructor({ onOpen, onClose }) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.el = document.getElementById('album'); // also what scrolls
    this.list = this.el.querySelector('.kept');
    this.empty = this.el.querySelector('.album-empty');
    this.count = this.el.querySelector('.album-count');
    this.openBtn = document.getElementById('album-open');
    this.closeBtn = document.getElementById('album-close');
    // flowers kept before the colours went neon are shown in neon too
    this.entries = store.loadAlbum().map((e) => ({ ...e, colors: toNeon(e.colors || []) }));

    // paint flowers only as they scroll near, so a long album stays light
    this.observer = new IntersectionObserver(
      (seen) => {
        for (const { isIntersecting, target } of seen) {
          if (!isIntersecting) continue;
          this.observer.unobserve(target);
          this.#paint(target, target.entry);
        }
      },
      { root: this.el, rootMargin: '800px 0px' },
    );

    this.openBtn.addEventListener('click', () => this.open());
    this.closeBtn.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape' && !e.target.closest?.('#dev')) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open() {
    this.#render();
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.onOpen();
    this.closeBtn.focus({ preventScroll: true });
  }

  #updateCount() {
    const n = this.entries.length;
    this.empty.hidden = n > 0;
    this.count.textContent = n ? `${n} kept` : '';
  }

  close() {
    this.el.hidden = true;
    this.onClose();
  }

  // Keep a copy of a drawing. Returns false if the browser wouldn't store it.
  add(pixels, colors) {
    const box = boxOf(pixels);
    if (!box) return false;
    const no = this.entries.reduce((m, e) => Math.max(m, e.no || 0), 0) + 1;
    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      no,
      keptAt: Date.now(),
      colors: [...colors],
      box,
      pixels: store.encode(pixels),
    };
    const next = [...this.entries, entry];
    if (!store.saveAlbum(next)) return false;
    this.entries = next;
    // the album word hops once the sheet has flown into it
    this.openBtn.classList.remove('bump');
    void this.openBtn.offsetWidth;
    this.openBtn.classList.add('bump');
    return true;
  }

  #render() {
    this.observer.disconnect();
    const items = [];
    for (let i = this.entries.length - 1; i >= 0; i--) items.push(this.#item(this.entries[i]));
    this.list.replaceChildren(...items);
    this.#updateCount();
  }

  #item(entry) {
    const [x0, y0, x1, y1] = entry.box;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const label = `no. ${entry.no} · ${dateLabel(entry.keptAt)}`;

    const li = document.createElement('li');
    li.className = 'kept-flower';

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.style.setProperty('--w', w);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `kept flower ${label}`);
    canvas.entry = entry;
    this.observer.observe(canvas);

    const caption = document.createElement('p');
    caption.className = 'kept-label';
    caption.textContent = label;

    li.append(canvas, caption);
    return li;
  }

  #paint(canvas, entry) {
    const [x0, y0] = entry.box;
    const { width: w, height: h } = canvas;
    const pixels = store.decode(entry.pixels, ART * ART);
    const rgb = toRgbTable(entry.colors);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = pixels[(y + y0) * ART + x + x0];
        if (!v) continue;
        const c = rgb[v];
        const j = (y * w + x) * 4;
        img.data[j] = c[0];
        img.data[j + 1] = c[1];
        img.data[j + 2] = c[2];
        img.data[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}

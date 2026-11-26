import { ART, toRgbTable, toNeon } from './config.js';
import * as store from './store.js';
import { settings, onSettings } from './settings.js';
import { drawFrame } from './deco.js';

// The album: a pop-up over the garden like the drawing sheet, with a stream of
// paper running off the top and bottom of the screen and every kept flower
// laid down it, newest first. Kept flowers are picked from the garden (they
// leave it), never wither here and are there for good: nothing in the album
// can be taken out again. Each is cropped to its drawing but drawn at one shared
// pixel size, so a small flower stays small next to a big one.
//
// The album is everyone's: in the shared garden its flowers live in the room
// (js/shared.js), so a flower kept by anyone shows up in every album, open ones
// included. Each browser also keeps a copy of the flowers kept in it; that's
// the album it shows when the room can't be reached, and anything kept while
// out of reach goes into the shared album the next time the room is there.
// Flowers are numbered in the order they were kept, across everyone.

// A kept flower as the room or this browser has it, checked; null if it's unreadable.
function entryOf(r) {
  if (!r || typeof r.id !== 'string' || typeof r.pixels !== 'string' || !Number.isFinite(r.keptAt)) return null;
  if (!Array.isArray(r.box) || r.box.length !== 4 || !r.box.every(Number.isInteger)) return null;
  if (!Array.isArray(r.colors) || !r.colors.every((c) => typeof c === 'string')) return null;
  // (flowers kept before the colours went neon are shown in neon too)
  return { id: r.id, keptAt: r.keptAt, colors: toNeon(r.colors), box: [...r.box], pixels: r.pixels };
}

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

// A kept flower's drawing, cropped to its box, as ImageData.
function imageOf(entry) {
  const [x0, y0, x1, y1] = entry.box;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const pixels = store.decode(entry.pixels, ART * ART);
  const rgb = toRgbTable(entry.colors);
  const img = new ImageData(w, h);
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
  return img;
}

// The exported PNG: one art px is EXPORT_PX image px, and the strip is as wide
// as on screen relative to the drawings (a whole drawing fills 55% of it).
const EXPORT_PX = 3;
const EXPORT_W = Math.round((ART * EXPORT_PX) / 0.55);

export class Album {
  constructor({ onOpen, onClose }) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.el = document.getElementById('album'); // also what scrolls
    this.list = this.el.querySelector('.kept');
    this.empty = this.el.querySelector('.album-empty');
    this.openBtn = document.getElementById('album-open');
    this.closeBtn = document.getElementById('album-close');
    // the paper and the sprayed line round it (js/deco.js), behind the flowers
    this.stream = this.el.querySelector('.stream');
    this.title = this.el.querySelector('.stream-title');
    this.frame = document.createElement('div');
    this.frame.className = 'album-frame';
    this.frame.setAttribute('aria-hidden', 'true');
    this.stream.prepend(this.frame);
    // measures one art px (the album's --px) in css px
    this.probe = document.createElement('div');
    this.probe.className = 'album-probe';
    this.el.append(this.probe);
    this.#applyLayout();
    onSettings(() => this.#applyLayout());
    // the paper grows with every flower and follows the screen and the columns
    new ResizeObserver(() => this.isOpen && this.#drawFrame()).observe(this.stream);
    this.room = null; // the shared album, once the room is there (useRoom)
    this.entries = [];
    this.shown = ''; // which flowers the open album shows, so it's only redrawn when that changes
    this.#setEntries(store.loadAlbum());

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

  // From dev mode: how many columns the flowers are laid out in (the stream
  // widens to hold them), and the gap above and below the paper.
  #applyLayout() {
    const n = Math.min(6, Math.max(1, Math.round(settings.albumColumns) || 1));
    this.el.style.setProperty('--cols', n);
    this.el.dataset.cols = n;
    const gap = Number.isFinite(settings.albumGap) ? Math.max(0, settings.albumGap) : 15;
    this.el.style.setProperty('--gap', `${gap}px`);
    const room = Number.isFinite(settings.albumTitleSpace) ? Math.max(0, settings.albumTitleSpace) : 63;
    this.el.style.setProperty('--title-space', `${room}px`);
    if (this.isOpen) this.#drawFrame();
  }

  // Spray the frame for the paper as it is now. (Layout sizes, not on-screen
  // ones: the paper is still rising into place when the album opens.)
  #drawFrame() {
    const px = this.probe.offsetWidth / 1000;
    const width = this.stream.offsetWidth;
    const height = this.stream.offsetHeight;
    // the word itself, not its line: where the frame leaves its gap
    const words = document.createRange();
    words.selectNodeContents(this.title);
    const r = words.getBoundingClientRect();
    const s = this.stream.getBoundingClientRect();
    const k = s.width / width || 1; // (in case the paper is scaled as it rises in)
    const title = { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
    if (!px || !width || !height) return;
    const key = [width, height, px, title.x, title.y, title.w, title.h].join('|');
    if (key === this.frameKey) return;
    this.frameKey = key;
    drawFrame(this.frame, width, height, title, px);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open() {
    this.#render();
    this.el.hidden = false;
    this.#drawFrame();
    this.el.scrollTop = 0;
    this.onOpen();
    this.closeBtn.focus({ preventScroll: true });
  }

  #updateEmpty() {
    const n = this.entries.length;
    this.empty.hidden = n > 0;
  }

  close() {
    this.el.hidden = true;
    this.onClose();
  }

  // Share the album: from now on it's the room's (`room` is a keyed channel,
  // js/shared.js). Flowers kept in this browser that the room hasn't had yet
  // go in first.
  useRoom(room) {
    this.room = room;
    const own = store.loadAlbum();
    const fresh = own.filter((e) => !e.shared).map(entryOf).filter(Boolean);
    if (fresh.length) {
      room.putMany(fresh);
      store.saveAlbum(own.map((e) => ({ ...e, shared: true })));
    }
    room.onChange((records) => this.#setEntries(Object.values(records)));
    this.#setEntries(Object.values(room.get()));
  }

  // The album is now `list` (in any order, duplicates and unreadable ones left out).
  #setEntries(list) {
    const byId = new Map();
    for (const r of list) {
      const e = entryOf(r);
      if (e) byId.set(e.id, e);
    }
    this.entries = [...byId.values()].sort((a, b) => a.keptAt - b.keptAt || (a.id < b.id ? -1 : 1));
    this.entries.forEach((e, i) => (e.no = i + 1));
    if (this.isOpen && this.#key() !== this.shown) {
      // someone kept a flower while it's open: it appears at the top, and what
      // was being looked at stays where it was
      const before = this.list.offsetHeight;
      this.#render();
      if (this.el.scrollTop > 0) this.el.scrollTop += this.list.offsetHeight - before;
    }
  }

  #key() {
    return this.entries.map((e) => e.id).join(',');
  }

  // Empty the album: everyone's in the shared garden, and this browser's copy.
  clear() {
    if (this.room) this.room.clear();
    store.saveAlbum([]);
    this.#setEntries([]);
  }

  // Keep a copy of a drawing. Returns false if it couldn't be kept anywhere.
  add(pixels, colors) {
    const box = boxOf(pixels);
    if (!box) return false;
    const entry = {
      id: Math.random().toString(36).slice(2, 10),
      keptAt: Date.now(),
      colors: [...colors],
      box,
      pixels: store.encode(pixels),
    };
    // this browser's copy (with its number, as albums from before sharing had)
    const own = store.loadAlbum();
    const saved = store.saveAlbum([...own, { ...entry, no: own.length + 1, shared: !!this.room }]);
    if (this.room) this.room.put(entry);
    else if (!saved) return false;
    this.#setEntries([...this.entries, entry]);
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
    this.shown = this.#key();
    this.#updateEmpty();
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
    canvas.getContext('2d').putImageData(imageOf(entry), 0, 0);
  }

  // The whole album as one tall PNG, laid out like the stream: newest first,
  // on the paper strip, one art px drawn as EXPORT_PX image px. Resolves to a Blob.
  async exportPng() {
    const k = EXPORT_W / 460; // image px per css px of the on-screen stream
    const hand = getComputedStyle(document.documentElement).getPropertyValue('--hand').trim() || 'sans-serif';
    const titleFont = `700 ${30 * k}px ${hand}`;
    const labelFont = `700 ${20 * k}px ${hand}`;
    await Promise.all([document.fonts.load(titleFont, 'album'), document.fonts.load(labelFont, 'no. 0')]);
    const strip = new Image();
    strip.src = 'img/strip.png';
    await strip.decode();

    const measure = document.createElement('canvas').getContext('2d');
    const items = [...this.entries].reverse().map((entry) => {
      const label = `no. ${entry.no} · ${dateLabel(entry.keptAt)}`;
      measure.font = labelFont;
      const [x0, y0, x1, y1] = entry.box;
      const w = (x1 - x0 + 1) * EXPORT_PX;
      const h = (y1 - y0 + 1) * EXPORT_PX;
      return { entry, label, w, h, lw: measure.measureText(label).width };
    });

    const titleH = 30 * k * 1.4;
    const labelH = 20 * k * 1.4 + 10 * k; // the caption plus its gap and margin
    const gap = 44 * k;
    let height = 72 * k + titleH + 28 * k;
    height += items.reduce((sum, it) => sum + it.h + labelH, 0) + gap * Math.max(0, items.length - 1);
    height = Math.ceil(height + 120 * k);

    const c = document.createElement('canvas');
    c.width = EXPORT_W;
    c.height = height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = settings.background;
    ctx.fillRect(0, 0, c.width, c.height);
    const tileH = Math.round((EXPORT_W * strip.naturalHeight) / strip.naturalWidth);
    for (let y = 0; y < height; y += tileH) ctx.drawImage(strip, 0, y, EXPORT_W, tileH);

    // the words get the same sprayed edge as on screen, where the browser can
    const text = (str, font, color, x, y) => {
      ctx.save();
      ctx.filter = 'url(#spray)';
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(str, x, y);
      ctx.restore();
    };

    const mid = EXPORT_W / 2;
    let y = 72 * k;
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#2a2530';
    text('album', titleFont, ink, mid, y);
    y += titleH + 28 * k;
    items.forEach((it, i) => {
      // odd ones lean left, even ones right, as in the stream
      const cx = mid + (i % 2 ? 1 : -1) * 0.08 * Math.max(it.w, it.lw);
      const art = document.createElement('canvas');
      art.width = it.w / EXPORT_PX;
      art.height = it.h / EXPORT_PX;
      art.getContext('2d').putImageData(imageOf(it.entry), 0, 0);
      ctx.drawImage(art, Math.round(cx - it.w / 2), Math.round(y), it.w, it.h);
      y += it.h + 10 * k;
      text(it.label, labelFont, '#6f6a76', cx, y);
      y += 20 * k * 1.4 + gap;
    });

    return new Promise((resolve, reject) =>
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('could not make the png'))), 'image/png'),
    );
  }

  // Export the album and hand it to the browser as a download.
  async downloadPng() {
    const blob = await this.exportPng();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grain-garden-album-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

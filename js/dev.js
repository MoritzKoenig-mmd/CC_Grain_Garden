// Dev mode: a settings panel. Open with ?dev in the address, or Shift+D.

import { settings, update, reset, sprayFringe, sprayRangeOf } from './settings.js';
import { sprayStamp, bufferToImage } from './brush.js';
import { toRgbTable } from './config.js';

// Lifespan slider is logarithmic: 15 seconds … 7 days.
const MIN_MIN = 0.25;
const MAX_MIN = 7 * 24 * 60;
const toSlider = (m) => Math.round((1000 * Math.log(m / MIN_MIN)) / Math.log(MAX_MIN / MIN_MIN));
const fromSlider = (v) => MIN_MIN * Math.pow(MAX_MIN / MIN_MIN, v / 1000);

function humanTime(min) {
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 60) return `${+min.toFixed(min < 10 ? 1 : 0)} min`;
  if (min < 1440) return `${+(min / 60).toFixed(1)} h`;
  return `${+(min / 1440).toFixed(1)} d`;
}

// Where the panel was dragged to, kept per browser. Nothing stored: it sits
// at the top left, as the stylesheet puts it.
const POS_KEY = 'grain-garden/dev-pos';
function loadPos() {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}
function savePos(p) {
  try {
    if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
    else localStorage.removeItem(POS_KEY);
  } catch {}
}

const randomHex = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

// A button for something that can't be undone: the first click asks (in the
// button itself, no browser dialog), a second one within a few seconds does it.
const SURE_MS = 3000;
function sure(label, what, action) {
  let armed = null;
  const btn = el(
    'button',
    {
      type: 'button',
      class: 'dev-add dev-danger',
      title: `removes ${what}`,
      disabled: !action,
      onclick: () => {
        if (!armed) {
          btn.textContent = `sure? click again to ${label}`;
          btn.classList.add('armed');
          armed = setTimeout(disarm, SURE_MS);
          return;
        }
        disarm();
        action();
        btn.textContent = `${label}: done`;
        setTimeout(() => (btn.textContent = label), 1500);
      },
    },
    label,
  );
  const disarm = () => {
    clearTimeout(armed);
    armed = null;
    btn.textContent = label;
    btn.classList.remove('armed');
  };
  return btn;
}

function brushPreview(r, range) {
  const size = 40;
  const c = el('canvas', { width: size, height: size, class: 'dev-brush' });
  const buf = new Uint8Array(size * size);
  for (let i = 0; i < 3; i++) sprayStamp(buf, size, size / 2 - 0.5, size / 2 - 0.5, r, 1, Math.random, sprayFringe(range));
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  bufferToImage(buf, img, toRgbTable(['#2a2530']));
  ctx.putImageData(img, 0, 0);
  return c;
}

export class DevPanel {
  constructor({ exportAlbum, clearGarden, clearAlbum } = {}) {
    this.exportAlbum = exportAlbum;
    this.clearGarden = clearGarden;
    this.clearAlbum = clearAlbum;
    this.el = document.getElementById('dev');
    this.toggleBtn = document.getElementById('dev-toggle');
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.pos = loadPos();
    this.#bindDrag();
    window.addEventListener('resize', () => this.#place());

    window.addEventListener('keydown', (e) => {
      if (e.shiftKey && e.key.toLowerCase() === 'd' && !e.target.closest?.('input')) {
        e.preventDefault();
        this.toggleBtn.hidden = false;
        this.toggle();
      } else if (e.key === 'Escape' && !this.el.hidden && this.el.contains(document.activeElement)) {
        this.toggle(false);
      }
    });

    if (new URLSearchParams(location.search).has('dev')) {
      this.toggleBtn.hidden = false;
      this.toggle(true);
    }
  }

  toggle(open = this.el.hidden) {
    this.el.hidden = !open;
    this.toggleBtn.setAttribute('aria-pressed', String(open));
    if (open) {
      this.render();
      this.#place();
    }
  }

  // Put the panel where it was dragged to, kept fully on screen.
  #place() {
    if (!this.pos || this.el.hidden) return;
    const { width, height } = this.el.getBoundingClientRect();
    const x = Math.min(Math.max(0, this.pos.x), Math.max(0, innerWidth - width));
    const y = Math.min(Math.max(0, this.pos.y), Math.max(0, innerHeight - Math.min(height, 40)));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  // Drag the panel around by its header; double-click the header to send it
  // back to the top left.
  #bindDrag() {
    let grab = null;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target.closest('.dev-head') || e.target.closest('button')) return;
      const r = this.el.getBoundingClientRect();
      grab = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add('dragging');
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      this.pos = { x: e.clientX - grab.dx, y: e.clientY - grab.dy };
      this.#place();
    });
    const drop = (e) => {
      if (!grab || e.pointerId !== grab.id) return;
      grab = null;
      this.el.classList.remove('dragging');
      savePos(this.pos);
    };
    this.el.addEventListener('pointerup', drop);
    this.el.addEventListener('pointercancel', drop);
    this.el.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.dev-head') || e.target.closest('button')) return;
      this.pos = null;
      savePos(null);
      this.el.style.left = '';
      this.el.style.top = '';
    });
  }

  render() {
    const s = settings;
    const rerender = () => this.render();

    const life = el('output', { class: 'dev-value' }, humanTime(s.lifespanMin));
    const pctLeft = (f) => `${Math.round(f * 100)}% left`;
    const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
    const fastAt = el('output', { class: 'dev-value' }, pctLeft(s.fastAt));
    const fastMs = el('output', { class: 'dev-value' }, secs(s.fastMs));
    const stemMs = el('output', { class: 'dev-value' }, secs(s.stemMs));
    const px = (v) => `${v} px`;
    const beeSize = el('output', { class: 'dev-value' }, px(s.beeSize));
    const beeOffset = el('output', { class: 'dev-value' }, px(s.beeOffset));
    const beeSmooth = el('output', { class: 'dev-value' }, s.beeSmooth ? `${s.beeSmooth.toFixed(2)} s` : 'off');
    // a slider row for one of the withering settings, showing its value in `out`
    const slider = (label, title, attrs, value, out, onset) =>
      el(
        'label',
        { class: 'dev-row', title },
        el('span', { class: 'dev-label' }, label),
        el('input', { type: 'range', ...attrs, value, 'aria-label': title, oninput: (e) => onset(Number(e.target.value)) }),
        out,
      );

    const colors = s.colors.map((hex, i) =>
      el(
        'div',
        { class: 'dev-row' },
        el('input', {
          type: 'color',
          value: hex,
          'aria-label': `colour ${i + 1}`,
          oninput: (e) => {
            const next = [...settings.colors];
            next[i] = e.target.value;
            e.target.nextElementSibling.textContent = e.target.value;
            update({ colors: next });
          },
        }),
        el('span', { class: 'dev-hex' }, hex),
        el(
          'button',
          {
            type: 'button',
            class: 'dev-x',
            'aria-label': 'remove colour',
            disabled: s.colors.length <= 1,
            onclick: () => {
              update({ colors: settings.colors.filter((_, k) => k !== i) });
              rerender();
            },
          },
          '×',
        ),
      ),
    );

    // the brush previews, redrawn when the spray settings change
    const previews = [];
    const redrawPreviews = () => previews.forEach(({ wrap, i }) => wrap.replaceChildren(brushPreview(settings.brushes[i], sprayRangeOf(i))));
    const sprayAmount = el('output', { class: 'dev-value' }, `${(s.sprayAmount * 100).toFixed(1)}%`);
    const albumColumns = el('output', { class: 'dev-value' }, String(s.albumColumns));
    const albumGap = el('output', { class: 'dev-value' }, `${s.albumGap} px`);
    const albumTitleSpace = el('output', { class: 'dev-value' }, `${s.albumTitleSpace} px`);
    // a slider for one value of the album words' spray
    const textSpray = (key, label, title, attrs, show) => {
      const out = el('output', { class: 'dev-value' }, show(s.textSpray[key]));
      return slider(label, title, attrs, s.textSpray[key], out, (v) => {
        update({ textSpray: { ...settings.textSpray, [key]: v } });
        out.textContent = show(v);
      });
    };
    const fixed = (n) => (v) => v.toFixed(n);
    const times = (v) => `${v.toFixed(2)}×`;
    // every brush's spray range, filled in for brushes that don't have one yet
    const ranges = () => settings.brushes.map((_, k) => sprayRangeOf(k));

    const brushes = s.brushes.map((r, i) => {
      const val = el('output', { class: 'dev-value' }, r.toFixed(1));
      const prev = el('span', { class: 'dev-brush-wrap' }, brushPreview(r, sprayRangeOf(i)));
      previews.push({ wrap: prev, i });
      const rangeVal = el('output', { class: 'dev-value' }, times(sprayRangeOf(i)));
      const rangeRow = slider('spray range', `how far brush ${i + 1}'s spray reaches from a stroke, in brush radii`, { min: 20, max: 200, step: 1 }, Math.round(sprayRangeOf(i) * 100), rangeVal, (v) => {
        const next = ranges();
        next[i] = v / 100;
        update({ sprayRanges: next });
        rangeVal.textContent = times(v / 100);
        prev.replaceChildren(brushPreview(settings.brushes[i], v / 100));
      });
      rangeRow.classList.add('dev-sub');
      const sizeRow = el(
        'div',
        { class: 'dev-row' },
        prev,
        el('input', {
          type: 'range',
          min: 1,
          max: 16,
          step: 0.2,
          value: r,
          'aria-label': `brush ${i + 1} radius`,
          oninput: (e) => {
            const v = Number(e.target.value);
            const next = [...settings.brushes];
            next[i] = v;
            update({ brushes: next });
            val.textContent = v.toFixed(1);
            prev.replaceChildren(brushPreview(v, sprayRangeOf(i)));
          },
        }),
        val,
        el(
          'button',
          {
            type: 'button',
            class: 'dev-x',
            'aria-label': 'remove brush',
            disabled: s.brushes.length <= 1,
            onclick: () => {
              update({
                brushes: settings.brushes.filter((_, k) => k !== i),
                sprayRanges: ranges().filter((_, k) => k !== i),
              });
              rerender();
            },
          },
          '×',
        ),
      );
      return el('div', { class: 'dev-brush-item' }, sizeRow, rangeRow);
    });

    // per flower / per stroke switch for one setting key
    const perRow = (key, title) =>
      el(
        'div',
        { class: 'dev-row' },
        el('span', { class: 'dev-label' }, title),
        ...['flower', 'stroke'].map((value) =>
          el(
            'label',
            { class: 'dev-check' },
            el('input', {
              type: 'radio',
              name: key,
              value,
              checked: s[key] === value,
              onchange: () => update({ [key]: value }),
            }),
            `per ${value}`,
          ),
        ),
      );

    this.el.replaceChildren(
      el(
        'header',
        { class: 'dev-head' },
        el('strong', { title: 'drag to move · double-click to put back' }, 'dev'),
        el('button', { type: 'button', class: 'dev-x', 'aria-label': 'close', onclick: () => this.toggle(false) }, '×'),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'background'),
        el(
          'div',
          { class: 'dev-row' },
          el('input', {
            type: 'color',
            value: s.background,
            'aria-label': 'background colour',
            oninput: (e) => {
              e.target.nextElementSibling.textContent = e.target.value;
              update({ background: e.target.value });
            },
          }),
          el('span', { class: 'dev-hex' }, s.background),
        ),
        el(
          'label',
          { class: 'dev-row' },
          el('span', { class: 'dev-label' }, 'grain'),
          el('input', {
            type: 'range',
            min: 0,
            max: 0.6,
            step: 0.01,
            value: s.grain,
            oninput: (e) => update({ grain: Number(e.target.value) }),
          }),
        ),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'bee'),
        slider('size', 'how wide the bee is', { min: 16, max: 160, step: 1 }, s.beeSize, beeSize, (v) => {
          update({ beeSize: v });
          beeSize.textContent = px(v);
        }),
        el(
          'label',
          { class: 'dev-check' },
          el('input', {
            type: 'checkbox',
            checked: s.beeFollow,
            onchange: (e) => {
              update({ beeFollow: e.target.checked });
              rerender();
            },
          }),
          'follow the trail of the mouse',
        ),
        slider('offset', 'how far behind the mouse, along its trail, the bee flies', { min: 0, max: 400, step: 1, disabled: !s.beeFollow }, s.beeOffset, beeOffset, (v) => {
          update({ beeOffset: v });
          beeOffset.textContent = px(v);
        }),
        slider('smoothing', 'how long the bee takes to catch up with its spot on the trail', { min: 0, max: 100, step: 1, disabled: !s.beeFollow }, Math.round(s.beeSmooth * 100), beeSmooth, (v) => {
          update({ beeSmooth: v / 100 });
          beeSmooth.textContent = v ? `${(v / 100).toFixed(2)} s` : 'off';
        }),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'withering'),
        el(
          'label',
          { class: 'dev-row' },
          el('span', { class: 'dev-label' }, 'lifespan'),
          el('input', {
            type: 'range',
            min: 0,
            max: 1000,
            step: 1,
            value: toSlider(s.lifespanMin),
            oninput: (e) => {
              const m = fromSlider(Number(e.target.value));
              update({ lifespanMin: m });
              life.textContent = humanTime(m);
            },
          }),
          life,
        ),
        slider('speed up at', 'the petals speed up when this much of them is left', { min: 0, max: 50, step: 1 }, Math.round(s.fastAt * 100), fastAt, (v) => {
          update({ fastAt: v / 100 });
          fastAt.textContent = pctLeft(v / 100);
        }),
        slider('last petals', 'how long the last petals take once they speed up', { min: 200, max: 10000, step: 100 }, s.fastMs, fastMs, (v) => {
          update({ fastMs: v });
          fastMs.textContent = secs(v);
        }),
        slider('stem', 'how long the stem takes to wither once the petals are gone', { min: 200, max: 10000, step: 100 }, s.stemMs, stemMs, (v) => {
          update({ stemMs: v });
          stemMs.textContent = secs(v);
        }),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'drawing tools'),
        el(
          'div',
          { class: 'dev-row' },
          ...['erase', 'undo', 'clear'].map((name) =>
            el(
              'label',
              { class: 'dev-check' },
              el('input', {
                type: 'checkbox',
                checked: s.tools[name],
                onchange: (e) => update({ tools: { ...settings.tools, [name]: e.target.checked } }),
              }),
              name,
            ),
          ),
        ),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'random pick'),
        perRow('colorPer', 'colour'),
        perRow('brushPer', 'brush'),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'stems'),
        el(
          'label',
          { class: 'dev-check' },
          el('input', {
            type: 'checkbox',
            checked: s.stems,
            onchange: (e) => update({ stems: e.target.checked }),
          }),
          'start new drawings with a stem',
        ),
        el(
          'div',
          { class: 'dev-row' },
          el('input', {
            type: 'color',
            value: s.stemColor,
            'aria-label': 'stem colour',
            oninput: (e) => {
              e.target.nextElementSibling.textContent = e.target.value;
              update({ stemColor: e.target.value });
            },
          }),
          el('span', { class: 'dev-hex' }, s.stemColor),
        ),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'colours'),
        ...colors,
        el(
          'button',
          {
            type: 'button',
            class: 'dev-add',
            onclick: () => {
              update({ colors: [...settings.colors, randomHex()] });
              rerender();
            },
          },
          '+ colour',
        ),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'brush sizes'),
        ...brushes,
        slider('spray', 'how much spray lands around a stroke (share of its specks that stray)', { min: 0, max: 200, step: 1 }, Math.round(s.sprayAmount * 1000), sprayAmount, (v) => {
          update({ sprayAmount: v / 1000 });
          sprayAmount.textContent = `${(v / 10).toFixed(1)}%`;
          redrawPreviews();
        }),
        el(
          'button',
          {
            type: 'button',
            class: 'dev-add',
            onclick: () => {
              update({ brushes: [...settings.brushes, 5], sprayRanges: [...ranges(), 0.5] });
              rerender();
            },
          },
          '+ brush',
        ),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'album'),
        slider('columns', 'how many columns the album lays its flowers out in', { min: 1, max: 6, step: 1 }, s.albumColumns, albumColumns, (v) => {
          update({ albumColumns: v });
          albumColumns.textContent = String(v);
        }),
        slider('gap', 'empty space above and below the album paper', { min: 0, max: 240, step: 1 }, s.albumGap, albumGap, (v) => {
          update({ albumGap: v });
          albumGap.textContent = `${v} px`;
        }),
        slider('title space', 'room on the paper above the word "album"', { min: 24, max: 240, step: 1 }, s.albumTitleSpace, albumTitleSpace, (v) => {
          update({ albumTitleSpace: v });
          albumTitleSpace.textContent = `${v} px`;
        }),
        el('h3', {}, 'album words'),
        textSpray('thick', 'thickness', 'how much each letter is thickened before it is sprayed', { min: 0, max: 3, step: 0.1 }, (v) => `${v.toFixed(1)} px`),
        textSpray('soft', 'softness', 'how soft the letters\' edges are before the grain breaks them up', { min: 0.2, max: 2.5, step: 0.05 }, fixed(2)),
        textSpray('grain', 'grain', 'how fine the specks are: higher is finer', { min: 0.2, max: 1.6, step: 0.05 }, fixed(2)),
        textSpray('ink', 'ink', 'how much of each letter survives: higher keeps more', { min: 0.5, max: 1.3, step: 0.01 }, fixed(2)),
        el(
          'button',
          {
            type: 'button',
            class: 'dev-add',
            id: 'dev-export-album',
            disabled: !this.exportAlbum,
            onclick: (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              this.exportAlbum()
                .catch((err) => console.error('[album export]', err))
                .finally(() => (btn.disabled = false));
            },
          },
          'export album as png',
        ),
      ),

      el(
        'section',
        {},
        el('h3', {}, 'clear'),
        el('p', { class: 'dev-note' }, 'for everyone in the shared garden, and it can’t be undone'),
        sure('clear garden', 'every flower in the garden', this.clearGarden),
        sure('clear album', 'every flower in the album', this.clearAlbum),
      ),

      el(
        'footer',
        {},
        el(
          'button',
          {
            type: 'button',
            class: 'dev-add',
            onclick: () => {
              reset();
              rerender();
            },
          },
          'reset to defaults',
        ),
      ),
    );
  }
}

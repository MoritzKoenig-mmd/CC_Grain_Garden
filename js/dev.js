// Dev mode: a settings panel. Open with ?dev in the address, or Shift+D.

import { settings, update, reset } from './settings.js';
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

function brushPreview(r) {
  const size = 40;
  const c = el('canvas', { width: size, height: size, class: 'dev-brush' });
  const buf = new Uint8Array(size * size);
  for (let i = 0; i < 3; i++) sprayStamp(buf, size, size / 2 - 0.5, size / 2 - 0.5, r, 1);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  bufferToImage(buf, img, toRgbTable(['#2a2530']));
  ctx.putImageData(img, 0, 0);
  return c;
}

export class DevPanel {
  constructor() {
    this.el = document.getElementById('dev');
    this.toggleBtn = document.getElementById('dev-toggle');
    this.toggleBtn.addEventListener('click', () => this.toggle());

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
    if (open) this.render();
  }

  render() {
    const s = settings;
    const rerender = () => this.render();

    const life = el('output', { class: 'dev-value' }, humanTime(s.lifespanMin));

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

    const brushes = s.brushes.map((r, i) => {
      const val = el('output', { class: 'dev-value' }, r.toFixed(1));
      const prev = el('span', { class: 'dev-brush-wrap' }, brushPreview(r));
      return el(
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
            prev.replaceChildren(brushPreview(v));
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
              update({ brushes: settings.brushes.filter((_, k) => k !== i) });
              rerender();
            },
          },
          '×',
        ),
      );
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
        el('strong', {}, 'dev'),
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
        el('h3', {}, 'garden'),
        el(
          'label',
          { class: 'dev-check' },
          el('input', {
            type: 'checkbox',
            checked: s.depthScale,
            onchange: (e) => update({ depthScale: e.target.checked }),
          }),
          'closer flowers are bigger',
        ),
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
        el(
          'button',
          {
            type: 'button',
            class: 'dev-add',
            onclick: () => {
              update({ brushes: [...settings.brushes, 5] });
              rerender();
            },
          },
          '+ brush',
        ),
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

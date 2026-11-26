// The bee: the garden's cursor. Either it *is* the cursor (it sits on the
// pointer and the browser's own cursor is hidden), or, with beeFollow on, it
// flies along the trail the pointer leaves, beeOffset px of that trail behind
// it, while the sprayed arrow and hand point the way. Its width is beeSize.
// While following, it glides after its spot on the trail on a damped spring;
// beeSmooth is how long it takes to catch up (seconds), 0 is no smoothing.
// On the drawing sheet it keeps out of the way: the crosshair shows where paint lands.
// When the mouse leaves the window, the bee waits on the edge where it went out.

import { settings, onSettings } from './settings.js';

// things you can press or pick up (the same list the hand cursor uses in style.css)
const PRESSABLE = '.word:not(:disabled), #garden.over-flower, #garden.dragging, #intro .door, #tree .note-btn, #tree .way';
const AWAY = '#paper';
const TURN_SPEED = 90; // px/s sideways before it turns to face the way it's going
const PERK_S = 0.08; // how quickly it grows over something pressable (s)

// A critically damped spring (the usual "smooth damp"): eases in and out with
// no overshoot, at any frame rate. Returns [position, velocity].
export function smoothDamp(from, to, vel, time, dt) {
  const omega = 2 / time;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = from - to;
  const temp = (vel + omega * change) * dt;
  return [to + (change + temp) * decay, (vel - omega * temp) * decay];
}

// ease `from` towards `to`, closing most of the gap in `time` seconds
const ease = (from, to, time, dt) => to + (from - to) * Math.exp(-dt / time);

export class Bee {
  constructor() {
    this.el = document.createElement('img');
    this.el.src = 'img/bee.png';
    this.el.alt = '';
    this.el.className = 'bee';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.draggable = false;
    document.body.append(this.el);

    this.pointer = null; // where the pointer is, {x, y}
    this.trail = []; // where it has been, newest last
    this.at = null; // where the bee is drawn
    this.vel = { x: 0, y: 0 }; // and how fast it's going there (px/s)
    this.target = null; // what's under the pointer
    this.facing = 1; // 1: looking right (as drawn), -1: left
    this.perk = 1; // its size over something pressable
    this.exit = null; // where the mouse left the window, while it's gone
    this.last = 0; // time of the last frame

    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    window.addEventListener('pointerdown', (e) => this.move(e), { passive: true });
    // out of the window: the bee stays behind on the edge
    document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) this.leave(e); });

    onSettings(() => this.apply());
    this.apply();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  apply() {
    this.el.style.width = `${settings.beeSize}px`;
    document.documentElement.classList.toggle('bee-cursor', !settings.beeFollow);
  }

  move(e) {
    // a finger has no cursor to replace
    if (e.pointerType === 'touch') return this.hide();
    this.target = e.target;
    this.exit = null;
    // every position the mouse reported since the last event, for a finer trail
    const points = e.getCoalescedEvents?.() ?? [];
    for (const c of points.length ? points : [e]) this.add({ x: c.clientX, y: c.clientY });
    this.trimTrail();
  }

  add(p) {
    if (!this.pointer) {
      this.at = { ...p };
      this.vel = { x: 0, y: 0 };
    }
    this.pointer = p;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 0.5) this.trail.push(p);
  }

  hide() {
    this.pointer = this.at = this.exit = null;
    this.trail = [];
    this.el.classList.remove('shown');
  }

  // the mouse went out of the window: the bee flies to the edge it crossed
  leave(e) {
    if (e.pointerType === 'touch' || !this.pointer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { x, y } = this.pointer;
    const edges = [
      [x, { x: 0, y }],
      [w - x, { x: w, y }],
      [y, { x, y: 0 }],
      [h - y, { x, y: h }],
    ];
    edges.sort((a, b) => a[0] - b[0]);
    this.exit = edges[0][1];
    this.target = null;
    this.add(this.exit);
    this.trimTrail();
  }

  // the exit point, moved in far enough that the whole bee is on screen
  onScreen(p) {
    const img = this.el;
    const ratio = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.9;
    const hw = (settings.beeSize * this.perk) / 2;
    const hh = hw * ratio;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    return { x: clamp(p.x, hw, window.innerWidth - hw), y: clamp(p.y, hh, window.innerHeight - hh) };
  }

  // keep only as much trail as the bee can be behind
  trimTrail() {
    const keep = settings.beeOffset + 4;
    let len = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      len += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      if (len > keep) {
        this.trail.splice(0, i - 1);
        return;
      }
    }
  }

  // the point `back` px along the trail behind the pointer
  behind(back) {
    const t = this.trail;
    let left = back;
    for (let i = t.length - 1; i > 0; i--) {
      const a = t[i];
      const b = t[i - 1];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= left) {
        const k = left / d;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      left -= d;
    }
    return t[0] || this.pointer;
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - (this.last || now)) / 1000 || 1 / 60));
    this.last = now;
    if (!this.pointer) return;

    const away = !!this.target?.closest?.(AWAY);
    this.el.classList.toggle('shown', !away);
    if (away) return;

    const prev = this.at;
    if (this.exit || settings.beeFollow) {
      // following, or settling on the edge after the mouse went out
      const spot = this.exit ? this.onScreen(this.exit) : this.behind(settings.beeOffset);
      if (settings.beeSmooth > 0) {
        const [x, vx] = smoothDamp(prev.x, spot.x, this.vel.x, settings.beeSmooth, dt);
        const [y, vy] = smoothDamp(prev.y, spot.y, this.vel.y, settings.beeSmooth, dt);
        this.at = { x, y };
        this.vel = { x: vx, y: vy };
      } else {
        this.at = { ...spot };
        this.vel = { x: (spot.x - prev.x) / dt, y: (spot.y - prev.y) / dt };
      }
    } else {
      // as the cursor it never lags: clicks land where the bee is
      this.at = { ...this.pointer };
      this.vel = { x: (this.at.x - prev.x) / dt, y: (this.at.y - prev.y) / dt };
    }

    // face the way it's flying
    if (Math.abs(this.vel.x) > TURN_SPEED) this.facing = Math.sign(this.vel.x);

    const pressable = !settings.beeFollow && !!this.target?.closest?.(PRESSABLE);
    this.perk = ease(this.perk, pressable ? 1.15 : 1, PERK_S, dt);

    this.el.style.transform =
      `translate(${this.at.x}px, ${this.at.y}px) translate(-50%, -50%) scale(${this.facing * this.perk}, ${this.perk})`;
  }
}

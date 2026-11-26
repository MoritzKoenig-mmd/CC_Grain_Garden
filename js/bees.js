// Everyone else's bees. Each garden tells the room where its own bee is (as a
// share of its screen, so it lands on the same spot of a garden of any size)
// and which place it's in; the bees of people in the same place fly here too.
// Positions go through playhtml presence, which nobody stores and which goes
// when its owner does. It takes about 20 writes a second at most, so a bee is
// sent ~12 times a second and glides between those on the same spring the
// following bee uses.
//
// A flower being dragged rides along in the same message (one message, so the
// two together stay inside that budget): the others see it carried across
// their garden, and when it's let go it settles where the room says it was put.

import { settings, onSettings } from './settings.js';
import { smoothDamp } from './bee.js';

const SEND_MS = 80; // how often our bee's position goes out, at most
const GLIDE_S = 0.12; // how long another bee takes to catch up with where it was last seen
const KEY = 'bee';

// The places where bees meet. In the studio or the album nobody's in the
// garden, so their bee isn't either, and no other bees fly over the sheet.
const MEETING = new Set(['gate', 'garden', 'tree']);

export class OtherBees {
  // people: playhtml.people · bee: our own Bee · where(): the place we're in ·
  // garden: for the flower we're carrying and the ones others carry
  constructor(people, bee, where, garden) {
    this.people = people;
    this.bee = bee;
    this.where = where;
    this.garden = garden;
    this.others = new Map(); // pid → { el, at, vel, target, facing }
    this.carried = new Map(); // pid → id of the flower they're carrying
    this.lastSent = 0;
    this.sent = 'null';
    this.last = 0;

    people.onChange([KEY], (everyone) => this.#heard(everyone));
    onSettings(() => {
      for (const o of this.others.values()) o.el.style.width = `${settings.beeSize}px`;
    });
    // say we've gone as the tab goes, rather than waiting to be timed out
    window.addEventListener('pagehide', () => this.#send(null, true));
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ---------- our bee, out ----------

  // { p: place, x, y, f: our bee, d: the flower we're carrying }, or null
  #mine() {
    const { bee } = this;
    const place = this.where();
    if (!MEETING.has(place)) return null;
    const r = (v) => Math.round(v * 10000) / 10000;
    const msg = { p: place };
    // (a finger has no bee, but can still carry a flower)
    if (bee.at && bee.el.classList.contains('shown')) {
      Object.assign(msg, { x: r(bee.at.x / window.innerWidth), y: r(bee.at.y / window.innerHeight), f: bee.facing });
    }
    const d = this.garden.dragging;
    if (d && place === 'garden') msg.d = { id: d.id, nx: r(d.nx), ny: r(d.ny) };
    return 'x' in msg || msg.d ? msg : null;
  }

  #send(value, now = false) {
    const t = performance.now();
    const text = JSON.stringify(value);
    if (text === this.sent || (!now && t - this.lastSent < SEND_MS)) return;
    this.sent = text;
    this.lastSent = t;
    try {
      this.people.setMyPresence(KEY, value);
    } catch {
      /* the room isn't there right now: try again next time */
    }
  }

  // ---------- theirs, in ----------

  #heard(everyone) {
    const seen = new Set();
    const carrying = new Map(); // pid → { id, nx, ny }
    for (const person of everyone) {
      if (person.isMe) continue;
      const b = person.presence?.[KEY];
      if (!b) continue;
      const d = b.d;
      if (b.p === 'garden' && d && typeof d.id === 'string' && Number.isFinite(d.nx) && Number.isFinite(d.ny)) {
        carrying.set(person.pid, d);
      }
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
      seen.add(person.pid);
      let o = this.others.get(person.pid);
      if (!o) {
        o = this.#hatch();
        this.others.set(person.pid, o);
      }
      o.target = { x: b.x, y: b.y };
      o.place = b.p;
      o.facing = b.f === -1 ? -1 : 1;
    }
    for (const [pid, o] of this.others) {
      if (seen.has(pid)) continue;
      o.el.remove();
      this.others.delete(pid);
    }
    this.#carry(carrying);
  }

  // Flowers in other people's hands: carried along, and let go when they are.
  #carry(carrying) {
    const find = (id) => this.garden.flowers.find((f) => f.id === id);
    for (const d of carrying.values()) {
      const f = find(d.id);
      if (f) this.garden.carry(f, d.nx, d.ny);
    }
    for (const [pid, id] of this.carried) {
      if (carrying.get(pid)?.id === id) continue;
      const f = find(id);
      if (f) this.garden.letGo(f);
    }
    this.carried = new Map([...carrying].map(([pid, d]) => [pid, d.id]));
  }

  #hatch() {
    const el = document.createElement('img');
    el.src = 'img/bee.png';
    el.alt = '';
    el.className = 'bee other';
    el.setAttribute('aria-hidden', 'true');
    el.draggable = false;
    el.style.width = `${settings.beeSize}px`;
    document.body.append(el);
    return { el, at: null, vel: { x: 0, y: 0 }, target: null, facing: 1, place: null };
  }

  // ---------- every frame ----------

  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - (this.last || now)) / 1000 || 1 / 60));
    this.last = now;
    this.#send(this.#mine());

    const here = this.where();
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const o of this.others.values()) {
      const show = !!o.target && MEETING.has(here) && o.place === here;
      o.el.classList.toggle('shown', show);
      if (!show) {
        o.at = null; // when it's back, it appears where it is rather than flying in from afar
        continue;
      }
      const spot = { x: o.target.x * w, y: o.target.y * h };
      if (!o.at) {
        o.at = spot;
        o.vel = { x: 0, y: 0 };
      } else {
        const [x, vx] = smoothDamp(o.at.x, spot.x, o.vel.x, GLIDE_S, dt);
        const [y, vy] = smoothDamp(o.at.y, spot.y, o.vel.y, GLIDE_S, dt);
        o.at = { x, y };
        o.vel = { x: vx, y: vy };
      }
      o.el.style.transform = `translate(${o.at.x}px, ${o.at.y}px) translate(-50%, -50%) scale(${o.facing}, 1)`;
    }
  }
}

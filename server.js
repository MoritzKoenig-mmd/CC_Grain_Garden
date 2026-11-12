// Grain garden server: Express serves the site (this folder), Socket.io keeps
// every visitor's garden in sync, and the whole garden is saved to a JSON
// file so it survives restarts. (Same pattern as the p5 + sockets template:
// state lives in memory, new clients get the history, changes are broadcast.)

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'garden.json');
const DEV_KEY = process.env.DEV_KEY || ''; // empty = anyone may change settings (fine locally)
const SAVE_EVERY = 2000;
const MAX_FLOWERS = 400;
const MAX_PIXELS_LEN = 120000; // run-length-encoded base64 per drawing

// ---------- state ----------

let garden = { flowers: {}, settings: {}, seeded: false };
let changed = false;
const pausedBy = new Map(); // flower id → socket id of whoever is tending it

function loadGarden() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    garden = { flowers: data.flowers || {}, settings: data.settings || {}, seeded: !!data.seeded };
    // nobody is tending anything right after a restart
    for (const f of Object.values(garden.flowers)) resumeFlower(f, Date.now());
    console.log(`loaded ${Object.keys(garden.flowers).length} flowers from ${DATA_FILE}`);
  } catch {
    console.log('starting with an empty garden');
  }
}

function saveGarden() {
  if (!changed) return;
  changed = false;
  const tmp = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(garden));
    fs.renameSync(tmp, DATA_FILE); // atomic: a crash mid-write can't corrupt the file
  } catch (err) {
    changed = true;
    console.error('could not save garden:', err.message);
  }
}

const lifespanMs = () => Math.max(0.05, Number(garden.settings.lifespanMin) || 10) * 60 * 1000;
const witherOf = (f, now) => ((f.pausedAt ?? now) - f.tendedAt) / lifespanMs();

function resumeFlower(f, now) {
  if (f.pausedAt == null) return;
  f.tendedAt += now - f.pausedAt;
  f.pausedAt = null;
}

// Withered flowers leave the garden for good.
function prune() {
  const now = Date.now();
  for (const [id, f] of Object.entries(garden.flowers)) {
    if (witherOf(f, now) >= 1) {
      delete garden.flowers[id];
      pausedBy.delete(id);
      changed = true;
    }
  }
}

// ---------- validation ----------

const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const HEX = /^#[0-9a-f]{6}$/i;

function cleanFlower(r) {
  if (!r || typeof r.id !== 'string' || r.id.length > 40) return null;
  if (typeof r.pixels !== 'string' || r.pixels.length > MAX_PIXELS_LEN) return null;
  const colors = Array.isArray(r.colors) ? r.colors.filter((c) => HEX.test(c)).slice(0, 64) : [];
  if (!colors.length) return null;
  return {
    id: r.id,
    nx: num(r.nx, 0, 1, 0.5),
    ny: num(r.ny, -2, 1.2, 0.5),
    size: num(r.size, 0.3, 3.5, 1),
    seed: Number.isInteger(r.seed) ? r.seed >>> 0 : 1,
    colors,
    pixels: r.pixels,
    tendedAt: Date.now(),
    pausedAt: null,
  };
}

function makeRoom() {
  const ids = Object.keys(garden.flowers);
  if (ids.length < MAX_FLOWERS) return;
  // the garden is full: the most withered flower goes first
  const now = Date.now();
  ids.sort((a, b) => witherOf(garden.flowers[b], now) - witherOf(garden.flowers[a], now));
  delete garden.flowers[ids[0]];
}

// ---------- server ----------

const app = express();
// the site is this folder (GitHub Pages serves it as is); keep the server's
// own files and the saved garden out of it
const PRIVATE = /^\/(node_modules|server\.js|package(-lock)?\.json|render\.yaml|garden\.json)/;
app.use((req, res, next) => (PRIVATE.test(req.path) ? res.sendStatus(404) : next()));
app.use(express.static(__dirname, { dotfiles: 'ignore' }));
const server = http.createServer(app);
// cors: the site may be served from GitHub Pages while this runs elsewhere
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 2e6 });

const snapshot = () => ({
  flowers: Object.values(garden.flowers),
  settings: garden.settings,
  seeded: garden.seeded,
  serverNow: Date.now(),
});

io.on('connection', (socket) => {
  // like the template's "history": a newcomer gets the whole garden
  prune();
  socket.emit('state', snapshot());
  io.emit('presence', io.engine.clientsCount);

  // first visitor ever plants the starter flowers
  socket.on('seed', (records) => {
    if (garden.seeded || !Array.isArray(records)) return;
    garden.seeded = true;
    for (const r of records.slice(0, 12)) {
      const f = cleanFlower(r);
      if (!f) continue;
      // starter flowers arrive at different ages
      f.tendedAt = Date.now() - num(r.age, 0, 0.9, 0) * lifespanMs();
      garden.flowers[f.id] = f;
    }
    changed = true;
    io.emit('state', snapshot());
  });

  socket.on('plant', (r) => {
    const f = cleanFlower(r);
    if (!f || garden.flowers[f.id]) return;
    makeRoom();
    garden.flowers[f.id] = f;
    changed = true;
    socket.broadcast.emit('flower', f);
    socket.emit('flower', f); // sender gets the server's clock values back
  });

  // someone redrew a flower: new body, fresh life
  socket.on('tend', (r) => {
    const old = r && garden.flowers[r.id];
    const f = cleanFlower(r);
    if (!old || !f) return;
    Object.assign(f, { nx: old.nx, ny: old.ny, size: old.size });
    garden.flowers[f.id] = f;
    pausedBy.delete(f.id);
    changed = true;
    io.emit('flower', f);
  });

  // dragging / scaling: sent often, so only the others hear about it
  socket.on('move', (m) => {
    const f = m && garden.flowers[m.id];
    if (!f) return;
    f.nx = num(m.nx, 0, 1, f.nx);
    f.ny = num(m.ny, -2, 1.2, f.ny);
    f.size = num(m.size, 0.3, 3.5, f.size);
    changed = true;
    socket.broadcast.emit('move', { id: f.id, nx: f.nx, ny: f.ny, size: f.size });
  });

  // while someone tends a flower, it stops withering for everyone
  socket.on('pause', (id) => {
    const f = garden.flowers[id];
    if (!f || f.pausedAt != null) return;
    f.pausedAt = Date.now();
    pausedBy.set(id, socket.id);
    changed = true;
    io.emit('flower', f);
  });

  socket.on('resume', (id) => {
    const f = garden.flowers[id];
    if (!f) return;
    resumeFlower(f, Date.now());
    pausedBy.delete(id);
    changed = true;
    io.emit('flower', f);
  });

  socket.on('remove', (id) => {
    if (!garden.flowers[id]) return;
    delete garden.flowers[id];
    pausedBy.delete(id);
    changed = true;
    io.emit('remove', id);
  });

  // dev mode: global settings, guarded by DEV_KEY when one is set
  socket.on('settings', ({ key, patch } = {}) => {
    if ((DEV_KEY && key !== DEV_KEY) || !patch || typeof patch !== 'object') {
      socket.emit('settings', garden.settings); // put the sender back in line
      socket.emit('denied');
      return;
    }
    const oldLife = lifespanMs();
    garden.settings = { ...garden.settings, ...patch };
    changed = true;
    const newLife = lifespanMs();
    if (newLife !== oldLife) {
      // keep every flower exactly as far along as it was
      const now = Date.now();
      for (const f of Object.values(garden.flowers)) {
        const at = f.pausedAt ?? now;
        f.tendedAt = at - ((at - f.tendedAt) / oldLife) * newLife;
      }
      io.emit('state', snapshot());
    } else {
      io.emit('settings', garden.settings);
    }
  });

  socket.on('disconnect', () => {
    // if they left mid-tend, let their flower carry on withering
    const now = Date.now();
    for (const [id, sid] of pausedBy) {
      if (sid !== socket.id) continue;
      const f = garden.flowers[id];
      if (f) {
        resumeFlower(f, now);
        io.emit('flower', f);
      }
      pausedBy.delete(id);
      changed = true;
    }
    io.emit('presence', io.engine.clientsCount);
  });
});

// ---------- start ----------

loadGarden();
setInterval(saveGarden, SAVE_EVERY);
setInterval(prune, 10000);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    changed = true;
    saveGarden();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log(`grain garden on http://localhost:${PORT}`);
  if (!DEV_KEY) console.log('note: no DEV_KEY set — anyone can change dev settings');
});

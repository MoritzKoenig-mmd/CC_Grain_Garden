// One garden for everyone. The flowers live in a playhtml room (playhtml.fun,
// a hosted Yjs/PartyKit service, so the site stays plain files on GitHub
// Pages): planting, tending, moving and picking a flower change the room, and
// every open garden follows it. The withering settings live there too, so a
// flower withers on the same clock for everyone and one person's dev lifespan
// can't wither everybody else's garden.
//
// playhtml prefixes rooms with the page's host name, so the live site, a
// localhost copy and a 127.0.0.1 copy are three separate gardens.

const LIB = 'https://unpkg.com/playhtml@2.16.0';
const ROOM = 'grain-garden';
const WAIT_MS = 10000; // give up and garden alone after this long

const within = (promise, ms) =>
  Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms))]);

// A keyed map of records in one page-data channel. Writes are mutations, so
// two people changing different flowers at once both land.
function keyed(channel) {
  return {
    get: () => channel.getData() || {},
    onChange: (fn) => channel.onUpdate((data) => fn(data || {})),
    put(record) {
      channel.setData((all) => {
        all[record.id] = record;
      });
    },
    putMany(records) {
      if (!records.length) return;
      channel.setData((all) => {
        for (const r of records) all[r.id] = r;
      });
    },
    // change some fields of records that are still there: { id: { field: value } }
    patch(changes) {
      channel.setData((all) => {
        for (const [id, fields] of Object.entries(changes)) if (all[id]) Object.assign(all[id], fields);
      });
    },
    remove(id) {
      channel.setData((all) => {
        if (all[id]) delete all[id];
      });
    },
  };
}

// A flat object of values in one page-data channel.
function values(channel) {
  return {
    get: () => channel.getData() || {},
    onChange: (fn) => channel.onUpdate((data) => fn(data || {})),
    set(patch) {
      channel.setData((v) => {
        Object.assign(v, patch);
      });
    },
  };
}

// Every tab is a visitor of its own, with its own bee. (playhtml keeps one
// identity per browser and hides a browser's tabs from each other, so two tabs
// side by side wouldn't see each other's bees or the flowers they carry.) Kept
// in sessionStorage: a reload is the same visitor, a new tab a new one.
const VISITOR_KEY = 'grain-garden/visitor';
const PALETTE = ['#ff1744', '#ff1fb4', '#ff6a00', '#ffd000', '#00e65c', '#00b4ff', '#2d5bff', '#7c3aff'];

function visitor() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(VISITOR_KEY) || 'null');
    if (saved && typeof saved.publicKey === 'string') return saved;
  } catch {}
  const k = Math.floor(Math.random() * PALETTE.length);
  const me = {
    publicKey: crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    playerStyle: { colorPalette: [0, 3, 5].map((d) => PALETTE[(k + d) % PALETTE.length]) },
    createdAt: Date.now(),
  };
  try {
    sessionStorage.setItem(VISITOR_KEY, JSON.stringify(me));
  } catch {}
  return me;
}

// Connect to the room. Rejects if playhtml can't be loaded or reached in time.
export async function connect() {
  const { playhtml } = await within(import(LIB), WAIT_MS);
  await within(
    Promise.resolve(playhtml.init({ room: ROOM, playerIdentity: visitor() })).then(() => playhtml.ready),
    WAIT_MS,
  );
  return {
    flowers: keyed(playhtml.createPageData('flowers-v1', {})),
    withering: values(playhtml.createPageData('withering-v1', {})),
    meta: values(playhtml.createPageData('garden-v1', { seeded: false })),
    people: playhtml.people, // who's here right now, and their bees (js/bees.js)
  };
}

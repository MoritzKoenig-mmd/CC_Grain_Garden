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

// Connect to the room. Rejects if playhtml can't be loaded or reached in time.
export async function connect() {
  const { playhtml } = await within(import(LIB), WAIT_MS);
  await within(
    Promise.resolve(playhtml.init({ room: ROOM })).then(() => playhtml.ready),
    WAIT_MS,
  );
  return {
    flowers: keyed(playhtml.createPageData('flowers-v1', {})),
    withering: values(playhtml.createPageData('withering-v1', {})),
    meta: values(playhtml.createPageData('garden-v1', { seeded: false })),
  };
}

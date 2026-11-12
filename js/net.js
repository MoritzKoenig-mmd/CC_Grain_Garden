// The socket connection to the shared garden (Socket.io, loaded in index.html).
// If there is no server to reach, the garden quietly runs on its own in this
// browser instead (onOffline).

import { serverUrl } from './config.js';

const OFFLINE_AFTER = 4000; // ms to wait for the first garden before going solo

export function connect(h) {
  const url = serverUrl();
  if (url === null || typeof window.io !== 'function') {
    h.onOffline();
    return { online: false, emit() {} };
  }

  // io() alone connects to the page's own address (served by server.js)
  const socket = url ? window.io(url) : window.io();
  const net = { online: false, emit: (ev, data) => socket.emit(ev, data) };

  const fallback = setTimeout(() => {
    if (!net.online) h.onOffline();
  }, OFFLINE_AFTER);

  socket.on('state', (s) => {
    clearTimeout(fallback);
    net.online = true;
    h.onState(s);
  });
  socket.on('flower', (r) => h.onFlower(r));
  socket.on('move', (m) => h.onMove(m));
  socket.on('remove', (id) => h.onRemove(id));
  socket.on('settings', (s) => h.onSettings(s));
  socket.on('presence', (n) => h.onPresence(n));
  socket.on('denied', () => h.onDenied());
  socket.on('connect', () => h.onStatus(true));
  socket.on('disconnect', () => h.onStatus(false));
  return net;
}

// One clock for everyone: withering is measured in the server's time, so
// visitors with wrong computer clocks still see the same garden.

let offset = 0;
export const now = () => Date.now() + offset;
export const syncClock = (serverNow) => {
  if (Number.isFinite(serverNow)) offset = serverNow - Date.now();
};

# grain garden

A shared garden. Draw a flower and it gets planted. Untended flowers slowly
wither under a noise mask until nothing is left. Anyone can redraw one to
bring it back, and anyone can drag one somewhere else. Everyone sees the same
garden, live. Flowers you keep go into your album, which stays in your own
browser.

It works like the Socket.io template from class. A small Node server
(`server.js`) keeps the garden and sends each change to everyone who is
connected. The page (`index.html`, `js/`) draws the garden and talks to that server.

## Run it locally

```sh
npm install
npm start            # http://localhost:3000
```

Open the address in two windows to watch them sync. The garden is saved to
`garden.json` every couple of seconds.

## Put it online

GitHub Pages can only host static files. It can't run the Node server, so the
server needs a home of its own.

1. **Server (Render, free):** on render.com, go to *New → Blueprint* and pick
   this repo. `render.yaml` sets everything up. Choose a `DEV_KEY`, the
   password for the dev panel. You get a URL like
   `https://grain-garden.onrender.com`. That address already serves the whole
   site, so you could stop here.
2. **GitHub Pages:** put the server URL into `PAGES_SERVER` in `js/config.js`
   and push. Until then the Pages site still works, but each visitor only
   sees their own garden.

Things to know about Render's free plan:
- The server sleeps after about 15 minutes without visitors. The next visitor
  waits roughly a minute while it wakes up. Meanwhile the page shows a local
  garden and switches to the shared one as soon as it connects.
- Its disk is wiped on every restart or redeploy, which also wipes the garden.
  To keep the garden, add a persistent disk (paid) and point `DATA_FILE` at it.

## Dev panel

Open it with `?dev` in the URL or Shift+D. Settings like colours, brush sizes,
withering speed, tools and stems apply to the whole shared garden. To change
them you enter the `DEV_KEY`. If the server has no key set, anyone can change
them.

Add `?server=<url>` to the address to point a page at any server.

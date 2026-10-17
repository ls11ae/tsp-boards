# Deployment

TSP Boards is a static site: HTML, JavaScript, a WebAssembly file (HiGHS) and JSON data. All
computation runs in the visitor's browser. Any web server that serves static files works, from
any sub-path (the build uses relative URLs).

## Build

```bash
npm ci
npm run build
```

The site is in `dist/`. Every CI run on `main` also uploads it as the artifact
`tsp-boards-dist` (GitHub Actions, kept for 30 days), so a deployment does not need Node.

Optional build variable:

- `VITE_PLAY_DATA_URL`: URL of the play data endpoint (see below). Without it, the app never
  sends anything and shows no consent box.

```bash
VITE_PLAY_DATA_URL=https://example.org/tsp-boards/play-data npm run build
```

## GitHub Pages (the public site)

The site is published at **https://ls11ae.github.io/tsp-boards/** by the workflow
`.github/workflows/pages.yml`: every push to `main` builds the site (`npm ci`, `npm run build`)
and deploys `dist/` with `actions/deploy-pages`. It can also be started by hand (Actions →
Pages → Run workflow).

- **Once, by a maintainer:** Settings → Pages → Build and deployment → Source: **GitHub
  Actions**. GitHub Pages of a private repository needs a paid plan; otherwise the repository
  must be public first (see `docs/licensing.md`). Until then the deploy job fails and the CI
  workflow is unaffected.
- **Short play links:** `https://ls11ae.github.io/tsp-boards/#p/<puzzle id>` opens a gallery
  puzzle in play mode (`public/puzzles/<puzzle id>.tsp.json`). The QR codes on the posters use
  them (`cli/export-poster.ts --qr https://ls11ae.github.io/tsp-boards/`), so the puzzle ids of
  the gallery must stay stable.
- Pages serves `.wasm` and `.json` with the right types and ignores the `.htaccess` (which is
  for Apache servers below); its own caching (10 minutes) is fine for the hashed assets.
- The play data endpoint cannot run on Pages (static only); without `VITE_PLAY_DATA_URL` the app
  sends nothing.

## Copy to the server

Copy the content of `dist/` (including the hidden `.htaccess`) into a directory of the web
server, e.g. `/var/www/html/tsp-boards/`. Replacing the directory's content updates the site;
old hashed files in `assets/` can be removed.

## Server requirements

- **MIME types**: `.wasm` as `application/wasm`, `.js` as `text/javascript` (module workers
  refuse other types), `.json` as `application/json`. The shipped `.htaccess` sets them for
  Apache (`mod_mime`); for nginx, the default `mime.types` already has them.
- **HTTPS**: needed for "Copy link" (the clipboard API only works in secure contexts) and
  recommended anyway.
- **Caching**: files in `assets/` have content hashes and can be cached for a year; `index.html`
  and `data/` keep their names across updates and should be revalidated. The `.htaccess` does
  this with `mod_headers`.
- **Content Security Policy** (if the server sets one): the app needs
  `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'` plus the play
  data endpoint in `connect-src` if configured; `style-src 'self' 'unsafe-inline'` (React sets
  a few inline styles).

nginx example:

```nginx
location /tsp-boards/ {
  alias /var/www/tsp-boards/;
  location ~* -[A-Za-z0-9_-]{8}\.(js|css|wasm)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
  location ~* \.(html|json)$ {
    add_header Cache-Control "no-cache";
  }
}
```

## Smoke test after deploying

1. Open the page: the map of Germany appears, the footer shows the app and data version.
2. Set 100 iterations and start a search: candidates appear, and the best ones get a ✓ (the
   exact check runs HiGHS in a worker, so this also tests the WebAssembly file).
3. "Plan the board", then download the SVG and the PDFs.
4. "Copy play link", open it in a private window, click a few nails.

## Play data endpoint (optional)

`server/play-data.mjs` is a dependency-free reference endpoint (Node ≥ 22). It accepts one JSON
play record per POST request, validates it strictly (unknown fields are dropped), and appends
it to a JSONL file stamped with the day only. It stores no IP addresses, headers or cookies.

```bash
PORT=8787 DATA_FILE=/var/lib/tsp-boards/play-data.jsonl ALLOW_ORIGIN=https://example.org node server/play-data.mjs
```

Run it as a service behind the web server (reverse proxy with HTTPS), e.g. nginx:

```nginx
location = /tsp-boards/play-data {
  proxy_pass http://127.0.0.1:8787/;
  client_max_body_size 16k;
  access_log off;  # the web server log would otherwise record IP addresses
}
```

Privacy: records are sent only with the player's explicit consent (a tick box, off by default)
and contain no personal data; still, mention the endpoint in the site's privacy notice and keep
the web server from logging requests to it.

## Event mode at a booth (offline, roadmap 9.4)

The app runs entirely in the browser, so a laptop at a booth needs no network once it is
built:

```bash
npm ci
npm run build
npx vite preview --port 4173
```

(or serve the `dist` folder with any static web server). Then open
`http://localhost:4173/#kiosk` for the game and, on a second screen,
`http://localhost:4173/#kiosk/scores` for the day's leaderboards (it rereads the scores every
10 s and whenever the game tab saves one).

- Start screen: three levels (easy 9–14, medium 20–25, hard 30–40 places, the Excellence
  puzzles first in each); the levels are set in `src/ui/kiosk.ts` (`KIOSK_LEVELS`, puzzle ids
  of the collection). "Vollbild" switches to full screen; a browser in kiosk mode does the
  same without a button (e.g. `chrome --kiosk http://localhost:4173/#kiosk`).
- During a game: "Nächste Person" starts the game again with an empty name; "Zur Auswahl"
  returns to the levels. After two minutes without a touch, click or key the booth goes back
  to the start screen by itself (`INACTIVITY_MS`).
- No designer, gallery or links out of the event mode; to leave it, remove `#kiosk` from the
  address and reload.
- The leaderboards ("Bestenliste des Tages") are kept in the browser's local storage of this
  laptop (nicknames only, nothing is sent; the opt-in play data endpoint stays off unless the
  build sets `VITE_PLAY_DATA_URL`). Only today's results are shown; clearing the site data of
  `localhost:4173` empties them.

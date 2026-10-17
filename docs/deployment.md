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

The deployment is GitHub Pages (below); since roadmap 9.17 there is no chair server and no
play data endpoint. The notes on copying the build to a static server stay for anyone who wants
to host it elsewhere.

## Offline (service worker)

The build has a service worker (`vite-plugin-pwa`, configured in `vite.config.ts`): on the
first visit it caches the app, the solver (HiGHS WebAssembly), all maps and puzzles (about
6 MB), and from then on the site and `#kiosk` open and play without a network. A page that
stays open checks for a new version every hour (and every load does); a new version installs
in the background and takes over where a reload loses nothing: in the gallery, or on the
kiosk's start screen and leaderboard, never during a game. Elsewhere the header offers "Neue
Version – neu laden". `e2e/offline.e2e.ts` tests the kiosk offline on a production build.

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
- No play data endpoint (not planned); the app sends nothing.

## Copy to another static server

Not needed for the project (it runs on GitHub Pages); for anyone who hosts a copy: copy the
content of `dist/` (including the hidden `.htaccess`) into a directory of the web
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
- **Service worker**: `sw.js` and `index.html` should be revalidated (not cached for long),
  so that visitors get updates; the hashed files in `assets/` may be cached for a year.
- **Content Security Policy** (if the server sets one): the app needs
  `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'`; `style-src 'self' 'unsafe-inline'` (React sets
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

## Play data endpoint (not planned)

Not planned since roadmap 9.17 (2026-10-18): the code stays, off by default, and the app sends
nothing unless a build sets `VITE_PLAY_DATA_URL`. For reference: `server/play-data.mjs` is a
dependency-free endpoint (Node ≥ 22). It accepts one JSON
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

## Event mode at a booth (offline, roadmap 9.4, 9.12, 9.17)

The booth uses the Pages site: `https://ls11ae.github.io/tsp-boards/#kiosk` for the game and,
optionally on a second screen, `https://ls11ae.github.io/tsp-boards/#kiosk/scores` for the
day's leaderboards. **Open the site once online before the event** (on every laptop, in the
browser profile used at the booth): the service worker then has everything and the booth works
without a network. Open the game and the leaderboard in the same browser and profile: the
leaderboards live in the browser's local storage, and the second screen rereads them every 10 s
and whenever the game tab saves one.

### Two laptops, two tables

Each laptop keeps its own leaderboard (no sync between laptops). A table label in the address
tells visitors which leaderboard is theirs: `#kiosk?table=1` on one laptop, `#kiosk?table=2`
on the other (and `#kiosk/scores?table=1` for a second screen). The start screen shows "Tisch
1" ("Table 1"), the leaderboards "Bestenliste des Tages – Tisch 1". It combines with free
names: `#kiosk?table=1&names=free`.

### Starting the kiosk with Chrome (Windows, tested by Kevin)

1. Close all Chrome windows, and turn off "Continue running background apps" (Chrome settings →
   System), so that no Chrome keeps running in the background and the kiosk switch takes
   effect.
2. Win+R:
   `chrome --kiosk "https://ls11ae.github.io/tsp-boards/#kiosk?table=1"`
   (if `chrome` is not found, the full path:
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://ls11ae.github.io/tsp-boards/#kiosk?table=1"`).
3. Alt+F4 leaves the kiosk.

The leaderboard lives in this browser profile for this address: always use the same Chrome
profile, no incognito window, the same URL (with the same table), and do not clear the site
data. The second screen with `#kiosk/scores?table=1` is optional (a second Chrome window of the
same profile, moved to the second screen, full screen there).

### Without the Pages site (alternative)

The local build works as well, e.g. on a laptop that was never online with the site:

```bash
npm ci
npm run build
npx vite preview --port 4173
```

Then open `http://localhost:4173/#kiosk?table=1` (and `#kiosk/scores?table=1`). Leaderboards
of `localhost:4173` and of the Pages site are separate (another address).

### Setting up the booth

- **Browser in kiosk mode** (Chrome, above), so there is no address bar, tab bar or back
  button. Without kiosk mode, "Vollbild" on the start screen switches to full screen (F11
  leaves it).
- **Second screen:** a second browser window (same profile) with `#kiosk/scores`, moved to
  the second screen and switched to full screen there.
- **Offline:** after one visit online the service worker has everything (maps, puzzles, the
  solver); no requests leave the laptop (there is no play data endpoint).

### During the day

- Start screen: three levels (easy 9–14, medium 20–25, hard 30–40 places, the Excellence
  puzzles first in each); the levels are set in `src/ui/kiosk.ts` (`KIOSK_LEVELS`, puzzle ids
  of the collection).
- **Names:** every player gets a name from a list of animals with a number ("Fuchs 7",
  "Biber 12"; German or English with the app's language), not one on today's leaderboards;
  "Anderer Name" picks another. There is no free text on the public screen. For supervised use
  (a class, a workshop) `#kiosk?names=free` brings back the name field.
- During a game: "Nächste Person" starts the game again with a new name; "Zur Auswahl"
  returns to the levels. After two minutes without a touch, click or key the booth goes back
  to the start screen by itself (`INACTIVITY_MS`).
- **Removing an entry** (e.g. a name someone typed with free names): press and hold the entry
  on a leaderboard for 1.5 s (or focus it and press Shift+Delete), then confirm with
  "Entfernen". No PIN is needed; the confirmation keeps it from happening by accident.
- **No way out:** the kiosk shows no designer, gallery, export, links or puzzle descriptions;
  the back button and an address changed to another part of the app return to the booth. To
  leave the event mode, load the page without `#kiosk` (edit the address and reload). A
  Playwright test (`npm run e2e`, `e2e/kiosk.e2e.ts`) clicks every visible button on every
  screen and checks that the page stays in the kiosk.
- The leaderboards ("Bestenliste des Tages") are kept in the browser's local storage of this
  laptop and browser profile (names only, nothing is sent). Only today's results are shown;
  clearing the site data of the address empties them.

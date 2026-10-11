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

# TSP Boards

Generator for **TSP puzzle boards**: physical puzzles (a wooden board, nails and a string) on
which players look for the shortest round trip.

- **Map puzzle** (current focus): real cities on a map of a country or region; find the
  optimal tour.
- **Incremental puzzle** ("step by step"): numbered points; solve the nested instances
  {1..3}, {1..4}, ...

The app is a static web app: all computation, including exact TSP solves with
[HiGHS](https://highs.dev/) compiled to WebAssembly, runs in the browser (Web Workers). The same
TypeScript core also runs in Node for batch experiments.

Status: the map puzzle (search, board export, play mode) and the incremental puzzle (generator,
board export) are implemented; deployment is prepared (see below). Design notes, benchmarks and open questions are in
[`docs/design-notes.md`](docs/design-notes.md).

## Using the app

1. Choose a country (Germany, Austria, Switzerland, the Netherlands), Europe or the world, and a
   region (the whole country, a state or canton, a continent, or a larger region), the number of
   cities and the board: size, margin, nail diameter, string thickness and minimum distance
   between nails (all in mm). World puzzles are digital: they measure great-circle distances on
   the sphere and show the round trip on an Equal Earth world map.
2. Set the target gap: how much longer (in mm of string) the second-best round trip must be
   than the optimal one, so that players can check their solution with the string.
3. Start the search. The board shows the best candidate so far; the side panel shows
   progress, the gap, difficulty and how well-known the cities are. The best candidates are
   checked exactly (✓) in the background.
4. Click a city on the board to pin it (it must be included), click again to exclude it, a
   third time to make it neutral again; then search again.
5. "Copy link" stores parameters, pins and the selected cities in the URL, so the puzzle can be
   shared and reopened. The interface is in English and German.
6. Board export: once a puzzle is checked exactly, "Plan the board" chooses the start nail and
   the measuring scale, places title and labels and computes the gap as read at the scale.
   Then download the SVG for a laser cutter, a print template (1:1 on A4/A3 tiles, for boards
   built without a laser) and the solution sheet (tour, lengths, string calibration).

7. "Copy play link" makes a link for players: it opens the puzzle without search settings and
   without the solution. Players click the nails in order to build their round trip; the app
   computes the shortest round trip in the background and tells them whether theirs is optimal
   or how many mm of string longer it is.

City labels must fit next to their nails without overlaps (8 positions per label); the search
treats labels that do not fit like a gap below the target. Label size 0 switches labels off.

### Step by step (incremental puzzle)

Switch to "Step by step" in the header. Set the number of nails (up to 16), the board, the gap
and the spacing of the marks, and generate: the app searches a sequence of points such that
every instance {1..k} has a unique shortest round trip (gap at least the target, also as read
on the board), its optimum is not just the previous one with the new nail inserted (from k = 5),
and the marks for consecutive k are apart. On the board, the string returns to nail 1 and runs
around the corner nails along the edge; mark k shows where its end lies for the shortest round
trip through 1..k. Click an instance to highlight its nails and (optionally) its optimum;
"Copy link" stores the points; the downloads are the same as for map boards.

```bash
npx tsx cli/incremental.ts --n 12 --seed 1 --export boards
```

### The self-check on the board

The string is tied to the start nail with a loose loop, wound around all nails, brought back
to the start nail and laid along the engraved scale. Whoever builds the board calibrates the
string once: wind the optimal tour from the solution sheet and mark the string at the target
mark "0". For the shortest round trip the string end then reaches 0; every other round trip
ends at least the gap shown on the solution sheet before it, and the scale shows how many mm of
string a solution uses too many. The gap at the scale is computed exactly, including the wrap
around the start nail.

SVG colours: red = cut through (outline, nail holes), blue = score (thin lines, scale), green =
outline (score with more power), black = engrave (text, marks). All text is converted to
outlines. Many laser drivers expect hairlines for cutting (e.g. 0.025 mm): set the SVG line
width in the export options.

The string length includes the wrap around each nail: S = L + r·Σ|θ| with r = nail radius +
half the string thickness and θ the turning angle at each nail. Default board dimensions are
placeholders until the measurements of the prototype boards are known.

## Development

Requirements: Node.js 24 (see `.nvmrc`; Node 22.12 or newer works).

```bash
npm ci
npm run dev       # dev server at http://localhost:5173
npm run check     # format check, lint, typecheck, tests, production build
```

Individual steps: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run format`.

### City data

The generated data in `public/data/` is committed; rebuilding is only needed to update it.

```bash
npm run data:download -- de
```

```bash
npm run data:build -- de
```

The download goes to `data/raw/` (gitignored, about 52 MB). The build writes
`public/data/countries/de.json`, updates `public/data/manifest.json` and writes a review report
to `docs/data/de-report.md`. The data version only increases when the content changes. The
same works for `at`, `ch` and `nl` (one place per municipality; the municipality level and the
cleaning of official names are set per country in `scripts/build-data/geonames.ts`) and for
`eu` (Europe: GeoNames' global town list and the 47 countries' alternate names, about 70 MB
of downloads besides Natural Earth; see `scripts/build-data/continent-sources.ts`) and `wo`
(the world: towns of at least 250,000 inhabitants, continents as regions, the alternate names
of about 150 countries, about 200 MB of downloads; see `scripts/build-data/world.ts`).

### Experiments (Node)

```bash
npx tsx cli/search.ts --n 40 --seed 1 --iterations 2000 --verify 3
```

Runs the puzzle search for Germany and prints the result as JSON; options are listed in the
header comment of each script. Further scripts: `cli/bench-exact.ts` (exact solver
timings), `cli/ub-tightness.ts` (quality of the local gap bound), `cli/gap-survey.ts`
(achievable gaps), `cli/label-survey.ts` (label feasibility), `cli/start-nail-survey.ts`
(gap at the scale), `cli/incremental-survey.ts` (incremental puzzle). Results are recorded in `docs/experiments/` and `docs/design-notes.md`.

```bash
npx tsx cli/export-board.ts --link '<permalink>' --out boards --paper A3
```

Exports a puzzle from a permalink (it must contain the selected cities) as laser SVG, print
template and solution sheet.

### Board font

Board text uses Fira Sans Condensed Medium (SIL Open Font License 1.1). Its outlines are
extracted into `src/core/board/font-data.ts` (generated, committed) by `npm run font:build`.

## Layout

- `src/core/`: pure TypeScript (no DOM, no Node APIs): geometry, projection, TSP heuristics,
  exact solver wrapper, metrics, search, board export (`src/core/board/`: font, labels, start
  nail and scale, drawing, SVG and PDF). Runs in browser and Node.
- `src/workers/`: Web Worker entry points (search, exact solves).
- `src/ui/`: the React web app.
- `scripts/`: offline data build and font extraction. `public/data/`: generated data.
- `cli/`: Node entry points for experiments and board export.
- `server/`: optional reference endpoint for play data.
- `docs/`: design notes and experiments.

### Deployment

The build (`npm run build`, or the CI artifact `tsp-boards-dist`) is a static site that runs
from any sub-path. Server settings, a smoke test and the optional play data endpoint are
described in [`docs/deployment.md`](docs/deployment.md).

### Play data (optional)

Builds with `VITE_PLAY_DATA_URL` set show players a consent box; with consent, one anonymous
record per game (times, attempts, excess in mm, puzzle hash; no names or ids) is POSTed to that
URL to calibrate difficulty. Without the variable (the default) nothing is ever sent. The format
is `PlayRecord` in `src/core/play.ts`.

## Credits

This project builds on the MSc thesis of Nick Tchang, _Generating Challenging TSP Instances_,
TU Dortmund, Chair 11 Algorithm Engineering, 2026.

Exact solves use [HiGHS](https://highs.dev/) (MIT license) via the
[`highs`](https://github.com/lovasoa/highs-js) npm package (MIT license).

Board text: [Fira Sans Condensed](https://github.com/mozilla/Fira) by The Mozilla Foundation and
Telefonica S.A., licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).

## Data attribution

- City data: [GeoNames](https://www.geonames.org/), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Boundaries: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

## License

The code license has not been chosen yet.

# TSP Boards

Generator for **TSP puzzle boards**: physical puzzles (a wooden board, nails and a string) on
which players look for the shortest round trip.

- **Map puzzle** (current focus): real cities on a map of a country or region; find the
  optimal tour.
- **Incremental puzzle** (later): numbered points; solve the nested instances {1..3}, {1..4}, ...

The app is a static web app: all computation, including exact TSP solves with
[HiGHS](https://highs.dev/) compiled to WebAssembly, runs in the browser (Web Workers). The same
TypeScript core also runs in Node for batch experiments.

Status: Phase 1 (map puzzle MVP for Germany) is complete. Design notes, benchmarks and open
questions are in [`docs/design-notes.md`](docs/design-notes.md).

## Using the app

1. Choose a region (Germany or a federal state), the number of cities and the board: size,
   margin, nail diameter, string thickness and minimum distance between nails (all in mm).
2. Set the target gap: how much longer (in mm of string) the second-best round trip must be
   than the optimal one, so that players can check their solution with the string.
3. Start the search. The board shows the best candidate so far; the side panel shows
   progress, the gap, difficulty and how well-known the cities are. The best candidates are
   checked exactly (✓) in the background.
4. Click a city on the board to pin it (it must be included), click again to exclude it, a
   third time to make it neutral again; then search again.
5. "Copy link" stores parameters, pins and the selected cities in the URL, so the puzzle can be
   shared and reopened. The interface is in English and German.

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
to `docs/data/de-report.md`. The data version only increases when the content changes.

### Experiments (Node)

```bash
npx tsx cli/search.ts --n 40 --seed 1 --iterations 2000 --verify 3
```

Runs the puzzle search for Germany and prints the result as JSON; options are listed in the
header comment of each script. Further scripts: `cli/bench-exact.ts` (exact solver
timings), `cli/ub-tightness.ts` (quality of the local gap bound), `cli/gap-survey.ts`
(achievable gaps). Results are recorded in `docs/experiments/` and `docs/design-notes.md`.

## Layout

- `src/core/`: pure TypeScript (no DOM, no Node APIs): geometry, projection, TSP heuristics,
  exact solver wrapper, metrics, search. Runs in browser and Node.
- `src/workers/`: Web Worker entry points (search, exact solves).
- `src/ui/`: the React web app.
- `scripts/`: offline data build. `public/data/`: generated data.
- `cli/`: Node entry points for experiments.
- `docs/`: design notes and experiments.

## Credits

This project builds on the MSc thesis of Nick Tchang, _Generating Challenging TSP Instances_,
TU Dortmund, Chair 11 Algorithm Engineering, 2026.

Exact solves use [HiGHS](https://highs.dev/) (MIT license) via the
[`highs`](https://github.com/lovasoa/highs-js) npm package (MIT license).

## Data attribution

- City data: [GeoNames](https://www.geonames.org/), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Boundaries: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

## License

The code license has not been chosen yet.

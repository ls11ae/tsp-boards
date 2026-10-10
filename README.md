# TSP Boards

Generator for **TSP puzzle boards**: physical puzzles (a wooden board, nails and a string) on
which players look for the shortest round trip.

- **Map puzzle** (current focus): real cities on a map of a country or region; find the
  optimal tour.
- **Incremental puzzle** (later): numbered points; solve the nested instances {1..3}, {1..4}, ...

The app is a static web app: all computation, including exact TSP solves with
[HiGHS](https://highs.dev/) compiled to WebAssembly, runs in the browser (Web Workers). The same
TypeScript core also runs in Node for batch experiments.

Status: early development. Design notes, benchmarks and open questions are in
[`docs/design-notes.md`](docs/design-notes.md).

## Development

Requirements: Node.js 24 (see `.nvmrc`; Node 22.12 or newer works).

```bash
npm ci
npm run dev       # dev server at http://localhost:5173
npm run check     # format check, lint, typecheck, tests, production build
```

Individual steps: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run format`.

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

# TSP Boards

Generator for **TSP puzzle boards**: physical puzzles (wooden board, nails, a string) on which
players look for the shortest round trip. Two puzzle types:

- **Map puzzle** (current focus): real cities on a map of a country/region; find the optimal tour.
- **Incremental puzzle** ("step by step"): numbered points; solve nested instances {1..3}, {1..4}, ...

This project reimplements and improves the generators from an MSc thesis whose code is not
available. The thesis is guidance, not a specification: deviations and improvements are welcome.

**Before making design decisions, read `docs/design-notes.md`.** It contains the thesis summary,
what we change and why, benchmark results, and open questions.

## Status

- Repository `ls11ae/tsp-boards` (GitHub, private for now, will become public later).
  Keep secrets and personal data out of the repo.
- Phase 1 (MVP map puzzle, Germany) complete: data build, TSP core with string length, exact
  solvers (Euclidean and turn-cost MIP), search with two-level evaluation, browser app (EN/DE)
  with live search, exact verification in a worker, pin/exclude, permalinks. Measurements in
  `docs/design-notes.md` (Sections 6, 11) and `docs/experiments/`.
- Phase 2 (board export) complete: embedded board font (text as outlines), label placement as
  search constraint, start nail + measuring scale with the exact gap at the scale, laser SVG,
  print template and solution sheet (PDF), export in the app and `cli/export-board.ts`.
  Measurements in `docs/design-notes.md` (Section 6.4) and `docs/experiments/`.
- Phase 3 (play mode) complete: play links without search settings or solution, tour building
  by clicks, judging against the exact string optimum, opt-in play records (off unless the
  build sets `VITE_PLAY_DATA_URL`).
- Phase 4: deployment prepared (CI artifact `tsp-boards-dist`, `docs/deployment.md`,
  `.htaccess`, reference play data endpoint `server/play-data.mjs`); the actual upload to the
  chair server needs access and is the maintainers' step. Incremental puzzle implemented
  (`src/core/incremental/`: Held–Karp with two best values, insertion field, sequence search
  with exact checks, measuring track around the board edge; app mode and `cli/incremental.ts`).
- **Next: Phase 5 "digital features"** (decided by Kevin 2026-10-11/12): puzzle files with
  titles, save/load and a gallery, city lists and custom points, local highscores, digital vs.
  board puzzles, overlays, group constraints. **`docs/roadmap.md` is the source of truth for
  open work**, in its order.
- Open: prototype board dimensions (and a test board), code license, deploying to the chair
  server, play data endpoint, play mode for the incremental puzzle.
- Code license not chosen yet (decide before going public).

## Agreed direction

- **Browser-first static web app.** All computation runs client-side (Web Workers). The chair's
  server only hosts static files (later possibly a tiny endpoint for opt-in play data). No
  backend compute, no accounts.
- **TypeScript** for app and core. The core must also run in Node, so batch experiments can run
  from a CLI.
- **Exact TSP:** HiGHS compiled to WebAssembly (npm package `highs`), DFJ model with iterative
  subtour elimination; second-best tour via a no-good cut on the optimal edge set.
  Keep the solver behind an interface so a server-side solver could be added later.
- **Offline data build** (Node/TypeScript): GeoNames + Natural Earth (+ later Wikidata)
  -> compact per-country JSON used by the app, committed, with a data version.
- **Board-first:** one region-fitted conformal projection (e.g. conic conformal via d3-geo) is
  used for the screen, for all metrics, and for the printed/lasered board. All physical
  parameters in millimetres (board size, nail diameter, min city distance, min gap in string).

## Domain facts (do not rediscover)

- The gap between the optimal and the second-best tour is often small for random instances
  (a few mm of string), but the search finds selections with exactly verified string gaps of
  6–25 mm (default weights) and ≥ 40 mm (gap only) for n = 30–50 in Germany
  (`docs/experiments/gap-survey-2026-10-10.md`). For boards it is a hard constraint in mm of
  string, not a bottleneck. Fixed instances (city lists, Phase 5) cannot be searched and may
  have small gaps: warn, and offer them as digital puzzles.
- The string wraps around the nails: string length S = L + r_eff·Σ|θ| (r_eff = nail radius +
  half the string thickness, θ = turning angle at each nail). S, not L, is the primary objective
  in heuristics and the gap bound. Every closed tour has Σ|θ| ≥ 2π, and near-optimal 40-point
  tours have Σ|θ| ≈ 40–48 rad, so "Euclidean-near" windows that would cover all
  string-shorter tours are ~35–40 mm wide and cannot be enumerated.
- Exact solves (WASM, optimum + runner-up): Euclidean ~30–400 ms, string (turn-cost) model
  1–17 s for n = 30–50. Do not run them in every search step: use fast heuristics plus a cheap
  upper bound on the second-best tour, and verify exactly only for promising candidates.
- The self-check reads the string end on a scale at the start nail; the wrap around the start
  nail changes the measured gap by up to 1.5·r·(π − θ_s). The board certifies the measured
  optimum (turn costs at s replaced by the end wrap, `board/measure.ts`), computed exactly.
- The local gap bound (all 2-opt, pure 3-opt and double-bridge alternatives of the optimum)
  overestimates the true gap in 10–20 % of instances, and a search maximising it selects
  exactly those. Combined with the string lengths of the exact Euclidean optimum and
  runner-up it is tight in 95–100 %; final candidates are verified with the exact turn-cost
  MIP (3–11 s at n = 40, 3–17 s at n = 50 in WASM).
- Achievable gaps (Germany, exact string model): ≥ 40 mm for n = 30–50 when only the gap is
  optimised; 6–25 mm with default weights (difficulty and well-known cities).
- Do not compute distances in Web Mercator (EPSG:3857); the thesis did, which distorts
  Germany by ~18 % north vs. south.
- Do not use population^2 as "recognizability" (Berlin alone dominates). Prefer log/rank-based
  scores or Wikidata/Wikipedia signals, plus user pinning of cities.
- GeoNames needs cleaning: drop city districts (feature code PPLX etc.), prefer short German
  names over long official names.

## Proposed layout

- `src/core/` pure TS, no DOM: geometry, projection, TSP heuristics, exact solver wrapper,
  metrics, search; `src/core/board/` board export (font, labels, start nail and scale,
  drawing, SVG, PDF); `src/core/incremental/` the incremental puzzle. Runs in browser and Node.
- `src/workers/` Web Worker entry points (search, exact solves).
- `src/ui/` the web app.
- `scripts/` offline data build; `public/data/` generated data (committed, one file per country).
- `cli/` Node entry points for experiments and exports.
- `server/` optional reference endpoint for opt-in play data.
- `docs/` design notes, experiments.

## Conventions

- npm, Vite, Vitest, strict TypeScript, ESLint + Prettier. CI on GitHub Actions (build + test).
- Seeded RNG everywhere. Permalinks restore a puzzle from its selected city IDs (`sel`); the same
  parameters + seed reproduce the same search only within the same JS engine (`Math.sin`, `cos`,
  `exp` are not bit-identical across engines).
- Tests: exact solver against brute force for n <= 9; heuristics against the exact solver;
  metrics on hand-made instances.
- Code, comments, commit messages and docs in English.
- Small, focused commits.

## Working mode

- Work autonomously, without asking. Decide by best judgement and record each decision briefly
  in the "Decision log" section of `docs/design-notes.md` (decision, alternatives, reason).
- Commit in small steps and push to `main` yourself once tests are green. Several people work
  on this repository: `git pull --rebase` before you start and before pushing; when two people
  work at the same time, use a feature branch and a pull request (CI green) instead.
- Open work comes from `docs/roadmap.md` (in its order); mark items done there when finished.
- Stop only if the gap measurement (Germany, string length) gives an achievable gap below
  about 3 mm for n = 40, or if genuinely blocked.
- Data attribution: GeoNames is CC BY 4.0 -> credit in UI and README. Natural Earth is public
  domain, Wikidata CC0.
- Credit the thesis in the README: Nick Tchang, "Generating Challenging TSP Instances",
  MSc thesis, TU Dortmund, Chair 11 Algorithm Engineering, 2026.

## Roadmap

Phases 1–4 are done (see Status). Open work, in order, is in `docs/roadmap.md`:

5. **Digital features** (current): puzzle files and gallery, city lists and custom points,
   highscores, digital vs. board puzzles, overlays and thesis metrics, group constraints.
6. **Later:** teaching mode, robustness over r_eff, classroom worksheets, more countries, play
   mode for the incremental puzzle, test board with the prototype dimensions, deployment.

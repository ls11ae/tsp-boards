# Design notes

Status: 2026-10-09. Written from a design discussion between Kevin Buchin and Claude after
reading the MSc thesis below. Internal working notes: review before the repository goes public.

## 1. Background

**Thesis:** Nick Tchang, _Generating Challenging TSP Instances_, MSc thesis, TU Dortmund,
Chair 11 Algorithm Engineering, 26 Feb 2026 (supervisors Kevin Buchin, Anja Fischer).
The original code was never published; we reimplement and improve.

**Physical puzzle:** a board with nails at the point positions and a string tied to a start nail.
The player winds the string around all nails and back. Markings on the board show where the
string end must reach for an optimal tour, so players can check themselves.

**Thesis implementation:** incremental puzzle in C++ (modified Vorosketch by Herman Haverkort for
the Voronoi computations, Gurobi for exact TSP); map puzzle in Python (Gurobi, folium,
GeoNames cities with >= 5000 inhabitants, projection EPSG:3857).

## 2. Map puzzle as described in the thesis

- Simulated annealing over subsets of a filtered city pool (e.g. one country), n ≈ 40.
- Move: remove a random city, add a population-weighted random city that satisfies the minimum
  distance to all selected cities (hard filter).
- Geometric cooling T: 1 -> 0.01; 500–3000 iterations; initial set = n most populous cities.
- Objective = weighted sum (weights not stated in the thesis) of
  - C = (n − h)/n, fraction of points not on the convex hull,
  - D = |E(OPT) \ E(NN graph)| / n, edges of the optimal tour not in the nearest-neighbour graph,
  - S = (L(OPT₂) − L(OPT)) / (0.05 · L(OPT)), normalized gap to the second-best tour,
  - P = Σ pop^α / (Σ over the n most populous cities of pop^α), α = 2.
- Physical correction for the string wrapping around nails: Δℓ ≈ r · Σ θᵢ (r nail radius, θᵢ
  turning angle at node i). Empirically this matched better than a tangent/arc model.
  Must be recalibrated with a real board.

## 3. Observations that motivate changes (map puzzle)

1. **The gap to the second-best tour.** Random 40–60 point instances have gaps of 0.00–0.17 %
   of the tour length (Section 6), with ~3 m of string 0.1 % ≈ 3 mm; in the thesis, S rarely
   exceeded 0.1 (gaps below 0.5 %). -> The gap is a hard constraint in mm of string and is
   optimised explicitly. Measured since (Section 6.3): the search finds exactly verified string
   gaps of 6–25 mm with default weights and ≥ 40 mm when only the gap counts (n = 30–50,
   Germany), and the gap at the scale keeps 95–112 % of it (Section 6.4). For searched boards
   the gap is not a bottleneck; fixed instances (city lists) can still have small gaps.
2. **Projection.** EPSG:3857 scales distances by 1/cos(latitude): ~1.47 in southern vs ~1.74 in
   northern Germany (~18 % difference). The thesis' "150 km" minimum distance was measured in
   Mercator units: the closest pair in its Table A.4 is only 92 km apart in reality
   (Laboe–Mölln). -> Region-fitted conformal projection used consistently on screen, in
   metrics and on the board; distances in mm on the board.
3. **Population term.** With α = 2, Berlin alone contributes ~51 % and the top three cities
   ~73 % of P (computed from the thesis' Table A.5 for Germany). -> Recognizability from
   log/rank of population or from Wikidata/Wikipedia (sitelinks, pageviews); user can pin
   cities ("Dortmund must be in").
4. **Hard minimum-distance filter** blocks a large city whenever a nearby small city is selected.
   -> "Ejection swap": insert a city, remove all selected cities that conflict with it, refill.
5. **Weak difficulty signals.** The hull ratio hardly varies (0.65–0.8 for n = 40); NN-graph
   overlap is only a weak proxy. -> Measure difficulty by how often simple strategies fail to
   find the optimum: nearest neighbour from every start, greedy edge, insertion heuristics,
   2-opt/Or-opt from random starts. Later: calibrate with real play data.
6. **Data quality.** Thesis instances contain city districts (e.g. "Holzen") and long official
   names ("Universitäts- und Hansestadt Greifswald"). -> Filter GeoNames feature codes (drop
   PPLX and similar), prefer short German names from alternate names.
7. **Weight tuning** was manual. -> Show several diverse good candidates with transparent metric
   breakdowns and let the user choose, instead of hiding everything in fixed weights.
8. Minor inconsistencies in the thesis (do not rely on exact numbers): Algorithm 4 starts from a
   random subset, the text from the n most populous cities; Tables A.4 and A.7 are identical;
   Fig. 7.4 caption says δ = 0.75 (should be 0.075).

## 4. Architecture (agreed direction)

**Browser-first static web app**, hosted as static files (chair server; GitHub Pages possible for
previews). Reasons: no server maintenance or security updates, no abuse risk from public
compute endpoints, keeps working after student assistants leave, instant feedback for
interactive editing, privacy is trivial, scales for free, works offline at school events.

- TypeScript core usable in browser and Node (CLI for batch experiments on a server/cluster).
- Exact solver behind an interface; a server-side solver could be added if ever needed.
- Optional later: tiny endpoint for anonymous, opt-in play data.

## 5. Algorithms

- **Exact TSP:** DFJ, degree constraints, iterative subtour elimination (solve MIP, add SECs
  for all components, repeat), HiGHS WASM in a Web Worker.
- **Exact second-best tour:** add the no-good cut Σ_{e ∈ OPT} x_e ≤ n − 2 (two different tours
  share at most n − 2 edges), keep the SECs collected so far, repeat the loop. Both models: the
  Euclidean length L and the string length S (turn-cost model, decision log 2026-10-10).
- **Heuristic optimum during search:** Or-opt + 2-opt with neighbour lists and perturbation
  (iterated local search); warm-start from the previous tour after a swap (remove city, cheapest
  insertion of the new city, local search).
- **Cheap upper bound on the second-best tour:** best tour different from OPT among local
  modifications of OPT (all 2-opt moves, all pure 3-opt reconnections, optionally double
  bridges), in string length. If UB − S(OPT) < required gap, reject the candidate without an
  exact solve. The true second-best can be a non-local change (Section 6.2), so promising
  candidates are refined and final candidates verified exactly.
- **Search:** SA / iterated local search over city subsets with ejection swaps; constraints:
  minimum distance on the board (mm), pinned/excluded cities, later label feasibility;
  objectives: gap (saturating at the target), difficulty, recognizability. Cache evaluations by
  subset key (SA revisits subsets).

## 6. Benchmark: HiGHS in WebAssembly

Script: `docs/experiments/highs-wasm-bench.cjs` (npm package `highs@1.8.0`, Node 22, i.e. the
same V8 engine as Chrome). Five instances each, unit square:

| instance         | optimal tour | second-best tour | gap OPT -> 2nd best |
| ---------------- | ------------ | ---------------- | ------------------- |
| n = 40 uniform   | 528 ms       | 131 ms           | 0.01–0.17 %         |
| n = 50 uniform   | 561 ms       | 558 ms           | 0.01–0.17 %         |
| n = 60 uniform   | 730 ms       | 473 ms           | 0.02–0.06 %         |
| n = 40 clustered | 148 ms       | 151 ms           | 0.00–0.08 %         |
| n = 50 clustered | 315 ms       | 178 ms           | 0.03–0.09 %         |

(The naive 2-opt/Or-opt heuristic in that script is deliberately simple and not representative
of a proper implementation.)

### 6.1 Phase 1 implementation (2026-10-10)

`cli/bench-exact.ts`, raw output in `docs/experiments/bench-exact-2026-10-10.txt` (Node 24,
highs 1.15.3, integer µm costs, r_eff = 1.5 mm, board 600 × 800 mm; "germany" = random
subsets of towns ≥ 5000 inhabitants at ≥ 25 mm). Times for optimum + second-best tour,
with MIP starts from the heuristic; three instances each:

| n   | ILS (150 kicks) | gap scan (+ double bridge) | Euclidean exact | string (turn-cost) exact |
| --- | --------------- | -------------------------- | --------------- | ------------------------ |
| 20  | 50–100 ms       | 0–4 ms                     | 14–313 ms       | 0.13–1.1 s               |
| 30  | 80–140 ms       | 1–6 ms                     | 27–157 ms       | 1.1–2.6 s                |
| 40  | 110–130 ms      | 2–8 ms                     | 37–307 ms       | 3–11 s                   |
| 50  | 130–180 ms      | 5–14 ms                    | 65–389 ms       | 3.4–17 s                 |

Later improvements (presolve off, reusable SEC pool) cut the Euclidean solves inside the
search by a further ~3×. The exact string model is fast enough to verify a handful of final
candidates (also in the browser: same V8/WASM engine), not for every search step.

### 6.2 Tightness of the local gap bound

`cli/ub-tightness.ts`, output in `docs/experiments/ub-tightness-2026-10-10.txt`.

- Euclidean (200 instances per row): the local bound (2-opt, all pure 3-opt, double bridge)
  equals the exact gap in 75–89 % of instances. Among instances whose bound is ≥ 3 mm, the
  true gap is smaller in 9–21 % ("false accepts"); the exact second-best tour changes ≥ 4
  edges in 10–20 % of instances. Germany is worse than uniform (clustered towns).
- String length (20 instances per row): local bound tight in 80–100 %; combined with the
  string lengths of the exact Euclidean optimum and runner-up: tight in 95–100 %, one false
  accept in 80 instances.
- Consequence: a search that maximises the local bound selects exactly the instances where it
  overestimates. The search therefore refines promising candidates (level 2, Section 11) and
  the final candidates are verified with the exact string model.

### 6.3 Achievable gaps (Germany)

`cli/gap-survey.ts`, output in `docs/experiments/gap-survey-2026-10-10.md`. Three seeds per row,
1500 iterations, top three candidates per run verified with the exact string model:

| mode                                     | n   | max. verified gap | median of run maxima |
| ---------------------------------------- | --- | ----------------- | -------------------- |
| max gap (target 3 mm, saturation 40 mm)  | 30  | 43.8 mm           | 43.2 mm              |
|                                          | 40  | 44.1 mm           | 41.2 mm              |
|                                          | 50  | 41.5 mm           | 41.4 mm              |
| default (target 5 mm, weights 1/0.5/0.5) | 30  | 20.8 mm           | 18.2 mm              |
|                                          | 40  | 24.6 mm           | 13.1 mm              |
|                                          | 50  | 23.7 mm           | 17.4 mm              |

- The gap is far from the bottleneck it seemed to be for random instances (0–5 mm): the
  search reaches ≥ 40 mm (the saturation point, so the true maximum is higher) for all sizes.
  Gap-only puzzles tend to be easy (difficulty often < 0.3), so the default mode matters.
- With default weights every verified top candidate had ≥ 6 mm (the saturation point).
- The search value overestimated the exact gap in 4 of 54 verified candidates, by at most
  1.6 mm (19.03 → 17.41 mm); never below the target.
- Stop criterion of the working mode (achievable gap below ~3 mm at n = 40): not met.

### 6.4 Board export (Phase 2, 2026-10-11)

Labels (`cli/label-survey.ts`, `docs/experiments/label-survey-2026-10-11.md`, 200 random
subsets per row): on 600 × 800 mm, 8–10 mm labels fit for 98–100 % of random subsets (n = 40–60);
on 400 × 533 mm with 10–12 mm labels only 3–87 %. The exact placement needs about n backtracking
nodes when a placement exists. Optimised puzzles on the default board were never limited by
labels.

Gap at the scale (`cli/start-nail-survey.ts`, `docs/experiments/start-nail-survey-2026-10-11.md`,
top three candidates of three runs, n = 40): 32–37 of 40 nails have room for the scale; with the
chosen start nail the exact measured gap is 95–112 % of the string gap (7.9–18.2 mm); the
cheap bound is 1–2 mm below. Planning including the MIP: 1–10 s.

Board files: the SVG of a 40-city board is ~0.4 MB (text as outlines), the A4 template
(1 + 15 pages) and the solution sheet ~0.35–0.5 MB each.

## 7. Interaction and features (ideas)

- Region: country, federal state, or a drawn polygon/rectangle.
- Watch the search live (progress, metric traces); pin/exclude cities and re-optimize around them.
- Designer mode vs. play mode; shared play links must not reveal the solution: done (play
  links, judging against the exact optimum, opt-in play data).
- Permalinks: parameters + seed + city IDs in the URL; no database needed.
- Label placement as a feasibility constraint: done (8-position model, exact backtracking).
  Later: sliding labels, labels avoiding the tour strings, leader lines.
- Export: done (laser SVG with cut/score/outline/engrave layers, 1:1 print template, solution
  sheet). Later: calibration of the string model on a real board (nail correction, start nail).
- Play mode in the browser doubles as a measurement tool for empirical difficulty (records
  are ready; an endpoint and an analysis are still to come).

## 8. Incremental puzzle

- Thesis idea: for a base set I and a new point p,
  L(OPT(I ∪ {p})) = min_{i≠j} W_ij + |p nᵢ| + |p nⱼ|, where W_ij is the shortest Hamiltonian path
  from nᵢ to nⱼ through I. Evaluating this on a raster gives the "Voronoi diagram with weighted
  detour distance"; the order-2 version gives the gap to the second-best tour.
  Thesis parameters: δ ≈ 0.075·side (gap), ε (minimum difference between consecutive optima),
  change ≥ 1 (tour must change beyond inserting the new point), look-ahead depth up to 3.
- Improvements:
  - Held–Karp DP instead of MIP (n ≤ 20). Point 1 is in every prefix, so one DP started at
    point 1 yields the optima of all nested sub-instances at once. Measured (Python + Numba,
    single DP): n = 14: 5 ms, 16: 23 ms, 18: 107 ms, 20: 486 ms.
  - Keep the two best values per DP state -> exact second-best tour. The thesis halves δ in one
    case, so its gap guarantee effectively holds only for δ/2.
  - Replace Vorosketch by a plain raster evaluation (min and second min over ~n²/2 functions).
  - Global search over the whole point sequence instead of greedy look-ahead; in the
    look-ahead, dead ends (no feasible candidate) must score −∞ (the thesis' Algorithm 2 does not
    penalize them, which explains failed generations). Prefer candidates far from the filter
    boundary; re-check δ after the nail correction.
  - Algorithm 3 tests L2 − |OPT| < ε; presumably L1 was intended.

Implemented (2026-10-12, see the decision log): Held–Karp with two best values, raster
evaluation of the insertion field, depth-first search with backtracking over the whole
sequence (dead ends penalised by backtracking), exact checks with the turn-cost MIP including
the measured gap at the track, the change rule from k = 5, mark spacing ε, clearance of later
points from earlier optimal tours, board drawing and export, app and CLI. Open: play mode for
the incremental puzzle, a "prefer candidates far from the filter boundary" score beyond the
weakest slack, larger N (Held–Karp limits N to 16).

## 9. Licenses and attribution

- GeoNames: CC BY 4.0 (attribution required). Natural Earth: public domain. Wikidata: CC0.
  OpenStreetMap (if used): ODbL.
- Code license: to be decided before making the repository public.

## 10. Open questions

- Code license.
- Dimensions, nail diameter and string of existing prototype boards (for defaults/calibration).
- Calibration of the string model on a real board: does the measured gap match? (Wind the
  optimum and the runner-up on a board and compare the string ends at the scale.)
- Hosting details on the chair server (requirements in `docs/deployment.md`).

## 11. Decision log

Short entries: decision; alternatives considered; reason. Newest last.

- **2026-10-10 UI framework: React** (state via Zustand or `useReducer`, no Redux; UI updates
  throttled to ≤ 10 Hz; d3 computes, React renders the SVG). Alternatives: Svelte 5, Preact,
  vanilla TS. Reason: most widely known, so easiest for future student assistants; stable.
- **2026-10-10 UI language: bilingual English/German with a switch**, own typed dictionaries
  (no i18n library). Board labels are a separate parameter (German in Phase 1).
- **2026-10-10 Data build in Node/TypeScript**, per-country GeoNames dumps. Alternative: Python
  (geopandas). Reason: one toolchain for CI, tests and lint; can reuse core code.
- **2026-10-10 Generated data is committed**, one file per country, with a data version in a
  manifest and in permalinks; the app warns on mismatch. Alternative: build data in CI.
  Reason: no GeoNames download in CI, reviewable diffs, stable permalinks.
- **2026-10-10 String length is the primary objective**: S = L + r_eff·Σ|θ|, r_eff = nail
  radius + half string thickness, in the heuristics, the gap bound and the exact check.
  Alternative: optimise Euclidean length and enumerate tours in a window afterwards. Reason:
  Σ|θ| ≥ 2π for every tour, so the window would be target + r_eff·(Σ|θ|(OPT) − 2π) ≈ 35–40 mm
  for n = 40, far too wide to enumerate. If an exact turn-cost model (triple variables) is too
  slow in HiGHS, results are labelled "Euclidean exact, string checked locally".
- **2026-10-10 Integer costs in µm** (coordinates rounded to µm, `Math.round(Math.sqrt(...))`,
  turn costs rounded per triple). Reason: exact comparisons and deltas, genuine ties, integer
  objective for HiGHS.
- **2026-10-10 Reproducibility contract**: a permalink restores the puzzle from the selected
  city IDs (`sel`); parameters + seed reproduce the search only within the same JS engine,
  because `Math.sin`, `cos`, `exp`, `atan2` are not bit-identical across engines. Exact
  verification results only annotate the archive and never influence the search.
- **2026-10-10 Gap bound scan excludes moves that reproduce the same tour** (compared via the
  edge set) but keeps genuine ties (different edge set, same length).
- **2026-10-10 TypeScript 6.0, not 7**: typescript-eslint (8.70) supports TypeScript < 6.1
  only; TypeScript 7 is the native compiler. Revisit when typescript-eslint supports it.
- **2026-10-10 highs ≥ 1.15.1** (pinned 1.15.3). 1.8.0 throws on `output_flag` (#51), 1.14.2
  can report non-optimal MIPs as optimal (#53). Each MIP run has ~9 ms fixed overhead, so the
  exact solver should keep a persistent model and add cuts incrementally (Model API).
- **2026-10-10 Working mode**: autonomous; decisions recorded here; push to `main` after green
  tests; stop only if the gap measurement for n = 40 gives an achievable gap below ~3 mm.
- **2026-10-10 One city per municipality.** GeoNames codes many districts as PPL (e.g.
  Brackel, Lütgendortmund in Dortmund), but they share the municipality key admin4 (AGS). The
  build groups populated places by (admin1, admin4); population from the ADM4 feature,
  coordinates from the place named like the municipality, else the highest seat code.
  Alternative: distance-based district detection. Reason: exact, and every place with
  population ≥ 1000 has an admin4 code. A "near a much larger city" flag remains for review.
- **2026-10-10 Names from the official municipality name (ADM4), cleaned**, not from GeoNames'
  alternate names: those differ in only 38 cases and about half are wrong ("Leinfelden" for
  Leinfelden-Echterdingen, "Ramstein+afb"). Cleaning drops designations after a comma, a
  leading "Stadt ", the Sorbian part of bilingual names, and expands official abbreviations
  ("Kahl a.Main" -> "Kahl am Main"). Short labels only as prefixes of the name; English names
  only for genuine exonyms (Munich, Cologne, Nuremberg, Hanover).
- **2026-10-10 Neighbouring countries from Natural Earth admin-1** (dissolved by country)
  instead of the admin-0 file: borders then share arcs with the German states exactly, and one
  download less.
- **2026-10-10 Country file format**: columnar JSON, rare values sparse, state as index,
  coordinates with 4 decimals (~10 m, the board scale is ~1 km/mm), minimum population 1000:
  453 KB for Germany (6951 cities). The data version increases only when the content hash
  changes; review report in `docs/data/<cc>-report.md`.
- **2026-10-10 Exact string model with turn costs**: one continuous variable per node and
  neighbour pair (n·C(n−1,2) columns, 29,640 for n = 40) linked to the binary edge variables;
  integral edges force integral pair variables. 3–11 s for optimum + runner-up at n = 40, so it
  verifies final candidates ("string exact"); on a time limit verification falls back to
  "Euclidean exact, string checked locally". Alternative: Euclidean exact plus local string
  check only. Reason: exact is affordable and the local check misses ~5 %.
- **2026-10-10 Two-level evaluation in the search.** Level 1: warm-started ILS + local gap scan.
  Level 2 (only when the local bound reaches the target): exact Euclidean optimum and runner-up
  (deterministic, synchronous), whose string lengths may reveal a better tour or a closer
  alternative, plus the double-bridge scan. The SA acceptance draw is made before level 2:
  level 2 can only lower the gap, so candidates rejected at level 1 skip the exact solve.
  Alternative: level 1 only, verify afterwards. Reason: Section 6.2 (selection bias).
- **2026-10-10 Reusable SEC pool: tried and dropped.** Subtour elimination constraints depend
  only on node indices, so cuts of one subset stay valid for others on the same slots. Measured
  on a search run (n = 40, 80 iterations): pool 0 → 40 s, 50 → 48 s, 300 → 63 s; the larger
  LPs cost more than the saved rounds. The search no longer uses it (`ExactOptions.cuts`
  remains available). Presolve off is kept (≈ 30 % faster solves).
- **2026-10-10 Level 2 only for archive candidates.** The exact Euclidean runner-up matters
  (string bound tight in 96 % with it vs. 84 % with the Euclidean optimum alone, n = 40), but
  it is the expensive part (proving the runner-up with a no-good cut needs much branching when
  the gap is large). Level 2 now runs only for candidates whose level 1 quality could enter
  the archive; the walk may use level 1 values, the archive and the best are always refined.
  Together with capping the gap scan at the saturation point: 3× faster.
- **2026-10-10 Gap scan cap.** The scan stops resolving gaps above the objective's saturation
  point (pruning is weak for large gaps, e.g. 40 mm); the search reports "≥ cap" and the exact
  verification gives the true value.
- **2026-10-10 Difficulty score** = mean excess of best nearest neighbour, greedy edge and hull
  insertion over the optimum, divided by 0.25 (capped at 1). Random German 40-subsets have
  5–20 % excess (median 11 %). Hull insertion alone is nearly optimal (4 % excess).
- **2026-10-10 Gap objective**: hard target (feasibility, penalty growing over the run) and a
  separate saturation point of the gap term (default 1.2 × target). Beyond saturation the
  search optimises difficulty and recognisability.
- **2026-10-10 Double bridge = A D C B.** The often quoted "A C B D" keeps the closing edge and
  is only a 3-opt segment exchange; the true non-sequential 4-opt double bridge is A D C B.
- **2026-10-11 Difficulty score made smooth**: 1 − exp(−combined excess / 0.15) instead of a
  linear score capped at 1. Optimised puzzles reached the cap (all top candidates scored 1.0),
  so the term stopped discriminating. Typical random subsets score ≈ 0.5.
- **2026-10-11 Pinned and excluded cities** are GeoNames ids in the store and the permalink
  (`pin`, `ex`); the search gets them as pool indices. Excluded cities stay in the pool with
  proposal weight 0, so pool indices (and the results on display) stay valid. A greedy
  placement (pinned first, then by population) checks before a run whether n cities fit at
  the minimum distance and whether pins conflict.
- **2026-10-11 Roadmap source**: `docs/roadmap.md` does not exist (neither in the repository nor
  on `origin`), so work follows the roadmap in `CLAUDE.md`. "Point 0" = re-establish the
  baseline on a fresh checkout (`npm ci`, `npm run check`: green), then Phase 2.
- **2026-10-11 Board text as outlines from an embedded font**: Fira Sans Condensed Medium (OFL),
  glyph outlines and metrics extracted at build time (`npm run font:build`, opentype.js as dev
  dependency) into a generated core module (56 KB). The core measures labels exactly (needed
  for label placement during the search) and writes text as paths, which laser software
  (Glowforge, LightBurn) and the PDF writer need. Alternatives: SVG `<text>` (fonts differ per
  machine, many laser tools ignore text), Hershey stroke fonts (no ß/umlauts), opentype.js at
  runtime (170 KB, async). Condensed, because label space limits n. No kerning (the subset
  carries none).
- **2026-10-11 Label placement as a feasibility constraint**: 8-position model (E, NE, SE, W, NW,
  SW, N, S in this order of preference) around a keep-out circle of nail radius + 2.5 mm; labels
  must not overlap each other (1.5 mm spacing), nails, obstacles or the board edge (5 mm).
  Exact backtracking with forward checking and smallest-domain-first, node limit 2000 in the
  search (200,000 for display/export, same first solution), then a greedy pass towards
  preferred positions. In the search, unplaced labels make a candidate infeasible and are
  penalised like a gap shortfall (min(1, unplaced/2) × penalty). Alternatives: greedy only (no
  feasibility proof), MIP (overkill: n ≤ 60, 8 positions), sliding labels (later, if needed).
  Measured (`docs/experiments/label-survey-2026-10-11.md`): on 600 × 800 mm with 8–10 mm
  labels random subsets almost always fit, so the constraint costs nothing there (identical
  search trajectory, +1 % time); on 400 × 533 mm or with 12–14 mm labels it binds strongly.
  Labels are drawn as outlines in the app too, so the screen shows exactly the checked boxes.
- **2026-10-11 Self-check: start nail, loose loop and measuring scale.** The string is tied to
  the start nail s with a loose loop (no wrap when leaving), runs the tour, comes back to s,
  wraps around it and lies along a scale engraved from s in the direction u of the optimum's
  outward bisector at s. Measured length M = L + r·Σ_{j≠s} θ_j + r·φ(last city) with φ the
  angle between the arrival direction and u; u makes both directions of the optimum end at
  the same mark. The board certifies min over directions of M, so the measured gap is
  computed exactly with the turn-cost MIP after replacing the turn costs at s by
  r·min(φ(i), φ(k)) (`Instance.withTurnCosts`), and bounded cheaply over all neighbour pairs
  at s to rank start nails. The builder calibrates the string by winding the optimum and
  marking the end at the target, so model errors common to all tours cancel. Alternatives:
  absolute string length cut to measure (tolerances ≫ gap), a mark on the string at the start
  nail (same start-nail effect, no reading of "how far off"), measuring the closed loop (needs
  a knot-free closing). Reason: the start-nail effect is up to 1.5·r·(π − θ_s), several mm, the
  size of the gap itself. Measured (`docs/experiments/start-nail-survey-2026-10-11.md`, n = 40):
  with the chosen start nail the measured gap is 95–112 % of the string gap; 32–37 of 40 nails
  have room for the scale; plan incl. MIP 1–10 s.
- **2026-10-11 Map line work from topojson meshes**, each segment once across all layers
  (region outline, country outline, inner borders, neighbours): a laser engraves doubled lines
  twice. Lines are clipped to the board and interrupted under text, the scale and nails.
- **2026-10-11 Own minimal PDF writer** (pages, form XObjects, paths, clipping, Flate via
  fflate, now a runtime dependency) instead of jsPDF/pdf-lib: text is already outlines, so
  only vector paths are needed; ~250 lines, no font handling, runs in the core (worker, Node).
  The print template tiles the board at 1:1 over A4 or A3 (portrait or landscape, whichever
  needs fewer pages; 10 mm overlap with dashed cut lines, a 50 mm check bar per page) after an
  overview page with instructions; the solution sheet (one A4 page) shows the tour, the order
  of cities, lengths, the measured gap and the calibration steps.
- **2026-10-12 Play mode in the browser.** A play link (`m=play`) carries only the cities and
  what shapes the board (region, board, nails, string, labels), no search settings and, like
  every link, no tour; the app computes the optimum in the exact worker. Players click nails in
  order (a visited nail cuts the trip back to it, the start nail closes a complete trip); the
  trip is judged by string length S against the exact string optimum and the excess is shown
  in mm of string, as the board's scale would. Alternatives: drag-and-drop editing (2-opt
  moves), judging by Euclidean length. Reason: click-to-extend works on touch screens and
  matches winding the string; S is what the board measures.
- **2026-10-12 Opt-in play data, off by default.** A game record (schema 1: app and data
  version, puzzle hash of the sorted city ids, region, n, r_eff, attempts with time and
  excess, time to solve, whether the solution was shown, difficulty score) is POSTed once per
  game only if the build sets `VITE_PLAY_DATA_URL` and the player ticks the consent box
  (stored in localStorage). No ids, names, cookies or location. The endpoint (Phase 4) is not
  part of this repository yet. Reason: calibrating difficulty needs real data, but privacy by
  default; a static build without the variable never sends anything.
- **2026-10-12 Deployment prepared, not performed.** No access to the chair server from here,
  and publishing (e.g. GitHub Pages of the private repository) is the maintainers' decision.
  Instead: CI uploads the built site as an artifact, `docs/deployment.md` lists server
  requirements (MIME types, HTTPS, caching, CSP), a shipped `.htaccess` covers Apache, and the
  production build was tested from a nested sub-path (search, exact check in the worker).
  A dependency-free reference endpoint for play data (`server/play-data.mjs`, Node) validates
  records strictly and stores them with the day only; alternatives (PHP script, hosted form
  services) depend on the server and were not built.
- **2026-10-12 Incremental puzzle: exact sequence search with a measuring track.** Held–Karp
  keeping the two best values per state (n ≤ 16) gives the two shortest Hamiltonian paths
  between all pairs of the points so far; every raster position (5 mm) for the next point is
  evaluated in O(k²) (the thesis' weighted detour diagram without Vorosketch). Candidates
  pass Euclidean proxies (gap ≥ 1.2 δ, growth ≥ 1.2 ε, no "inserted only" optimum, minimum
  distance, clearance from earlier optimal tours and the string's first leg), are ranked by
  their weakest slack, and the best few are checked exactly with the turn-cost MIP; a step
  without candidates is a dead end and the depth-first search backtracks, with restarts from
  a new triangle. Alternatives: greedy look-ahead (thesis; dead ends unpenalised), Euclidean
  only. Measured (`docs/experiments/incremental-survey-2026-10-12.md`, 400 × 400 mm): N = 16
  with δ = 10 mm in ~7 s, δ = 15 mm only sometimes within 400 checks.
- **2026-10-12 Incremental board: one track for all instances.** The lengths of the instances
  differ by up to ~1 m, so a straight scale does not fit: the string, back at nail 1, runs to
  the nearest corner peg and clockwise along the board edge around the corner pegs; mark k
  sits where the string end lies for the optimum of {1..k} (calibrated with the full instance
  in the listed direction). The end wrap at nail 1 differs between the two directions of an
  optimum (the track direction is fixed), so each mark is a field covering both, and the
  required gap is measured from the far end of the field. The change rule ("not only
  inserted") starts at k = 5: every four-point tour is the triangle with one point inserted.
  Later points keep 4 mm clear of earlier optimal tours, since their nails stand on the board
  while earlier instances are played.
- **2026-10-12 Housekeeping of these notes (roadmap 5.0).** Section 3.1 no longer calls the gap
  the bottleneck (answered by Sections 6.3 and 6.4); Section 5 describes the implemented
  algorithms (no-good cut with n − 2, string-length bound with 3-opt and double bridges);
  Section 10 drops the question whether the string self-check can work (answered by the
  measured gaps and the start-nail and scale design). The original statements are in the git
  history (first version: commit 3e07a9c).
- **2026-10-12 Puzzle files (schema 1, roadmap 5.1).** One self-contained JSON document per
  puzzle (`src/core/puzzle-file.ts`): title, description, purpose, kind, data and app version,
  and either the map part (parameters, places, optional place list for 5.2, constraints) or the
  incremental part (parameters, points). Places carry name and coordinates besides the GeoNames
  id, so files stay readable across data versions. Results (optimum, gaps, start nail) are
  informational; the app recomputes them on opening, since stored solver output could be stale
  or edited. Library: localStorage (`tsp-boards.library.v1`) with an in-memory fallback and a
  notice when the browser keeps nothing; IndexedDB is not needed at a few KB per puzzle. The
  curated collection (`public/puzzles/`, index + files) is built by `cli/collection.ts`, which
  verifies exactly and stores the results. Titles travel in all link types (`t=`) and replace
  the region name on the board and the sheets.
- **2026-10-12 Place lists (roadmap 5.2).** Lines are town names or CSV rows "name, lat, lon,
  label" (semicolons or tabs allow decimal commas). Names are matched against all towns of the
  country data: exact (also transliterated "Muenchen" and English names), then word prefix
  ("Frankfurt"), then edit distance 1–2 (always offered as a choice); ambiguous matches default
  to the largest town and can be changed per line. Places of the same town or within 2 km merge
  into one node labelled with all names (unless a label is given). Two modes: `fixed` (the list
  is the puzzle: no search, exact analysis with warnings for close pairs, places off the board
  and gaps below the board target, plus "which removal helps most": local gap bound for every
  removal, exact solve for the best three) and `pool` (the search chooses from the list). The
  list replaces the board pool (custom places get negative ids, population 1); links carry it
  deflated and base64url-encoded (`pl`, selection as list indices `sx`), files as `map.list`.
  Alternatives: geocoding service (needs a server, privacy), Euclidean-only matching by
  coordinates. Reason: works offline with the shipped data; custom rows cover the rest.
- **2026-10-12 Gallery, games and highscores (roadmap 5.3).** The app starts on a gallery of
  the curated collection and the local library (status: not played, in progress, solved or
  tried, with the personal best); links still open the designer or play mode directly. Games
  are kept per puzzle id (document id, or a hash of the places) in localStorage (50 most recent,
  wall-clock start so a resumed game keeps its time), so switching puzzles keeps progress.
  Highscores are local (name field, top 20 per puzzle): one entry per game, made when the
  optimum is found or when the solution is shown (then with the best excess and a flag that
  ranks it after all others); ranking by excess (µm of string, or ppm of length for digital
  puzzles, 5.4), then time. Play records move to schema 2: board points, the best order (the
  reference endpoint recomputes the length), the measure and a nickname only with a second,
  separate consent. Incremental play: one board, instances 1–3, 1–4, …; an optimal round trip
  advances to the next nail, a shown solution lets the player move on and marks the game.

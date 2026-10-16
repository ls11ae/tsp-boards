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
- **2026-10-12 Curated excellence instances.** Lists researched from the primary sources (DFG,
  Wissenschaftsrat; `docs/data/curated/`): Universities of Excellence and alliances from 2027
  (15 funding cases, 17 cities), the 2019–2026 list (11 cases, 10 cities) and the 70 Clusters of
  Excellence 2026–2032 (37 cities); one node per city as wanted, towns from the country data.
  Built as fixed instances with exact results; the collection CLI chooses the purpose: board
  only if string gap and gap at the scale reach the target and no nails are closer than 12 mm.
  The 2027 list (gap 0.37 mm) and the clusters (2.1 mm) become digital puzzles, the 2019 list
  (15.5 mm) a board.
- **2026-10-12 Digital puzzles (roadmap 5.4).** Purpose `digital` judges Euclidean length: r_eff
  is 0 for verification (Euclidean exact, fast), judging and search; the gap requirement is a
  unique optimum with 0.05 mm on the board (about 50 m on the default Germany board), the gap
  term saturates at 0.5 mm, and switching the purpose suggests weights 0.3/1/0.5 (difficulty
  first) unless the user changed them. Play mode shows lengths in km and the excess in % and
  km; highscores use ppm of the length. Board planning is off for digital puzzles (the stored
  optimum is Euclidean): switching to `board` re-verifies with the string model. Incremental
  puzzles stay boards. Alternatives: a relative gap target (e.g. 0.1 % of the length), judging
  digital puzzles by S too. Reason: without nails the string is irrelevant, and any unique
  optimum is a fair puzzle on screen.
- **2026-10-12 Overlays and thesis metrics (roadmap 5.5).** One comparison tour at a time
  ("compare with": runner-up, nearest neighbour from its best start, greedy edge, hull
  insertion), drawn dashed over the board; its own edges are solid, the optimal edges it leaves
  out are marked, and the panel gives the number of differing edges and the excess (mm and %,
  or % and km for digital puzzles). The runner-up comes from the exact check; heuristic tours
  are computed in the UI on the puzzle's instance (cheap at n ≤ 120). Players see the choice
  only after solving or revealing. Metrics C and D are shown for the best known tour, and two
  optional weights (default 0) add them to the objective; links carry them as weights 4 and 5
  of `w` only when non-zero, so old links stay valid. Alternatives: several overlays at once
  (cluttered), heuristic tours from the search worker (would tie them to a run).
- **2026-10-12 Regions (roadmap 5.6).** A region is the country, a state or a union of states
  with the id `DE-BB+BE` (state codes sorted, joined by `+`): pool = towns of the states,
  outline = the dissolved state polygons (topojson `merge`), board outline = its outer
  boundary. Named unions live in `src/core/region.ts`: the city-states with their surrounding
  state (Berlin and Brandenburg, Bremen and Lower Saxony, Hamburg and Schleswig-Holstein),
  Rhineland-Palatinate and Saarland, and Northern, Eastern, Central and Southern Germany. A
  region is offered only if 10 places fit greedily at the minimum distance on the default
  board (85 ms for all regions, memoised); this drops Berlin, Hamburg and Bremen alone, while
  links with such a region still open. Brandenburg, Lower Saxony and Schleswig-Holstein stay
  available on their own. Changing the pool (region, population threshold) now drops search
  results and moves the puzzle on display to the new pool by its GeoNames ids when all its
  places are there (before, it kept stale pool indices and could crash the board).
  Alternatives: unions in the data build (would need a data version bump for each new union),
  a free choice of states (possible with the same ids; a UI for it is left for later).
- **2026-10-12 Group constraints per state (roadmap 5.6).** Constraints `{group, min, max}`
  (max `null` = none; `'*'` = every state of the region, a state id overrides it) become pool
  groups for the search. They are hard constraints: the greedy start fills each group's
  minimum first (smallest groups first) and then skips full groups; swaps keep the bounds
  (a full group only swaps within itself), and ejections repair them (if the new city's group
  is full, one of its members leaves too; the refill serves groups below their minimum first)
  or are rejected. Without groups the moves draw the same random numbers as before, so old
  seeds reproduce. Before a run the UI checks, in this order: states whose pool is smaller
  than the minimum, the size range (Σ min ≤ n ≤ Σ max), pinned conflicts, pins above a
  maximum, labels of the pinned cities, and the greedy start. The UI offers one constraint for
  every state (at least / at most, "every state", "exactly one per state" which sets n);
  links carry `gr=*:1:1`, files `constraints.groups`, the CLI `--groups`. Germany with exactly
  one place per state: exact string gap 44 mm after 400 iterations (2 s). Alternatives: soft
  penalties (the walk could leave the feasible set and the archive would need filtering),
  per-state limits in the UI (kept to files and links for now).
- **2026-10-12 Teaching mode (Phase 6).** A designer panel shows one strategy at a time on the
  puzzle on display, as frames (edges so far, the newest emphasised, a caption with place
  names): nearest neighbour from a chosen start (default: the largest place), convex hull +
  cheapest insertion, greedy edge, 2-opt (best exchange each step, from the nearest-neighbour
  tour; two frames per exchange) and the exact solver's rounds (Euclidean DFJ model: the
  MIP solution of each round with its subtours, until one tour; computed in the exact worker
  via a round callback of `ExactTsp.solve`). All strategies use distances between nail
  centres, like the difficulty probes. Frames are plain data in `src/core/teaching.ts`, so a
  later classroom view or export can reuse them. Alternatives: animating inside the search
  worker (would tie teaching to a run), the string model for the rounds (its extra turn
  variables make the pictures harder to read).
- **2026-10-12 Robustness check (Phase 6).** For a planned board the export panel checks r_eff
  0.5 mm below and above the planned value (e.g. 1.0 / 1.5 / 2.0 mm), each exactly: string
  optimum and runner-up (is the optimum still the board's tour? the gap), and the measured
  optimum and gap at the scale for the planned start nail and direction. One exact worker of
  its own, rows arrive one by one (about a minute at n = 40; 0.5 s at n = 10). First results:
  the Germany board (n = 40) keeps its optimum, gap 9.0 / 10.1 / 11.2 mm, at the scale
  9.5 / 10.9 / 12.3 mm; the gap grows with r_eff here. Alternatives: a finer grid of r_eff
  (cost grows linearly), the local check instead of the exact one (fast, but it is the
  exactness that makes the statement useful for building).
- **2026-10-12 Classroom worksheet (Phase 6).** A two-page PDF in the board language: the task
  (title, instruction, name and date line) with the map scaled to fit A4 or A3 (orientation by
  the better fit), places as dots with the board labels (placed again without the scale, map
  lines interrupted around them) and a kilometre scale bar (1/2/5 × 10^k km, at least 25 mm);
  and the solution page with the Euclidean optimum in red, its length in km and how much
  longer the runner-up is, plus the order when there is room. Pencil on paper measures
  straight lines, so the solution is the exact Euclidean optimum from the verification, not
  the string optimum. Available after the exact check, for digital puzzles too.
  Alternatives: reusing the laser drawing (it carries the scale and the nail holes, which
  make no sense on paper).
- **2026-10-12 Free-form instances (Phase 6).** Points placed by hand are custom places of a
  fixed place list: a click on the board adds a line `n; lat; lon` (the board point inverted
  through the region's projection, named by the next number), a click on a point removes its
  line; the list text stays editable. So verification, play, board export, worksheet,
  teaching, links and files work unchanged. A new board option `blankBoard` (link `bl=1`)
  hides the map lines in the app and in all exports. Points live in geographic coordinates,
  so a changed board size scales the pattern with the region fit. Fix found on the way:
  checks are keyed by pool indices, and two pools (two lists of the same size, or a list
  edit) gave stale results for the same key; a signature of the pool (ids and coordinates)
  now resets checks, plans, robustness and teaching whenever the pool changes.
  Alternatives: a puzzle type of its own with points in board mm (cleaner data, but every
  feature of map puzzles would need a second implementation).
- **2026-10-12 City puzzles (Phase 6).** Districts come from Wikidata (CC0) rather than
  official open data or OSM: one SPARQL query per city gives names and points (Berlin: the
  96 current items of class "Ortsteil von Berlin"; Hamburg: the 104 parts of its seven
  Bezirke), no licence obligations beyond the CC BY of GeoNames we already carry, and
  `cli/wikidata.ts` rebuilds the lists. They are place lists of custom places with the
  city-state as region (not offered in the region list, but valid), and the collection CLI
  now searches a list as pool (`list --pool --n`) with `--merge 0` for close districts.
  Berlin: 20 of 96 Ortsteile, string gap 37.1 mm; Hamburg: 20 of 104 Stadtteile, 10.8 mm; both
  boards. Alternatives: official boundary data (centroids would be better than Wikidata's
  points, but formats and licences differ per city), OSM `place=suburb` nodes (ODbL share-alike).
- **2026-10-12 Themed instances (Phase 6).** `cli/wikidata.ts` also builds town lists: state
  capitals (P36 of the states, plus Berlin and Hamburg), Hanseatic towns (class
  "Hansestadt", 156 items, 136 of them towns of the data) and university towns (74 towns
  with a university by subclass of Q3918 and a German name with "Universität"). Matching goes
  by Wikidata id (only 2007 of 6951 towns carry one), else by name or name prefix within
  15 km; the rest is left out and named in the list header, so the lists stay one place per
  municipality. Puzzles: the 16 capitals as a fixed instance (digital: Mainz and Wiesbaden
  are 10 mm apart on the default board), 25 Hanseatic towns (Lübeck, Stralsund, Wismar
  pinned; the collection CLI got `--pin` for list pools) and 30 university towns, both boards.
  Alternatives: the Wikidata class "Universitätsstadt" (an official title in some states,
  incomplete), membership in the Hanseatic League (P463, only two German members recorded).
- **2026-10-12 More countries (Phase 6).** Austria, Switzerland and the Netherlands from the
  same pipeline. The municipality key is a per-country scheme in `geonames.ts`: Germany admin4
  (AGS), Austria admin3 (but Vienna as one municipality: its admin3 units are the 23
  Gemeindebezirke), Switzerland admin3, the Netherlands admin2; name cleaning per country
  ("Gemeinde …", "Wien Stadt", "Bern/Berne/Berna", "Gemeente …"). Natural Earth: German canton
  names from `name_de` ("Kanton Luzern" → "Luzern"; `name` mixes languages), the Caribbean
  Netherlands left out (they spread the bounding box over the Atlantic). Germany rebuilt from a
  fresh download with the refactored code is byte-identical (data version 1). Result: AT 1673,
  CH 1418, NL 341 places. The app loads country files on demand; a country switch sets data and
  region in one update; links and files of another country load its data first. Regions are
  offered if they hold 10 places with all towns of the data (for Germany the same list as
  before); named unions for Vienna + Lower Austria, the two Basel, the two Appenzell, and the
  NUTS 1 / Swiss major regions. Alternatives: a municipality key from the official registers
  (better, but another source per country), keeping a single country per deployment.
- **2026-10-12 mapshaper 0.7.83.** Upgraded (exact pin) to clear the advisories in adm-zip
  (≤ 0.6.0) and the nested fflate 0.8.2 that came only through this dev dependency of the data
  build; `npm audit` reports none. The release was two days old (same publisher and
  repository; new dependencies: the two fixes, minor bumps, `@resvg/resvg-wasm`), upgraded at
  the maintainers' request instead of waiting two weeks. All four country files rebuild with
  identical content hashes. Alternative: npm `overrides` for adm-zip/fflate under 0.7.67
  (outside mapshaper's declared range).
- **2026-10-13 Composite places (roadmap 7.1).** A place may have `members` (towns by id or
  points with coordinates): one node whose board point is the mean of the members' projected
  points (`boardPoints`), stored with the geographic mean as its position; population is the
  members' sum, the state the first member town's. Input: list lines
  `Name = A + B (lat, lon)[; label]` (members matched like single lines, each with its own
  choice), and in the designer "combine places" (click places, name, combine; without a list the
  puzzle on display becomes a fixed list first). Links carry composites as
  `[name, [members], label?]`, files as `members`; composites never merge by distance; lists,
  tooltips, the solution sheet and the worksheet name the members. Curated: the 2027 list with
  Rhein-Main-Universitäten and Ruhr Innovation Lab as composites raises the string gap from
  0.37 to 3.24 mm (14 places; still below the 5 mm board target, so digital), the 2019–2026
  puzzle is removed, and a cluster variant combines close sites that share clusters
  (Bochum/Dortmund, Bonn/Köln, Gießen/Marburg) and Rhein-Main: no nails closer than 25 mm, but
  a gap of 1.14 mm (digital). Alternatives: the geographic mean as the board point (it is off
  the line between the members after projection), merging by distance only (loses the names).
- **2026-10-13 Gallery layout (roadmap 7.2).** The gallery had no styles of its own and sat in
  the designer's three-column grid (first column). It now has a one-column page and a card grid
  (`auto-fill, minmax(260px, 1fr)`: five cards at 1440 px, one on a phone). Each card shows a
  thumbnail of its board without the tour (region outline and places, drawn from the puzzle
  file with the same projection, memoised; country data loaded on demand), region names
  instead of codes, and filters for type, region, purpose and status (solved without help or
  not). Alternatives: pre-rendered thumbnails in the collection index (stale after data or
  projection changes, and none for own puzzles).
- **2026-10-13 Play view (roadmap 7.3).** Play mode has its own board (`PlayBoard`): places,
  labels and lines are drawn at a fixed screen size (7 px markers, 13 px labels, 24 px hit
  radius) by converting through the current pixels per board millimetre; the view starts at
  the places' bounding box and fills the stage (flex to the window height on desktop, 64 vh on
  phones); zoom by buttons, wheel and pinch, pan by dragging (a tap is a click only below 6 px of
  movement). Labels are placed with the board's solver at screen size inside the starting view
  and recomputed in 8 % zoom steps; labels without room are hidden with a hint to zoom in.
  Texts follow the purpose (places and km for digital puzzles), the solution is solid in the
  tour colour and the player's round trip dashed in a second colour with a legend, highscores
  are a table, and a "next place" list allows keyboard play. The designer keeps the board in
  millimetres (it previews the physical board). Alternatives: one component with a scale
  switch (the designer must stay true to scale), HTML labels over the SVG (no collision check).
- **2026-10-13 Designer groups (roadmap 7.4).** The parameter column is split into collapsible
  groups (`<details>`): puzzle, places, board and search; inside the search group an
  "advanced" group (weights including the thesis terms, seed, iterations) is closed by
  default. The open state is remembered per browser (localStorage, a convenience only); the
  search, link and play buttons stay visible below the groups. Alternatives: tabs (hide the
  board while editing places, which the designer needs side by side).
- **2026-10-13 Curated content (roadmap 7.5).** "Deutschland: 40 Städte" is rebuilt with towns of
  at least 50,000 inhabitants and weights 1/0.5/3 (well-known cities): 40 well-known cities,
  string gap 17.6 mm (was 10.1 mm with Gangkofen, Treuenbrietzen, …); the collection CLI search
  got `--weights` and `--min-pop`. The fixed-instance analysis now rates removals and
  combinations of two places (all pairs below the minimum distance and the eight shortest
  pairs; a combination is the midpoint, as a composite place) with the string model for a board
  variant, also for digital puzzles, shows which reach the target with no close pairs, and
  applies one with a click; `cli/variants.ts` runs it for curated files. Board variants:
  Landeshauptstädte with Mainz/Wiesbaden combined (18.6 mm, 15 places) and the 2027 list with
  Bonn/Köln combined (10.15 mm, 13 places). The clusters stay digital: no single change reaches
  5 mm (best 4.35 mm). Alternatives: searching pairs of changes (quadratic in the instance size,
  and the single changes already show the way), lowering the target for these lists.
- **2026-10-13 Bundle and version (roadmap 7.6).** The board downloads (SVG, print template,
  solution sheet, worksheet; also for the incremental puzzle) and the teaching mode load on
  demand (`import()` and `React.lazy`); the plan and the preview, which the designer always
  needs, moved to `ui/plans.ts`. The initial JavaScript is now 366 + 138 KB (no chunk above
  500 KB, was one chunk of 531 KB); most of it is React DOM (~190 KB), fflate (links), the board
  font's outlines and the app itself, so further splitting would gain little. The empty
  `__vite-browser-external` chunks came from HiGHS importing `node:module` in its Node branch;
  the browser build aliases it to a stub (tests and the CLI keep the real module). Version
  0.9.0 (footer "0.9.0+commit"); 1.0.0 is meant for the first public deployment. Fixed on the
  way: the file name hash could become negative ("…-13--6e1d4.pdf").
- **2026-10-13 Europe (roadmap 8.1).** A data file `eu.json` in the country format whose
  "states" are 47 countries (`EU-DE`, …), so search, string model, board export and the app
  work unchanged. Towns: GeoNames' global cities15000 list, populated places (no sections,
  historical or abandoned places) with at least 50,000 inhabitants inside the extent 25° W–45° E,
  34–71.5° N (no Canaries, Madeira, Azores, Svalbard; Russia cut at 45° E); Turkey only with
  East Thrace and Istanbul (admin-1 units and a point-in-polygon test). Districts that GeoNames
  codes as towns are dropped within max(5 km, 3 km · √(population/100,000)) of a larger town
  (Istanbul ~37 km, Berlin ~17 km): 1453 towns. German and English names (Moskau / Moscow,
  Neapel, Genf, Kyjiw) and Wikidata ids from the countries' GeoNames alternate names; a first
  attempt via Wikidata's GeoNames id (P1566) linked many cities to wrong items ("Thomson
  Reuters (Switzerland)" for Geneva, historic "Christiania" for Oslo) and was dropped. Borders:
  Natural Earth admin-1 dissolved per country and clipped (258 KB file, 2 km simplification);
  country names from ICU (`Intl.DisplayNames`). Regions are offered by the usual capacity test
  (35 of 59: small countries such as Austria have too few towns of 50,000; their own country
  files remain); named groups: DACH, Benelux, British Isles, Iberian Peninsula, Scandinavia,
  Nordic countries, Baltic states, Central Europe, Western Balkans, Mediterranean EU, EU-27.
  Curated: 40 European capitals (digital, 0.72 mm) and "Europa: 30 Städte" on an 800 × 600 mm
  landscape board (8.87 mm). Alternatives: merging the country files (different municipality
  rules per country), one global alternate-names file (190 MB).
- **2026-10-13 World (roadmap 8.2).** A data file `wo.json` (1964 towns, 200 KB) marked as
  metric `sphere`: towns of GeoNames' cities15000 with at least 250,000 inhabitants; "states"
  are the six continents (GeoNames' continent of the country; Russia's Urals, Siberian and Far
  Eastern federal districts count as Asia, Turkey's East Thrace and Istanbul as Europe, as in
  the Europe file), borders from Natural Earth admin-1 dissolved per continent (25 km
  simplification, islands below 300 km² dropped; Antarctica as context). City districts are
  merged within a country only (Brazzaville stays beside Kinshasa) and the capital, else the
  more prominent town (population × (1 + alternate names / 20)) stands for its cluster with the
  cluster's largest population: Manila over Quezon City, Guadalajara over Zapopan, New York City
  over its boroughs, New Delhi with Delhi's 11 million. The same rule now builds Europe (data
  version 2: e.g. Hamilton instead of "Meikle Earnock", Giurgiu kept beside Ruse); population
  order alone kept districts (Zapopan, Quezon City), state capitals first kept Ikeja over Lagos.
  Overrides: Peking (GeoNames prefers "Beijing" in German), Abu Dhabi, and Wuzhong left out
  (GeoNames: 7.2 million inhabitants, really about 1.4 million). Distances: the `Instance`
  takes each point's longitude and latitude and measures great-circle kilometres times the
  map's scale (mm/km at the centre), so all lengths stay in board units, integer µm, and the
  app's km display for digital puzzles is exact on the sphere; r_eff is 0 (no string on a
  sphere). The search pool, the verification and the teaching rounds carry the positions; exact
  solver and heuristics use only the distance matrix. Planar parts: the minimum distance and
  the labels stay on the map (legibility); insertion starts from the two places farthest apart
  instead of the convex hull; the convex-hull thesis metrics are hidden; board, robustness,
  worksheet (a km scale is wrong on Equal Earth) and board variants are not offered, and world
  puzzles are always digital (also when a file says otherwise). Map: Equal Earth, for the whole
  world fitted to the full sphere (its edge drawn) so legs near the poles stay on the map;
  regions are centred on their meridian (also across the antimeridian). Legs are great-circle
  arcs from d3-geo, cut at the map's edge; the play view starts with the whole map and, on
  phones, takes the map's aspect ratio. Teaching point: the exact worker also solves the
  flat-map instance (Euclidean on the map points) and the overlay "shortest tour on the flat
  map" shows it with its excess on the sphere (Welt: 30 Metropolen: 638 km longer). Search: 400
  iterations at n = 30 over 502 cities of a million take about 20 s in Node; the exact check
  about 3 s. Curated: Olympic host cities (23, gap 88 km) and 30 world cities (gap 123 km).
  Alternatives: a rotatable orthographic globe (needs hit-testing and labels on a rotating
  view; the map already shows arcs, poles and the wrap at the edge), distances in integer
  metres (would need a second unit in the UI), one global alternate-names file (205 MB).
- **2026-10-16 Excellence Strategy board (roadmap 9.1).** The first wooden board: the 25-place
  list on 300 × 600 mm (margin 15, labels 5 mm, minimum distance 10 mm, 2 mm nails, 1 mm
  string until Kevin measures his): string gap 5.71 mm, also at the scale; robust for r_eff
  1.0–2.0 mm (same optimum, 5.47–5.95 mm, also at the scale). Marked places: a leading `*` in
  place lists (`Place.highlight`, links carry the marked indices as a third element), drawn as an
  engraved ring at the label clearance radius (outer 3.5, inner 2.7 mm for 2 mm nails) and as a
  ring in the app; alternatives were a bold label (one font only) or a second nail. Board
  extras in puzzle files (`map.board`: legend lines with a symbol, preferred start nail; CLI
  `--board-extras file.json`): the legend sits in a box at the bottom, reserved in the plan like
  the title (no scale, labels or map lines inside; the footer becomes its last line, centred),
  without a frame, as in Kevin's mock-up. The preferred start nail is tried first, and only for
  it the scale may turn away from the outward bisector (±15° steps up to ±90°, keeping 30° from
  both tour edges at the nail); the two directions of the optimum then end at marks r_eff·|φ(a) −
  φ(b)| apart, so the certificate subtracts that spread and the solution sheet calibrates with
  the longer direction (the other one ends beyond 0). For the Ruhr Innovation Lab the bisector is
  blocked by Siegen, Marburg and Gießen and the best turned scale reads 4.92 mm (< 5 mm), so the
  rule falls back to the planner: Hannover, 5.71 mm. Logos come only from local SVG files
  (`local/`, git-ignored; never in puzzle files, links or the library): filled paths with their
  group transforms, arcs as Béziers, white shapes skipped (potrace output works directly); next
  to a nail the logo replaces the label at the largest of 30/26/22/20 mm width that the label
  placement allows (40 mm dominated the Ruhr area), in the legend up to 110 × 75 mm; the app's
  export panel loads the same files for the session. Map lines along the bounding box of a layer
  (clip edges of the data build, e.g. through Sweden on a tall board or Europe's 45° E cut) are
  no longer drawn. Exports: from a puzzle file (`cli/export-board.ts --puzzle`, with composite
  places and the extras), a copy turned by 90° for the P2S bed (600 × 305 mm), a strip of test
  holes 0.6 mm below to the nail diameter and `--hole` for a press fit, and a report with
  robustness, tour and runner-up. Lists say "Orte" in the subtitle. The collection index is
  ordered by theme, Excellence first.
- **2026-10-16 Open-day fixes (roadmap 9.2).** Every view change scrolls to the top (the
  board's position differs too much between views to keep the scroll position). The clock stops
  when the solution is shown (`revealedMs`, older stored games default to null), and a solved
  puzzle no longer offers "Lösung zeigen". Play titles say "Orte" for place lists (alliances and
  points are no towns) and keep "Städte" for the region's towns; counts of one use the singular;
  the teaching hint names straight-line distances for digital puzzles; scores always carry their
  unit ("0 mm", "+0,12 %"); the header tagline drops nails and string while a digital puzzle is
  played. The overlay select has an explicit id and label; a favicon (nails and a string).
- **2026-10-16 Rotatable globe (roadmap 9.3).** World puzzles open on an orthographic globe
  (d3-geo, clipped at the horizon), in play mode and in the designer, with a switch to the
  Equal Earth map. Dragging turns the globe with versors (the grabbed point stays under the
  pointer; no gimbal lock at the poles); buttons, the wheel and two fingers zoom (1–12×); only
  places on the visible side are hit (angular distance < 90° from the view centre); labels are
  placed greedily at screen size for every view (right, left, above, below; bigger places
  first; inside the view). The globe is drawn in screen pixels, not board millimetres: it has
  no board, and land, routes and labels stay sharp at any zoom. "Rundreise abfliegen" (after
  solving or showing the solution) and "Meine Rundreise abfliegen" (a closed own round trip)
  move a marker along each leg's great circle (`geoInterpolate`, 4000 km/s, at least 0.5 s per
  leg) and keep it in the centre of the globe. The flat-map comparison is drawn with straight
  lines on the Equal Earth map, as it is measured there (on the globe its legs stay great
  circles). District merging: the less prominent town stays separate if it is the seat of a
  first-order division with a million inhabitants more than 15 km away, so Yokohama, Saitama,
  Incheon and Biên Hòa are back (world data version 2; Europe unchanged). Curated: "In 80 Tagen
  um die Welt" (Fogg's stations; his route is the optimum, 517 km ahead of the runner-up) and
  "Einmal um die Welt" (20 northern cities; the optimum winds once around the globe).
  Alternatives: a canvas renderer (faster, but SVG keeps clicks, titles and styling simple at
  these sizes), d3-zoom/d3-drag (a dependency for a few lines of pointer handling).
- **2026-10-16 Event mode (roadmap 9.4).** `#kiosk` opens a booth version of the app: a start
  screen with three curated levels (easy: the two Universities of Excellence puzzles and Jules
  Verne; medium: the Excellence board, once around the world, Berlin, Olympia; hard: all 34
  Excellence places, Germany 40, world 30, Europe 30), cards of at least 84 px height and
  buttons of 52 px, full screen by a button, no designer, gallery or links out, "Nächste Person"
  (new game, empty name) and a return to the start after two minutes without input. The play
  screen reuses the normal play view and panel (also the globe) with a kiosk variant of the
  panel: the name field at the top and today's leaderboard instead of the all-time one.
  `#kiosk/scores` shows today's top five of every kiosk puzzle large, for a second screen in
  another tab or window (rereads local storage on `storage` events and every 10 s). Scores stay
  on the device: up to 200 per puzzle are kept (was 20), so a busy day is not crowded out by
  older results; "today" is the ISO date of the result. Alternatives: a separate kiosk build
  (one build is simpler to run), a server for the leaderboard (the booth must work offline).
- **2026-10-16 Board build variant (roadmap 9.5, Kevin's decision).** The Excellence board is
  engraved on 12 mm birch plywood cut to size by the store, and the nail holes are drilled by
  hand: a CO2 laser cannot cut clean 1.2–1.6 mm holes through 12 mm. New hole mode `pit`: a
  filled 1 mm dot at each nail on a layer of its own (magenta, "engrave deeper"), in which a
  1.2 mm drill centres itself (crosses are hard to hit). The board outline moved from the red
  cut layer to a layer of its own (orange `edge`) and can be left out (`--no-edge`, the app's
  "Brettkante schneiden"). A board's export defaults live in its puzzle file
  (`map.board.export`; this board: pits, no outline), used by the CLI and the app's export
  panel; options override them. Nails 1.6 × 20 mm with flat heads and 1 mm string until
  measured: string gap 5.61 mm, also at the scale, start nail Hannover; robust for r_eff
  1.0–2.0 mm (5.47–5.95 mm). The test-hole strip is written only for laser-cut holes. The file
  stays 300 × 600 mm and is centred on the 1–2 mm narrower pieces with the P2S camera; the
  build note describes tape, lasering, drilling 9 mm deep, nails 11 mm high with a gauge,
  oiling, a test piece first, and the 6 mm laser-cut variant as alternative.
- **2026-10-16 Event mode follow-ups (roadmap 9.5).** Every visitor appears on today's
  leaderboard: "Nächste Person", "Zur Auswahl" and the inactivity reset record the best closed
  round trip of an unfinished game (not revealed, at most once per game); an optimum shows as
  "optimal" instead of "0 mm" / "0 %", and the column reads "über Optimum". Board puzzles stay
  judged in millimetres of string in the kiosk, with a note under the name field ("Wie am
  Holzbrett: Gemessen wird der Faden, der sich um die Nägel legt."): the booth stands next to
  the wooden board, and the same measure on screen and on the board is the point of the
  exhibit; a switch to percent of length would hide that. Each kiosk game starts afresh (the
  stored game of the previous visitor is not resumed). `#kiosk` and `#kiosk/scores` also react
  to `hashchange`. Easy level: "Exzellenzuniversitäten ab 2027" without "(Brett)" was nearly
  the same puzzle and gave way to "Ruhrgebiet: 11 Städte" (the eleven independent cities of the
  Regionalverband Ruhr, digital, string gap 2.57 mm on the NRW map), a local puzzle for
  visitors from the region. The kiosk cards show the gallery's map thumbnails. Alternatives
  for the Ruhr puzzle: Dortmund districts (not in the data: GeoNames drops city districts),
  "Landeshauptstädte (Brett)" (no local touch).
- **2026-10-16 Globe follow-ups (roadmap 9.5).** The globe opens centred on the places: the
  spherical centroid of the place vectors, or, when their mean vector is short (places around
  the globe, e.g. "Einmal um die Welt"), the pole on their side tilted by 30° at their mean
  longitude, so the whole loop is visible. During a flight the player's own tour is hidden (only
  the solution and the flown legs are drawn). World data version 3: German "Sues" → "Suez" by
  override (also in "In 80 Tagen um die Welt"). On narrow screens the globe's zoom buttons sit
  at the bottom so they do not cover the northern places.
- **2026-10-16 No clip edges on the screen (roadmap 9.6).** The data build clips Europe at
  45° E and the neighbouring countries to a box; the app drew those edges as borders (a straight
  diagonal through Russia, also in the gallery thumbnails). The screen now draws, like the board
  export since 9.1, the borders as topojson meshes without the segments along the layer's
  bounding box in longitude and latitude (`withoutBoxEdges`, moved to `core/region.ts`): the
  country or continent outline, the borders between states, the neighbours' borders and coasts,
  and the selected region's outline; the neighbours' areas are filled without a stroke. Only
  their fill still ends at the box, in the corner of the Europe board, where it reads as the
  edge of the map. Alternative: cut Europe along the Ural in the data build (a new boundary
  to source and maintain for one edge that nobody needs to see).
- **2026-10-16 Fame of world cities (roadmap 9.6).** For the world, population says little
  about how well-known a city is (Chongqing 22 million inhabitants, Paris 2 million), so "Welt:
  30 Metropolen" was Asia-heavy. The world file has a new optional column `fame`: the number of
  Wikipedia language editions with an article about the town (Wikidata sitelinks, Paris 366,
  Chongqing 153). The download queries the Wikidata service three ways and keeps the item with
  the most sitelinks: the item GeoNames links (or an override, Hong Kong), the item of a
  Wikipedia article GeoNames links (München, Recife), and items naming the GeoNames id (P1566,
  which often sits on a district: Madrid's id is on an item without any article); 45 of 1966
  towns stay without (fame 1). The search uses `prominence` (population, or e^(fame/50)) for
  proposals and recognisability, which is a log scale between the pool's extremes, so it grows
  linearly with the number of editions (a log scale of fame itself gave Bamako 0.88 next to
  Paris). GeoNames' alternate-name count was tried first and is too noisy (Mogadishu above
  Paris, Cairo far down). Rebuilt "Welt: 30 Metropolen" with the same search settings: Paris
  (London stays out, 8 mm from Paris on the map), Tokyo, Los Angeles, Rome, Madrid, Rio,
  Sydney and Singapore are in; Asia 11, Europe 7, North America 4, Africa 4, South America 2,
  Oceania 2, so no minimum per continent is needed; gap 248 km (0.34 %), the flat-map optimum
  3,164 km longer on the sphere. World data version 4 (the towns are unchanged; the GeoNames
  snapshot of the world build is now 2026-10-16). Alternatives: Wikipedia page views (vary
  with news, need many requests), a rank-based score for all files (would change the searches
  of the country files, where population works).
- **2026-10-16 One comparison at a time, games tied to their places (roadmap 9.6).** With the
  solution shown and a comparison chosen (e.g. the flat-map optimum), the player's own tour is
  no longer drawn, on the map and on the globe: three tours on top of each other are hard to
  read. After solving without the solution shown, the own tour is the optimum and stays. Found
  on the way: a stored game was resumed by puzzle id alone, so after a curated puzzle changed
  (the new "Welt: 30 Metropolen") its old path was laid onto the new places. Games now keep a
  hash of their places (incremental: of their points, in order) and are resumed only when it
  matches; games stored before are resumed as before. Highscores stay per puzzle id.
- **2026-10-16 Incremental play on the screen-size board (roadmap 9.6).** The incremental
  puzzle's play view drew the board in millimetres (4 mm nails, the measuring track, a 12 mm
  click radius, no zoom). It now uses the map's play board approach: the view, zoom (buttons,
  wheel, pinch), panning and taps live in a shared hook (`ui/zoom.ts`, `ZoomControls`), and
  the screen-size label placement is shared too. Nails of the current stage are markers like
  the map's places (start and visited marked), later nails small and faded, all numbers at
  screen size (hidden ones counted, "zoom in"), the solution and the own tour as on the map.
  The view starts with the whole board and a margin of 6 % (the zoom buttons sit over the
  margin, not over a nail in a corner). The measuring track is left to the wooden board and
  the export; the panel shows the string length.
- **2026-10-16 Places kept in board variants (roadmap 9.6).** The board variant suggestions
  of a fixed list were purely geometric ("Aachen + Köln zusammengefasst"). Places pinned in
  the designer (a click on the map, as for searches) are now neither left out nor combined
  (`ChangeOptions.keep`; `cli/variants.ts --keep 'A,B'`); the panel says which places are kept
  or how to keep one. Pinning has no other effect on a fixed list, and pins are already saved
  with the puzzle and in links. Alternative: a new list prefix or a column in the place table
  (more format and UI for the same meaning as a pin).
- **2026-10-16 Lazy gallery thumbnails (roadmap 9.6).** A card's puzzle file and data file
  load when the card comes within 400 px of the screen (IntersectionObserver; without it, at
  once as before), so opening the gallery no longer fetches `eu.json` and `wo.json` (about
  1 MB) for cards further down; `de.json` is loaded by the app anyway. The kiosk's cards use
  the same component.
- **2026-10-16 Posters in DIN formats (roadmap 9.7).** A poster shows the solution: the
  exact shortest round trip by great-circle distance ("Luftlinie", HiGHS on distances in
  metres) with the runner-up, checked against the optimum on the flat map of the puzzle's board
  (the app's measure; the same in all six Excellence variants, the map lengths 1.0–1.5 km
  longer). `core/board/poster-tour.ts` makes the stops (a composite place as one stop at the
  mean of its members' map points, as on boards, or its members as separate stops, grouped by
  a red rounded hull with the alliance's name) and the tour; `core/board/poster.ts` lays out
  one page: title and subtitle, the map projected straight into paper millimetres (land
  filled, borders as on boards, member dots of centred alliances, the tour, dots, rings,
  labels on white halos, scale bar), the facts (length, places, possible round trips as
  "3,1 · 10²³" with a raised exponent, as the font has no superscript digits, the extra km of
  the second-best, the proof sentence), legend and footer. Sizes scale with the short side
  of the page (A1 = 1: title cap height 17 mm, length 22 mm, margin 18 mm, at least 10 mm on
  A4); the facts go below the map or beside it, whichever gives the larger map scale (ties
  within 3 % to the band below). Output as PDF (vector, text as outlines) and SVG; PNG
  previews and the contact sheet in the CLI only, rendered by `@resvg/resvg-js` (a dev
  dependency: native binaries, no effect on the app bundle). Logos as on boards, from local
  files only (`--logo`, `--legend-logo`, `--suffix -logo` into `local/posters/`); a test
  checks that no file under `local/` or named like a logo is tracked. The app's export panel
  has "Plakat (PDF)" with format, orientation and (for composite places) the members mode;
  the tour is computed in an exact worker, the paper constants live apart (`paper.ts`) so
  the panel does not load the export code. The list-file reader moved from
  `cli/collection.ts` to `cli/lib/place-list.ts` (same places for all curated lists). Not
  done: the optional QR code to the play link (off until the app is online, Phase 10) and
  posters of world puzzles (Equal Earth with the antimeridian; boards and posters are
  planar). Alternatives: scaling the board drawing onto the page as the worksheet does (the
  labels would scale with it and the map would not use the page's aspect), a raster
  renderer of our own for the previews (more code than a dev dependency).

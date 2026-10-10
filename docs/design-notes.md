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

1. **The gap to the second-best tour is the bottleneck.** Our benchmark (Section 6): random
   40–60 point instances have gaps of 0.00–0.17 % of the tour length. With ~3 m of string
   (board ~60×80 cm, 40 cities), 0.1 % ≈ 3 mm. In the thesis, S rarely exceeded 0.1, i.e.
   gaps below 0.5 %. -> Make the gap a hard constraint in mm of string; optimize it explicitly;
   consider fewer cities or a complementary verification mechanism.
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

## 5. Algorithms (proposed)

- **Exact TSP:** DFJ, degree constraints, iterative subtour elimination (solve MIP, add SECs
  for all components, repeat), HiGHS WASM in a Web Worker.
- **Exact second-best tour:** add the no-good cut Σ_{e ∈ OPT} x_e ≤ n − 1, keep the SECs collected
  so far, repeat the loop.
- **Heuristic optimum during search:** Or-opt + 2-opt with neighbour lists and perturbation
  (iterated local search); warm-start from the previous tour after a swap (remove city, cheapest
  insertion of the new city, local search).
- **Cheap upper bound on the second-best tour:** best tour different from OPT among local
  modifications of OPT (2-opt moves, Or-opt moves of segments of length 1–3). If
  UB − L(OPT) < required gap, reject the candidate without an exact solve. The true second-best
  can be a non-local change, so always verify exactly before accepting a final candidate.
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

## 7. Interaction and features (ideas)

- Region: country, federal state, or a drawn polygon/rectangle.
- Watch the search live (progress, metric traces); pin/exclude cities and re-optimize around them.
- Designer mode vs. play mode; shared play links must not reveal the solution.
- Permalinks: parameters + seed + city IDs in the URL; no database needed.
- Label placement as a feasibility constraint (e.g. 4-position model); fits the chair's research.
- Export: laser-ready SVG (separate cut/engrave layers, nail holes, labels, markings incl. nail
  correction) and a printable PDF for schools without a laser cutter.
- Play mode in the browser doubles as a measurement tool for empirical difficulty.

## 8. Incremental puzzle (later)

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

## 9. Licenses and attribution

- GeoNames: CC BY 4.0 (attribution required). Natural Earth: public domain. Wikidata: CC0.
  OpenStreetMap (if used): ODbL.
- Code license: to be decided before making the repository public.

## 10. Open questions

- Code license.
- Dimensions, nail diameter and string of existing prototype boards (for defaults/calibration).
- Is the string-length self-check the only verification mechanism, given the tiny gaps?
- Hosting details on the chair server.

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

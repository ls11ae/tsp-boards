# Roadmap

Source of truth for open work (see `CLAUDE.md`, "Working mode"). Work through the items in
order, record decisions in the decision log of `docs/design-notes.md` (Section 11), and mark
items done here when they are finished (heading "— done <date>", or "(done)" after a bullet).

Status 2026-10-13: Phases 1–6 are done except the physical items; Phase 7 is next, then
Phase 8 (Europe and world).
Earlier status 2026-10-12: Phases 1–4 and the incremental puzzle are done (map puzzle search with
exact verification, board export with labels, start nail and scale, play mode, deployment
preparation). Kevin decided to extend the digital side next, before building physical boards.

## Phase 5: digital features — done 2026-10-12

### 5.0 Housekeeping — done 2026-10-12

- `docs/design-notes.md` still contains superseded statements: Section 3.1 ("the gap is the
  bottleneck"; answered by Section 6.3), Section 5 (no-good cut with n − 1; the code uses
  n − 2), Section 10 (open question whether the string self-check works; answered by 6.3 and
  the start-nail design). Update them; keep the history in the decision log.

### 5.1 Puzzle files and library — done 2026-10-12

- One JSON document per puzzle (map and incremental): **title**, description, **purpose**
  (`board` or `digital`, see 5.4), region, places (GeoNames ids or custom points, see 5.2),
  board and string parameters, constraints (pins, exclusions, groups), results (tours,
  verification, board plan), data version, app version, schema version.
- Save and load: download/upload as a file; a local library "My puzzles" in the browser
  (IndexedDB or localStorage with try/catch; works without it); existing permalinks and play
  links keep working, and links can carry a title (compressed when custom points make them
  long). (Done; compressed links come with the custom points of 5.2.)
- The title replaces the generic one in the app, in play mode and on the exported board
  (the board export already warns when there is no room for a title).
- A curated collection shipped with the app under `public/puzzles/` with an index file.

### 5.2 City lists and custom points — done 2026-10-12

- Input as text, one place per line, fuzzy-matched against the country data with a choice
  when ambiguous; or CSV with name, latitude, longitude and optional label for places that are
  not towns (a university, an alliance, a landmark).
- Two modes: **fixed instance** (exactly these places; no search, only analysis: optimum,
  runner-up, gap, metrics, label placement, warnings for small gaps or places closer than the
  minimum distance; can still be exported and played) and **pool** (the search chooses n
  places from the list, with the usual constraints).
- Merge identical or very close places into one node; the label can name all of them (e.g.
  several clusters of excellence in one city). Allow a custom label per place.
- Fixed instances with a gap below the board target: say so and suggest the `digital`
  purpose, or show which single removal would raise the gap most.

### 5.3 Gallery, puzzle switching, highscores — done 2026-10-12

- Start page: gallery of curated and own puzzles (title, type, n, region, status solved /
  unsolved, personal best); open a puzzle in play mode or in the designer with one click;
  switch between puzzles without losing progress.
- Highscores per puzzle, stored locally in the browser, with a name field. Ranking: excess
  over the optimum, then time, with a penalty when the solution was shown. Design the record
  so it can later go to an optional endpoint (extend the play data schema; the server
  recomputes the tour length from the submitted order; nicknames only with consent).
- Play mode for the incremental puzzle (play instance by instance on one board).

### 5.4 Digital vs. board puzzles — done 2026-10-12

- Purpose `board`: as now (string length S, gap target in mm, start nail and scale).
- Purpose `digital`: no nails, so play mode judges the **Euclidean length** and shows the
  excess in % (or km on the map); a unique optimum suffices, no mm gap target, so digital
  puzzles can be harder. The search gets a matching objective (gap term off or relative,
  difficulty weighted higher). Today play mode always judges S; keep that for `board`.

### 5.5 Overlays and metrics — done 2026-10-12

- Runner-up tour as an overlay after solving or in the designer: highlight the edges where it
  differs from the optimum and show the difference.
- Heuristic tours (nearest neighbour, greedy edge, hull insertion) as overlays, for teaching.
- Thesis metrics C (interior fraction) and D (tour edges not in the nearest-neighbour graph)
  are computed in `src/core/metrics.ts` but not shown: show them, and offer them as optional
  objective terms so results can be compared with the thesis.

### 5.6 Regions and group constraints — done 2026-10-12

- City-states make no sense as regions of their own: with one place per municipality, Berlin
  and Hamburg have a single place and Bremen two. Remove them from the region list and add
  combined regions instead: "Berlin and Brandenburg", "Bremen and Lower Saxony", "Hamburg and
  Schleswig-Holstein" (outline = dissolved state polygons, pool = union of the states). Today a
  Brandenburg puzzle leaves out Berlin, its largest city, although it lies inside the outline.
- General rule: offer a region only if its pool can hold a minimum puzzle (e.g. 10 places at
  the minimum distance on the default board); the existing greedy placement check gives this.
- Multi-state regions, e.g. "Northern Germany"; a free polygon remains a Phase 6 idea.
- Minimum and maximum number of places per group, first per federal state: "visit every
  state", "exactly one per state" (a 16-state tour). Repair moves in the search and a
  feasibility check before a run (also with pins and label placement).

## Phase 6: later

- Teaching mode: animate nearest neighbour, insertion, greedy and 2-opt on the current
  puzzle; visualise the exact solver's subtour elimination rounds. (Done 2026-10-12.)
- Robustness: re-verify for several r_eff values (e.g. 1.0, 1.5, 2.0 mm) and show whether the
  optimum and the gap at the scale stay the same. (Done 2026-10-12.)
- Classroom worksheet: one A4/A3 page with the map scaled to fit and a separate solution page
  (the existing print template is 1:1 for building boards). (Done 2026-10-12.)
- Free-form instances: place points by hand on an empty board. (Done 2026-10-12.)
- City puzzles: districts as places (e.g. the Ortsteile of Berlin or the Stadtteile of Hamburg)
  from official open data or OpenStreetMap (ODbL), or landmarks via city lists (5.2). (Done 2026-10-12: Berlin and Hamburg from Wikidata.)
- Themed instances from Wikidata (state capitals, Hanseatic cities, university towns, ...),
  built offline into the curated collection. (Done 2026-10-12.)
- More countries: Austria, Switzerland, the Netherlands (the municipality deduplication is
  Germany-specific and needs a per-country variant). (Done 2026-10-12.)
- Physical: test board with the prototype dimensions once known; deployment to the chair
  server and the play data endpoint when access is available. (Open: waits for the prototype
  dimensions and for access to the chair server; everything else of Phase 6 is done.)

## Phase 7: polish, usability and composite places — done 2026-10-13

From Kevin's review of 2026-10-13 (app run in a browser at 1440 × 900 and 390 × 844). Work
through the items in order.

### 7.1 Composite places (alliances) — done 2026-10-13

- A place can combine several towns or points, e.g. "Ruhr Innovation Lab (Bochum/Dortmund)" or
  "Rhein-Main-Universitäten (Frankfurt/Mainz/Darmstadt)". It is one node at the centroid of
  its members (the mean of the members' coordinates; compute it in the board projection so it
  lies between them on the board), labelled with the combined name. Keep the member names for
  the description, a tooltip and the solution sheet.
- Input: in place lists, e.g. `Ruhr Innovation Lab = Bochum + Dortmund` (members are matched
  like single places; custom points allowed); in the designer, select places and "combine".
  Puzzle files and links store the members, not only the centroid.
- Use it in the curated "Exzellenzuniversitäten ab 2027" puzzle for every alliance (Ruhr
  Innovation Lab, Rhein-Main-Universitäten; the Berlin University Alliance is one city
  anyway) and re-check the gap and the purpose: the close pairs (Bochum–Dortmund,
  Frankfurt–Mainz–Darmstadt) are the likely reason for the string gap of only 0.37 mm, so a
  board version may become possible. Offer the same for clusters of excellence shared by
  several towns.
- Remove the curated puzzle "Exzellenzuniversitäten 2019–2026" (and its list and index
  entry): the collection is about the new round, in particular the Ruhr Innovation Lab.

### 7.2 Gallery — done 2026-10-13

- Layout bug: on desktop the cards render as a narrow bulleted list in the left column (about
  170 px wide, the rest of the page empty). Use a responsive grid of cards.
- A small map thumbnail per card (the board without a tour) and filters (type, region,
  purpose, solved).

### 7.3 Play view — done 2026-10-13

- Nails and labels are tiny: unreadable on a phone, and on a desktop the board uses only about
  half of the available width. In play mode, and especially for digital puzzles, draw nails
  and labels at a screen size independent of the board millimetres, let the board fill the
  available space, support zoom (pinch, buttons) and use larger touch targets.
- Digital puzzles still speak of nails and string ("Besuchte Nägel", "Der Faden legt sich um
  die Nägel …"): word the texts by purpose (places and kilometres for `digital`).
- After "show solution" the player's tour and the optimum are both red and cannot be told
  apart: use distinct styles (e.g. optimum solid, own tour dashed in another colour) and a
  legend. Style the "compare with" select like the other controls.
- Highscore rows run together ("1. −+18,66 %0:02Lösung angesehen"): show a small table
  (rank, name, excess, time, note).
- Keyboard play for accessibility (choose the next place from a list or with the keyboard).

### 7.4 Designer — done 2026-10-13

- The left column is very long: collapsible groups (puzzle, places, board, search), with the
  advanced settings (weights, thesis metrics, seed, iterations) collapsed by default.

### 7.5 Curated content — done 2026-10-13

- "Deutschland: 40 Städte" contains many little-known towns (Gangkofen, Treuenbrietzen,
  Neunkirchen-Seelscheid, ...): rebuild it with a higher weight for well-known cities or with
  pinned major cities.
- Fixed lists that only work as digital puzzles (clusters of excellence 2.1 mm; state
  capitals with Mainz and Wiesbaden 10 mm apart): offer a board variant by showing which
  combinations (7.1) or omissions raise the gap above the target.

### 7.6 Small things — done 2026-10-13

- Main bundle 511 KB: load the teaching mode and the PDF/board export lazily.
- The footer shows "Version 0.0.0": set a real version before deploying.
- The build emits a `__vite-browser-external` chunk: check which Node import reaches the
  browser bundle.

## Phase 8: Europe and world

Decided by Kevin 2026-10-13. Needs the zoom of 7.3 first (dense areas such as Europe or East
Asia are not clickable otherwise).

### 8.1 Continents as regions (planar, board-capable)

- Europe first (then other continents): towns from several countries in one region, with the
  existing region-fitted conformal projection, so the whole pipeline (search, string model,
  board export) works unchanged. Country borders from Natural Earth admin-0.
- Data: per-country GeoNames files or one global file filtered by population (e.g. ≥ 50,000 for
  Europe); the municipality deduplication is country-specific, so for countries without a
  variant merge places within a few km and keep the largest. German and English names
  (exonyms such as Moskau/Moscow) from the alternate names.
- Curated: European capitals (fixed list), a European board puzzle.

### 8.2 World (digital, great-circle distances)

- Cities worldwide above a population threshold (e.g. ≥ 100,000, or ≥ 500,000 for a coarse
  pool), with metropolitan districts merged (e.g. Tokyo wards, New York boroughs) via the
  composite places of 7.1 or distance-based merging.
- Distances are great-circle distances (integer metres or km): the exact solver and the
  heuristics only need the distance matrix, but code that assumes the plane (convex hull, hull
  insertion, turning angles, teaching mode, label placement) must use a local projection or be
  disabled. The string model and the board export stay planar: world puzzles are `digital`.
- Rendering: a world map (e.g. Equal Earth) or a rotatable globe (orthographic) with
  great-circle arcs; d3-geo draws geodesic lines and cuts them at the antimeridian. Show that a
  tour may cross the Pacific or pass near a pole.
- Optional teaching point: compare the shortest tour on the sphere with the shortest tour on
  the flat map (same cities, two metrics).
- A world board, if wanted later, can only measure map distances (state this on the board).

## Curated instances wanted by Kevin — done 2026-10-12

- Universities of Excellence and excellence alliances (Exzellenzuniversitäten /
  Exzellenzverbünde).
- Clusters of Excellence (Exzellenzcluster), one node per city.

Research the current lists (funding round, locations) before building them; record sources.
(Done: `public/puzzles/exzellenz*`, lists and sources in `docs/data/curated/`.)

## Working with several people

- While only one person works at a time: commit to `main`, `git pull --rebase` before starting
  and before pushing.
- When two people work in parallel: one feature branch per item, pull request into `main`,
  CI must be green. Keep the decision log append-only (newest last) to avoid merge conflicts.

# Roadmap

Source of truth for open work (see `CLAUDE.md`, "Working mode"). Work through the items in
order, record decisions in the decision log of `docs/design-notes.md` (Section 11), and mark
items done here when they are finished (heading "— done <date>", or "(done)" after a bullet).

Status 2026-10-17, after Kevin's review of 9.9: 9.1–9.9 are done. Next is 9.10: simpler poster
texts, a QR code to the game, the phone layout, and design themes (TU Dortmund, RUB). Then the
open items of Phase 10.
Earlier status 2026-10-17: 9.1–9.9 are done (9.9: the Ruhr Innovation Lab poster in German and
English, A1 and A0); the code is under the MIT License. Next are the open items of Phase 10.
Earlier status 2026-10-16, after Kevin's review of 9.7–9.8: 9.1–9.8 are done. Next is 9.9, the
Ruhr Innovation Lab poster for the corridor of Chair 11 (German and English, A1 and A0); then
the open items of Phase 10.
Earlier status 2026-10-16 (night): Phase 9 is done (9.7 posters, 9.8 city-scale puzzles).
From Phase 10, the incremental test board files and the licensing preparation are done;
open are the physical builds, deployment and the play data endpoint (need the chair
server) and the choice of the code license (maintainers, see `docs/licensing.md`).
Earlier status 2026-10-16, after Kevin's review of 9.5–9.6: 9.1–9.6 are done. Next is 9.7, a poster
export in DIN formats with the shortest round trip and its length (Excellence Strategy
variants for Kevin to choose from), then the small items in 9.8. In parallel, Kevin lasers and
builds the test board. Then Phase 10.
Earlier status 2026-10-16 (night): Phase 9 (9.1–9.6) is done. Open for the open day:
lasering and building the test board, then re-exporting it with the measured nails and
string (one command in `docs/boards/exzellenzstrategie-2027/README.md`). Next is Phase 10.
Earlier status 2026-10-16 (evening): 9.1–9.5 are done (the board as 12 mm plywood with
drilled holes, re-exported for 1.6 mm nails and 1 mm string).
Earlier status 2026-10-16 (later): 9.1–9.4 are done.
Earlier status 2026-10-16: Phases 1–8 are done. Next is Phase 9 for the open day on
2026-11-07 (the Excellence Strategy board first, then fixes, a rotatable globe and an event
mode); the remaining physical items, deployment and the license are Phase 10.
Earlier status 2026-10-13 (evening): Phases 1–8 are done except the physical items (test board,
deployment, play data endpoint, license), which wait for the prototype dimensions and access
to the chair server.
Earlier status 2026-10-13: Phases 1–6 are done except the physical items; Phase 7 is next, then
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
  dimensions and for access to the chair server; everything else of Phase 6 is done. Moved to
  Phase 10.)

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

## Phase 8: Europe and world — done 2026-10-13

Decided by Kevin 2026-10-13. Needs the zoom of 7.3 first (dense areas such as Europe or East
Asia are not clickable otherwise).

### 8.1 Continents as regions (planar, board-capable) — done 2026-10-13 (Europe)

- Europe first (then other continents): towns from several countries in one region, with the
  existing region-fitted conformal projection, so the whole pipeline (search, string model,
  board export) works unchanged. Country borders from Natural Earth admin-0.
- Data: per-country GeoNames files or one global file filtered by population (e.g. ≥ 50,000 for
  Europe); the municipality deduplication is country-specific, so for countries without a
  variant merge places within a few km and keep the largest. German and English names
  (exonyms such as Moskau/Moscow) from the alternate names.
- Curated: European capitals (fixed list), a European board puzzle.

### 8.2 World (digital, great-circle distances) — done 2026-10-13

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

(Done: `wo.json` with 1964 towns and continents as regions, great-circle distances in the
`Instance`, Equal Earth map with great-circle legs, the flat-map optimum as comparison tour,
world puzzles always digital without board or worksheet; curated "Olympische Sommerspiele" and
"Welt: 30 Metropolen". The rotatable globe was not built: the Equal Earth map already shows the
arcs, the poles and the wrap at the map's edge.)

## Phase 9: open day (Tag der offenen Tür, Saturday 2026-11-07)

Decided by Kevin 2026-10-16, from his review of the app after Phases 7 and 8 (run in a browser
at 1440 × 900 and 390 × 844). Work through the items in order. 9.1 comes first because the
board has to be lasered and tested before 2026-11-07: have its files ready by about
2026-10-21. A poster about the TSP exists already.

### 9.1 Excellence Strategy board (Exzellenzstrategie) — done 2026-10-16

(Done: board files and build note in `docs/boards/exzellenzstrategie-2027/`; string gap 5.71 mm,
also at the scale, start nail Hannover because the best scale at the Ruhr Innovation Lab reads
only 4.92 mm; robust for r_eff 1.0–2.0 mm (5.47–5.95 mm). Logo versions are written to the
git-ignored `local/boards/`. Details in the decision log.)

The first wooden board, to celebrate the new round of the Excellence Strategy (TU Dortmund is
excellent from 2027 as part of the Ruhr Innovation Lab). Kevin lasers it himself on the
chair's xTool P2S (CO2, working area 600 × 305 mm) without the conveyor feeder, so the board
must fit the bed in one piece: **300 × 600 mm, portrait**.

- Input: `docs/data/curated/exzellenzstrategie-2027.txt`, 34 places: the 15 Universities of
  Excellence and alliances (14 places; Ruhr Innovation Lab and Rhein-Main-Universitäten as
  composite places) and the 20 further sites of Clusters of Excellence 2026–2032. Sources as
  in the other Exzellenz lists (`docs/data/curated/README.md`).
- Findings from Kevin's review (exact checks; Euclidean for the digital numbers; difficulty
  score as in the app; random 34-town selections of Germany have a median score of 0.57,
  "Deutschland: 40 Städte" 0.72):
  - All 34 places: score 0.63, but the runner-up is only 0.06 % (1.7 km) longer: Würzburg
    between Rhein-Main and Heidelberg or between Erlangen and Bayreuth (with the string the
    other way round); string gap 1.1 mm on 600 × 800 mm. A digital puzzle only, and the last
    step is guessing.
  - The universities plus the sites with at least two clusters (22 places) are easy again
    (score 0.24, runner-up +0.05 %).
  - A search over the 34 places as a pool with those 22 pinned (the 14 university places
    plus Hannover, Gießen, Oldenburg, Bremen, Kiel, Marburg, Stuttgart, Würzburg), n = 26,
    adds Düsseldorf, Leipzig, Münster and Siegen (the same four for all seeds and board sizes
    tried): score 0.72, runner-up +0.31 % (8 km).
  - String gap of this selection by board size (2 mm nails, 1 mm string; start nail chosen
    by the planner): 300 × 600 mm (margin 15 mm, labels 5 mm, minimum distance 10 mm):
    5.71 mm, also at the scale (start nail Hannover); with 1.2 mm nails and 0.5 mm string
    5.39 mm. For comparison: 600 × 600 mm (two pieces) 8.33 mm (scale 8.08), 500 × 750 mm
    (conveyor feeder, which processes at most 500 mm wide) 9.22 mm, 600 × 800 mm 10.69 mm.
    On 300 × 600 mm the closest pairs are Bonn–Köln 10.3 mm and Gießen–Marburg 10.8 mm.
  - Command used (the review copy's CLI had extra options `--margin`, `--label`, `--nail`,
    `--string` for `list`; add them):
    `npx tsx cli/collection.ts list --file docs/data/curated/exzellenzstrategie-2027.txt --pool --n 26 --pin '<the 22 places>' --merge 0 --board 300x600 --margin 15 --label 5 --min-dist 10`.
  - **Used for the board: a rule-based selection** (proposed 2026-10-16), so that the legend
    can say exactly which cluster sites are on the board: the 22 places above plus all further
    cluster sites in North Rhine-Westphalia (Düsseldorf, Münster, Siegen), 25 places, list
    `docs/data/curated/exzellenzstrategie-2027-brett.txt` (left out: Bayreuth, Braunschweig,
    Erlangen, Halle (Saale), Konstanz, Leipzig, Lübeck, Regensburg, Ulm; one cluster each). Same
    gaps as the search result: 5.71 mm on 300 × 600 mm, 10.69 mm on 600 × 800 mm; score 0.71,
    runner-up +0.32 % (8 km). The gap hardly depends on nails and string (300 × 600 mm,
    nail/string in mm: 1.4/1.0 → 5.56, 1.6/1.0 → 5.61, 2.0/1.0 → 5.71, 2.0/2.0 → 5.95,
    3.0/1.5 → 6.07), so Kevin buys what is available and measures it.
- Build the board puzzle for 300 × 600 mm as a fixed list from
  `docs/data/curated/exzellenzstrategie-2027-brett.txt`, with the nail diameter and string
  thickness Kevin measures (until then 2 mm and 1 mm). The description names the sites that are
  left out. Check robustness over r_eff (1.0–2.0 mm) before export: the gap is close to the
  5 mm target, so if the optimum or the reading at the scale is not robust, say so and propose
  the best alternative.
- Highlight the Universities of Excellence and alliances (Kevin's wish): an engraved ring
  around their nails (or another clear marker) on the board, the same distinction in the app
  (play view and designer, e.g. a ring or bold label), and a legend.
- Ruhr Innovation Lab with its logo (Kevin's wish): on the wooden board the logo replaces the
  text label of the Ruhr Innovation Lab nail (as large as the label placement allows, at least
  about 20 mm wide, else keep the text label), and a large logo with the legend in a box at
  the bottom of the board (about 110 mm below the map are free on 300 × 600 mm; keep map
  lines out of the box, as for the title). Suggested legend text: ring = "Exzellenzuniversität
  oder -verbund ab 2027", plain nail = "weiterer Standort von Exzellenzclustern: alle mit mind.
  zwei Clustern, in NRW alle", "Ruhr Innovation Lab: Ruhr-Universität Bochum und TU Dortmund –
  exzellent ab 2027", and the funding periods. Mock-up of this layout:
  `local/exzellenz-brett-mockup.png`.
  - The logo file is **not** committed (logo usage rights; the repository becomes public
    later): Kevin keeps it in the git-ignored folder `local/` (`local/ruhr-innovation-lab.png`
    as received, `local/ruhr-innovation-lab.svg` vectorised with potrace). The export takes an
    optional image per place and for the legend from a local path (CLI option and, if easy,
    an upload in the app's export panel); engrave it as vector paths. Kevin asks the Ruhr
    Innovation Lab for the official vector logo and permission.
- Board details: title such as "Exzellenzstrategie 2026–2033" (suggest wording); the Ruhr
  Innovation Lab as the start nail with the scale if its measured gap stays at or above the
  target, else the planner's choice; the solution sheet names the members of composite
  places; the subtitle says "Orte", not "Städte".
- Deliver the laser SVG (layers for engraving, scoring and cutting, sized for the P2S bed),
  print template 1:1, solution sheet, and a short build and test note (plywood thickness,
  nail holes lasered slightly undersized for a press fit or as marks, nail height, string
  material, how to check the scale). Files ready by about 2026-10-21 so that a test board can
  be lasered, strung and checked before the final one.
- Also add the digital puzzle "Exzellenzstrategie: alle 34 Standorte" (fixed list) to the
  collection, and put the Excellence puzzles first in the gallery (see 9.5).

### 9.2 Fixes needed for the open day — done 2026-10-16

- Switching views keeps the scroll position (no scroll to the top): on a phone or tablet,
  "Spielen" in the gallery lands below the board. Scroll to the top (or to the board) on every
  view change.
- The timer keeps running after "Lösung zeigen"; stop it there. After an optimal solution,
  "Lösung zeigen" with its confirmation is pointless.
- Texts: "Finde die kürzeste Rundreise durch 14 Städte" should say "Orte" (alliances are not
  cities); singular forms ("1 Namen ausgeblendet", "1 Paare liegen …"); "Entferntestes Paar"
  → "Am weitesten entferntes Paar"; the teaching mode says "Nagelmitten" for digital puzzles;
  the highscore column "Mehr" shows values without a unit; the subtitle "mit Nägeln und
  Faden" also appears for digital puzzles.
- Accessibility and polish: the "Vergleichen mit" select has no associated label; the
  favicon is missing (404 in the console); lint warning about the `useMemo` dependency in
  `src/ui/overlay.ts`.

### 9.3 Rotatable globe for world puzzles — done 2026-10-16

Kevin's wish: the world in the app as a globe, so that a round trip can travel around the
world.

- An orthographic globe (d3-geo `geoOrthographic`, clipped at the horizon) for world puzzles
  in play mode and in the designer, with a switch between globe and the Equal Earth map.
  Rotate by dragging (mouse and one finger; quaternion/versor rotation so it does not get
  stuck at the poles), zoom by buttons, wheel and pinch. Great-circle legs and the tour are
  drawn as geodesics and disappear behind the horizon.
- Only places on the visible side can be clicked (hit test by angular distance from the
  view centre); labels for visible places, recomputed while rotating (throttled).
- "Fly the round trip": after solving or showing the solution, an animation that follows
  the tour leg by leg (a marker moving along the great circle, `geoInterpolate`) and turns
  the globe with it; optionally also for the player's own tour.
- Curated: a puzzle whose optimal tour goes once around the world (places spread over all
  longitudes, so the map version wraps at the edge and the globe shows one loop), and an easy
  one after Jules Verne's "In 80 Tagen um die Welt" (London, Suez, Mumbai, Kolkata, Hong
  Kong, Yokohama, San Francisco, New York, Liverpool). Yokohama is missing from `wo.json`
  (probably merged into Tokyo as a district): check the district merging.
- The rest stays as it is: great-circle distances, the exact check and the flat-map
  comparison (draw that comparison tour as straight lines on the Equal Earth map, see 9.5).

### 9.4 Event mode — done 2026-10-16

- A kiosk mode for a booth (e.g. `#kiosk`): full screen, a start screen with three levels
  (easy about 10–12, medium about 20, hard 30–40 places; Excellence puzzles included), large
  touch targets, "Nächste Person" (new game, empty name) and a reset after inactivity, no
  designer and no links out of the kiosk.
- A "Bestenliste des Tages" per puzzle (local to the device, nicknames only), shown large,
  e.g. on a second screen or after each game.
- Works offline from a laptop (`npm run build` + `vite preview`, or the `dist` folder);
  document how to run it in `docs/deployment.md`.

### 9.5 Follow-ups from Kevin's review of 9.1–9.4 (2026-10-16) — done 2026-10-16

Do these first; the board items are the critical path (lasering and a test board before
2026-11-07).

**Board: build variant (Kevin's decision)**

- Kevin builds the boards from **12 mm birch plywood** (HORNBACH "Fixmaß Multiplexplatte Birke
  BB/WG" 1200 × 600 × 12 mm, cut by the store into four pieces of about 298 × 600 mm), engraves
  them directly and **drills** the nail holes by hand. A CO2 laser cannot cut clean holes of
  1.2–1.6 mm through 12 mm. The 6 mm variant with laser-cut press-fit holes stays as an
  alternative in the build note, not as the default.
- Nail positions: a new hole mode (e.g. `--holes pit`, the default for this board) that marks
  each nail as a small engraved pit (about 1 mm wide, engraved deeper than the map, e.g. by
  repeated passes or a separate layer/colour with more power) in which a 1.2 mm drill centres
  itself. Crosses are harder to hit with a drill.
- Put the **board outline on its own layer and colour**, separate from the nail holes (today
  both are red "cut"), so it can be switched off in xTool Creative Space when the board is
  pre-cut; or an option `--no-outline`. Default for this board: no outline cut.
- The pieces are 1–2 mm narrower than 300 mm: keep the file at 300 × 600 mm (margin 15 mm) and
  say in the build note to centre it on the board with the P2S camera, or take the measured
  size if Kevin gives it.
- Nails and string as planned: **1.6 × 20 mm wire nails with flat heads**, polyester string
  about 1 mm. Use these values (`--nail 1.6 --string 1`) until Kevin gives measured ones, and
  keep re-exporting with measured values a one-line command.
- Rewrite the build note (`docs/boards/exzellenzstrategie-2027/README.md`) for this variant:
  masking tape against smoke stains; engrave, then score; pre-drill each pit with a 1.2 mm drill
  about 9 mm deep (tape on the drill as a depth mark, a drill stand if available, straight up);
  nails with about 11 mm protruding, set with a gauge (an M12/M14 hex nut or a wooden block of
  that height) so all have the same height; sand and oil; one quarter as a test board first;
  then calibration and checking the scale as now. Mention the 6 mm variant briefly.
- The logo versions: keep writing them to the git-ignored `local/boards/`; the build note says
  which file to laser (`…-logo-bed.svg`).

**Event mode**

- Today's leaderboard only gets an entry for the optimum or after "Lösung zeigen". Also record
  the best closed round trip of a game when "Nächste Person" is pressed or the inactivity reset
  happens, so that visitors who did not find the optimum appear too. Show "optimal" instead of
  "0 %" / "0 mm".
- Board puzzles in the kiosk are judged in "mm Faden": fine next to the wooden board, but say
  so on screen (e.g. "wie am Holzbrett: gemessen wird der Faden") or decide on a clearer
  presentation for visitors; record the decision.
- `#kiosk` and `#kiosk/scores` only work on a fresh page load: react to `hashchange` as well.
- The easy level has two nearly identical puzzles ("Exzellenzuniversitäten ab 2027" with and
  without "(Brett)"): keep one and add another easy puzzle, if possible with a local touch
  (e.g. a small Ruhr area or Dortmund puzzle), else "Landeshauptstädte (Brett)".
- Kiosk cards with the map thumbnails of the gallery (more inviting for visitors).

**Globe**

- Start view: centre the globe on the places (spherical centroid, or the pole when the places
  surround it), so that "Einmal um die Welt" starts with the whole loop visible, seen from
  above the North Pole.
- While "Rundreise abfliegen" runs, hide or fade the player's own dashed tour.
- German name "Sues" → "Suez" (override in the world data).

**Small things**

- Highscore column "Mehr": a clearer header (e.g. "über Optimum").

### 9.6 Further items from the review (after 9.1–9.5) — done 2026-10-16

- Europe: the cut at 45° E is drawn as a straight diagonal line through Russia (also in the
  thumbnails) and looks like a border. Cut along the Ural or do not draw the clip edge. (Done
  for the board export in 9.1; still drawn in the app's play view, designer and thumbnails.)
  (done: not drawn on the screen either)
- "Welt: 30 Metropolen" is Asia-heavy (Chongqing, Tianjin, Shenzhen, …), with only three
  cities in the Americas and without Paris, Los Angeles, São Paulo or Buenos Aires. For the
  world, measure recognisability by prominence (alternate names or Wikipedia), not
  population, and consider a minimum per continent (the group constraints exist).
  (done: fame from Wikipedia editions; the minimum per continent was not needed)
- Flat-map comparison: draw the comparison tour as straight lines on the map (that is how it
  is measured) and hide the player's tour while comparing (three tours on top of each other
  are hard to read). (Straight lines done in 9.3; hiding the player's tour is open.)
  (done: hidden while a comparison is drawn next to the solution)
- Incremental play still uses the old millimetre drawing (small nails, measuring track, no
  zoom): use the screen-size approach of `PlayBoard`. (done)
- Board variant suggestions are purely geometric (e.g. "Aachen + Köln zusammengefasst"):
  allow marking places that must not be removed or combined. (done: pinned places are kept)
- Gallery: thumbnails load `de.json`, `eu.json` and `wo.json` (about 1.6 MB, 550 KB gzip):
  load them when a card becomes visible. Order by theme (Excellence first, then Germany,
  cities, Europe, world, step by step) instead of alphabetically. (Order done in 9.1; lazy
  thumbnails open.) (done: thumbnails load near the screen)

### 9.7 Poster export (DIN formats) — done 2026-10-16

Kevin's wish 2026-10-16: print a puzzle as a poster in a DIN format, with the shortest round
trip drawn and its length, above all for the Excellence Strategy and the Ruhr Innovation Lab.
He has not decided the number of places yet and chooses after seeing the poster variants
below. A poster is not a puzzle: the solution is shown, so the string gap and the difficulty
do not matter here.

- A poster PDF (`src/core/board/poster.ts`, building on the classroom worksheet in
  `worksheet.ts` and the PDF writer): one page, DIN A4 to A0, portrait or landscape, vector,
  text as outlines, white margin of at least 10 mm (no bleed). The map is scaled to fit, as
  on the worksheet. The optimal round trip is a strong line above the map. The places are
  dots with labels. Highlighted places (`*`) get rings and a legend, as on the board. Add a
  km scale bar, a title and a subtitle.
  - Typography scales with the paper size. The title and the length must be readable from
    about 3 m on A1 and A0.
- Facts on the poster, in large type:
  - The length of the round trip in km, rounded to whole km.
  - The number of places.
  - The number of possible round trips (n − 1)!/2, in readable form (e.g. "3,1 · 10²³").
  - How much longer the second-best round trip is.
  - One sentence that the tour was computed and proven optimal with integer linear
    optimisation (HiGHS).
  - Suggest the wording, in German; e.g. title "Die kürzeste Rundreise durch Deutschlands
    Exzellenz", subtitle "Alle 34 Standorte der Exzellenzstrategie 2026–2033".
- The footer contains Lehrstuhl 11 Algorithm Engineering, TU Dortmund and the data credits
  (GeoNames CC BY 4.0). Optionally it also has a QR code to the play link, but only once the
  app is online (Phase 10), so it is off by default.
- Length in km: the great-circle length ("Luftlinie") of the tour. The export checks that the
  map-Euclidean optimum (the one the app judges against) is also the great-circle optimum,
  states the result in a short report, and warns and uses the great-circle optimum if they
  differ.
  - Kevin's check 2026-10-16 found them identical in all six variants below. The map lengths
    were 1–1.5 km longer than the great-circle lengths.
- Composite places come in two forms:
  - One point at the centroid, as on the board. The poster says that the tour is measured to
    the centroid of each alliance's universities.
  - Members as separate stops (`--members separate`): each member is its own place, and the
    alliance is drawn as one highlighted group with its name, e.g. a common outline or ring
    around Bochum and Dortmund.
- Logos come only from local SVG files, as in `cli/export-board.ts`: `--logo` puts one next
  to its place (e.g. `"Ruhr Innovation Lab=local/ruhr-innovation-lab.svg"`) and
  `--legend-logo` puts one in the legend. Logo versions are written to the git-ignored
  `local/posters/`, never to the repository.
- Interfaces:
  - `cli/export-poster.ts` (`--puzzle` or `--list`, `--paper A0…A4`, `--orientation`,
    `--members`, logos, `--out`, `--name`, `--png <dpi>` for previews).
  - A "Poster" button in the app's export panel, with paper size and orientation selects.
    In the app a logo can be chosen as a local SVG file; it stays in the browser.
- Variants for Kevin's choice, each as A1 portrait plus a PNG preview, in
  `docs/posters/exzellenzstrategie-2027/`. Logo versions go to `local/posters/`. Add a README
  with a comparison table (places, length, second-best, possible tours) and one contact
  sheet PNG with all six variants side by side. The variants, with Kevin's check 2026-10-16
  (great-circle km, exact):

  | Variant                                                                   | Places | Length  | Second-best | Possible tours |
  | ------------------------------------------------------------------------- | ------ | ------- | ----------- | -------------- |
  | Universities of Excellence and alliances (`exzellenzuniversitaeten-2027`) | 14     | 2039 km | +3.5 km     | 3.1 · 10⁹      |
  | the same, members as separate stops                                       | 17     | 2078 km | +0.6 km     | 1.0 · 10¹³     |
  | universities plus sites with at least two clusters                        | 22     | 2521 km | +1.4 km     | 2.6 · 10¹⁹     |
  | the board selection (`exzellenzstrategie-2027-brett`, with NRW)           | 25     | 2534 km | +8.0 km     | 3.1 · 10²³     |
  | all sites (`exzellenzstrategie-2027`)                                     | 34     | 2838 km | +1.7 km     | 4.3 · 10³⁶     |
  | all sites, members as separate stops                                      | 37     | 2879 km | +2.4 km     | 1.9 · 10⁴¹     |

  The 22 variant has no list file yet. Use the board list without Düsseldorf, Münster and
  Siegen.

- Tests: the page sizes of all DIN formats; the tour on the poster equals the exact optimum;
  the km figures; no logo file in the repository.

(Done: `cli/export-poster.ts`, the app's "Plakat (PDF)", the six variants with README,
report and contact sheet in `docs/posters/exzellenzstrategie-2027/`, logo versions in
`local/posters/`. The QR code waits for Phase 10.)

### 9.8 Small items from the review of 9.5–9.6 — done 2026-10-16

- "Ruhrgebiet: 11 Städte" looks empty, with no municipal borders. Draw municipal or
  district borders for city-scale puzzles if they are cheap to add, else a light background
  of the surrounding towns. (done: surrounding towns; municipal borders are not in the data)
- The thumbnail of the Ruhr puzzle in the gallery is tiny: crop it to the places. (done)

### 9.9 Ruhr Innovation Lab poster (Kevin's review of 9.7, 2026-10-16) — done 2026-10-17

The poster is not for the open day: Kevin hangs it in the corridor of Chair 11, to celebrate
the Ruhr Innovation Lab (RIL). He chooses the variant after this round, so keep all six
variants.

- **The Ruhr Innovation Lab is prominent in every variant.**
  - The round trip starts and ends at the RIL; mark it ("Start und Ziel" / "Start and
    finish").
  - Its label is larger, bold and red (where no logo replaces it, see below).
  - Bochum and Dortmund are always visible as named dots inside the red alliance outline,
    also in the centroid variants (14, 22, 25, 34), where the stop is the centre inside the
    outline. Each name sits clearly next to its own dot. In a test with the logo, the label
    "Dortmund" stood above Bochum's dot.
  - With `--logo` the RIL logo stands large (about 80–120 mm wide on A1) in free space near
    the outline, e.g. over the North Sea or the Netherlands, with a thin leader line to the
    outline. No text box: the logo contains the name, so it replaces the red map label.
    Without a logo (the committed versions) the red name stays at the outline.
  - The Rhein-Main-Universitäten stay as they are.
  - Propose two or three titles in the README, at least one of them naming the RIL.
- **Labels avoid the round trip.** The tour is known when the poster is laid out. Treat its
  legs, the alliance outlines and the logo as obstacles in the label placement, so that
  no label covers a leg (now Würzburg, Aachen, Bonn, Jena, Freiburg, Ulm, Leipzig and
  Braunschweig do). Test: no label box intersects a leg.
- **A visual poster with little text** (Kevin): the map and the round trip carry the poster.
  - One line describes the problem and contains the number of possible round trips,
    (n − 1)!/2. Examples: "Finde die kürzeste Rundreise unter 1,9 · 10⁴¹ Möglichkeiten." and
    "Find the shortest round trip out of 1.9 × 10⁴¹ options." Below it, large, comes the
    answer: the length in km.
  - Drop the other fact boxes: the number of places, the separate count of round trips and
    the second-best. No comparison with trying all round trips.
  - At most one short line in small type says that the round trip is proven optimal
    (HiGHS). In the centroid variants, the note on alliances becomes a small legend entry.
- **German and English.** Every text exists in both languages: title, subtitle, facts,
  legend and footer.
  - Use the official English terms: Excellence Strategy, Universities of Excellence,
    Clusters of Excellence, excellence alliance, Rhine-Main Universities, Ruhr University
    Bochum, TU Dortmund University.
  - Use English place names where they are common (Munich, Cologne, …; check the list).
  - Use the English number format (2,534 km; 3.1 × 10²³).
  - In the app, the poster follows the app's language.
- **A1 and A0**, both portrait. Type and line widths scale with the paper, so A0 is A1
  enlarged by √2; check that.
- **Small items:**
  - The line "Förderung …" comes after the symbol entries of the legend (in 37 it sits
    between them).
  - Make the footer larger: on A1 the chair line ("Lehrstuhl 11 Algorithm Engineering, TU
    Dortmund") needs a cap height of about 5 mm.
  - Use the free space at the bottom right for a TU Dortmund logo (also only from
    `local/`) and later the QR code.
- **App poster:**
  - Title, subtitle and legend are editable in the poster section before the export,
    prefilled from the puzzle. Puzzle descriptions such as "… ein Puzzle für den Bildschirm"
    do not belong on a poster, and the legend now says only "markierter Ort".
  - The RIL emphasis (start and finish, logo at the place) is available for any place.
- **Outputs:**
  - In `docs/posters/exzellenzstrategie-2027/`: the A1 PDFs and PNG previews of all six
    variants in German and English (e.g. subfolders `de/` and `en/`), one contact sheet per
    language, and the README updated.
  - A0 and the logo versions are built by one command into the git-ignored
    `local/posters/`; do not commit them.
  - The logo stays out of the repository, because the repository becomes public.
  - The official logo files (from Kevin, 2026-10-16) are in `local/`; see
    `local/LIESMICH-logo.txt`. `ruhr-innovation-lab.svg` is the block logo without texture,
    for the board. `ruhr-innovation-lab-textur.svg` is the block logo with the stamp texture,
    for the poster. Horizontal versions of both are there too.
  - If these files are missing on the machine, build without the logo and say so.

(Done 2026-10-17: emphasis, labels off the legs, the reduced text, German and English, A1 and
A0, the app's editable poster; the files in `docs/posters/exzellenzstrategie-2027/de` and
`/en`, A0 and the logo versions in `local/posters/` by one command, see the README there. The
TU Dortmund logo is not in `local/` yet; the QR code waits for Phase 10.)

### 9.10 Poster: simpler texts, QR code, design themes; playing on a phone (Kevin's review of 9.9, 2026-10-17)

Kevin finds the poster text still too complicated, wants a QR code to the game ("it must play
well on a smartphone"), and wants versions in the corporate designs of TU Dortmund (for his
corridor) and of the Ruhr-Universität Bochum (for Maike's). Work through the items in this
order; the phone layout matters for the open day too, since visitors may play on their phones.

- **Texts, German and English:**
  - Title: "TSP Tour: Standorte der Exzellenzstrategie 2026–2033" / "TSP Tour: Sites of the
    Excellence Strategy 2026–2033". A short subtitle only where the variant needs one (e.g.
    "Jede Stadt eines Verbunds als eigener Halt" for 17 and 37).
  - The line above the length starts without "Finde die": "Kürzeste Rundreise unter
    1,9 · 10⁴¹ Möglichkeiten:" / "Shortest round trip out of 1.9 × 10⁴¹ options:".
  - Drop the line about HiGHS ("any solver could do this"). Keep only "Luftlinie" / "As the
    crow flies" in small type.
  - Titles fit on one line in both languages (shrink the title to fit if needed).
  - (Done 2026-10-17.)
- **QR code to the game:**
  - A short link that opens a gallery puzzle in play mode, e.g. `#p/<puzzle id>`, so the QR
    stays small. Old permalinks keep working.
  - A gallery puzzle for every poster variant that has none yet, at least "Exzellenzstrategie:
    alle 37 Städte" (alliances as separate stops), so that poster and game show the same
    places.
  - On the poster: `--qr <base url>` (the CLI appends `#p/<id>`). Put the code bottom right,
    about 40 mm wide on A1, with "Selbst spielen" / "Play it yourself" and the URL in small
    type. Generate the code locally: a small dependency with a permissive license, or our own
    encoder; no web service. A test decodes the code again (decoder as a dev dependency).
  - The base URL is Kevin's decision (hosting, see Phase 10). Until then, the committed
    posters have no QR code.
  - (Done 2026-10-17: `#p/<id>`, gallery puzzles for 17, 22 and 37, `--qr`, GitHub Pages at
    https://ls11ae.github.io/tsp-boards/ as the base URL, the committed posters with the code.)
- **Phones** (Kevin's review at 390 × 844 with touch, 2026-10-17):
  - The board starts halfway down the first screen, and the status (places, km, time) is
    below the board, so while playing you see neither.
  - Places are too close together for a finger at the full view: Köln–Bonn are 13 CSS px
    apart, Bochum–Dortmund about 8 px in the 37 variant. A tap goes to the nearest place,
    which works with a mouse but not reliably with a finger.
  - Fix: a phone layout for narrow screens. Keep the header compact and the description
    collapsible. Show the board first and as large as the screen allows. Add a compact
    sticky status bar (places n/N, km, time, Zurück, Lösung zeigen).
  - Ambiguous taps: when several places lie within about 24 CSS px of a tap, zoom in around
    the tap (or show a small chooser) instead of guessing.
  - On touch devices the texts say "Tippe" instead of "Klicke".
  - Test with Playwright mobile emulation (390 × 844, touch) on the 37 puzzle: a whole round
    trip by taps, with screenshots.
  - (Done 2026-10-17: below 600 px the play view has a one-row header, the description folds,
    the board takes the screen above a sticky status bar; an ambiguous tap zooms in; "Tippe"
    on touch devices; `npm run e2e` with screenshots in
    `docs/experiments/phone-play-2026-10-17/`.)
- **Design themes** (`--theme neutral|tu|rub`):
  - Theme files in the repository hold colours, texts and the names of logo files. The logos
    themselves come only from `local/`.
  - **neutral**: as now.
  - **tu**: like Kevin's chair posters (sciebo `poster/final/*.pdf`, made in InDesign). The TU
    Dortmund logo is at the top left. Title and length are in TU green (#84B818, as in
    `local/ae-logo.svg`). The footer has the faculty logo at the bottom left and the AE logo
    at the bottom right. The tour stays red, because the AE logo pairs TU green with red.
  - **rub**: the RUB logo at the top, the faculty logo and Maike's chair logo in the footer.
    Title, length and tour are in RUB blue (#003560; CMYK 100/50/0/60 in the RUB A3 poster
    template `local/rub/09_PlakatA3.zip`), the alliance tint is light blue. The sender line is
    configurable; Maike gives its text.
  - Poster logos keep their SVG colours, fills and strokes.
    - The AE logo has three colours.
    - The RUB faculty logo and Maike's chair logo use stroked lines (`stroke`,
      `stroke-width`, caps, joins) and the faculty logo uses `<use>` glyph references. Draw
      both on posters.
    - Maike's chair logo has very thin lines (1.2 of 1072 units). Keep a minimum line width
      on the poster, about 0.25 mm.
    - Boards stay one colour.
  - The font stays Fira Sans Condensed. Akkurat, the TU font, is licensed and stays out of
    the repository.
  - Logo files in `local/` (see `local/LIESMICH-logo.txt`):
    - `tu-dortmund.svg` is the German TU logo, `tu-dortmund-en.svg` the English one; use it on
      the English posters. Keep the clear space around the TU logo that the TU design
      guidelines require.
    - `ae-logo.svg` and `ae-logo-text.svg` are Kevin's chair logos.
    - `rub.svg` is the RUB logo, `rub-informatik.svg` the RUB Faculty of Computer Science
      (English only), and `rub-lehrstuhl.svg` Maike's chair logo. The sources are in
      `local/rub/`.
    - `fakultaet-informatik.svg` is the faculty logo of TU Dortmund ("fi fakultät für
      informatik"), taken from Kevin's posters.
- **Outputs** as in 9.9 (A1 in the repository per language, A0 and logo versions in
  `local/posters/`), now also per theme.

## Phase 10: physical and public

- Test board of the incremental puzzle with the prototype dimensions; deployment to the
  chair server; play data endpoint; code license (before the repository becomes public).
  (Done 2026-10-16: the test board files for Kevin's build, 300 × 300 mm, 12 nails, in
  `docs/boards/incremental-test/`, with a robustness check over r_eff; the licensing
  inventory, a recommendation and a checklist in `docs/licensing.md`, and the third-party
  notices in the build. License decided 2026-10-17: MIT for code and docs (`LICENSE`,
  `AUTHORS`). Open: building and testing the board, deployment and the endpoint (server
  access); making the repository public (maintainers).)
- Later: a physical globe (wood or 3D print) with nails and string. A taut string follows the
  great circle by itself; on a 40 cm globe 1 mm is about 32 km, so a 5 mm gap needs about
  160 km (a quick search found 241 km for 20 world cities, but 30 cities typically give only
  90–120 km). Open problems: placing the nails accurately, friction of long legs on the
  surface, a measuring tape instead of the scale.

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

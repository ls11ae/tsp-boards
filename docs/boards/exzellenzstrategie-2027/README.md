# Excellence Strategy board (Exzellenzstrategie 2026–2033)

The first wooden board (roadmap 9.1): 25 places on 300 × 600 mm, for the xTool P2S (CO2,
working area 600 × 305 mm) in one piece. Built from
`public/puzzles/exzellenzstrategie-2027-brett.tsp.json` (list
`docs/data/curated/exzellenzstrategie-2027-brett.txt`, legend and start nail in
`exzellenzstrategie-2027-brett.board.json`).

## Files

| file                                      | use                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `exzellenzstrategie-2027-bed.svg`         | laser file, turned by 90° for the P2S bed (600 × 300 mm)            |
| `exzellenzstrategie-2027.svg`             | the same board upright (300 × 600 mm), for viewing                  |
| `exzellenzstrategie-2027-hole-test.svg`   | test strip with nail holes of 1.4–2.0 mm (cut first)                |
| `exzellenzstrategie-2027-template-A4.pdf` | print template 1:1 on A4 tiles (boards built without a laser)       |
| `exzellenzstrategie-2027-solution.pdf`    | solution sheet: tour, lengths, string calibration (not for players) |
| `exzellenzstrategie-2027-report.md`       | figures: gaps, start nail, robustness, the tour and the runner-up   |

Layers (colour → operation, as xTool Creative Space maps them): black fill = engrave (title,
labels, rings, legend, scale numbers), blue = score (inner borders, scale ticks, legend frame),
green = score with more power (outline of Germany), red = cut (nail holes, board outline). Run
them in this order: engrave, score, cut holes, cut the outline last (the board stays in place
until the end).

## The puzzle

- 25 places: the 15 Universities of Excellence and alliances from 2027 (14 places, each with an
  engraved ring; Rhein-Main-Universitäten and Ruhr Innovation Lab as one nail between their
  cities) and the further sites of Clusters of Excellence with at least two clusters, plus all
  further cluster sites in North Rhine-Westphalia. Left out (one cluster each): Bayreuth,
  Braunschweig, Erlangen, Halle (Saale), Konstanz, Leipzig, Lübeck, Regensburg, Ulm.
- String gap between the shortest and the second-shortest round trip: **5.71 mm** (exact, 2 mm
  nails, 1 mm string); at the scale also **5.71 mm** (start nail **Hannover**).
- The Ruhr Innovation Lab as start nail: its scale does not fit along the usual direction
  (Siegen, Marburg and Gießen are in the way); turned by 15° it fits, but the gap at the scale
  is then 4.92 mm, below the 5 mm target, so the planner chose Hannover.
- Robust: for r_eff from 1.0 to 2.0 mm (nail radius plus half the string) the optimum stays the
  same and the gap is 5.47–5.95 mm, also at the scale. Thinner or thicker nails and string do
  not break the puzzle.
- The runner-up differs only near Aachen and Köln (Düsseldorf → Köln → Aachen → Bonn instead of
  Düsseldorf → Aachen → Köln → Bonn).

## Building and testing

1. **Wood**: birch plywood, 6 mm (thicker holds the nails better but takes several passes on a
   CO2 laser; 4 mm is too thin for nails without a backing board).
2. **Holes**: cut the test strip first and push a nail into each hole. Use the diameter where
   the nail sits tight by hand pressure or a light tap (usually 0.2–0.4 mm below the nail
   diameter, since the laser burns a little away), then export the board with
   `--hole <diameter>`. Alternatively export with `--holes mark` (crosses only) and drill.
3. **Nails**: all the same height, 12–15 mm above the board (a spacer block helps), straight
   up. Nails with heads keep the string from slipping off. Measure the diameter and re-export
   with `--nail <mm>` (see below); the gap changes by tenths of a millimetre at most.
4. **String**: about 1 mm, low stretch (waxed polyester cord or braided line; cotton and
   macramé cord stretch). Measure its thickness and re-export with `--string <mm>`.
5. **Calibrating** (solution sheet, "Faden kalibrieren"): tie a loose loop around the start nail
   (Hannover, the nail with the scale), wind the tour in the order of the solution sheet, back
   to the start nail, once around it and straight along the scale. Mark the string at the
   target mark 0 (a knot or a bead) and cut it there.
6. **Checking the scale**: wind the shortest tour again in the other direction: the end
   reaches 0 again. Wind the runner-up (in the report: swap Aachen and Köln): the end must stop
   about 5.7 mm before 0, outside the scored frame around 0. If the end of the optimum misses 0
   by more than 1–2 mm, the string stretches or the nails lean.

## Re-exporting (measured nails, string, logo)

```bash
npx tsx cli/export-board.ts --puzzle public/puzzles/exzellenzstrategie-2027-brett.tsp.json --out docs/boards/exzellenzstrategie-2027 --name exzellenzstrategie-2027 --bed 600x305 --nail 2 --string 1 --hole 1.7
```

With the Ruhr Innovation Lab logo (kept in the git-ignored folder `local/`, never committed),
write the files to `local/` as well:

```bash
npx tsx cli/export-board.ts --puzzle public/puzzles/exzellenzstrategie-2027-brett.tsp.json --out local/boards --name exzellenzstrategie-2027-logo --bed 600x305 --logo "Ruhr Innovation Lab=local/ruhr-innovation-lab.svg" --legend-logo local/ruhr-innovation-lab.svg
```

The logo must be an SVG with filled shapes (e.g. potrace output); it is engraved as a filled
area. Next to its nail it replaces the label if it fits at 20 mm width or more (the export
says so); in the legend box it is up to 110 × 60 mm. The app's export panel
can load the same SVG files ("Logos für das Brett"); they stay in the browser session only.

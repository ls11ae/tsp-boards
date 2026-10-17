# Excellence Strategy board (Exzellenzstrategie 2026–2033)

The first wooden board (roadmap 9.1, build variant of 9.5): 25 places on 300 × 600 mm, engraved
on the xTool P2S (CO2, working area 600 × 305 mm) in one piece. Built from
`public/puzzles/exzellenzstrategie-2027-brett.tsp.json` (list
`docs/data/curated/exzellenzstrategie-2027-brett.txt`; legend, start nail and export defaults in
`exzellenzstrategie-2027-brett.board.json`).

Build variant: **12 mm birch plywood** (HORNBACH "Fixmaß Multiplexplatte Birke BB/WG"
1200 × 600 × 12 mm, cut by the store into four pieces of about 298 × 600 mm), engraved by the
laser, nail holes **drilled by hand** at engraved pits. Nails: **1.6 × 20 mm wire nails with
flat heads**; string: polyester, about 1 mm.

## Files

| file                                                | use                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `local/boards/exzellenzstrategie-2027-logo-bed.svg` | **the laser file** with the Ruhr Innovation Lab logo, turned by 90° for the P2S bed     |
| `exzellenzstrategie-2027-bed.svg`                   | the same without the logo (text label "Ruhr Innovation Lab"), for tests and as fallback |
| `exzellenzstrategie-2027.svg`                       | the board upright (300 × 600 mm), for viewing                                           |
| `exzellenzstrategie-2027-template-A4.pdf`           | print template 1:1 on A4 tiles (boards built without a laser)                           |
| `exzellenzstrategie-2027-solution.pdf`              | solution sheet: tour, lengths, string calibration (not for players)                     |
| `exzellenzstrategie-2027-report.md`                 | figures: gaps, start nail, robustness, the tour and the runner-up                       |

The logo versions live in the git-ignored folder `local/boards/` (logo usage rights; see
"Re-exporting" below). They are the same board plus the logo next to the Ruhr Innovation Lab
nail and in the legend.

## Layers in xTool Creative Space

The SVG holds one colour per operation; set each colour's operation and power in Creative
Space:

| colour       | layer                              | on? | what                                                                                    |
| ------------ | ---------------------------------- | --- | --------------------------------------------------------------------------------------- |
| black fill   | engrave                            | on  | title, labels, rings, legend, logo, scale numbers and target mark                       |
| magenta fill | pit                                | on  | a 1 mm dot at each nail: engrave **deeper** (more power or 2–3 passes) as a drill guide |
| blue         | score                              | on  | inner borders, neighbouring countries, scale ticks                                      |
| green        | outline                            | on  | Germany's outline (score with more power)                                               |
| red / orange | cut (holes) / edge (board outline) | –   | not in this file: the board is pre-cut and the holes are drilled                        |

Order: engrave, pit, score, outline. The 6 mm variant below adds red (holes) and orange (board
outline) for cutting.

## The puzzle

- 25 places: the 15 Universities of Excellence and alliances from 2027 (14 places, each with an
  engraved ring; Rhein-Main-Universitäten and Ruhr Innovation Lab as one nail between their
  cities) and the further sites of Clusters of Excellence with at least two clusters, plus all
  further cluster sites in North Rhine-Westphalia. Left out (one cluster each): Bayreuth,
  Braunschweig, Erlangen, Halle (Saale), Konstanz, Leipzig, Lübeck, Regensburg, Ulm.
- With 1.6 mm nails and 1 mm string: string gap between the shortest and the second-shortest
  round trip **5.61 mm** (exact), at the scale also **5.61 mm**; start nail **Hannover**. The
  Ruhr Innovation Lab as start nail reads below the 5 mm target at the scale (its scale only
  fits turned away from the usual direction), so the planner chose Hannover.
- Robust: for r_eff from 1.0 to 2.0 mm (nail radius plus half the string) the optimum stays the
  same and the gap is 5.47–5.95 mm, also at the scale.
- The runner-up differs only near Aachen and Köln (Düsseldorf → Köln → Aachen → Bonn instead of
  Düsseldorf → Aachen → Köln → Bonn).

## Building

Try everything on **one of the four pieces as a test board** first.

1. **Tape**: cover the surface with masking tape (or laser transfer tape) against smoke stains;
   peel it off after lasering.
2. **Placing**: the pieces are 1–2 mm narrower than 300 mm. Keep the file at 300 × 600 mm and
   centre it on the piece with the P2S camera (equal margins left and right; the map keeps
   15 mm from the edge, so a millimetre less on each side does not matter). If you measure the
   exact size, the board can be exported for it.
3. **Lasering**: engrave (black), pits (magenta, deeper), score (blue), outline (green). Test the
   power on an offcut first; the pits should be clearly deeper than the engraving.
4. **Drilling**: at each pit, pre-drill with a **1.2 mm drill about 9 mm deep** (a piece of tape
   on the drill as depth mark; a drill stand if available; straight up). The pit centres the
   drill; do not drill through the 12 mm.
5. **Sanding and oiling**: remove the tape, sand lightly, oil and let it dry (before the nails,
   so the oil does not collect around them).
6. **Nails**: drive the 1.6 × 20 mm nails into the holes until **about 11 mm protrude**. Use a
   gauge so all are equally high: an M12 or M14 hex nut (10–13 mm high depending on the
   standard: measure it) or a wooden block of 11 mm next to the nail; hammer until the head is level with it. Nails straight up.
7. **String**: polyester, about 1 mm, low stretch. Measure nails and string and re-export with
   the measured values (below); the gap changes by tenths of a millimetre at most.
8. **Calibrating** (solution sheet, "Faden kalibrieren"): tie a loose loop around the start nail
   (Hannover, the nail with the scale), wind the tour in the order of the solution sheet, back
   to the start nail, once around it and straight along the scale. Mark the string at the
   target mark 0 (a knot or a bead) and cut it there.
9. **Checking the scale**: wind the shortest tour again in the other direction: the end reaches
   0 again. Wind the runner-up (swap Aachen and Köln): the end must stop about 5.6 mm before 0,
   outside the scored frame around 0. If the optimum misses 0 by more than 1–2 mm, the string
   stretches or the nails lean.

## Alternative: 6 mm plywood with laser-cut holes

A CO2 laser cannot cut clean 1.2–1.6 mm holes through 12 mm, but through 6 mm it can: export
with `--holes cut --edge --hole <diameter>`; the export then also writes a strip of test holes
(0.6 mm below the nail diameter up to it) to find the press fit first. Red cuts the holes,
orange the board outline. 6 mm holds the nails less well; a backing board helps.

## München ×2 (2026-10-17)

München has two Universities of Excellence (LMU, TUM), so its label reads "München ×2" and the
14 rings stand for the 15 Universities of Excellence and alliances (roadmap 9.13). The nails
did not move: re-exported with the same gap, 5.61 mm exact and at the scale, start nail
Hannover; the label fits at the same position.

## Re-exporting (measured nails, string, logo)

Without the logo (committed):

```bash
npx tsx cli/export-board.ts --puzzle public/puzzles/exzellenzstrategie-2027-brett.tsp.json --out docs/boards/exzellenzstrategie-2027 --name exzellenzstrategie-2027 --bed 600x305 --nail 1.6 --string 1
```

With the Ruhr Innovation Lab logo (from the git-ignored `local/`, never committed):

```bash
npx tsx cli/export-board.ts --puzzle public/puzzles/exzellenzstrategie-2027-brett.tsp.json --out local/boards --name exzellenzstrategie-2027-logo --bed 600x305 --nail 1.6 --string 1 --logo "Ruhr Innovation Lab=local/ruhr-innovation-lab.svg" --legend-logo local/ruhr-innovation-lab.svg
```

Replace `--nail` and `--string` with the measured values. The board's defaults (drill pits, no
outline cut) come from the puzzle file; `--holes` and `--edge`/`--no-edge` override them. The
logo must be an SVG with filled shapes (e.g. potrace output); next to its nail it replaces the
label if it fits at 20 mm width or more, in the legend it is up to 110 × 75 mm. The app's
export panel can load the same SVG files ("Logos für das Brett"); they stay in the browser
session only.

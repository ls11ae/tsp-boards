# World board "Rund um die Welt" (roadmap 9.15)

40 world cities on 600 × 300 mm (Equal Earth, landscape), engraved on the xTool P2S (CO2,
working area 600 × 305 mm) in one piece. A round trip around the world cannot close on a flat
board, so **the flight across the Pacific is given**: the string runs from **Los Angeles**
(start nail, the string is tied there) through all other places to **Sydney** (end nail with
the scale); the dashed line Sydney → Los Angeles leaves the map at both edges and closes the
round trip. Built from `public/puzzles/welt-pazifik-brett.tsp.json` (list
`docs/data/curated/welt-pazifik.txt`, export defaults in `welt-pazifik-brett.board.json`); the
same puzzle is in the app as a digital puzzle on the globe (`#p/welt-pazifik`), the board
version is `#p/welt-pazifik-brett`.

Build variant as the Excellence board (`docs/boards/exzellenzstrategie-2027/README.md`): one
of the **12 mm birch plywood** pieces (about 298 × 600 mm), engraved, nail holes **drilled by
hand** at engraved pits; nails **2.0 × 20 mm**, polyester string about **1 mm**.

## Files

| file                           | use                                                           |
| ------------------------------ | ------------------------------------------------------------- |
| `welt-pazifik.svg`             | **the laser file**, 600 × 300 mm, as it lies on the bed       |
| `welt-pazifik-template-A4.pdf` | print template 1:1 on A4 tiles (boards built without a laser) |
| `welt-pazifik-solution.pdf`    | solution sheet: path, lengths, calibration (not for players)  |
| `welt-pazifik-report.md`       | figures: gaps, scale, robustness, the path and the runner-up  |

Layers as on the Excellence board: black engrave (title, labels, "Start", "Ziel", scale
numbers), magenta pits (engrave deeper, drill guides), blue score (inner lines, the dashed
Pacific leg, the rings at the start and end nail, scale ticks), green outline (coasts, more
power). No red or orange: the piece is pre-cut and the holes are drilled.

## The puzzle

- 40 cities on all continents, chosen by the search (`cli/world-board.ts`) among the 250 cities
  with the most Wikipedia editions, for label space, recognizability and the gap; details in
  `docs/experiments/world-board-2026-10-17.md`.
- With 2.0 mm nails and 1 mm string (r_eff 1.5 mm): string gap between the shortest and the
  second-shortest path **7.34 mm** (exact); **at the scale at Sydney also 7.34 mm** (exact).
- Robust: for r_eff from 1.0 to 2.0 mm the shortest path stays the same; the gap is 5.58–7.66
  mm, at the scale the same.
- The same order on the globe: the shortest path by great circles (the digital puzzle, 66,732
  km) visits the cities in the same order; there the runner-up is 109 km longer (0.16 %).
- The runner-up swaps the Balkans and Central Europe (Paris → Rom → Tirana → Budapest → Berlin …
  Kyjiw → Istanbul instead of Paris → Berlin … Kyjiw → Budapest → Rom → Tirana → Istanbul).

## Building

As the Excellence board (tape, placing, lasering, drilling 1.5 mm about 9 mm deep with the
Wolfcraft chuck, sanding and oiling, nails with the M14 nut as height gauge), except:

1. **Placing**: the pieces are 1–2 mm narrower than 300 mm. Keep the file at 600 × 300 mm and
   centre it on the piece (equal margins top and bottom; the title keeps 12 mm from the edge).
2. **Calibrating** (solution sheet, "Faden kalibrieren"): cut at least 1.4 m of string, **tie it
   to the start nail Los Angeles**, wind the path in the order of the solution sheet (Los
   Angeles → Denver → Chicago → … → Jakarta → Sydney), **once around the end nail Sydney** and
   straight along the scale. Mark the string at the target mark 0 (a knot or a bead) and cut it
   there. The string from the knot to 0 is about 1,214 mm.
3. **Checking the scale**: wind the runner-up (above; the report has the full order): its end
   must stop about 7.3 mm before 0, outside the scored frame around 0. A path has one direction
   only, so there is no second calibration direction. If the shortest path misses 0 by more than
   1–2 mm, the string stretches or the nails lean.
4. **Playing**: the string stays tied at Los Angeles; players wind it through all places and
   end at Sydney, around the nail and along the scale. The dashed flight back is not wound.

## Re-exporting (measured nails and string)

```bash
npx tsx cli/export-board.ts --puzzle public/puzzles/welt-pazifik-brett.tsp.json --out docs/boards/welt-pazifik --name welt-pazifik --bed 600x305 --nail 2 --string 1
```

Replace `--nail` and `--string` with the measured values. The drill pits and the missing outline
cut come from the puzzle file; `--holes` and `--edge`/`--no-edge` override them.

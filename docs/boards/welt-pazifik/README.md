# World board "Rund um die Welt" (roadmap 9.15)

40 world cities on 600 × 300 mm (Equal Earth, landscape), engraved on the xTool P2S (CO2,
working area 600 × 305 mm) in one piece. A round trip around the world cannot close on a flat
board, so **the flight across the Pacific is given**: the string runs from **Los Angeles**
(start nail, the string is tied there) through all other places to **Sydney** (end nail with
the scale); the dashed line Sydney → Los Angeles leaves the map at both edges and closes the
round trip; a legend line at the bottom left says so ("Gestrichelt: der Rückflug über den
Pazifik ist vorgegeben", with a scored dashed line). Built from
`public/puzzles/welt-pazifik-brett.tsp.json` (list `docs/data/curated/welt-pazifik.txt`, export
defaults and legend in `welt-pazifik-brett.board.json`); the same puzzle is in the app as a
digital puzzle on the globe (`#p/welt-pazifik`), the board version is `#p/welt-pazifik-brett`.

Build variant as the Excellence board (`docs/boards/exzellenzstrategie-2027/README.md`): one
of the **12 mm birch plywood** pieces (about 298 × 600 mm), engraved, nail holes **drilled by
hand** at engraved pits; nails **2.0 × 20 mm** (measured 2026-10-18), polyester string about
**1 mm** (measured value follows; re-export then, below).

Cities since 2026-10-18 (roadmap 9.17, Kevin's review): London, Kairo, Lagos and Johannesburg
are on the board, so Africa has four cities; London replaces Paris and Kairo replaces Jerusalem
(5.4 mm and 6.4 mm apart on the board, below the 10 mm minimum), and Krasnodar, Tirana and Mekka
are gone. The first version (7.34 mm) is in the git history.

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
  with the most Wikipedia editions (plus the pinned London, Kairo, Lagos and Johannesburg), for
  label space, recognizability and the gap; details in
  `docs/experiments/world-board-2026-10-17.md`.
- With 2.0 mm nails and 1 mm string (r_eff 1.5 mm): string gap between the shortest and the
  second-shortest path **7.50 mm** (exact); **at the scale at Sydney also 7.50 mm** (exact).
- Robust: for r_eff from 1.0 to 2.0 mm the shortest path stays the same; the gap is 7.34–7.66
  mm, at the scale the same.
- The same order on the globe: the shortest path by great circles (the digital puzzle, 70,851
  km) visits the cities in the same order; there the runner-up is 109 km longer (0.15 %).
- The runner-up swaps Bangkok and Ho-Chi-Minh-Stadt (… Hongkong → Ho-Chi-Minh-Stadt → Bangkok →
  Singapur … instead of … Hongkong → Bangkok → Ho-Chi-Minh-Stadt → Singapur …), on the board and
  on the globe.

## Building

As the Excellence board (tape, placing, lasering, drilling 1.5 mm about 9 mm deep with the
Wolfcraft chuck, sanding and oiling, nails with the M14 nut as height gauge), except:

1. **Placing**: the pieces are 1–2 mm narrower than 300 mm. Keep the file at 600 × 300 mm and
   centre it on the piece (equal margins top and bottom; the title keeps 12 mm from the edge).
2. **Calibrating** (solution sheet, "Faden kalibrieren"): cut at least 1.45 m of string, **tie
   it to the start nail Los Angeles**, wind the path in the order of the solution sheet (Los
   Angeles → Mexiko-Stadt → Chicago → … → Jakarta → Sydney), **once around the end nail Sydney**
   and straight along the scale. Mark the string at the target mark 0 (a knot or a bead) and cut
   it there. The string from the knot to 0 is about 1,263 mm.
3. **Checking the scale**: wind the runner-up (Bangkok and Ho-Chi-Minh-Stadt swapped, above):
   its end must stop about 7.5 mm before 0, outside the scored frame around 0. A path has one direction
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

# Test board of the incremental puzzle ("Schritt für Schritt")

The first wooden board of the incremental puzzle (roadmap Phase 10): 12 numbered nails on
300 × 300 mm; players find the shortest round trip through nails 1–3, then 1–4, and so on up
to 1–12, and check each answer at the measuring track around the edge. The prototype
dimensions of the thesis' boards are still unknown, so this test board uses Kevin's build of
the Excellence board (`docs/boards/exzellenzstrategie-2027/README.md`): **12 mm birch
plywood** (half of one of the 298 × 600 mm pieces), engraved on the xTool P2S, nail holes
**drilled by hand** at engraved pits, **2.0 × 20 mm** wire nails (1.6 mm nails are not
available; changed 2026-10-17, roadmap 9.14), polyester string about **1 mm**.

## Files

| file                                      | use                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `tsp-incremental-12-test.svg`             | **the laser file** (300 × 300 mm, fits the P2S bed as it is)                     |
| `tsp-incremental-12-test-template-A4.pdf` | print template 1:1 on A4 tiles (a board without a laser)                         |
| `tsp-incremental-12-test-solution.pdf`    | solution sheet: optimum per instance, gaps, string calibration (not for players) |
| `tsp-incremental-12-test-report.md`       | figures per instance and the robustness over r_eff                               |
| `tsp-incremental-12-test.json`            | points, tours and marks (input for checks and the app)                           |

## Layers in xTool Creative Space

| colour       | layer   | on? | what                                                                                                  |
| ------------ | ------- | --- | ----------------------------------------------------------------------------------------------------- |
| black fill   | engrave | on  | nail numbers, track marks with their numbers, the line of text                                        |
| magenta fill | pit     | on  | a 1 mm dot at each nail and at the four corner pegs of the track: engrave **deeper** as a drill guide |
| blue         | score   | on  | the measuring track (first leg from nail 1 and the edges between the corner pegs), mark ticks         |

No red or orange layers: the piece is cut to size and the holes are drilled.

## The puzzle

- 12 nails, all 10 instances 1–3 … 1–12 with a unique shortest round trip; the gap to the
  second-shortest is at least **19.0 mm** of string, and at least **14.9 mm as read at the
  track** (exact, with 2.0 mm nails and 1 mm string, r_eff 1.5 mm). Seed 32, chosen on
  2026-10-18 (roadmap 9.20) as the board with the largest smallest gap at the track among 40
  seeds (38 of them reach 10 mm; `docs/experiments/incremental-gap-2026-10-18.md`); the first
  test board (seed 2) had 6.5 mm and is in the git history.
- Every new nail changes the round trip beyond inserting it (from 1–5 on), and later nails
  keep clear of the earlier round trips, so the earlier answers do not give away the next.

## Robustness: measure nails and string first

With other nails or string (r_eff from 1.0 to 2.0 mm) all optima stay the same and every gap
at the track stays at least 13.6 mm (the report marks r_eff 2.0 mm because 1–10 then falls
below the 14 mm target the board was generated with; 13.6 mm is still clear). But the
**marks** are placed for r_eff 1.5 mm. After calibrating the string on the full round trip, the
other string ends move away from their marks by up to 2.0 mm at r_eff 1.25 or 1.75 mm and
4.0 mm at 1.0 or 2.0 mm (see the report). That is more than on the map board, which reads only
one gap.

**The board must be re-exported with the measured string thickness (and nail diameter) before
lasering, with the same seed (32)**, since its marks depend on them (below); with measured
values the ends land within a millimetre of their marks. Nails were measured on 2026-10-18:
2.0 mm, as exported; the string's thickness follows.

## Building

As for the Excellence board, steps 1–6 (tape, placing with the camera, lasering, drilling a
1.5 mm hole about 9 mm deep at every pit with the Wolfcraft quick-release chuck 0.5–6.5 mm in
the drill, sanding and oiling, nails with about 11 mm protruding, set with the M14 nut, DIN 934,
11 mm high). The four corner pegs of the track get nails as well.

Then calibrate (solution sheet, "Faden kalibrieren"): tie a loose loop around nail 1, wind the
shortest round trip through all 12 nails in the order given there, back around nail 1 to the
next corner and clockwise around the corner pegs along the track; mark the string at mark
"12" (a knot or a bead) and cut it. Check two or three instances with the solution sheet: the
string end of the optimum must reach the field of its mark, and the runner-up must stop at
least the gap before it.

## Re-exporting with measured nails and string

```bash
npx tsx cli/incremental.ts --n 12 --seed 32 --gap 14 --max-checks 1000 --board 300x300 --margin 35 --min-dist 25 --nail 2 --string 1 --holes pit --no-edge --out docs/boards/incremental-test/tsp-incremental-12-test.json --export docs/boards/incremental-test --name tsp-incremental-12-test
```

Replace `--nail` and `--string` with the measured values. If the generator no longer finds
the board with seed 32 and `--gap 14` (the conditions are checked again for the new r_eff), try
`--gap 12` with the same seed, or seed 8 or 9 (14.7 and 14.1 mm at r_eff 1.5 mm); then
`npx tsx cli/print.ts` updates the building guide. For laser-cut holes in 6 mm plywood use `--holes cut` and leave out `--no-edge`.

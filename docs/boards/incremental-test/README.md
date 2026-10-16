# Test board of the incremental puzzle ("Schritt für Schritt")

The first wooden board of the incremental puzzle (roadmap Phase 10): 12 numbered nails on
300 × 300 mm; players find the shortest round trip through nails 1–3, then 1–4, and so on up
to 1–12, and check each answer at the measuring track around the edge. The prototype
dimensions of the thesis' boards are still unknown, so this test board uses Kevin's build of
the Excellence board (`docs/boards/exzellenzstrategie-2027/README.md`): **12 mm birch
plywood** (half of one of the 298 × 600 mm pieces), engraved on the xTool P2S, nail holes
**drilled by hand** at engraved pits, **1.6 × 20 mm** wire nails, polyester string about
**1 mm**.

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
  second-shortest is at least 7.4 mm of string, and at least 6.6 mm as read at the track
  (exact, with 1.6 mm nails and 1 mm string, r_eff 1.3 mm). Generated with seed 2 (seeds 1, 3
  and 4 also work, with 5.0–5.7 mm at the track).
- Every new nail changes the round trip beyond inserting it (from 1–5 on), and later nails
  keep clear of the earlier round trips, so the earlier answers do not give away the next.

## Robustness: measure nails and string first

With other nails or string (r_eff from 1.0 to 2.0 mm) all optima stay the same and every gap
at the track stays at least 6.2 mm. But the **marks** are placed for r_eff 1.3 mm. After
calibrating the string on the full round trip, the other string ends move away from their
marks by up to 0.6 mm if r_eff is off by 0.05 mm, 2.4 mm at 1.5 mm and 3.5 mm at 1.0 mm (see
the report). That is more than on the map board, which reads only one gap. So **measure the
nails and the string and re-export before lasering** (below); with measured values the ends
land within a millimetre of their marks.

## Building

As for the Excellence board, steps 1–6 (tape, placing with the camera, lasering, drilling a
1.2 mm hole about 9 mm deep at every pit, sanding and oiling, nails with about 11 mm
protruding, set with a gauge). The four corner pegs of the track get nails as well.

Then calibrate (solution sheet, "Faden kalibrieren"): tie a loose loop around nail 1, wind the
shortest round trip through all 12 nails in the order given there, back around nail 1 to the
next corner and clockwise around the corner pegs along the track; mark the string at mark
"12" (a knot or a bead) and cut it. Check two or three instances with the solution sheet: the
string end of the optimum must reach the field of its mark, and the runner-up must stop at
least the gap before it.

## Re-exporting with measured nails and string

```bash
npx tsx cli/incremental.ts --n 12 --seed 2 --board 300x300 --margin 35 --min-dist 25 --nail 1.6 --string 1 --holes pit --no-edge --out docs/boards/incremental-test/tsp-incremental-12-test.json --export docs/boards/incremental-test --name tsp-incremental-12-test
```

Replace `--nail` and `--string` with the measured values. If the generator no longer finds
the board with seed 2 (the conditions are checked again for the new r_eff), try `--seed 1`,
`3` or `4`. For laser-cut holes in 6 mm plywood use `--holes cut` and leave out `--no-edge`.

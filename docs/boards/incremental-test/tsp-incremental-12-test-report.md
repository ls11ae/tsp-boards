# Incremental board tsp-incremental-12-test

Generated 2026-10-17 by `cli/incremental.ts`: 12 nails, seed 2, board 300 × 300 mm (margin 35), nails 2 mm, string 1 mm (r_eff 1.50 mm), minimum distance 25 mm, target gap 5 mm, mark spacing 10 mm, holes: pit, no outline cut.

| nails | optimum (from nail 1) | string (mm) | string gap (mm) | gap at the track (mm) |
| --- | --- | --- | --- | --- |
| 1–3 | 1 → 2 → 3 | 459.39 | – | – |
| 1–4 | 1 → 2 → 4 → 3 | 611.28 | 47.77 | 46.86 |
| 1–5 | 1 → 2 → 3 → 4 → 5 | 759.16 | 10.86 | 8.93 |
| 1–6 | 1 → 3 → 4 → 6 → 2 → 5 | 780.55 | 13.04 | 11.16 |
| 1–7 | 1 → 2 → 3 → 4 → 6 → 7 → 5 | 801.19 | 7.44 | 6.48 |
| 1–8 | 1 → 2 → 7 → 6 → 3 → 4 → 8 → 5 | 830.14 | 21.27 | 20.30 |
| 1–9 | 1 → 2 → 7 → 9 → 5 → 8 → 4 → 6 → 3 | 859.14 | 11.92 | 11.02 |
| 1–10 | 1 → 2 → 7 → 6 → 3 → 4 → 8 → 5 → 9 → 10 | 880.63 | 11.31 | 10.82 |
| 1–11 | 1 → 2 → 10 → 9 → 7 → 6 → 3 → 4 → 8 → 5 → 11 | 906.06 | 14.16 | 12.92 |
| 1–12 | 1 → 11 → 5 → 9 → 10 → 2 → 7 → 8 → 4 → 6 → 3 → 12 | 1004.19 | 12.17 | 10.26 |

## Robustness over r_eff (exact)

| r_eff (mm) | optima | smallest gap at the track (mm) | largest shift of a string end from its mark after calibration (mm) | violated |
| --- | --- | --- | --- | --- |
| 1.00 | same | 6.77 | 5.87 | – |
| 1.25 | same | 6.63 | 2.93 | – |
| 1.50 | same | 6.48 | 0.00 | – |
| 1.75 | same | 6.33 | 2.93 | – |
| 2.00 | same | 6.18 | 5.86 | – |

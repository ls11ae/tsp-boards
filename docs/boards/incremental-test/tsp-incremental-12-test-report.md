# Incremental board tsp-incremental-12-test

Generated 2026-10-18 by `cli/incremental.ts`: 12 nails, seed 32, board 300 × 300 mm (margin 35), nails 2 mm, string 1 mm (r_eff 1.50 mm), minimum distance 25 mm, target gap 14 mm, mark spacing 10 mm, holes: pit, no outline cut.

| nails | optimum (from nail 1) | string (mm) | string gap (mm) | gap at the track (mm) |
| --- | --- | --- | --- | --- |
| 1–3 | 1 → 2 → 3 | 408.19 | – | – |
| 1–4 | 1 → 3 → 2 → 4 | 587.17 | 49.24 | 45.62 |
| 1–5 | 1 → 2 → 3 → 5 → 4 | 762.89 | 24.24 | 23.65 |
| 1–6 | 1 → 4 → 5 → 2 → 3 → 6 | 819.84 | 18.99 | 15.19 |
| 1–7 | 1 → 6 → 3 → 5 → 4 → 2 → 7 | 846.37 | 20.44 | 18.35 |
| 1–8 | 1 → 6 → 7 → 2 → 3 → 5 → 4 → 8 | 872.72 | 19.38 | 15.78 |
| 1–9 | 1 → 6 → 3 → 5 → 2 → 7 → 9 → 4 → 8 | 895.19 | 25.31 | 21.11 |
| 1–10 | 1 → 6 → 7 → 2 → 3 → 5 → 10 → 9 → 4 → 8 | 921.76 | 19.10 | 14.90 |
| 1–11 | 1 → 6 → 3 → 5 → 11 → 4 → 8 → 9 → 10 → 2 → 7 | 957.62 | 21.63 | 20.13 |
| 1–12 | 1 → 6 → 3 → 2 → 7 → 12 → 9 → 10 → 5 → 11 → 4 → 8 | 979.96 | 20.24 | 16.63 |

## Robustness over r_eff (exact)

| r_eff (mm) | optima | smallest gap at the track (mm) | largest shift of a string end from its mark after calibration (mm) | violated |
| --- | --- | --- | --- | --- |
| 1.00 | same | 16.23 | 3.98 | – |
| 1.25 | same | 15.56 | 1.99 | – |
| 1.50 | same | 14.90 | 0.00 | – |
| 1.75 | same | 14.23 | 1.99 | – |
| 2.00 | same | 13.56 | 3.98 | k=10: measured-gap |

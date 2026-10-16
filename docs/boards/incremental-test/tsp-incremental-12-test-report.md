# Incremental board tsp-incremental-12-test

Generated 2026-10-16 by `cli/incremental.ts`: 12 nails, seed 2, board 300 × 300 mm (margin 35), nails 1.6 mm, string 1 mm (r_eff 1.30 mm), minimum distance 25 mm, target gap 5 mm, mark spacing 10 mm, holes: pit, no outline cut.

| nails | optimum (from nail 1) | string (mm) | string gap (mm) | gap at the track (mm) |
| --- | --- | --- | --- | --- |
| 1–3 | 1 → 2 → 3 | 458.13 | – | – |
| 1–4 | 1 → 2 → 4 → 3 | 610.02 | 47.33 | 46.54 |
| 1–5 | 1 → 2 → 3 → 4 → 5 | 757.40 | 10.79 | 9.12 |
| 1–6 | 1 → 3 → 4 → 6 → 2 → 5 | 778.61 | 12.97 | 11.34 |
| 1–7 | 1 → 2 → 3 → 4 → 6 → 7 → 5 | 798.91 | 7.43 | 6.60 |
| 1–8 | 1 → 2 → 7 → 6 → 3 → 4 → 8 → 5 | 828.04 | 20.72 | 19.88 |
| 1–9 | 1 → 2 → 7 → 9 → 5 → 8 → 4 → 6 → 3 | 856.51 | 11.69 | 10.90 |
| 1–10 | 1 → 2 → 7 → 6 → 3 → 4 → 8 → 5 → 9 → 10 | 877.88 | 10.96 | 10.54 |
| 1–11 | 1 → 2 → 10 → 9 → 7 → 6 → 3 → 4 → 8 → 5 → 11 | 903.35 | 13.47 | 12.39 |
| 1–12 | 1 → 11 → 5 → 9 → 10 → 2 → 7 → 8 → 4 → 6 → 3 → 12 | 1000.88 | 12.42 | 10.76 |

## Robustness over r_eff (exact)

| r_eff (mm) | optima | smallest gap at the track (mm) | largest shift of a string end from its mark after calibration (mm) | violated |
| --- | --- | --- | --- | --- |
| 1.00 | same | 6.77 | 3.52 | – |
| 1.25 | same | 6.63 | 0.59 | – |
| 1.50 | same | 6.48 | 2.35 | – |
| 1.75 | same | 6.33 | 5.28 | – |
| 2.00 | same | 6.18 | 8.21 | – |

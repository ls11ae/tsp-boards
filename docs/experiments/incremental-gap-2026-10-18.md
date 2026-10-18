# Incremental test board with a larger gap (2026-10-18, roadmap 9.20)

The first test board (seed 2) had the first board the generator found above the 5 mm target:
6.48 mm at the track. This survey looks for the largest smallest gap at the track instead.

## Setup

`cli/incremental-gap.ts`: the generator of the board (`src/core/incremental/generate.ts`) with
the thesis' conditions as before (mark spacing 10 mm, every new nail changes the round trip
beyond inserting it from 5 nails on, later nails keep 4 mm clear of earlier round trips and of
the string's first leg), board 300 × 300 mm, margin 35 mm, at least 25 mm between nails, nails
2.0 mm and string 1 mm (r_eff 1.5 mm), a budget of 1000 exact checks per run. For every seed
the target gap (string gap and gap at the track for every instance) goes down from 18, 16, 14,
12, 10 to 8 mm, and the first board found counts; its smallest gap may exceed the target.

```
npx tsx cli/incremental-gap.ts --n 12 --seeds 1-40 --targets 18,16,14,12,10,8
npx tsx cli/incremental-gap.ts --n 11 --seeds 1-20 --targets 18,16,14,12,10,8
npx tsx cli/incremental-gap.ts --n 10 --seeds 1-20 --targets 18,16,14,12,10,8
```

## Results

| nails | boards | at least 10 mm | at least 12 mm | at least 14 mm |
| --- | --- | --- | --- | --- |
| 12 | 40 | 38 | 27 | 3 |
| 11 | 20 | 19 | 14 | 3 |
| 10 | 20 | 19 | 16 | 4 |

No target above 14 mm was reached. The best boards (smallest gap over all instances, mm):

| nails | seed | target | at the track | string gap | exact checks | time (s) |
| --- | --- | --- | --- | --- | --- | --- |
| 12 | 32 | 14 | 14.90 | 18.99 | 142 | 5.0 |
| 12 | 8 | 12 | 14.65 | 16.33 | 181 | 5.7 |
| 12 | 9 | 12 | 14.07 | 14.51 | 324 | 17.5 |
| 12 | 4 | 12 | 13.96 | 12.59 | 501 | 15.2 |
| 12 | 27 | 12 | 13.95 | 14.39 | 602 | 18.1 |
| 11 | 4 | 12 | 14.92 | 13.55 | 483 | 12.2 |
| 11 | 8 | 12 | 14.65 | 16.33 | 179 | 5.4 |
| 11 | 20 | 14 | 14.12 | 14.19 | 244 | 10.1 |
| 11 | 12 | 10 | 13.90 | 12.95 | 149 | 5.2 |
| 11 | 14 | 12 | 13.71 | 16.02 | 446 | 10.8 |
| 10 | 20 | 14 | 15.69 | 17.26 | 210 | 4.5 |
| 10 | 8 | 12 | 15.48 | 17.78 | 173 | 4.0 |
| 10 | 2 | 12 | 14.58 | 14.24 | 104 | 4.0 |
| 10 | 18 | 12 | 14.35 | 16.91 | 103 | 2.6 |
| 10 | 4 | 12 | 13.96 | 12.59 | 481 | 11.7 |

With fewer nails the best gap grows only a little (15.69 mm with 10 nails against 14.90 mm
with 12), so the board keeps 12 nails.

## Choice

12 nails, seed 32 (target 14 mm): smallest gap at the track **14.90 mm** (1–10), smallest
string gap 18.99 mm (1–6), every instance's optimum unique. Robust over r_eff (exact): the same
optima for 1.0–2.0 mm, the smallest gap at the track 13.56–16.23 mm, and after calibrating on
the full round trip the other string ends move at most 2.0 mm from their marks at r_eff 1.25 or
1.75 mm and 4.0 mm at 1.0 or 2.0 mm (seed 2: 2.9 and 5.9 mm). Files in
`docs/boards/incremental-test/`.

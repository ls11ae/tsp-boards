# World board with the Pacific leg given (2026-10-17, roadmap 9.15)

A world board on 600 × 300 mm (Equal Earth, landscape, margin 12 mm): the string runs from Los
Angeles (start nail, tied) through all places to Sydney (end nail with the scale); the leg
Sydney → Los Angeles across the Pacific is given (a round trip with that edge fixed, see the
decision log). The board measures on the flat map (string model); the same places as a digital
puzzle are judged on the sphere (great circles, r_eff 0), with the same given leg.

## Setup

`cli/world-board.ts`: a search (simulated annealing as in the app, `src/core/search`) over the
250 cities of `wo.json` with the most Wikipedia editions (`fame`), Los Angeles and Sydney
pinned and the leg between them fixed; nails 2.0 mm, string 1 mm (r_eff 1.5 mm), at least 10 mm
between nails, 4 mm labels as a constraint (label space), target gap 5 mm. For the six best
archive entries of each run: the exact string optimum and runner-up on the flat board (turn-cost
MIP with the fixed edge) and the exact great-circle optimum and runner-up (Euclidean model on
the sphere with the fixed edge); "same order" means that the board's path and the globe's path
visit the places in the same order.

```
npx tsx cli/world-board.ts --n 30,35,40,45 --seeds 1,2,3 --iterations 1500 --top 6 --pool-top 250
npx tsx cli/world-board.ts --n 38,40,42 --seeds 4,5,6 --iterations 2500 --top 6 --pool-top 250 --weights 1,0.5,2
```

A search run takes 30–110 s (n = 30–45), the exact checks of its six candidates 2–4 minutes
(Node, HiGHS WASM).

## Results

| sweep | weights (gap, difficulty, recognizability) | iterations | n | seeds | candidates | same order | string gaps (mm) | best same-order candidate (string gap, globe gap, recognizability) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1,0.5,1 | 1500 | 30 | 1, 2, 3 | 18 | 9 | 0.27–10.38 | 6.10 mm, 109 km, 0.610 |
| 1 | 1,0.5,1 | 1500 | 35 | 1, 2, 3 | 18 | 4 | 4.22–8.59 | 6.42 mm, 137 km, 0.551 |
| 1 | 1,0.5,1 | 1500 | 40 | 1, 2, 3 | 18 | 15 | 5.92–10.15 | 7.50 mm, 109 km, 0.530 |
| 1 | 1,0.5,1 | 1500 | 45 | 1, 2, 3 | 18 | 9 | 2.41–9.65 | 7.08 mm, 109 km, 0.504 |
| 2 | 1,0.5,2 | 2500 | 38 | 4, 5, 6 | 18 | 12 | 6.43–10.60 | 7.26 mm, 42 km, 0.567 |
| 2 | 1,0.5,2 | 2500 | 40 | 4, 5, 6 | 18 | 12 | 6.32–7.50 | 6.44 mm, 42 km, 0.561 |
| 2 | 1,0.5,2 | 2500 | 42 | 4, 5, 6 | 18 | 9 | 3.81–8.74 | 6.70 mm, 109 km, 0.534 |

- **Gaps:** string gaps of 6–10 mm are common for n = 30–45 with the Pacific leg fixed (the
  quick check before the search found 6.4 mm for 35 and 7.9 mm for 40 cities). With the scale
  at the end nail the gap at the scale equalled the string gap in both boards exported (a
  trial with the best candidate of sweep 1, 7.50 mm, and the chosen one, 7.34 mm).
- **Board and globe:** 70 of 126 candidates have the same order on the board and on the globe.
  Where they differ, it is a local swap (for example Rio de Janeiro and Brasília). The globe's
  gap is small in absolute terms (4–481 km on paths of about 67,000 km; 109 km is the most
  frequent value, 30 of the 70 same-order candidates).
- **Recognizability** (mean fame score of the places, 0–1) falls with n: about 0.61 for 30,
  0.53–0.56 for 40, 0.50–0.53 for 42–45; a higher weight for it (sweep 2) gains about 0.03.

## Choice

Sweep 2, n = 40, seed 6: **string gap 7.34 mm** (exact, also 7.34 mm at the scale at Sydney),
the **same order on the globe**, globe gap **109 km** (0.16 % of 66,732 km), recognizability
0.556. Preferred over the slightly better known 38- and 40-city candidates with 42 km on the
globe (a larger gap on both) and over 7.50 mm at recognizability 0.530 (Kingston, Valparaíso,
Astana). Robust over r_eff (exact): the same optimum for 1.0–2.0 mm, gaps 5.58–7.66 mm.

Path (board and globe): Los Angeles → Denver → Chicago → New York City → Mexiko-Stadt → Bogotá
→ Lima → Santiago → Buenos Aires → Rio de Janeiro → Brasília → Lissabon → Barcelona → Paris →
Berlin → Stockholm → Sankt Petersburg → Moskau → Kyjiw → Budapest → Rom → Tirana → Istanbul →
Krasnodar → Baku → Jerusalem → Mekka → Nairobi → Mumbai → Dhaka → Peking → Seoul → Tokio →
Shanghai → Hongkong → Bangkok → Ho-Chi-Minh-Stadt → Singapur → Jakarta → Sydney.

The string runner-up swaps the Balkans and Central Europe (Paris → Rom → Tirana → Budapest →
Berlin …, Kyjiw → Istanbul), 7.34 mm longer. Files: `docs/data/curated/welt-pazifik.txt`,
`public/puzzles/welt-pazifik-brett.tsp.json` (board) and `welt-pazifik.tsp.json` (digital),
`docs/boards/welt-pazifik/`.

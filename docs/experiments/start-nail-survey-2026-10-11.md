# Start nail and measured gap (Germany)

`npx tsx cli/start-nail-survey.ts --n 40 --seeds 3 --top 3` (board 600 × 800 mm, labels 8 mm,
title 150 × 30 mm, footer). "bound": cheap lower bound of the best-ranked start nail;
"measured gap": exact turn-cost MIP with the start-nail costs. Plan time includes the MIP.

n = 40, target 5 mm, r_eff 1.5 mm, 1000 iterations, top 3 per seed.

| seed | # | string gap | bound (best nail) | measured gap | θ at start | start nails fitting | plan time |
| - | - | - | - | - | - | - | - |
| 1 | 1 | 10.11 mm | 8.84 mm | 10.11 mm (exact) | 1.72 rad | 37 | 2745 ms |
| 1 | 2 | 10.29 mm | 8.44 mm | 9.77 mm (exact) | 2.25 rad | 35 | 2505 ms |
| 1 | 3 | 14.13 mm | 12.24 mm | 14.13 mm (exact) | 2.28 rad | 34 | 2852 ms |
| 2 | 1 | 15.36 mm | 14.32 mm | 15.08 mm (exact) | 2.59 rad | 32 | 3597 ms |
| 2 | 2 | 10.25 mm | 9.43 mm | 10.25 mm (exact) | 2.70 rad | 37 | 2937 ms |
| 2 | 3 | 15.82 mm | 14.67 mm | 15.82 mm (exact) | 2.57 rad | 36 | 4623 ms |
| 3 | 1 | 7.94 mm | 6.90 mm | 7.94 mm (exact) | 2.66 rad | 33 | 1238 ms |
| 3 | 2 | 13.16 mm | 11.77 mm | 13.16 mm (exact) | 2.21 rad | 32 | 2875 ms |
| 3 | 3 | 16.27 mm | 14.88 mm | 18.24 mm (exact) | 2.21 rad | 33 | 9927 ms |

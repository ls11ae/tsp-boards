# Label feasibility of random city subsets (Germany)

`npx tsx cli/label-survey.ts --samples 200` and `--board 400x533x20 --scale 0.67`.
Font Fira Sans Condensed Medium, nail diameter 2 mm, 8 positions per label, search node limit.

Board 600 × 800 mm, margin 30 mm, 200 random subsets per row.

| n | min. distance | label size | complete | median unplaced | max nodes |
| - | - | - | - | - | - |
| 40 | 25 mm | 8 mm | 100 % | 0 | 40 |
| 40 | 25 mm | 10 mm | 100 % | 0 | 40 |
| 40 | 25 mm | 12 mm | 99 % | 0 | 41 |
| 40 | 25 mm | 14 mm | 96 % | 0 | 44 |
| 50 | 22 mm | 8 mm | 100 % | 0 | 50 |
| 50 | 22 mm | 10 mm | 100 % | 0 | 51 |
| 50 | 22 mm | 12 mm | 97 % | 0 | 51 |
| 50 | 22 mm | 14 mm | 90 % | 0 | 54 |
| 60 | 20 mm | 8 mm | 100 % | 0 | 60 |
| 60 | 20 mm | 10 mm | 98 % | 0 | 61 |
| 60 | 20 mm | 12 mm | 91 % | 0 | 62 |
| 60 | 20 mm | 14 mm | 71 % | 0 | 2000 |

Board 400 × 533 mm, margin 20 mm, 200 random subsets per row.

| n | min. distance | label size | complete | median unplaced | max nodes |
| - | - | - | - | - | - |
| 40 | 17 mm | 8 mm | 98 % | 0 | 41 |
| 40 | 17 mm | 10 mm | 87 % | 0 | 43 |
| 40 | 17 mm | 12 mm | 55 % | 0 | 1865 |
| 40 | 17 mm | 14 mm | 20 % | 3 | 99 |
| 50 | 15 mm | 8 mm | 94 % | 0 | 52 |
| 50 | 15 mm | 10 mm | 62 % | 0 | 56 |
| 50 | 15 mm | 12 mm | 20 % | 3 | 144 |
| 50 | 15 mm | 14 mm | 3 % | 6 | 1516 |
| 60 | 13 mm | 8 mm | 82 % | 0 | 69 |
| 60 | 13 mm | 10 mm | 32 % | 2 | 152 |
| 60 | 13 mm | 12 mm | 3 % | 6 | 2000 |
| 60 | 13 mm | 14 mm | 0 % | 11 | 10 |

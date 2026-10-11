# Incremental puzzle: achievable sizes and gaps

`npx tsx cli/incremental-survey.ts --seeds 3`. "smallest gap at the track": the weakest instance
of the sequence, exact (turn-cost MIP), including the end wrap at nail 1 and both directions.

Board 400 × 400 mm, margin 45 mm, min. distance 30 mm, mark spacing 10 mm, budget 400 exact checks, 3 seeds per row.

| N | target gap | found | median time | median checks | smallest gap at the track (median) |
| - | - | - | - | - | - |
| 8 | 5 mm | 3/3 | 0.5 s | 28 | 8.5 mm |
| 8 | 10 mm | 3/3 | 1.3 s | 92 | 14.9 mm |
| 8 | 15 mm | 1/3 | 5.6 s | 400 | 15.6 mm |
| 12 | 5 mm | 3/3 | 0.7 s | 32 | 6.0 mm |
| 12 | 10 mm | 3/3 | 1.7 s | 96 | 10.5 mm |
| 12 | 15 mm | 1/3 | 5.7 s | 400 | 15.3 mm |
| 16 | 5 mm | 3/3 | 2.0 s | 41 | 5.9 mm |
| 16 | 10 mm | 3/3 | 6.9 s | 103 | 11.0 mm |
| 16 | 15 mm | 0/3 | 5.9 s | 400 | – |

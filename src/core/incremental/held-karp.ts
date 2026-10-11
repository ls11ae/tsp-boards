// Held–Karp dynamic programming that keeps the two best values per state, for small point
// sets (n ≤ 16): the two shortest Hamiltonian paths between every pair of points, and the two
// shortest tours. Each kept value belongs to a different path, so the second value is the
// exact runner-up (ties count: a different path of equal length gives a gap of 0).

/** Symmetric n × n cost matrix, row-major. */
export type CostMatrix = Float64Array;

export const MAX_HELD_KARP = 16;

export interface PathTable {
  readonly n: number;
  /** best[i * n + j]: shortest Hamiltonian path from i to j through all points. */
  readonly best: Float64Array;
  /** Second shortest such path (Infinity if there is none). */
  readonly second: Float64Array;
}

/** Two best paths from `start` through every subset, ending at each point (full set only). */
function pathsFrom(
  n: number,
  start: number,
  cost: CostMatrix,
  b1: Float64Array,
  b2: Float64Array,
): void {
  const full = (1 << n) - 1;
  b1.fill(Infinity);
  b2.fill(Infinity);
  b1[(1 << start) * n + start] = 0;
  for (let mask = 1; mask <= full; mask++) {
    if (!(mask & (1 << start))) continue;
    for (let v = 0; v < n; v++) {
      const at = mask * n + v;
      const v1 = b1[at]!;
      if (v1 === Infinity) continue;
      const v2 = b2[at]!;
      for (let u = 0; u < n; u++) {
        if (mask & (1 << u)) continue;
        const to = (mask | (1 << u)) * n + u;
        const c = cost[v * n + u]!;
        // Insert v1 + c and v2 + c (v2 ≥ v1) into the two best values at the target state.
        const a = v1 + c;
        const t1 = b1[to]!;
        if (a < t1) {
          b1[to] = a;
          b2[to] = Math.min(t1, v2 + c);
        } else if (a < b2[to]!) {
          b2[to] = a;
        }
      }
    }
  }
}

/** Two shortest Hamiltonian paths between all pairs of n points (O(n³ 2ⁿ)). */
export function hamiltonianPaths(n: number, cost: CostMatrix): PathTable {
  if (n > MAX_HELD_KARP) throw new Error(`Held–Karp is limited to n ≤ ${MAX_HELD_KARP}`);
  const best = new Float64Array(n * n).fill(Infinity);
  const second = new Float64Array(n * n).fill(Infinity);
  if (n === 1) {
    best[0] = 0;
    return { n, best, second };
  }
  const size = (1 << n) * n;
  const b1 = new Float64Array(size);
  const b2 = new Float64Array(size);
  const full = (1 << n) - 1;
  for (let s = 0; s < n; s++) {
    pathsFrom(n, s, cost, b1, b2);
    for (let v = 0; v < n; v++) {
      if (v === s) continue;
      best[s * n + v] = b1[full * n + v]!;
      second[s * n + v] = b2[full * n + v]!;
    }
  }
  return { n, best, second };
}

export interface TwoTours {
  readonly best: number;
  /** Second shortest tour (Infinity if the tour is unique, n ≤ 3). */
  readonly second: number;
}

/** Lengths of the two shortest tours through n ≥ 3 points. */
export function twoShortestTours(n: number, cost: CostMatrix): TwoTours {
  if (n < 3) throw new Error('a tour needs n ≥ 3');
  if (n > MAX_HELD_KARP) throw new Error(`Held–Karp is limited to n ≤ ${MAX_HELD_KARP}`);
  const size = (1 << n) * n;
  const b1 = new Float64Array(size);
  const b2 = new Float64Array(size);
  pathsFrom(n, 0, cost, b1, b2);
  const full = (1 << n) - 1;
  // Every tour appears twice (once per direction, ending at either neighbour of point 0), and a
  // runner-up is never worse than second in its bucket: the third smallest value is the
  // second-best tour.
  const values: number[] = [];
  for (let v = 1; v < n; v++) {
    values.push(b1[full * n + v]! + cost[v * n]!, b2[full * n + v]! + cost[v * n]!);
  }
  values.sort((a, b) => a - b);
  return { best: values[0]!, second: values[2] ?? Infinity };
}

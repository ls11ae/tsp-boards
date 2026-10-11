// Where can the next point go? For a base set I and a new point p, every tour of I ∪ {p} is p
// between two points i, j plus a Hamiltonian path from i to j through I, so
//   L1(p) = min_{i<j} W1_ij + |p i| + |p j|
// and the runner-up is the better of the second smallest such value and the second-best path of
// the minimising pair (thesis: "Voronoi diagram with weighted detour distance"; here a plain
// evaluation per candidate instead of Vorosketch). Euclidean lengths in mm.

import { distance, type Point } from '../geometry';
import { hamiltonianPaths, type PathTable } from './held-karp';

export interface Insertion {
  /** Optimal tour length of I ∪ {p}. */
  readonly best: number;
  /** Second-best tour length of I ∪ {p}. */
  readonly second: number;
  /** Neighbours of p in the optimal tour (indices into I). */
  readonly i: number;
  readonly j: number;
  /**
   * The optimum is the previous optimum with p inserted between two consecutive points (the
   * player need not rethink anything).
   */
  readonly unchanged: boolean;
}

export function distanceMatrix(points: readonly Point[]): Float64Array {
  const n = points.length;
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) d[i * n + j] = distance(points[i]!, points[j]!);
  return d;
}

export class InsertionField {
  readonly base: readonly Point[];
  readonly paths: PathTable;
  /** Optimal tour of the base set as a cycle of indices, and its length. */
  private readonly optEdges: Set<number>;
  private readonly optLength: number;

  /**
   * @param base the points so far (2 ≤ n ≤ 15)
   * @param opt their optimal tour (indices) and its length, for the "unchanged" test
   */
  constructor(
    base: readonly Point[],
    opt: { readonly tour: readonly number[]; readonly length: number },
  ) {
    this.base = base;
    const n = base.length;
    this.paths = hamiltonianPaths(n, distanceMatrix(base));
    this.optEdges = new Set();
    for (let k = 0; k < opt.tour.length; k++) {
      const a = opt.tour[k]!;
      const b = opt.tour[(k + 1) % opt.tour.length]!;
      this.optEdges.add(a < b ? a * n + b : b * n + a);
    }
    this.optLength = opt.length;
  }

  evaluate(p: Point): Insertion {
    const { base } = this;
    const n = base.length;
    const { best: w1, second: w2 } = this.paths;
    const dp = base.map((q) => distance(p, q));
    let best = Infinity;
    let runnerUp = Infinity;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const value = w1[i * n + j]! + dp[i]! + dp[j]!;
        if (value < best) {
          runnerUp = best;
          best = value;
          bi = i;
          bj = j;
        } else if (value < runnerUp) {
          runnerUp = value;
        }
      }
    }
    const second = Math.min(runnerUp, w2[bi * n + bj]! + dp[bi]! + dp[bj]!);
    const unchanged =
      this.optEdges.has(bi * n + bj) &&
      Math.abs(w1[bi * n + bj]! + distance(base[bi]!, base[bj]!) - this.optLength) < 1e-6;
    return { best, second, i: bi, j: bj, unchanged };
  }
}

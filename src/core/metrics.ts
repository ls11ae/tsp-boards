// Descriptive metrics of a puzzle instance and its optimal tour.

import { convexHull, distance, turningAngle, type Point } from './geometry';
import { UM_PER_MM, type Instance } from './instance';
import { edgeKey, euclideanLength, stringLength, type Tour } from './tsp/tour';

export interface TourMetrics {
  readonly n: number;
  /** String length S of the tour, mm. */
  readonly stringMm: number;
  /** Euclidean length L of the tour, mm. */
  readonly euclideanMm: number;
  /** Total turning Σ|θ| in radians (≥ 2π for every closed tour). */
  readonly turnSumRad: number;
  /** Thesis metric C: fraction of points not on the convex hull. */
  readonly interiorFraction: number;
  /** Thesis metric D: tour edges not in the nearest-neighbour graph, per node. */
  readonly nonNearestEdges: number;
  /** Smallest distance between two points, mm. */
  readonly minDistanceMm: number;
}

export function tourMetrics(inst: Instance, tour: Tour): TourMetrics {
  const n = inst.n;
  const points: Point[] = inst.pointsMm();
  let turnSum = 0;
  for (let i = 0; i < n; i++) {
    turnSum += turningAngle(
      points[tour[(i + n - 1) % n]!]!,
      points[tour[i]!]!,
      points[tour[(i + 1) % n]!]!,
    );
  }
  // Nearest-neighbour graph; ties within 1 µm (rounding) all count as nearest.
  const nng = new Set<number>();
  let minDist = Infinity;
  for (let i = 0; i < n; i++) {
    let nearest = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      nearest = Math.min(nearest, inst.dist(i, j));
      if (j > i) minDist = Math.min(minDist, distance(points[i]!, points[j]!));
    }
    for (let j = 0; j < n; j++)
      if (j !== i && inst.dist(i, j) <= nearest + 1) nng.add(edgeKey(i, j, n));
  }
  let nonNearest = 0;
  for (let i = 0; i < n; i++) if (!nng.has(edgeKey(tour[i]!, tour[(i + 1) % n]!, n))) nonNearest++;
  return {
    n,
    stringMm: stringLength(inst, tour) / UM_PER_MM,
    euclideanMm: euclideanLength(inst, tour) / UM_PER_MM,
    turnSumRad: turnSum,
    interiorFraction: (n - convexHull(points).length) / n,
    nonNearestEdges: nonNearest / n,
    minDistanceMm: minDist,
  };
}

/**
 * Recognisability of a selection: mean over cities of log(pop / min) / log(max / min), where
 * min and max are taken over the region's city pool. 1 = all as large as the largest city.
 */
export function recognizability(
  populations: readonly number[],
  poolMin: number,
  poolMax: number,
): number {
  if (populations.length === 0 || poolMax <= poolMin) return 0;
  const scale = Math.log(poolMax / poolMin);
  let sum = 0;
  for (const p of populations) sum += Math.max(0, Math.min(1, Math.log(p / poolMin) / scale));
  return sum / populations.length;
}

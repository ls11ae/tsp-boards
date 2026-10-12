// Analysis of a fixed instance (a given list of places, no search): pairs closer than the
// minimum distance, and which single removal would raise the gap most (for instances whose gap
// is below the board target).

import { distance, type Point } from './geometry';
import { Instance } from './instance';
import { Rng } from './rng';
import { optimalAndSecond, type ExactModelKind, type MipBackend } from './tsp/exact';
import { iteratedLocalSearch } from './tsp/ils';
import { alternativeTour, scanSecondBest } from './tsp/second-best';

export interface ClosePair {
  readonly a: number;
  readonly b: number;
  readonly distanceMm: number;
}

/** Pairs of points closer than `minDistanceMm`, closest first. */
export function closePairs(points: readonly Point[], minDistanceMm: number): ClosePair[] {
  const out: ClosePair[] = [];
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const d = distance(points[a]!, points[b]!);
      if (d < minDistanceMm) out.push({ a, b, distanceMm: d });
    }
  }
  return out.sort((x, y) => x.distanceMm - y.distanceMm);
}

export interface RemovalSuggestion {
  /** Index of the point to remove. */
  readonly point: number;
  /** Gap of the instance without it, µm (exact if `exact`, else the local bound). */
  readonly gapUm: number;
  readonly exact: boolean;
}

/**
 * For every point, the gap of the instance without it: estimated with a heuristic tour and the
 * local gap scan, then the `top` best estimates are solved exactly (if a backend is given).
 * `model` 'euclidean' uses r_eff = 0 (digital puzzles).
 */
export function removalSuggestions(
  points: readonly Point[],
  rEffMm: number,
  model: ExactModelKind,
  backend: MipBackend | null,
  top = 3,
): RemovalSuggestion[] {
  if (points.length < 5) return [];
  const r = model === 'euclidean' ? 0 : rEffMm;
  const estimates = points.map((_, point) => {
    const inst = new Instance(
      points.filter((__, i) => i !== point),
      r,
    );
    const tour = iteratedLocalSearch(inst, new Rng(point + 1), { kicks: 30, neighbors: 10 }).tour;
    const scan = scanSecondBest(inst, tour, { doubleBridge: true });
    return { point, inst, scan };
  });
  estimates.sort((a, b) => b.scan.gap - a.scan.gap || a.point - b.point);
  return estimates
    .slice(0, top)
    .map(({ point, inst, scan }) => {
      if (!backend) return { point, gapUm: scan.gap, exact: false };
      const exact = optimalAndSecond(backend, inst, model, {
        optimal: scan.tour,
        second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined,
      });
      if (exact.optimal.status !== 'optimal' || !exact.second || exact.second.status !== 'optimal')
        return { point, gapUm: scan.gap, exact: false };
      return { point, gapUm: exact.second.cost - exact.optimal.cost, exact: true };
    })
    .sort((a, b) => b.gapUm - a.gapUm);
}

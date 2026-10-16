// Analysis of a fixed instance (a given list of places, no search): pairs closer than the
// minimum distance, and which removal or combination of two places raises the gap most (for
// instances whose gap is below the board target).

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

/** A change of a fixed instance: leave a point out, or combine two points into one. */
export type ChangeSuggestion =
  | { readonly kind: 'remove'; readonly point: number }
  | { readonly kind: 'combine'; readonly a: number; readonly b: number };

export type RatedChange = ChangeSuggestion & {
  /** Gap after the change, µm (exact if `exact`, else the local bound). */
  readonly gapUm: number;
  readonly exact: boolean;
  /** Pairs still closer than the minimum distance after the change. */
  readonly closePairs: number;
};

export interface ChangeOptions {
  readonly minDistanceMm: number;
  /** Solved exactly (if a backend is given): the best estimates. */
  readonly top?: number;
  /** Shortest pairs tried as combinations besides all pairs below the minimum distance. */
  readonly pairs?: number;
  /**
   * Points that are neither left out nor combined (roadmap 9.6: e.g. the places pinned in the
   * designer, where the suggestions would otherwise be purely geometric).
   */
  readonly keep?: readonly number[];
}

/** The points after a change; a combined pair becomes its midpoint (a composite place). */
export function applyChange(points: readonly Point[], change: ChangeSuggestion): Point[] {
  if (change.kind === 'remove') return points.filter((_, i) => i !== change.point);
  const a = points[change.a]!;
  const b = points[change.b]!;
  const rest = points.filter((_, i) => i !== change.a && i !== change.b);
  return [...rest, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]];
}

/**
 * Which change raises the gap most: every single removal, and combining each pair closer than
 * the minimum distance and each of the shortest pairs. All are estimated with a heuristic
 * tour and the local gap scan; the `top` best estimates are solved exactly. `model`
 * 'euclidean' uses r_eff = 0 (digital puzzles), 'string' the board's string length.
 */
export function changeSuggestions(
  points: readonly Point[],
  rEffMm: number,
  model: ExactModelKind,
  backend: MipBackend | null,
  options: ChangeOptions,
): RatedChange[] {
  if (points.length < 5) return [];
  const r = model === 'euclidean' ? 0 : rEffMm;
  const top = options.top ?? 3;
  const close = closePairs(points, options.minDistanceMm);
  const keep = new Set(options.keep ?? []);
  const free = (p: { a: number; b: number }) => !keep.has(p.a) && !keep.has(p.b);
  const pairs: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++)
      pairs.push({ a, b, d: distance(points[a]!, points[b]!) });
  pairs.sort((x, y) => x.d - y.d);
  const combine = new Map<string, ChangeSuggestion>();
  for (const p of [...close.filter(free), ...pairs.filter(free).slice(0, options.pairs ?? 8)])
    combine.set(`${p.a}-${p.b}`, { kind: 'combine', a: p.a, b: p.b });
  const changes: ChangeSuggestion[] = [
    ...points.flatMap((_, point): ChangeSuggestion[] =>
      keep.has(point) ? [] : [{ kind: 'remove', point }],
    ),
    ...combine.values(),
  ];
  const estimates = changes.map((change, k) => {
    const changed = applyChange(points, change);
    const inst = new Instance(changed, r);
    const tour = iteratedLocalSearch(inst, new Rng(k + 1), { kicks: 30, neighbors: 10 }).tour;
    const scan = scanSecondBest(inst, tour, { doubleBridge: true });
    return { change, inst, scan, closePairs: closePairs(changed, options.minDistanceMm).length };
  });
  estimates.sort((x, y) => y.scan.gap - x.scan.gap);
  return estimates
    .slice(0, top)
    .map(({ change, inst, scan, closePairs: left }): RatedChange => {
      const estimate = { ...change, gapUm: scan.gap, exact: false, closePairs: left };
      if (!backend) return estimate;
      const exact = optimalAndSecond(backend, inst, model, {
        optimal: scan.tour,
        second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined,
      });
      if (exact.optimal.status !== 'optimal' || !exact.second || exact.second.status !== 'optimal')
        return estimate;
      return { ...estimate, gapUm: exact.second.cost - exact.optimal.cost, exact: true };
    })
    .sort((x, y) => y.gapUm - x.gapUm);
}

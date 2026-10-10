// Difficulty as the excess of simple strategies over the optimum (by string length).
// Fail rates are not informative: at n = 40 nearest neighbour almost never finds the optimum.

import type { Instance } from './instance';
import type { Rng } from './rng';
import { greedyEdge, hullInsertion, nearestNeighbor, randomTour } from './tsp/construct';
import { TourState } from './tsp/kopt';
import { localSearch } from './tsp/local-search';
import { stringLength } from './tsp/tour';

export interface Difficulty {
  /** Relative excess (0.05 = 5 % longer than the optimum). */
  readonly nearestNeighborBest: number;
  readonly nearestNeighborMean: number;
  readonly greedyEdge: number;
  readonly hullInsertion: number;
  /** Combined score in [0, 1]: mean of best NN, greedy and hull insertion, / reference. */
  readonly score: number;
}

/**
 * Excess at which the difficulty score saturates. For random German 40-city subsets the
 * combined excess is 5–20 % (median 11 %), so typical instances score about 0.45.
 */
export const DIFFICULTY_REFERENCE = 0.25;

export function difficulty(inst: Instance, optimalLength: number): Difficulty {
  const excess = (tour: number[]) => stringLength(inst, tour) / optimalLength - 1;
  let best = Infinity;
  let sum = 0;
  for (let s = 0; s < inst.n; s++) {
    const e = excess(nearestNeighbor(inst, s));
    best = Math.min(best, e);
    sum += e;
  }
  const greedy = excess(greedyEdge(inst));
  const hull = excess(hullInsertion(inst));
  const combined = (best + greedy + hull) / 3;
  return {
    nearestNeighborBest: best,
    nearestNeighborMean: sum / inst.n,
    greedyEdge: greedy,
    hullInsertion: hull,
    score: Math.min(1, Math.max(0, combined / DIFFICULTY_REFERENCE)),
  };
}

/** Share of 2-opt/Or-opt runs from random starts that reach the optimal string length. */
export function localSearchSuccess(
  inst: Instance,
  optimalLength: number,
  lists: Int32Array[],
  rng: Rng,
  runs = 20,
): number {
  let hits = 0;
  for (let r = 0; r < runs; r++) {
    const state = new TourState(randomTour(inst.n, rng));
    localSearch(inst, state, lists);
    if (stringLength(inst, state.order) === optimalLength) hits++;
  }
  return hits / runs;
}

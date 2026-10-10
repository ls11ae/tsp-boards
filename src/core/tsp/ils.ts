// Iterated local search: local search, then repeatedly a random double-bridge kick followed by
// local search, keeping the best tour. Deterministic for a given RNG.

import type { Instance } from '../instance';
import type { Rng } from '../rng';
import { hullInsertion } from './construct';
import { TourState } from './kopt';
import { localSearch, neighborLists } from './local-search';
import { stringLength, type Tour } from './tour';

export interface IlsOptions {
  readonly kicks: number;
  /** Size of the neighbour lists. */
  readonly neighbors: number;
}

export const DEFAULT_ILS: IlsOptions = { kicks: 150, neighbors: 10 };

/**
 * Double bridge: cuts the tour into non-empty segments A B C D and reconnects them as A D C B.
 * This changes all four junction edges (a non-sequential 4-opt move). Note: the often quoted
 * "A C B D" keeps the closing edge D→A and is only a 3-opt segment exchange.
 */
export function doubleBridge(tour: Tour, rng: Rng): number[] {
  const n = tour.length;
  if (n < 8) return [...tour];
  const cuts = new Set<number>();
  while (cuts.size < 3) cuts.add(1 + rng.int(n - 1));
  const [i, j, k] = [...cuts].sort((x, y) => x - y) as [number, number, number];
  return [...tour.slice(0, i), ...tour.slice(k), ...tour.slice(j, k), ...tour.slice(i, j)];
}

export interface IlsResult {
  readonly tour: number[];
  readonly length: number;
}

export function iteratedLocalSearch(
  inst: Instance,
  rng: Rng,
  options: IlsOptions = DEFAULT_ILS,
  start?: Tour,
  lists: Int32Array[] = neighborLists(inst, options.neighbors),
): IlsResult {
  const state = new TourState(start ?? hullInsertion(inst));
  localSearch(inst, state, lists);
  let best = state.tour();
  let bestLength = stringLength(inst, best);
  for (let kick = 0; kick < options.kicks; kick++) {
    state.set(doubleBridge(best, rng));
    localSearch(inst, state, lists);
    const length = stringLength(inst, state.order);
    if (length < bestLength) {
      best = state.tour();
      bestLength = length;
    }
  }
  return { tour: best, length: bestLength };
}

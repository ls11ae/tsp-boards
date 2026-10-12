// Tours to compare with the optimum on the board (roadmap 5.5): the runner-up and the tours of
// simple strategies, with the edges in which they differ.

import type { Instance } from './instance';
import { greedyEdge, hullInsertion, nearestNeighbor } from './tsp/construct';
import { edgeKey, stringLength, type Tour } from './tsp/tour';

export type HeuristicKind = 'nearest-neighbor' | 'greedy-edge' | 'hull-insertion';
export const HEURISTICS: readonly HeuristicKind[] = [
  'nearest-neighbor',
  'greedy-edge',
  'hull-insertion',
];

/** Tour of a simple strategy; nearest neighbour from its best start. */
export function heuristicTour(inst: Instance, kind: HeuristicKind): number[] {
  if (kind === 'greedy-edge') return greedyEdge(inst);
  if (kind === 'hull-insertion') return hullInsertion(inst);
  let best: number[] = nearestNeighbor(inst, 0);
  let length = stringLength(inst, best);
  for (let s = 1; s < inst.n; s++) {
    const tour = nearestNeighbor(inst, s);
    const l = stringLength(inst, tour);
    if (l < length) {
      best = tour;
      length = l;
    }
  }
  return best;
}

export type Edge = readonly [number, number];

/** Edges of `other` that are not in `base`, and edges of `base` that `other` does not use. */
export function edgeDifference(
  base: Tour,
  other: Tour,
  n: number,
): { readonly added: Edge[]; readonly removed: Edge[] } {
  const edges = (t: Tour) => t.map((v, i): Edge => [v, t[(i + 1) % t.length]!]);
  const keys = (t: Tour) => new Set(edges(t).map(([a, b]) => edgeKey(a, b, n)));
  const baseKeys = keys(base);
  const otherKeys = keys(other);
  return {
    added: edges(other).filter(([a, b]) => !baseKeys.has(edgeKey(a, b, n))),
    removed: edges(base).filter(([a, b]) => !otherKeys.has(edgeKey(a, b, n))),
  };
}

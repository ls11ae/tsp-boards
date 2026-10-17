// Tours to compare with the optimum on the board (roadmap 5.5): the runner-up and the tours of
// simple strategies, with the edges in which they differ.

import type { Instance } from './instance';
import { greedyEdge, hullInsertion, nearestNeighbor } from './tsp/construct';
import { edgeKey, hasFixedEdge, stringLength, type Tour } from './tsp/tour';

export type HeuristicKind = 'nearest-neighbor' | 'greedy-edge' | 'hull-insertion';
export const HEURISTICS: readonly HeuristicKind[] = [
  'nearest-neighbor',
  'greedy-edge',
  'hull-insertion',
];

/**
 * Tour of a simple strategy; nearest neighbour from its best start. With a given leg (an open
 * path, roadmap 9.15) the tour contains it.
 */
export function heuristicTour(inst: Instance, kind: HeuristicKind): number[] {
  if (kind === 'greedy-edge') return withFixedEdge(inst, greedyEdge(inst));
  if (kind === 'hull-insertion') return withFixedEdge(inst, hullInsertion(inst));
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
  return withFixedEdge(inst, best);
}

/**
 * The tour through the given leg: unchanged if it has it (the strategies take the leg's cost of
 * −10⁹ early, but an insertion can start from a hull on which both ends lie apart), else with
 * the end moved next to the start.
 */
function withFixedEdge(inst: Instance, tour: number[]): number[] {
  const f = inst.fixedEdge;
  if (!f || hasFixedEdge(inst, tour)) return tour;
  const rest = tour.filter((v) => v !== f[1]);
  const i = rest.indexOf(f[0]);
  const before = [...rest.slice(0, i), f[1], ...rest.slice(i)];
  const after = [...rest.slice(0, i + 1), f[1], ...rest.slice(i + 1)];
  return stringLength(inst, before) <= stringLength(inst, after) ? before : after;
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

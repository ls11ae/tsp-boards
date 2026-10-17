import { describe, expect, it } from 'vitest';
import { Instance } from './instance';
import { edgeDifference, heuristicTour, HEURISTICS } from './overlays';
import { randomPoints } from './test-utils';
import { hasFixedEdge, isTour, stringLength } from './tsp/tour';
import { nearestNeighbor } from './tsp/construct';

describe('overlays', () => {
  it('builds valid heuristic tours, nearest neighbour from its best start', () => {
    const inst = new Instance(randomPoints(25, 3), 1.5);
    for (const kind of HEURISTICS) expect(isTour(heuristicTour(inst, kind), 25)).toBe(true);
    const nn = stringLength(inst, heuristicTour(inst, 'nearest-neighbor'));
    for (let s = 0; s < 25; s++)
      expect(nn).toBeLessThanOrEqual(stringLength(inst, nearestNeighbor(inst, s)));
  });

  it('keep the given leg of an open path (roadmap 9.15)', () => {
    const points = randomPoints(25, 5);
    for (const edge of [
      [0, 1],
      [3, 17],
      [24, 9],
    ] as const) {
      const inst = new Instance(points, 1.5, null, edge);
      for (const kind of HEURISTICS) {
        const tour = heuristicTour(inst, kind);
        expect(isTour(tour, 25)).toBe(true);
        expect(hasFixedEdge(inst, tour)).toBe(true);
      }
    }
  });

  it('lists the edges in which two tours differ', () => {
    const d = edgeDifference([0, 1, 2, 3, 4], [0, 2, 1, 3, 4], 5);
    expect(d.added.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort()).toEqual([
      [0, 2],
      [1, 3],
    ]);
    expect(d.removed.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort()).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(edgeDifference([0, 1, 2, 3], [3, 2, 1, 0], 4)).toEqual({ added: [], removed: [] });
  });
});

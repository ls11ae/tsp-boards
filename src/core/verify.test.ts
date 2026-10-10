import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { difficulty } from './difficulty';
import { Instance } from './instance';
import { recognizability, tourMetrics } from './metrics';
import { Rng } from './rng';
import { randomPoints, regularPolygon } from './test-utils';
import { allTours } from './tsp/brute-force';
import type { MipBackend } from './tsp/exact';
import { iteratedLocalSearch } from './tsp/ils';
import { verifyCandidate } from './verify';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('metrics', () => {
  it('measures a regular polygon', () => {
    const inst = new Instance(regularPolygon(10, 100), 1);
    const tour = Array.from({ length: 10 }, (_, i) => i);
    const m = tourMetrics(inst, tour);
    expect(m.interiorFraction).toBe(0);
    expect(m.nonNearestEdges).toBe(0);
    expect(m.turnSumRad).toBeCloseTo(2 * Math.PI);
    expect(m.stringMm - m.euclideanMm).toBeCloseTo(2 * Math.PI, 1);
    expect(m.minDistanceMm).toBeCloseTo(2 * 100 * Math.sin(Math.PI / 10), 2);
  });

  it('scores recognisability on a log scale', () => {
    expect(recognizability([1000, 1_000_000], 1000, 1_000_000)).toBeCloseTo(0.5);
    expect(recognizability([31_623], 1000, 1_000_000)).toBeCloseTo(0.5, 2);
  });

  it('reports zero excess for a polygon (all strategies are optimal)', () => {
    const inst = new Instance(regularPolygon(12, 100), 1);
    const opt = iteratedLocalSearch(inst, new Rng(1)).length;
    const d = difficulty(inst, opt);
    expect(d.nearestNeighborBest).toBe(0);
    expect(d.hullInsertion).toBe(0);
    expect(d.score).toBeGreaterThanOrEqual(0);
  });
});

describe('verifyCandidate', () => {
  for (const mode of ['string-exact', 'euclid-exact-string-local'] as const) {
    it(`${mode}: matches brute force on small instances`, () => {
      for (let seed = 0; seed < 6; seed++) {
        const inst = new Instance(randomPoints(8, 900 + seed), 1.5);
        const ranked = allTours(inst);
        const heuristic = ranked[3]!.tour; // deliberately not optimal
        const v = verifyCandidate(backend, inst, heuristic, mode, { timeLimitSec: 30 });
        expect(v.status).toBe('optimal');
        expect(v.mode).toBe(mode);
        expect(v.heuristicOptimal).toBe(false);
        expect(v.string!.optimalLength).toBe(ranked[0]!.length);
        if (mode === 'string-exact')
          expect(v.string!.gap).toBe(ranked[1]!.length - ranked[0]!.length);
        else expect(v.string!.gap).toBeGreaterThanOrEqual(ranked[1]!.length - ranked[0]!.length);
        const eRanked = allTours(inst.euclidean());
        expect(v.euclidean!.gap).toBe(eRanked[1]!.length - eRanked[0]!.length);
      }
    });
  }
});

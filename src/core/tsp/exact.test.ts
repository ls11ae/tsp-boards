import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Instance } from '../instance';
import { Rng } from '../rng';
import { randomPoints } from '../test-utils';
import { allTours } from './brute-force';
import { optimalAndSecond, type MipBackend } from './exact';
import { iteratedLocalSearch } from './ils';
import { alternativeTour, scanSecondBest } from './second-best';
import { euclideanLength, hasFixedEdge, openPath, sameTour, stringLength } from './tour';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('exact solver against brute force', () => {
  for (const kind of ['euclidean', 'string'] as const) {
    it(`${kind} model: optimal and second-best cost (n = 5..9)`, () => {
      for (let seed = 0; seed < 12; seed++) {
        const n = 5 + (seed % 5);
        const inst = new Instance(randomPoints(n, 300 + seed), kind === 'string' ? 1.5 : 0);
        const ranked = allTours(inst);
        const result = optimalAndSecond(backend, inst, kind);
        expect(result.optimal.status).toBe('optimal');
        expect(result.optimal.cost).toBe(ranked[0]!.length);
        if (ranked[1]!.length > ranked[0]!.length) {
          expect(sameTour(result.optimal.tour!, ranked[0]!.tour, n)).toBe(true);
        }
        expect(result.second?.status).toBe('optimal');
        expect(result.second!.cost).toBe(ranked[1]!.length);
        expect(sameTour(result.second!.tour!, result.optimal.tour!, n)).toBe(false);
      }
    });
  }

  it('euclidean costs of the string model equal the Euclidean model when r_eff = 0', () => {
    const inst = new Instance(randomPoints(8, 77), 0);
    const e = optimalAndSecond(backend, inst, 'euclidean');
    const s = optimalAndSecond(backend, inst, 'string');
    expect(s.optimal.cost).toBe(e.optimal.cost);
    expect(s.second!.cost).toBe(e.second!.cost);
  });
});

describe('heuristics against the exact solver (n = 20–40)', () => {
  it('ILS finds the Euclidean optimum and the scan bounds the gap', () => {
    for (let seed = 0; seed < 6; seed++) {
      const n = 20 + 4 * seed;
      const inst = new Instance(randomPoints(n, 500 + seed), 0);
      const heuristic = iteratedLocalSearch(inst, new Rng(seed));
      const scan = scanSecondBest(inst, heuristic.tour, { doubleBridge: true });
      const exact = optimalAndSecond(backend, inst, 'euclidean', {
        optimal: scan.tour,
        second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined,
      });
      expect(exact.optimal.cost).toBe(euclideanLength(inst, scan.tour));
      expect(scan.gap).toBeGreaterThanOrEqual(exact.second!.cost - exact.optimal.cost);
    }
  }, 120_000);
});

describe('a given edge: open paths with fixed end points (roadmap 9.15)', () => {
  /** Legs and inner turns of the path start → … → end, on the same points without the edge. */
  const pathCost = (plain: Instance, path: readonly number[]) => {
    let sum = 0;
    for (let i = 0; i + 1 < path.length; i++) sum += plain.dist(path[i]!, path[i + 1]!);
    for (let i = 1; i + 1 < path.length; i++)
      sum += plain.turn(path[i - 1]!, path[i]!, path[i + 1]!);
    return sum;
  };

  for (const kind of ['euclidean', 'string'] as const) {
    it(`${kind} model: optimal and second-best open path (n = 5..9)`, () => {
      for (let seed = 0; seed < 10; seed++) {
        const n = 5 + (seed % 5);
        const points = randomPoints(n, 900 + seed);
        const r = kind === 'string' ? 1.5 : 0;
        const inst = new Instance(points, r, null, [0, n - 1]);
        const plain = new Instance(points, r);
        const ranked = allTours(inst).filter((t) => hasFixedEdge(inst, t.tour));
        // The length of a tour with the edge is its open path: legs and the inner turns.
        for (const t of ranked.slice(0, 3))
          expect(t.length).toBe(pathCost(plain, openPath(inst, t.tour)!));
        const result = optimalAndSecond(backend, inst, kind);
        expect(result.optimal.cost).toBe(ranked[0]!.length);
        expect(result.second!.cost).toBe(ranked[1]!.length);
        for (const t of [result.optimal.tour!, result.second!.tour!]) {
          expect(hasFixedEdge(inst, t)).toBe(true);
          expect(openPath(inst, t)![0]).toBe(0);
          expect(openPath(inst, t)!.at(-1)).toBe(n - 1);
        }
      }
    });
  }

  it('heuristics keep the edge and reach the optimum; the scan bounds the gap', () => {
    for (let seed = 0; seed < 4; seed++) {
      const n = 20 + 5 * seed;
      const inst = new Instance(randomPoints(n, 950 + seed), 1.5, null, [3, 11]);
      const heuristic = iteratedLocalSearch(inst, new Rng(seed));
      expect(hasFixedEdge(inst, heuristic.tour)).toBe(true);
      const scan = scanSecondBest(inst, heuristic.tour, { doubleBridge: false });
      expect(hasFixedEdge(inst, scan.tour)).toBe(true);
      const exact = optimalAndSecond(backend, inst, 'string', {
        optimal: scan.tour,
        second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined,
      });
      expect(exact.optimal.cost).toBe(stringLength(inst, scan.tour));
      expect(scan.gap).toBeGreaterThanOrEqual(exact.second!.cost - exact.optimal.cost);
      expect(hasFixedEdge(inst, exact.second!.tour!)).toBe(true);
    }
  }, 120_000);
});

import { describe, expect, it } from 'vitest';
import { Instance } from '../instance';
import { Rng } from '../rng';
import { randomPoints, regularPolygon } from '../test-utils';
import { allTours } from './brute-force';
import {
  cheapestInsertion,
  greedyEdge,
  hullInsertion,
  nearestNeighbor,
  randomTour,
} from './construct';
import { iteratedLocalSearch } from './ils';
import { TourState, applyMove, isIdentityMove, moveDelta, type KOptMove } from './kopt';
import { improveTour, neighborLists } from './local-search';
import { scanSecondBest } from './second-best';
import { isTour, sameTour, stringLength } from './tour';

describe('k-opt moves', () => {
  it('delta equals the recomputed change for random 2-opt and 3-opt moves', () => {
    const rng = new Rng(11);
    for (let trial = 0; trial < 300; trial++) {
      const n = 6 + rng.int(10);
      const inst = new Instance(randomPoints(n, trial), 0.5 + rng.float() * 2);
      const tour = randomTour(n, rng);
      const state = new TourState(tour);
      const cuts = new Set<number>();
      const k = 2 + rng.int(2);
      while (cuts.size < k) cuts.add(rng.int(n));
      const [i, j, l] = [...cuts].sort((x, y) => x - y);
      const t = (p: number) => tour[p % n]!;
      let move: KOptMove;
      if (k === 2) {
        if (j! - i! < 2 || (i === 0 && j === n - 1)) continue;
        move = {
          k: 2,
          rem: [t(i!), t(i! + 1), t(j!), t(j! + 1)],
          add: [t(i!), t(j!), t(i! + 1), t(j! + 1)],
        };
      } else {
        // A C' B: reverse C and move it before B.
        move = {
          k: 3,
          rem: [t(i!), t(i! + 1), t(j!), t(j! + 1), t(l!), t(l! + 1)],
          add: [t(i!), t(l!), t(j! + 1), t(i! + 1), t(j!), t(l! + 1)],
        };
      }
      const before = stringLength(inst, tour);
      const delta = moveDelta(inst, state, move);
      applyMove(state, move);
      const after = state.tour();
      expect(isTour(after, n)).toBe(true);
      expect(stringLength(inst, after) - before).toBe(delta);
    }
  });

  it('recognises identity moves by their edge sets', () => {
    expect(isIdentityMove({ k: 2, rem: [0, 1, 1, 2], add: [1, 2, 0, 1] })).toBe(true);
    expect(isIdentityMove({ k: 2, rem: [0, 1, 2, 3], add: [0, 2, 1, 3] })).toBe(false);
  });
});

describe('construction heuristics', () => {
  const inst = new Instance(randomPoints(30, 5), 1);

  it('produce valid tours', () => {
    for (let s = 0; s < 30; s++) expect(isTour(nearestNeighbor(inst, s), 30)).toBe(true);
    expect(isTour(greedyEdge(inst), 30)).toBe(true);
    expect(isTour(hullInsertion(inst), 30)).toBe(true);
    expect(isTour(cheapestInsertion(inst, [0, 1, 2, 3], 4), 5)).toBe(true);
  });

  it('hull insertion returns the hull for points in convex position', () => {
    const poly = new Instance(regularPolygon(12), 1);
    const tour = hullInsertion(poly);
    expect(
      sameTour(
        tour,
        Array.from({ length: 12 }, (_, i) => i),
        12,
      ),
    ).toBe(true);
  });
});

describe('local search and ILS', () => {
  it('find the brute-force optimum on small instances (string costs)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const inst = new Instance(randomPoints(9, 100 + seed), 1.5);
      const best = allTours(inst)[0]!;
      const result = iteratedLocalSearch(inst, new Rng(seed), { kicks: 30, neighbors: 8 });
      expect(result.length).toBe(best.length);
    }
  });

  it('never makes a tour worse', () => {
    const inst = new Instance(randomPoints(40, 9), 1);
    const lists = neighborLists(inst, 10);
    const rng = new Rng(2);
    for (let trial = 0; trial < 10; trial++) {
      const start = randomTour(40, rng);
      const improved = improveTour(inst, start, lists);
      expect(isTour(improved, 40)).toBe(true);
      expect(stringLength(inst, improved)).toBeLessThanOrEqual(stringLength(inst, start));
    }
  });
});

describe('second-best scan', () => {
  it('is an upper bound on the true gap and often tight (brute force, n ≤ 9)', () => {
    let tight = 0;
    let total = 0;
    for (const rEff of [0, 1.5]) {
      for (let seed = 0; seed < 25; seed++) {
        const inst = new Instance(randomPoints(9, 200 + seed), rEff);
        const ranked = allTours(inst);
        const scan = scanSecondBest(inst, ranked[0]!.tour, { doubleBridge: true });
        expect(scan.improvements).toBe(0);
        const trueGap = ranked[1]!.length - ranked[0]!.length;
        expect(scan.gap).toBeGreaterThanOrEqual(trueGap);
        total++;
        if (scan.gap === trueGap) tight++;
      }
    }
    expect(tight / total).toBeGreaterThan(0.8);
  });

  it('reports min(gap, cap) when capped', () => {
    const inst = new Instance(randomPoints(9, 31), 1.5);
    const opt = allTours(inst)[0]!.tour;
    const full = scanSecondBest(inst, opt, { doubleBridge: true }).gap;
    expect(full).toBeGreaterThan(2);
    const low = Math.floor(full / 2);
    expect(scanSecondBest(inst, opt, { doubleBridge: true, cap: low }).gap).toBe(low);
    expect(scanSecondBest(inst, opt, { doubleBridge: true, cap: low }).best).toBeNull();
    expect(scanSecondBest(inst, opt, { doubleBridge: true, cap: full + 1 }).gap).toBe(full);
  });

  it('improves a non-optimal tour before reporting the gap', () => {
    const inst = new Instance(randomPoints(9, 7), 1);
    const ranked = allTours(inst);
    const scan = scanSecondBest(inst, ranked[5]!.tour);
    expect(scan.improvements).toBeGreaterThan(0);
    expect(scan.length).toBeLessThan(ranked[5]!.length);
  });

  it('reports genuine ties as gap 0 but never an identical tour', () => {
    // 3 × 3 grid: several optimal tours of equal length.
    const gridPts = [0, 1, 2].flatMap((r) =>
      [0, 1, 2].map((c) => [100 + 50 * c, 100 + 50 * r] as const),
    );
    const gridInst = new Instance(gridPts, 0);
    const ranked = allTours(gridInst);
    expect(ranked[1]!.length).toBe(ranked[0]!.length);
    expect(scanSecondBest(gridInst, ranked[0]!.tour).gap).toBe(0);
    // Regular polygon: unique optimum, so the gap is positive.
    const poly = new Instance(regularPolygon(9), 1);
    const polyRanked = allTours(poly);
    const scan = scanSecondBest(poly, polyRanked[0]!.tour, { doubleBridge: true });
    expect(scan.gap).toBeGreaterThan(0);
    expect(scan.gap).toBe(polyRanked[1]!.length - polyRanked[0]!.length);
  });
});

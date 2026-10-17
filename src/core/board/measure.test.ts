import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Instance } from '../instance';
import { randomPoints } from '../test-utils';
import { allTours } from '../tsp/brute-force';
import { optimalAndSecond, type MipBackend } from '../tsp/exact';
import { hasFixedEdge, openPath, sameTour, stringLength } from '../tsp/tour';
import {
  calibrationTour,
  checkMeasurement,
  endWrapAngle,
  measuredGapBound,
  measuredLength,
  measurementInstance,
  neighbours,
  outwardBisector,
} from './measure';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('measured string length', () => {
  it('measures the end wrap against the scale direction', () => {
    expect(endWrapAngle([10, 0], [0, 0], [1, 0])).toBeCloseTo(0);
    expect(endWrapAngle([10, 0], [0, 0], [0, 1])).toBeCloseTo(Math.PI / 2);
    expect(endWrapAngle([10, 0], [20, 0], [1, 0])).toBeCloseTo(Math.PI);
  });

  it('points the bisector away from both neighbours', () => {
    const points = [
      [0, 0],
      [10, 10],
      [20, 0],
      [10, 30],
    ] as const;
    const u = outwardBisector(points, [0, 1, 2, 3], 1)!;
    expect(u[0]).toBeCloseTo(0);
    expect(u[1]).toBeCloseTo(1);
  });

  it('equals the minimum over both directions in the measurement instance', () => {
    const inst = new Instance(randomPoints(9, 11), 1.5);
    const tours = allTours(inst);
    const slot = 4;
    for (const { tour } of tours.slice(0, 50)) {
      const u = outwardBisector(inst.pointsMm(), tours[0]!.tour, slot)!;
      const m = measurementInstance(inst, slot, u);
      const forward = measuredLength(inst, tour, slot, u);
      const backward = measuredLength(inst, tour, slot, u, true);
      expect(stringLength(m, tour)).toBe(Math.min(forward, backward));
    }
  });

  it('gives the optimum the same length in both directions', () => {
    const inst = new Instance(randomPoints(9, 12), 1.5);
    const opt = allTours(inst)[0]!.tour;
    for (let slot = 0; slot < inst.n; slot++) {
      const u = outwardBisector(inst.pointsMm(), opt, slot);
      if (!u) continue;
      const forward = measuredLength(inst, opt, slot, u);
      const backward = measuredLength(inst, opt, slot, u, true);
      expect(Math.abs(forward - backward)).toBeLessThanOrEqual(1);
      // The end wrap replaces the turn at s: S − r·θ + r·(π − θ)/2.
      const [a, b] = neighbours(opt, slot);
      const theta = inst.turn(a, slot, b) / inst.rEffUm;
      expect(forward).toBeCloseTo(
        stringLength(inst, opt) - inst.turn(a, slot, b) + (inst.rEffUm * (Math.PI - theta)) / 2,
        -1,
      );
    }
  });
});

describe('exact measured gap against brute force', () => {
  it('finds the measured optimum and runner-up (n = 5..8), bounded by the cheap bound', () => {
    for (let seed = 0; seed < 12; seed++) {
      const n = 5 + (seed % 4);
      const inst = new Instance(randomPoints(n, 900 + seed, 300, 300), 2);
      const ranked = allTours(inst);
      const opt = ranked[0]!.tour;
      const stringGap = ranked[1]!.length - ranked[0]!.length;
      const slot = seed % n;
      const u = outwardBisector(inst.pointsMm(), opt, slot);
      if (!u) continue;
      const measured = ranked
        .map(({ tour }) => ({
          tour,
          m: Math.min(
            measuredLength(inst, tour, slot, u),
            measuredLength(inst, tour, slot, u, true),
          ),
        }))
        .sort((x, y) => x.m - y.m);
      const check = checkMeasurement(backend, inst, opt, slot, u, {}, { timeLimitSec: 60 });
      expect(check.status).toBe('optimal');
      expect(check.lengthUm).toBe(measured[0]!.m);
      expect(check.gapUm).toBe(measured[1]!.m - measured[0]!.m);
      const unique = measured[1]!.m > measured[0]!.m;
      if (unique) expect(check.sameOptimum).toBe(sameTour(measured[0]!.tour, opt, n));
      const bound = measuredGapBound(inst, opt, slot, u, stringGap);
      if (check.sameOptimum) expect(bound).toBeLessThanOrEqual(check.gapUm);
      if (bound > 0) expect(check.sameOptimum).toBe(true);
    }
  });

  it('keeps the string optimum on a convex instance with a sharp corner', () => {
    // A thin triangle-like polygon: the sharpest corner barely changes the gap.
    const points = [
      [0, 0],
      [200, 40],
      [400, 0],
      [300, 120],
      [200, 300],
      [100, 120],
    ] as const;
    const inst = new Instance(points, 1.5);
    const exact = optimalAndSecond(backend, inst, 'string');
    const opt = exact.optimal.tour!;
    const u = outwardBisector(inst.pointsMm(), opt, 4)!;
    const check = checkMeasurement(backend, inst, opt, 4, u, {}, { timeLimitSec: 60 });
    expect(check.sameOptimum).toBe(true);
    const stringGap = exact.second!.cost - exact.optimal.cost;
    expect(Math.abs(check.gapUm - stringGap)).toBeLessThan(1.5 * 1500 * Math.PI);
  });
});

describe('an open path measured at its end nail (roadmap 9.15)', () => {
  it('finds the measured optimum and runner-up (n = 5..8) and is bounded by the cheap bound', () => {
    for (let seed = 0; seed < 12; seed++) {
      const n = 5 + (seed % 4);
      const points = randomPoints(n, 1300 + seed, 300, 300);
      const [start, end] = [seed % n, (seed + 2) % n];
      const inst = new Instance(points, 1.5, null, [start, end]);
      const ranked = allTours(inst).filter((t) => hasFixedEdge(inst, t.tour));
      const opt = ranked[0]!.tour;
      // The scale leaves the end nail straight on from the last leg, turned by up to 60°.
      const path = openPath(inst, opt)!;
      const [a, b] = [points[path[n - 2]!]!, points[end]!];
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) + (((seed % 5) - 2) * Math.PI) / 6;
      const u = [Math.cos(angle), Math.sin(angle)] as const;
      // Measured by hand: legs and inner turns of the path plus the wrap at the end nail.
      const plain = new Instance(points, 1.5);
      const byHand = (tour: readonly number[]) => {
        const p = openPath(inst, tour)!;
        let sum = 0;
        for (let i = 0; i + 1 < n; i++) sum += plain.dist(p[i]!, p[i + 1]!);
        for (let i = 1; i + 1 < n; i++) sum += plain.turn(p[i - 1]!, p[i]!, p[i + 1]!);
        return sum + Math.round(1500 * endWrapAngle(points[end]!, points[p[n - 2]!]!, u));
      };
      const measured = ranked
        .map(({ tour }) => ({ tour, m: measuredLength(inst, tour, end, u) }))
        .sort((x, y) => x.m - y.m);
      for (const { tour, m } of measured.slice(0, 4)) expect(m).toBe(byHand(tour));
      const check = checkMeasurement(backend, inst, opt, end, u, {}, { timeLimitSec: 60 });
      expect(check.status).toBe('optimal');
      expect(check.lengthUm).toBe(measured[0]!.m);
      expect(check.gapUm).toBe(measured[1]!.m - measured[0]!.m);
      expect(calibrationTour(inst, opt, end, u)[0]).toBe(start);
      const bound = measuredGapBound(inst, opt, end, u, ranked[1]!.length - ranked[0]!.length);
      if (check.sameOptimum) expect(bound).toBeLessThanOrEqual(check.gapUm);
    }
  });
});

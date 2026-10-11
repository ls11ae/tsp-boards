import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { measuredLength } from '../board/measure';
import { distance } from '../geometry';
import { Instance } from '../instance';
import { allTours } from '../tsp/brute-force';
import type { MipBackend } from '../tsp/exact';
import { sameTour } from '../tsp/tour';
import {
  DEFAULT_INCREMENTAL,
  generateIncremental,
  stepGapUm,
  trackMarks,
  type IncrementalParams,
} from './generate';
import { segmentDistance, trackDirection } from './track';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

const params: IncrementalParams = { ...DEFAULT_INCREMENTAL, n: 8, seed: 3 };

describe('incremental puzzle generator', () => {
  it('builds a sequence that meets every condition (checked by brute force)', () => {
    const { puzzle } = generateIncremental(params, backend);
    expect(puzzle).not.toBeNull();
    const { points, steps, track } = puzzle!;
    expect(points).toHaveLength(8);
    expect(steps.map((s) => s.k)).toEqual([3, 4, 5, 6, 7, 8]);
    const u = trackDirection(track);
    for (const p of points) {
      expect(p[0]).toBeGreaterThanOrEqual(params.marginMm);
      expect(p[1]).toBeLessThanOrEqual(params.heightMm - params.marginMm);
    }
    for (let a = 0; a < 8; a++)
      for (let b = a + 1; b < 8; b++)
        expect(distance(points[a]!, points[b]!)).toBeGreaterThanOrEqual(params.minDistanceMm);
    for (const step of steps) {
      const inst = new Instance(points.slice(0, step.k), params.rEffMm);
      const ranked = allTours(inst);
      expect(sameTour(ranked[0]!.tour, step.tour, step.k)).toBe(true);
      if (step.k > 3) {
        expect(ranked[1]!.length - ranked[0]!.length).toBe(step.stringGapUm);
        expect(step.stringGapUm).toBeGreaterThanOrEqual(params.targetGapMm * 1000);
        // Measured at the track: every other tour, in either direction, ends ≥ δ from the mark.
        const worstOpt = Math.max(step.forwardUm, step.backwardUm);
        let other = Infinity;
        for (const { tour } of ranked.slice(1)) {
          other = Math.min(
            other,
            measuredLength(inst, tour, 0, u),
            measuredLength(inst, tour, 0, u, true),
          );
        }
        expect(other).toBe(step.otherUm);
        expect(stepGapUm(step)).toBeGreaterThanOrEqual(params.targetGapMm * 1000);
        expect(other - worstOpt).toBe(stepGapUm(step));
      }
      // Later points keep clear of this instance's optimal tour.
      for (const later of points.slice(step.k)) {
        for (let i = 0; i < step.tour.length; i++) {
          const a = points[step.tour[i]!]!;
          const b = points[step.tour[(i + 1) % step.tour.length]!]!;
          expect(segmentDistance(later, a, b)).toBeGreaterThanOrEqual(params.clearanceMm);
        }
      }
    }
    // Change from k = 5 and spacing of consecutive marks.
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1]!;
      const step = steps[i]!;
      if (step.k >= 5) {
        const shortcut = step.tour.filter((v) => v !== step.k - 1);
        expect(sameTour(shortcut, prev.tour, prev.k)).toBe(false);
      }
      expect(
        Math.min(step.forwardUm, step.backwardUm) - Math.max(prev.forwardUm, prev.backwardUm),
      ).toBeGreaterThanOrEqual(params.spacingMm * 1000);
    }
    // Marks: instance N first, all on the track, in order and apart.
    const marks = trackMarks(steps, track);
    expect(marks.at(-1)!.s).toBeLessThan(marks[0]!.s);
    for (const m of marks) {
      expect(m.from).toBeLessThanOrEqual(m.s);
      expect(m.to).toBeGreaterThanOrEqual(m.s);
      expect(m.to).toBeLessThanOrEqual(track.end);
    }
  }, 120_000);

  it('is deterministic for a seed', () => {
    const a = generateIncremental(params, backend).puzzle!;
    const b = generateIncremental(params, backend).puzzle!;
    expect(a.points).toEqual(b.points);
    const c = generateIncremental({ ...params, seed: 4 }, backend).puzzle!;
    expect(c.points).not.toEqual(a.points);
  }, 120_000);

  it('reports how far it got when the conditions are too strict', () => {
    const result = generateIncremental(
      { ...params, n: 10, targetGapMm: 60, maxChecks: 30 },
      backend,
    );
    expect(result.puzzle).toBeNull();
    expect(result.reached).toBeGreaterThanOrEqual(3);
    expect(result.reached).toBeLessThan(10);
  }, 120_000);
});

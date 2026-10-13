import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyChange, changeSuggestions, closePairs } from './fixed';
import { Instance } from './instance';
import { randomPoints } from './test-utils';
import { allTours } from './tsp/brute-force';
import type { MipBackend } from './tsp/exact';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('fixed instance analysis', () => {
  it('lists pairs closer than the minimum distance', () => {
    const pairs = closePairs(
      [
        [0, 0],
        [10, 0],
        [100, 0],
        [104, 3],
      ],
      20,
    );
    expect(pairs.map((p) => [p.a, p.b])).toEqual([
      [2, 3],
      [0, 1],
    ]);
    expect(pairs[0]!.distanceMm).toBeCloseTo(5);
  });

  it('suggests removals and combinations with exact gaps (checked by brute force)', () => {
    for (const seed of [21, 22, 23]) {
      const points = randomPoints(8, seed, 300, 300);
      const suggestions = changeSuggestions(points, 1.5, 'string', backend, {
        minDistanceMm: 40,
        top: 4,
      });
      expect(suggestions).toHaveLength(4);
      for (let i = 1; i < suggestions.length; i++)
        expect(suggestions[i]!.gapUm).toBeLessThanOrEqual(suggestions[i - 1]!.gapUm);
      for (const s of suggestions) {
        expect(s.exact).toBe(true);
        const changed = applyChange(points, s);
        const ranked = allTours(new Instance(changed, 1.5));
        expect(s.gapUm).toBe(ranked[1]!.length - ranked[0]!.length);
        expect(s.closePairs).toBe(closePairs(changed, 40).length);
      }
    }
  });

  it('combines a pair into its midpoint', () => {
    const points: [number, number][] = [
      [0, 0],
      [10, 0],
      [100, 0],
    ];
    expect(applyChange(points, { kind: 'combine', a: 0, b: 1 })).toEqual([
      [100, 0],
      [5, 0],
    ]);
    expect(applyChange(points, { kind: 'remove', point: 2 })).toEqual(points.slice(0, 2));
  });

  it('estimates without a backend and needs at least five points', () => {
    const points = randomPoints(7, 30, 300, 300);
    const s = changeSuggestions(points, 1.5, 'euclidean', null, { minDistanceMm: 25, top: 2 });
    expect(s).toHaveLength(2);
    expect(s.every((x) => !x.exact)).toBe(true);
    expect(
      changeSuggestions(points.slice(0, 4), 1.5, 'string', backend, { minDistanceMm: 25 }),
    ).toEqual([]);
  });
});

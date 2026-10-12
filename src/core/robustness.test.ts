import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { outwardBisector } from './board/measure';
import { Instance } from './instance';
import { checkRobustness, robustnessRadii } from './robustness';
import { randomPoints } from './test-utils';
import { optimalAndSecond, type MipBackend } from './tsp/exact';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('robustness', () => {
  it('checks r_eff half a millimetre around the planned value', () => {
    expect(robustnessRadii(1.5)).toEqual([1, 1.5, 2]);
    expect(robustnessRadii(0.3)).toEqual([0.3, 0.8]);
  });

  it('agrees with the exact check at the planned r_eff, also at the scale', () => {
    const points = randomPoints(10, 31);
    const inst = new Instance(points, 1.5);
    const exact = optimalAndSecond(backend, inst, 'string');
    const tour = exact.optimal.tour!;
    const scale = { slot: tour[0]!, direction: outwardBisector(points, tour, tour[0]!)! };
    const row = checkRobustness(backend, points, 1.5, tour, scale, { timeLimitSec: 30 });
    expect(row.status).toBe('optimal');
    expect(row.sameOptimum).toBe(true);
    expect(row.gapUm).toBeCloseTo(exact.second!.cost - exact.optimal.cost, 3);
    expect(row.scale?.status).toBe('optimal');
    // A huge r_eff favours tours with little turning: the reference may lose.
    const big = checkRobustness(backend, points, 40, tour, null, { timeLimitSec: 30 });
    expect(big.status).toBe('optimal');
    expect(big.scale).toBeNull();
  });
});

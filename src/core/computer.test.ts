import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANIMATION_MAX_MS,
  STRATEGIES,
  animationMs,
  computerSteps,
  strategyTour,
  strategyTours,
} from './computer';
import { Instance } from './instance';
import { subtourRounds } from './teaching';
import { randomPoints } from './test-utils';
import type { MipBackend } from './tsp/exact';
import { optimalAndSecond } from './tsp/exact';
import { hasFixedEdge, isTour, sameTour, stringLength, tourFromEdges } from './tsp/tour';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('how the computer does it (roadmap 9.18)', () => {
  it('compares the strategies with the optimum and proves it within 30 s', () => {
    const inst = new Instance(randomPoints(20, 4), 1.5);
    const tours = strategyTours(inst);
    for (const s of STRATEGIES) expect(isTour(strategyTour(tours, s), 20)).toBe(true);
    // 2-opt only improves its start (by the distances between the nails).
    const opt = optimalAndSecond(backend, inst, 'string', {}, { timeLimitSec: 60 }).optimal;
    for (const s of STRATEGIES)
      expect(stringLength(inst, strategyTour(tours, s))).toBeGreaterThanOrEqual(opt.cost);
    const rounds = subtourRounds(backend, inst);
    const steps = computerSteps(inst, tours, rounds);
    expect(animationMs(steps)).toBeLessThanOrEqual(ANIMATION_MAX_MS);
    expect(steps.map((s) => s.phase)).toEqual(
      expect.arrayContaining(['quick', 'improve', 'proven']),
    );
    // The last step is the board's optimum (string model), proven.
    const last = steps.at(-1)!;
    expect(last.phase).toBe('proven');
    expect(sameTour(tourFromEdges(20, last.edges)!, opt.tour!, 20)).toBe(true);
  }, 120_000);

  it('keeps the given leg of an open path in every strategy', () => {
    const inst = new Instance(randomPoints(20, 7), 1.5, null, [3, 11]);
    const tours = strategyTours(inst);
    for (const s of STRATEGIES) expect(hasFixedEdge(inst, strategyTour(tours, s))).toBe(true);
    const rounds = subtourRounds(backend, inst);
    const last = computerSteps(inst, tours, rounds).at(-1)!;
    expect(hasFixedEdge(inst, tourFromEdges(20, last.edges)!)).toBe(true);
  }, 120_000);
});

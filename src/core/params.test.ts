import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMS,
  DIGITAL_GAP_SATURATION_MM,
  DIGITAL_TARGET_GAP_MM,
  effectiveREffMm,
  rEffMm,
  searchParams,
} from './params';
import { Search } from './search/search';
import { randomPoints } from './test-utils';

describe('board and digital purposes', () => {
  it('judge boards by string length and digital puzzles by Euclidean length', () => {
    expect(effectiveREffMm(DEFAULT_PARAMS, 'board')).toBe(rEffMm(DEFAULT_PARAMS));
    expect(effectiveREffMm(DEFAULT_PARAMS, 'digital')).toBe(0);
  });

  it('give digital puzzles a tiny gap requirement that saturates early', () => {
    const board = searchParams(DEFAULT_PARAMS);
    const digital = searchParams(DEFAULT_PARAMS, 'digital');
    expect(board.targetGapMm).toBe(DEFAULT_PARAMS.targetGapMm);
    expect(board.gapSaturationMm).toBeNull();
    expect(digital).toMatchObject({
      rEffMm: 0,
      targetGapMm: DIGITAL_TARGET_GAP_MM,
      gapSaturationMm: DIGITAL_GAP_SATURATION_MM,
    });
  });

  it('search digital puzzles with Euclidean costs', () => {
    const points = randomPoints(80, 9);
    const params = {
      ...searchParams({ ...DEFAULT_PARAMS, n: 12, minDistanceMm: 40 }, 'digital'),
      iterations: 40,
      kicks: 4,
    };
    const search = new Search(
      { points, population: points.map((_, i) => 1000 + i), pinned: [] },
      params,
    );
    search.step(40);
    for (const e of search.archive)
      expect(e.gapUm).toBeGreaterThanOrEqual(DIGITAL_TARGET_GAP_MM * 1000);
  });
});

import { describe, expect, it } from 'vitest';
import { decodePermalink } from '../permalink';
import {
  DEFAULT_INCREMENTAL_UI,
  decodeIncrementalLink,
  encodeIncrementalLink,
  incrementalParams,
} from './params';

describe('incremental links', () => {
  it('round-trip parameters and points (0.1 mm)', () => {
    const ui = { ...DEFAULT_INCREMENTAL_UI, seed: 7, targetGapMm: 8, labelLanguage: 'en' as const };
    const points = [
      [45, 50.3],
      [120.25, 300],
      [355, 355],
      [200, 100],
    ] as const;
    const link = decodeIncrementalLink(
      encodeIncrementalLink(ui, points, '0.0.0', 'Ein Test & mehr'),
    )!;
    expect(link.title).toBe('Ein Test & mehr');
    expect(link.params).toEqual({ ...ui, n: 4 });
    expect(link.points).toEqual([
      [45, 50.3],
      [120.3, 300],
      [355, 355],
      [200, 100],
    ]);
  });

  it('are not map links and fall back to defaults', () => {
    const hash = encodeIncrementalLink(DEFAULT_INCREMENTAL_UI, null);
    expect(decodePermalink(hash)!.mode).toBe('design');
    expect(decodeIncrementalLink('#v=1&m=inc&g=-3&pts=zz')).toEqual({
      params: DEFAULT_INCREMENTAL_UI,
      points: null,
      title: null,
      play: false,
    });
    expect(decodeIncrementalLink('#v=1&n=40')).toBeNull();
  });

  it('derive the generator parameters', () => {
    const p = incrementalParams({
      ...DEFAULT_INCREMENTAL_UI,
      nailDiameterMm: 3,
      stringThicknessMm: 1,
    });
    expect(p.rEffMm).toBe(2);
    expect(p.clearanceMm).toBeGreaterThanOrEqual(4);
  });
});

import { describe, expect, it } from 'vitest';
import { Instance } from './instance';
import { EMPTY_PLAY, clickNail, judge, pathLength, puzzleHash, undo } from './play';
import { regularPolygon } from './test-utils';
import { stringLength } from './tsp/tour';

describe('building a round trip', () => {
  it('extends, closes, takes back and cuts back', () => {
    let s = EMPTY_PLAY;
    for (const slot of [2, 0, 1, 3]) s = clickNail(s, slot, 4);
    expect(s).toEqual({ path: [2, 0, 1, 3], closed: false });
    s = clickNail(s, 2, 4);
    expect(s.closed).toBe(true);
    s = undo(s);
    expect(s).toEqual({ path: [2, 0, 1, 3], closed: false });
    s = clickNail(s, 3, 4);
    expect(s.path).toEqual([2, 0, 1]);
    s = clickNail(s, 0, 4);
    expect(s.path).toEqual([2, 0]);
    // The start nail closes only when all nails are visited.
    expect(clickNail(s, 2, 4).path).toEqual([2]);
    expect(undo(EMPTY_PLAY)).toEqual(EMPTY_PLAY);
  });

  it('reopens a closed trip at the clicked nail', () => {
    const closed = { path: [0, 1, 2, 3], closed: true };
    expect(clickNail(closed, 1, 4)).toEqual({ path: [0, 1], closed: false });
  });
});

describe('judging', () => {
  const inst = new Instance(regularPolygon(6, 100), 1.5);
  const optimum = { tour: [0, 1, 2, 3, 4, 5], lengthUm: stringLength(inst, [0, 1, 2, 3, 4, 5]) };

  it('accepts the optimum in any rotation and direction', () => {
    expect(judge(inst, [3, 2, 1, 0, 5, 4], optimum)).toMatchObject({ optimal: true, excessUm: 0 });
  });

  it('reports the excess of other trips', () => {
    const j = judge(inst, [0, 2, 1, 3, 4, 5], optimum);
    expect(j.optimal).toBe(false);
    expect(j.excessUm).toBe(j.lengthUm - optimum.lengthUm);
    expect(j.excessUm).toBeGreaterThan(0);
  });

  it('measures open paths with the wraps at inner nails', () => {
    expect(pathLength(inst, [0])).toBe(0);
    expect(pathLength(inst, [0, 1])).toBe(inst.dist(0, 1));
    expect(pathLength(inst, [0, 1, 2])).toBe(
      inst.dist(0, 1) + inst.dist(1, 2) + inst.turn(0, 1, 2),
    );
  });
});

describe('puzzle hash', () => {
  it('ignores the order of ids', () => {
    expect(puzzleHash([3, 1, 2])).toBe(puzzleHash([1, 2, 3]));
    expect(puzzleHash([1, 2, 3])).not.toBe(puzzleHash([1, 2, 4]));
    expect(puzzleHash([1])).toMatch(/^[0-9a-f]{8}$/);
  });
});

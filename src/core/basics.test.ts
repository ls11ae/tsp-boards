import { describe, expect, it } from 'vitest';
import { convexHull, turningAngle } from './geometry';
import { Instance } from './instance';
import { Rng, hashSeed, hashString } from './rng';
import { randomPoints } from './test-utils';
import { turnCost, euclideanLength, stringLength } from './tsp/tour';

describe('Rng', () => {
  it('is deterministic per seed and forks independent streams', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.uint32());
    expect(Array.from({ length: 5 }, () => b.uint32())).toEqual(seqA);
    expect(new Rng(43).uint32()).not.toBe(seqA[0]);
    const parent = new Rng(7);
    const before = parent.uint32();
    const fork = new Rng(7).fork('x');
    expect(fork.uint32()).not.toBe(before);
  });

  it('produces floats in [0, 1) and ints in range', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 1000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      expect(rng.int(7)).toBeLessThan(7);
    }
  });

  it('hashes strings and seeds stably', () => {
    expect(hashString('tsp')).toBe(hashString('tsp'));
    expect(hashSeed(1, 'a')).not.toBe(hashSeed(1, 'b'));
  });
});

describe('geometry', () => {
  it('computes the convex hull counter-clockwise', () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
      [1, 0],
    ]);
    expect(hull).toEqual([0, 1, 3, 4]);
  });

  it('measures turning angles in [0, π]', () => {
    expect(turningAngle([0, 0], [1, 0], [2, 0])).toBeCloseTo(0);
    expect(turningAngle([0, 0], [1, 0], [1, 1])).toBeCloseTo(Math.PI / 2);
    expect(turningAngle([0, 0], [1, 0], [1, -1])).toBeCloseTo(Math.PI / 2);
    expect(turningAngle([0, 0], [1, 0], [0, 0])).toBeCloseTo(Math.PI);
  });
});

describe('Instance', () => {
  it('stores integer µm distances and symmetric turn costs', () => {
    const inst = new Instance(
      [
        [0, 0],
        [3, 4],
        [3, 0],
      ],
      1,
    );
    expect(inst.dist(0, 1)).toBe(5000);
    expect(inst.turn(0, 2, 1)).toBe(inst.turn(1, 2, 0));
    expect(inst.turn(0, 2, 1)).toBe(Math.round(1000 * (Math.PI / 2)));
  });

  it('string length of a convex polygon tour is L + 2π r', () => {
    const inst = new Instance(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      1.5,
    );
    const tour = [0, 1, 2, 3];
    expect(euclideanLength(inst, tour)).toBe(400_000);
    expect(turnCost(inst, tour)).toBe(4 * Math.round(1500 * (Math.PI / 2)));
    expect(stringLength(inst, tour)).toBe(400_000 + 4 * 2356);
  });

  it('updates all costs when a point moves', () => {
    const points = randomPoints(8, 3);
    const inst = new Instance(points, 1.2);
    inst.movePoint(5, 123.4, 567.8);
    const moved = [...points];
    moved[5] = [123.4, 567.8];
    const fresh = new Instance(moved, 1.2);
    expect(inst.d).toEqual(fresh.d);
    expect(inst.t).toEqual(fresh.t);
  });
});

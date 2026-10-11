import { describe, expect, it } from 'vitest';
import type { Point } from '../geometry';
import { Rng } from '../rng';
import { hamiltonianPaths, twoShortestTours } from './held-karp';
import { InsertionField, distanceMatrix } from './insertion';

function points(n: number, rng: Rng): Point[] {
  return Array.from({ length: n }, () => [rng.float() * 300, rng.float() * 300] as const);
}

/** All permutations of 0..n-1 (n ≤ 8). */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) =>
    Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]),
  );
}

function length(d: Float64Array, n: number, order: readonly number[], closed: boolean): number {
  let sum = 0;
  for (let i = 0; i + 1 < order.length; i++) sum += d[order[i]! * n + order[i + 1]!]!;
  if (closed) sum += d[order[order.length - 1]! * n + order[0]!]!;
  return sum;
}

/** Distinct tour lengths, sorted (each cycle once). */
function bruteTours(pts: readonly Point[]): number[] {
  const n = pts.length;
  const d = distanceMatrix(pts);
  return permutations(n - 1)
    .map((p) => [n - 1, ...p])
    .filter((t) => t[1]! < t[n - 1]!)
    .map((t) => length(d, n, t, true))
    .sort((a, b) => a - b);
}

describe('Held–Karp with two best values', () => {
  it('finds the two shortest Hamiltonian paths between every pair', () => {
    const rng = new Rng(3);
    for (let n = 2; n <= 7; n++) {
      const pts = points(n, rng);
      const d = distanceMatrix(pts);
      const table = hamiltonianPaths(n, d);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const lengths = permutations(n)
            .filter((p) => p[0] === i && p[n - 1] === j)
            .map((p) => length(d, n, p, false))
            .sort((a, b) => a - b);
          expect(table.best[i * n + j]).toBeCloseTo(lengths[0]!, 9);
          expect(table.second[i * n + j]).toBeCloseTo(lengths[1] ?? Infinity, 9);
        }
      }
    }
  });

  it('finds the two shortest tours', () => {
    const rng = new Rng(4);
    for (let n = 3; n <= 8; n++) {
      const pts = points(n, rng);
      const brute = bruteTours(pts);
      const two = twoShortestTours(n, distanceMatrix(pts));
      expect(two.best).toBeCloseTo(brute[0]!, 9);
      if (n === 3) expect(two.second).toBe(Infinity);
      else expect(two.second).toBeCloseTo(brute[1]!, 9);
    }
  });
});

describe('insertion field', () => {
  it('agrees with brute force for the next point', () => {
    const rng = new Rng(5);
    for (let trial = 0; trial < 30; trial++) {
      const k = 2 + (trial % 6);
      const base = points(k, rng);
      const p = points(1, rng)[0]!;
      const opt =
        k >= 3
          ? (() => {
              const d = distanceMatrix(base);
              const all = permutations(k - 1).map((q) => [k - 1, ...q]);
              let tour = all[0]!;
              for (const t of all) if (length(d, k, t, true) < length(d, k, tour, true)) tour = t;
              return { tour, length: length(d, k, tour, true) };
            })()
          : { tour: [0, 1], length: 2 * distanceMatrix(base)[1]! };
      const field = new InsertionField(base, opt);
      const result = field.evaluate(p);
      const brute = bruteTours([...base, p]);
      expect(result.best).toBeCloseTo(brute[0]!, 9);
      expect(result.second).toBeCloseTo(brute[1] ?? Infinity, 9);
    }
  });

  it('detects an optimum that only inserts the new point', () => {
    // Square: inserting a point just outside the middle of an edge keeps the square order.
    const square: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const field = new InsertionField(square, { tour: [0, 1, 2, 3], length: 400 });
    expect(field.evaluate([50, -5]).unchanged).toBe(true);
    // A point far inside changes nothing either way here, but a point that breaks an edge
    // pair differently: put it near a corner diagonal.
    const inside = field.evaluate([50, 50]);
    expect(inside.best).toBeGreaterThan(400);
  });
});

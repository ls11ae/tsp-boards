// Shared helpers for tests (not used by the app).

import type { Point } from './geometry';
import { Rng } from './rng';

/** Uniform random points on a board of the given size in mm. */
export function randomPoints(n: number, seed: number, width = 600, height = 800): Point[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => [rng.float() * width, rng.float() * height] as const);
}

/** Points on a regular polygon (radius in mm). */
export function regularPolygon(n: number, radius = 100): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [300 + radius * Math.cos(a), 400 + radius * Math.sin(a)] as const;
  });
}

/** Square grid with the given spacing in mm. */
export function grid(cols: number, rows: number, spacing = 50): Point[] {
  const points: Point[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) points.push([100 + c * spacing, 100 + r * spacing]);
  return points;
}

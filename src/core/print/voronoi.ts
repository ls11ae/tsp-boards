// Voronoi regions of a few points in a rectangle (roadmap 9.19: the drawing of Ruler of the
// Plane on the take-away cards, castles with their regions): each region is the rectangle cut
// by the half-planes closer to its point than to every other point.

import type { Point } from '../geometry';

/** The part of a convex polygon where a·p ≤ b (Sutherland–Hodgman for one edge). */
function clip(poly: readonly Point[], a: Point, b: number): Point[] {
  const out: Point[] = [];
  const side = (p: Point) => a[0] * p[0] + a[1] * p[1] - b;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/** The Voronoi region of every site inside the rectangle [x0, y0, x1, y1] (convex polygons). */
export function voronoiCells(
  sites: readonly Point[],
  box: readonly [number, number, number, number],
): Point[][] {
  const [x0, y0, x1, y1] = box;
  return sites.map((p, i) => {
    let cell: Point[] = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    sites.forEach((q, j) => {
      if (j === i || cell.length === 0) return;
      // Closer to p than to q: (q − p)·x ≤ (|q|² − |p|²) / 2.
      const a: Point = [q[0] - p[0], q[1] - p[1]];
      const b = (q[0] ** 2 + q[1] ** 2 - p[0] ** 2 - p[1] ** 2) / 2;
      cell = clip(cell, a, b);
    });
    return cell;
  });
}

/** Area of a simple polygon (absolute value). */
export function polygonArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}

// Plane geometry on board coordinates (mm or µm; units are the caller's choice).

export type Point = readonly [number, number];

/** Indices of the convex hull in counter-clockwise order (Andrew's monotone chain). */
export function convexHull(points: readonly Point[]): number[] {
  const order = points.map((_, i) => i);
  order.sort((i, j) => points[i]![0] - points[j]![0] || points[i]![1] - points[j]![1]);
  if (order.length < 3) return order;
  const cross = (o: number, a: number, b: number) => {
    const [ox, oy] = points[o]!;
    const [ax, ay] = points[a]!;
    const [bx, by] = points[b]!;
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
  };
  const lower: number[] = [];
  for (const i of order) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, i) <= 0) upper.pop();
    upper.push(i);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Turning angle at b when travelling a -> b -> c, in [0, π]: 0 for going straight on, π for
 * turning back. Symmetric in a and c. Zero-length legs count as going straight.
 */
export function turningAngle(a: Point, b: Point, c: Point): number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  if ((ux === 0 && uy === 0) || (vx === 0 && vy === 0)) return 0;
  return Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy);
}

export function distance(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Mean Earth radius (IUGG), km. */
export const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km between two points given as [longitude, latitude] in degrees. */
export function greatCircleKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const phi1 = a[1] * rad;
  const phi2 = b[1] * rad;
  const s = Math.sin(((b[1] - a[1]) * rad) / 2);
  const t = Math.sin(((b[0] - a[0]) * rad) / 2);
  const h = s * s + Math.cos(phi1) * Math.cos(phi2) * t * t;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

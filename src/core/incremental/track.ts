// Measuring track of the incremental board: the string, back at nail 1, runs to the nearest
// corner peg and then clockwise along the board edge around the other corner pegs. Marks on the
// track show where its end lies for the optimum of each instance {1..k}. The pegs add the same
// wrap to every tour, so only the end wrap at nail 1 (towards the first peg) varies.

import type { Point } from '../geometry';

export interface Track {
  /** Nail 1 and the pegs in the order the string passes them. */
  readonly polyline: readonly Point[];
  /** Arc length from nail 1 at each polyline vertex, mm. */
  readonly at: readonly number[];
  /** Usable length: marks must lie before this arc length. */
  readonly end: number;
}

/** Corner pegs (clockwise from the top left) at `inset` mm from the board edges. */
export function cornerPegs(width: number, height: number, inset: number): Point[] {
  return [
    [inset, inset],
    [width - inset, inset],
    [width - inset, height - inset],
    [inset, height - inset],
  ];
}

export function makeTrack(start: Point, width: number, height: number, inset: number): Track {
  const pegs = cornerPegs(width, height, inset);
  let first = 0;
  pegs.forEach((p, i) => {
    if (
      Math.hypot(p[0] - start[0], p[1] - start[1]) <
      Math.hypot(pegs[first]![0] - start[0], pegs[first]![1] - start[1])
    )
      first = i;
  });
  const order = [0, 1, 2, 3].map((k) => pegs[(first + k) % 4]!);
  // The last edge runs back towards the first peg and stops short of the string's first leg.
  const back = pegs[first]!;
  const last = order[3]!;
  const stop = 25;
  const len = Math.hypot(back[0] - last[0], back[1] - last[1]);
  const endPoint: Point = [
    last[0] + ((back[0] - last[0]) * (len - stop)) / len,
    last[1] + ((back[1] - last[1]) * (len - stop)) / len,
  ];
  const polyline = [start, ...order, endPoint];
  const at = [0];
  for (let i = 1; i < polyline.length; i++) {
    const [ax, ay] = polyline[i - 1]!;
    const [bx, by] = polyline[i]!;
    at.push(at[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return { polyline, at, end: at[at.length - 1]! };
}

/** Direction of the string leaving nail 1 (towards the first peg). */
export function trackDirection(track: Track): readonly [number, number] {
  const [ax, ay] = track.polyline[0]!;
  const [bx, by] = track.polyline[1]!;
  const len = Math.hypot(bx - ax, by - ay);
  return [(bx - ax) / len, (by - ay) / len];
}

/** Point and unit direction at arc length s along the track (s beyond the first peg). */
export function trackPoint(track: Track, s: number): { point: Point; direction: Point } {
  const { polyline, at } = track;
  let i = 1;
  while (i < polyline.length - 1 && at[i]! < s) i++;
  const a = polyline[i - 1]!;
  const b = polyline[i]!;
  const len = at[i]! - at[i - 1]!;
  const t = len > 0 ? (s - at[i - 1]!) / len : 0;
  return {
    point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
    direction: [(b[0] - a[0]) / len, (b[1] - a[1]) / len],
  };
}

/** Distance from point p to segment ab. */
export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

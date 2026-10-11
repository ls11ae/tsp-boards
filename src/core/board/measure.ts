// The self-check on the board: start nail and measuring scale.
//
// The string is tied to the start nail s with a loose loop (it turns freely, so leaving s costs
// no wrap), runs around all other nails, comes back to s from its last city b, wraps around s
// and is laid along a straight scale engraved from s in direction u. Where its end lies on the
// scale tells how much string the tour used. The measured length of a tour is
//   M(T, direction) = L(T) + r_eff·Σ_{j≠s} θ_j + r_eff·φ(b),   φ(b) = angle between s − b and u,
// i.e. the closed string length S with the turn at s replaced by the end wrap φ. Since players
// may go either way round, the board certifies the tour minimising min over directions of M,
// and the measured gap is min_{T≠OPT, dir} M(T, dir) − max_dir M(OPT, dir).
//
// u is the outward bisector of the optimal tour at s, so both directions of the optimum end at
// the same mark (φ = (π − θ_s)/2 for both neighbours). The measured gap differs from the
// string gap by the start-nail terms; it is computed exactly with the turn-cost MIP on an
// instance whose turn costs at s are r_eff·min(φ(i), φ(k)) (Instance.withTurnCosts), and
// bounded cheaply over all neighbour pairs at s to rank start nails.
//
// The builder calibrates the string by winding the optimal tour (solution sheet) and marking
// the end at the target mark, so model errors common to all tours cancel; only differences
// between tours (the gap) rely on the model.

import { turningAngle, type Point } from '../geometry';
import type { Instance } from '../instance';
import {
  optimalAndSecond,
  type ExactOptions,
  type ExactStatus,
  type MipBackend,
} from '../tsp/exact';
import { sameTour, stringLength, type Tour } from '../tsp/tour';

/** Unit vector. */
export type Direction = readonly [number, number];

/** Angle in [0, π] between the arrival direction s − from and the scale direction u. */
export function endWrapAngle(s: Point, from: Point, u: Direction): number {
  const dx = s[0] - from[0];
  const dy = s[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  const cos = (dx * u[0] + dy * u[1]) / len;
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** Neighbours of `slot` in the tour. */
export function neighbours(tour: Tour, slot: number): [number, number] {
  const n = tour.length;
  const i = tour.indexOf(slot);
  return [tour[(i + n - 1) % n]!, tour[(i + 1) % n]!];
}

/**
 * Outward bisector at `slot` of the tour: the direction pointing away from both neighbours.
 * Null if the tour goes straight through (the bisector is then ill-defined).
 */
export function outwardBisector(
  points: readonly Point[],
  tour: Tour,
  slot: number,
): Direction | null {
  const s = points[slot]!;
  const [a, b] = neighbours(tour, slot).map((i) => points[i]!) as [Point, Point];
  const unit = (p: Point): Point => {
    const dx = s[0] - p[0];
    const dy = s[1] - p[1];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  };
  const ua = unit(a);
  const ub = unit(b);
  const x = ua[0] + ub[0];
  const y = ua[1] + ub[1];
  const len = Math.hypot(x, y);
  return len < 1e-6 ? null : [x / len, y / len];
}

/** Instance whose tour costs are the measured lengths M (minimum over both directions). */
export function measurementInstance(inst: Instance, slot: number, u: Direction): Instance {
  const points = inst.pointsMm();
  const s = points[slot]!;
  const phi = points.map((p) => endWrapAngle(s, p, u));
  return inst.withTurnCosts(slot, (i, k) => inst.rEffUm * Math.min(phi[i]!, phi[k]!));
}

/**
 * Measured length (µm) of the tour traversed from `slot` in tour order (`reverse`: against
 * it), computed directly from the geometry with the instance's rounded costs.
 */
export function measuredLength(
  inst: Instance,
  tour: Tour,
  slot: number,
  u: Direction,
  reverse = false,
): number {
  const n = inst.n;
  const order = reverse ? [...tour].reverse() : [...tour];
  const start = order.indexOf(slot);
  const walk = Array.from({ length: n }, (_, i) => order[(start + i) % n]!);
  let length = 0;
  for (let i = 0; i < n; i++) length += inst.dist(walk[i]!, walk[(i + 1) % n]!);
  for (let i = 1; i < n; i++) length += inst.turn(walk[i - 1]!, walk[i]!, walk[(i + 1) % n]!);
  const points = inst.pointsMm();
  const last = walk[n - 1]!;
  return length + Math.round(inst.rEffUm * endWrapAngle(points[slot]!, points[last]!, u));
}

/**
 * Lower bound on the measured gap: the string gap plus the worst change of the start-nail
 * term over all neighbour pairs at s (a tour with OPT's pair at s keeps the term). Positive
 * means the optimum is also the unique measured optimum.
 */
export function measuredGapBound(
  inst: Instance,
  opt: Tour,
  slot: number,
  u: Direction,
  stringGapUm: number,
): number {
  const n = inst.n;
  const points = inst.pointsMm();
  const s = points[slot]!;
  const phi = points.map((p) => endWrapAngle(s, p, u));
  const delta = (i: number, k: number) =>
    Math.round(inst.rEffUm * Math.min(phi[i]!, phi[k]!)) - inst.turn(i, slot, k);
  const [a, b] = neighbours(opt, slot);
  const own = delta(a, b);
  let worst = 0;
  for (let i = 0; i < n; i++) {
    if (i === slot) continue;
    for (let k = i + 1; k < n; k++) {
      if (k !== slot) worst = Math.min(worst, delta(i, k) - own);
    }
  }
  return stringGapUm + worst;
}

export interface MeasuredCheck {
  readonly status: ExactStatus;
  /** The measured optimum is the given optimal tour (as a cycle). */
  readonly sameOptimum: boolean;
  /** Measured length of the optimum (loop to the arrival at s plus the end wrap), µm. */
  readonly lengthUm: number;
  /** Exact measured gap in µm (Infinity if there is no other tour). */
  readonly gapUm: number;
  /** Measured optimum and runner-up (null unless solved). */
  readonly optimal: number[] | null;
  readonly second: number[] | null;
}

/** Exact measured optimum and runner-up for start nail `slot` and scale direction u. */
export function checkMeasurement(
  backend: MipBackend,
  inst: Instance,
  opt: Tour,
  slot: number,
  u: Direction,
  starts: { readonly second?: Tour },
  options: ExactOptions,
): MeasuredCheck {
  const mInst = measurementInstance(inst, slot, u);
  const result = optimalAndSecond(
    backend,
    mInst,
    'string',
    { optimal: opt, second: starts.second },
    options,
  );
  const optimal = result.optimal.tour;
  const fail = (status: ExactStatus): MeasuredCheck => ({
    status,
    sameOptimum: false,
    lengthUm: stringLength(mInst, opt),
    gapUm: 0,
    optimal,
    second: null,
  });
  if (result.optimal.status !== 'optimal' || !optimal) return fail(result.optimal.status);
  if (!result.second || result.second.status === 'time-limit') return fail('time-limit');
  const second = result.second.tour;
  return {
    status: 'optimal',
    sameOptimum: sameTour(optimal, opt, inst.n),
    lengthUm: result.optimal.cost,
    gapUm: second ? result.second.cost - result.optimal.cost : Infinity,
    optimal,
    second,
  };
}

/** Turning angle of the tour at `slot` (radians). */
export function turnAt(points: readonly Point[], tour: Tour, slot: number): number {
  const [a, b] = neighbours(tour, slot);
  return turningAngle(points[a]!, points[slot]!, points[b]!);
}

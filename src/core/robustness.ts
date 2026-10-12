// Robustness of a board puzzle (Phase 6): does the optimum stay the optimum, and how large is
// the gap, if the nails or the string are a little thinner or thicker than planned? Each r_eff
// is checked exactly (string model), and at the measuring scale if the board is planned.

import type { Direction } from './board/measure';
import { checkMeasurement } from './board/measure';
import type { Point } from './geometry';
import { Instance } from './instance';
import {
  optimalAndSecond,
  type ExactOptions,
  type ExactStatus,
  type MipBackend,
} from './tsp/exact';
import { sameTour, type Tour } from './tsp/tour';

/** r_eff values around the planned one, mm. */
export const ROBUSTNESS_OFFSETS_MM: readonly number[] = [-0.5, 0, 0.5];

export function robustnessRadii(rEffMm: number): number[] {
  return ROBUSTNESS_OFFSETS_MM.map((d) => Math.round((rEffMm + d) * 1000) / 1000).filter(
    (r) => r >= 0,
  );
}

export interface ScaleCheck {
  readonly status: ExactStatus;
  /** The measured optimum is the board's optimal tour. */
  readonly sameOptimum: boolean;
  /** Measured gap, µm. */
  readonly gapUm: number;
}

export interface RobustnessRow {
  readonly rEffMm: number;
  readonly status: ExactStatus;
  /** The string optimum for this r_eff is the board's optimal tour. */
  readonly sameOptimum: boolean;
  /** Gap between optimum and runner-up for this r_eff, µm. */
  readonly gapUm: number;
  /** At the measuring scale; null without a board plan. */
  readonly scale: ScaleCheck | null;
}

export interface ScalePosition {
  readonly slot: number;
  readonly direction: Direction;
}

/** Exact check of the puzzle for one r_eff against the board's optimal tour `reference`. */
export function checkRobustness(
  backend: MipBackend,
  points: readonly Point[],
  rEffMm: number,
  reference: Tour,
  scale: ScalePosition | null,
  options: ExactOptions,
): RobustnessRow {
  const inst = new Instance(points, rEffMm);
  const result = optimalAndSecond(backend, inst, 'string', { optimal: reference }, options);
  const optimal = result.optimal.tour;
  if (result.optimal.status !== 'optimal' || !optimal || result.second?.status !== 'optimal')
    return {
      rEffMm,
      status: result.second?.status ?? result.optimal.status,
      sameOptimum: false,
      gapUm: 0,
      scale: null,
    };
  const sameOptimum = sameTour(optimal, reference, inst.n);
  const gapUm = result.second.cost - result.optimal.cost;
  let scaleCheck: ScaleCheck | null = null;
  if (scale) {
    const m = checkMeasurement(
      backend,
      inst,
      optimal,
      scale.slot,
      scale.direction,
      { second: result.second.tour ?? undefined },
      options,
    );
    scaleCheck = {
      status: m.status,
      sameOptimum:
        m.status === 'optimal' && m.optimal !== null && sameTour(m.optimal, reference, inst.n),
      gapUm: m.gapUm,
    };
  }
  return { rEffMm, status: 'optimal', sameOptimum, gapUm, scale: scaleCheck };
}

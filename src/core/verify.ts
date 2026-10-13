// Verification of a candidate puzzle: exact optimum and second-best tour.
//
// The decisive quantity is the gap in string length S. Two modes:
//   'string-exact': the turn-cost MIP gives the exact string optimum and second-best tour.
//   'euclid-exact-string-local': the Euclidean optimum and second-best tour are exact; the
//     string gap is checked against all local alternatives (2-opt, 3-opt, double bridge) of
//     the best known string tour and against the exact Euclidean optimum and runner-up.
// Exact results only annotate candidates; they never steer the (deterministic) search.

import type { Instance } from './instance';
import {
  DEFAULT_EXACT,
  ExactTsp,
  optimalAndSecond,
  type ExactOptions,
  type ExactStatus,
  type MipBackend,
} from './tsp/exact';
import { alternativeTour, scanSecondBest } from './tsp/second-best';
import { euclideanLength, sameTour, stringLength, type Tour } from './tsp/tour';

export type VerificationMode = 'string-exact' | 'euclid-exact-string-local';

export interface RankedPair {
  readonly optimal: number[];
  readonly optimalLength: number;
  /** Best known different tour (null if none was found). */
  readonly second: number[] | null;
  readonly secondLength: number;
  /** secondLength − optimalLength in µm. */
  readonly gap: number;
}

export interface Verification {
  /** Mode actually used: 'string-exact' falls back to the local check on a time limit. */
  readonly mode: VerificationMode;
  readonly status: ExactStatus;
  /** String length optimum and runner-up (exact in 'string-exact' mode). */
  readonly string: RankedPair | null;
  /** Euclidean optimum and runner-up (always exact when status is 'optimal'). */
  readonly euclidean: RankedPair | null;
  /** The heuristic tour was already string-optimal. */
  readonly heuristicOptimal: boolean;
  /** The Euclidean optimum differs from the string optimum. */
  readonly optimaDiffer: boolean;
  /** World puzzles: the shortest round trip on the flat map (null if not solved). */
  readonly flat?: FlatOptimum | null;
}

/** The optimum on the flat map of a sphere instance, measured on the map and on the sphere. */
export interface FlatOptimum {
  readonly tour: number[];
  /** Euclidean length on the map, µm. */
  readonly mapLength: number;
  /** Great-circle length (in the instance's units), µm. */
  readonly sphereLength: number;
}

/**
 * Teaching point of the world (roadmap 8.2): the shortest round trip when distances are
 * measured with a ruler on the flat map, exactly, and its length on the sphere.
 */
export function flatOptimum(
  backend: MipBackend,
  inst: Instance,
  options: ExactOptions = DEFAULT_EXACT,
): FlatOptimum | null {
  if (!inst.sphere) return null;
  const plane = inst.plane();
  const result = backend.withModel((model) =>
    new ExactTsp(model, plane, 'euclidean', options).solve(),
  );
  if (result.status !== 'optimal' || !result.tour) return null;
  return {
    tour: result.tour,
    mapLength: euclideanLength(plane, result.tour),
    sphereLength: euclideanLength(inst, result.tour),
  };
}

function pair(
  optimal: number[],
  optimalLength: number,
  second: number[] | null,
  secondLength: number,
): RankedPair {
  return { optimal, optimalLength, second, secondLength, gap: secondLength - optimalLength };
}

export function verifyCandidate(
  backend: MipBackend,
  inst: Instance,
  heuristicTour: Tour,
  mode: VerificationMode,
  options: ExactOptions,
): Verification {
  const heuristicLength = stringLength(inst, heuristicTour);
  const scan = scanSecondBest(inst, heuristicTour, { doubleBridge: true });

  const eInst = inst.euclidean();
  const eScan = scanSecondBest(eInst, scan.tour, { doubleBridge: true });
  const eExact = optimalAndSecond(
    backend,
    eInst,
    'euclidean',
    {
      optimal: eScan.tour,
      second: eScan.best ? alternativeTour(eScan.tour, eScan.best) : undefined,
    },
    options,
  );
  const failed = (status: ExactStatus): Verification => ({
    mode,
    status,
    string: null,
    euclidean: null,
    heuristicOptimal: false,
    optimaDiffer: false,
  });
  if (eExact.optimal.status !== 'optimal') return failed(eExact.optimal.status);
  if (!eExact.second || eExact.second.status === 'time-limit') return failed('time-limit');
  const eOpt = eExact.optimal.tour!;
  const eSecond = eExact.second.tour;
  const euclidean = pair(
    eOpt,
    eExact.optimal.cost,
    eSecond,
    eSecond ? eExact.second.cost : Infinity,
  );

  // Local check: best known string tour (the scanned heuristic tour or the Euclidean optimum),
  // compared with its local alternatives and the other known tours.
  const localString = (): RankedPair => {
    let best = scan;
    if (stringLength(inst, eOpt) < scan.length)
      best = scanSecondBest(inst, eOpt, { doubleBridge: true });
    let second = best.best ? alternativeTour(best.tour, best.best) : null;
    let secondLength = best.best ? best.length + best.gap : Infinity;
    for (const other of [scan.tour, eOpt, eSecond]) {
      if (!other || sameTour(other, best.tour, inst.n)) continue;
      const length = stringLength(inst, other);
      if (length < secondLength) {
        second = other;
        secondLength = length;
      }
    }
    return pair(best.tour, best.length, second, secondLength);
  };

  let usedMode: VerificationMode = 'euclid-exact-string-local';
  let string: RankedPair | null = null;
  if (mode === 'string-exact') {
    const sExact = optimalAndSecond(
      backend,
      inst,
      'string',
      { optimal: scan.tour, second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined },
      options,
    );
    if (
      sExact.optimal.status === 'optimal' &&
      sExact.second &&
      sExact.second.status !== 'time-limit'
    ) {
      const sSecond = sExact.second.tour;
      string = pair(
        sExact.optimal.tour!,
        sExact.optimal.cost,
        sSecond,
        sSecond ? sExact.second.cost : Infinity,
      );
      usedMode = 'string-exact';
    }
  }
  string ??= localString();
  return {
    mode: usedMode,
    status: 'optimal',
    string,
    euclidean,
    heuristicOptimal: heuristicLength === string.optimalLength,
    optimaDiffer:
      !sameTour(eOpt, string.optimal, inst.n) &&
      euclideanLength(eInst, string.optimal) !== euclidean.optimalLength,
  };
}

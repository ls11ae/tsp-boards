// "So rechnet der Computer" (roadmap 9.18): after a game, the visitor's round trip next to the
// simple strategies and the optimum, and a short animation of how the computer finds and proves
// the shortest round trip: a quick tour (nearest neighbour), 2-opt improvements, then the exact
// solver's rounds (pieces and the small round trips it forbids) until one round trip is left.
// Built on the teaching mode's frames (core/teaching.ts); timed to at most ANIMATION_MAX_MS.

import { heuristicTour } from './overlays';
import type { Instance } from './instance';
import {
  nearestNeighborFrames,
  subtourFrames,
  twoOptFrames,
  type Edge,
  type TeachingFrame,
} from './teaching';
import { nearestNeighbor } from './tsp/construct';
import { stringLength, tourFromEdges, type Tour } from './tsp/tour';

/** The strategies of the comparison, in the order shown. */
export type Strategy = 'nearest-neighbor' | 'insertion' | 'two-opt';
export const STRATEGIES: readonly Strategy[] = ['nearest-neighbor', 'insertion', 'two-opt'];

export interface StrategyTours {
  /** Nearest neighbour from its best start (the start, for the animation). */
  readonly nearestNeighbor: Tour;
  readonly start: number;
  readonly insertion: Tour;
  /** 2-opt improvements of the nearest neighbour tour until none helps. */
  readonly twoOpt: Tour;
  /** The frames of both, for the animation. */
  readonly nnFrames: readonly TeachingFrame[];
  readonly twoOptFrames: readonly TeachingFrame[];
}

/**
 * The strategies' tours on the puzzle's instance (with a given leg if the puzzle is an open
 * path: every strategy keeps it). Lengths are measured as the game measures (string length, or
 * the plain length for digital puzzles with r_eff 0).
 */
export function strategyTours(inst: Instance): StrategyTours {
  let start = 0;
  let best = Infinity;
  for (let s = 0; s < inst.n; s++) {
    const length = stringLength(inst, nearestNeighbor(inst, s));
    if (length < best) [best, start] = [length, s];
  }
  const nnFrames = nearestNeighborFrames(inst, start);
  const nn = nearestNeighbor(inst, start);
  const improve = twoOptFrames(inst, nn);
  const twoOpt = tourFromEdges(inst.n, improve.at(-1)!.edges) ?? nn;
  return {
    nearestNeighbor: nn,
    start,
    insertion: heuristicTour(inst, 'hull-insertion'),
    twoOpt,
    nnFrames,
    twoOptFrames: improve,
  };
}

/** The tour of a strategy. */
export function strategyTour(tours: StrategyTours, strategy: Strategy): Tour {
  return strategy === 'nearest-neighbor'
    ? tours.nearestNeighbor
    : strategy === 'insertion'
      ? tours.insertion
      : tours.twoOpt;
}

/** What a step of the animation tells (its caption). */
export type ComputerPhase = 'quick' | 'improve' | 'round' | 'proven';

export interface ComputerStep {
  readonly phase: ComputerPhase;
  readonly edges: readonly Edge[];
  readonly highlight: readonly Edge[];
  readonly nodes: readonly number[];
  /** For 'round': its number (from 1) and the number of separate round trips in it. */
  readonly round?: number;
  readonly pieces?: number;
  /** How long the step stays, ms (the last one stays until the view closes). */
  readonly ms: number;
}

/** The whole animation lasts at most this long (the last step then stays). */
export const ANIMATION_MAX_MS = 30_000;
/** Time budgets of the phases, ms: quick tour, improvements, the solver's rounds. */
const QUICK_MS = 7_000;
const IMPROVE_MS = 8_000;
const ROUNDS_MS = 12_000;
/** Shown longest per step, ms (short puzzles do not need the whole budget). */
const QUICK_STEP_MS = 250;
const IMPROVE_STEP_MS = 700;
const ROUND_STEP_MS = 2_000;
/** The proof at the end. */
const PROVEN_MS = 3_000;

const share = (budget: number, count: number, most: number) =>
  Math.min(most, budget / Math.max(1, count));

/**
 * The animation's steps: nearest neighbour, 2-opt, the exact solver's rounds (from
 * `subtourRounds`), and the proof. Total time at most ANIMATION_MAX_MS.
 */
export function computerSteps(
  inst: Instance,
  tours: StrategyTours,
  rounds: readonly (readonly Edge[])[],
): ComputerStep[] {
  const steps: ComputerStep[] = [];
  const add = (phase: ComputerPhase, f: TeachingFrame, ms: number, extra = {}) =>
    steps.push({ phase, edges: f.edges, highlight: f.highlight, nodes: f.nodes, ms, ...extra });
  const quick = share(QUICK_MS, tours.nnFrames.length, QUICK_STEP_MS);
  for (const f of tours.nnFrames) add('quick', f, quick);
  const improve = share(IMPROVE_MS, tours.twoOptFrames.length, IMPROVE_STEP_MS);
  for (const f of tours.twoOptFrames) add('improve', f, improve);
  const frames = subtourFrames(inst, rounds);
  const round = share(ROUNDS_MS, frames.length, ROUND_STEP_MS);
  frames.forEach((f, r) => {
    const pieces = f.note.kind === 'round' ? f.note.subtours : 1;
    const last = r === frames.length - 1;
    add(last ? 'proven' : 'round', f, last ? PROVEN_MS : round, { round: r + 1, pieces });
  });
  return steps;
}

/** Total time of the animation until its last step, ms. */
export function animationMs(steps: readonly ComputerStep[]): number {
  return steps.reduce((sum, s) => sum + s.ms, 0);
}

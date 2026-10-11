// Generator for the incremental puzzle: numbered points 1..N on a board; the player solves the
// nested instances {1..3}, {1..4}, ..., {1..N}. Every instance k ≥ 4 must have
//   - a unique string optimum with a gap ≥ δ to the runner-up, also as read at the track
//     (the end wrap at nail 1 included, both directions of the optimum within the mark),
//   - an optimum that is not just the previous one with point k inserted ("change", k ≥ 5),
//   - a mark at least ε further along than the previous one (marks stay apart),
// and later points keep clear of earlier optimal tours and of the string's first leg (the nails
// of later points stand on the board while earlier instances are played).
//
// Search: depth-first over the point sequence. For each step, every candidate on a raster is
// evaluated with the insertion field (Euclidean, Held–Karp with two best values), filtered by
// the Euclidean proxies of the conditions, ranked by their weakest slack, and the best few are
// checked exactly (turn-cost MIP); a step without any candidate is a dead end and the search
// backtracks (thesis: dead ends were not penalised). Restarts from a new triangle if needed.

import type { Point } from '../geometry';
import { Instance } from '../instance';
import { Rng } from '../rng';
import { optimalAndSecond, type MipBackend } from '../tsp/exact';
import { iteratedLocalSearch } from '../tsp/ils';
import { sameTour, stringLength } from '../tsp/tour';
import { checkMeasurement, measuredLength } from '../board/measure';
import { twoShortestTours } from './held-karp';
import { InsertionField, distanceMatrix } from './insertion';
import { makeTrack, segmentDistance, trackDirection, type Track } from './track';

export interface IncrementalParams {
  /** Number of points N (4..16). */
  readonly n: number;
  readonly widthMm: number;
  readonly heightMm: number;
  /** Points stay this far inside the board edge (room for the track and its marks). */
  readonly marginMm: number;
  readonly minDistanceMm: number;
  /** δ: gap to the runner-up, in mm of string and at the track. */
  readonly targetGapMm: number;
  /** ε: minimal distance between consecutive marks, mm of string. */
  readonly spacingMm: number;
  readonly rEffMm: number;
  /** Later points keep this distance from earlier optimal tours and the string's first leg. */
  readonly clearanceMm: number;
  /** Distance of the corner pegs (track) from the board edge. */
  readonly trackInsetMm: number;
  /** Spacing of the candidate raster, mm. */
  readonly rasterMm: number;
  readonly seed: number;
  /** Exact candidate checks per step before backtracking. */
  readonly triesPerStep: number;
  /** Budget of exact checks for the whole run. */
  readonly maxChecks: number;
}

export const DEFAULT_INCREMENTAL: IncrementalParams = {
  n: 10,
  widthMm: 400,
  heightMm: 400,
  marginMm: 45,
  minDistanceMm: 30,
  targetGapMm: 5,
  spacingMm: 10,
  rEffMm: 1.5,
  clearanceMm: 4,
  trackInsetMm: 15,
  rasterMm: 5,
  seed: 1,
  triesPerStep: 4,
  maxChecks: 400,
};

export interface IncrementalStep {
  /** Instance {1..k}. */
  readonly k: number;
  /** String-optimal tour over 0..k−1, starting at point 1 (index 0). */
  readonly tour: readonly number[];
  readonly stringUm: number;
  /** Gap to the runner-up in string length (Infinity for k = 3). */
  readonly stringGapUm: number;
  /** Measured length of the optimum in tour order and against it (µm). */
  readonly forwardUm: number;
  readonly backwardUm: number;
  /** Shortest measured length of any other tour (µm; Infinity for k = 3). */
  readonly otherUm: number;
}

export interface IncrementalPuzzle {
  readonly params: IncrementalParams;
  /** Board coordinates (mm) of points 1..N. */
  readonly points: readonly Point[];
  readonly steps: readonly IncrementalStep[];
  readonly track: Track;
  readonly stats: { readonly checks: number; readonly restarts: number; readonly ms?: number };
}

export interface GenerationResult {
  readonly puzzle: IncrementalPuzzle | null;
  /** Longest sequence reached if no complete puzzle was found. */
  readonly reached: number;
  readonly checks: number;
}

/** Measured gap of a step: every other tour ends at least this far from the optimum's mark. */
export function stepGapUm(step: IncrementalStep): number {
  return step.otherUm - Math.max(step.forwardUm, step.backwardUm);
}

function rotateToStart(tour: readonly number[]): number[] {
  const i = tour.indexOf(0);
  return tour.map((_, k) => tour[(i + k) % tour.length]!);
}

interface Context {
  readonly params: IncrementalParams;
  readonly backend: MipBackend;
  readonly rng: Rng;
  checks: number;
  reached: number;
  track: Track | null;
}

export type Violation =
  'solver' | 'string-gap' | 'change' | 'measured-optimum' | 'measured-gap' | 'spacing';

interface StepAnalysis {
  readonly step: IncrementalStep | null;
  readonly violations: readonly Violation[];
}

/**
 * Exact evaluation of instance {1..k}. With `stopEarly` (the search) it returns at the first
 * violated condition; otherwise it evaluates everything (checking a given sequence).
 */
function analyzeStep(
  backend: MipBackend,
  params: IncrementalParams,
  track: Track,
  points: readonly Point[],
  previous: IncrementalStep | null,
  stopEarly: boolean,
): StepAnalysis {
  const violations: Violation[] = [];
  const fail = (v: Violation) => {
    violations.push(v);
    return stopEarly;
  };
  const k = points.length;
  const inst = new Instance(points, params.rEffMm);
  let tour = [0, 1, 2];
  let stringUm = stringLength(inst, tour);
  let stringGap = Infinity;
  if (k > 3) {
    const start = iteratedLocalSearch(inst, new Rng(k)).tour;
    const exact = optimalAndSecond(backend, inst, 'string', { optimal: start });
    if (exact.optimal.status !== 'optimal' || !exact.optimal.tour)
      return { step: null, violations: ['solver'] };
    tour = rotateToStart(exact.optimal.tour);
    stringUm = exact.optimal.cost;
    stringGap = exact.second?.tour ? exact.second.cost - exact.optimal.cost : Infinity;
    if (stringGap < params.targetGapMm * 1000 && fail('string-gap'))
      return { step: null, violations };
  }
  // Change: removing point k from the optimum must not give the previous optimum. Every tour
  // of four points is the triangle with one point inserted, so this starts at k = 5.
  if (previous && k >= 5) {
    const shortcut = tour.filter((v) => v !== k - 1);
    if (sameTour(shortcut, previous.tour, k - 1) && fail('change'))
      return { step: null, violations };
  }
  const u = trackDirection(track);
  const forward = measuredLength(inst, tour, 0, u);
  const backward = measuredLength(inst, tour, 0, u, true);
  let other = Infinity;
  if (k > 3) {
    const m = checkMeasurement(backend, inst, tour, 0, u, {}, { timeLimitSec: 60 });
    if (m.status !== 'optimal') return { step: null, violations: [...violations, 'solver'] };
    // The measured optimum must be the string optimum; else the board certifies another tour.
    if (!m.sameOptimum && fail('measured-optimum')) return { step: null, violations };
    other = m.sameOptimum ? m.lengthUm + m.gapUm : m.lengthUm;
    if (other - Math.max(forward, backward) < params.targetGapMm * 1000 && fail('measured-gap'))
      return { step: null, violations };
  }
  if (previous) {
    const growth = Math.min(forward, backward) - Math.max(previous.forwardUm, previous.backwardUm);
    if (growth < params.spacingMm * 1000 && fail('spacing')) return { step: null, violations };
  }
  return {
    step: {
      k,
      tour,
      stringUm,
      stringGapUm: stringGap,
      forwardUm: forward,
      backwardUm: backward,
      otherUm: other,
    },
    violations,
  };
}

/** Exact evaluation of instance {1..k} in the search; null if it violates a condition. */
function checkStep(
  ctx: Context,
  points: readonly Point[],
  previous: IncrementalStep | null,
): IncrementalStep | null {
  ctx.checks++;
  return analyzeStep(ctx.backend, ctx.params, ctx.track!, points, previous, true).step;
}

export interface SequenceCheck {
  /** The puzzle with all steps (null if the solver failed). */
  readonly puzzle: IncrementalPuzzle | null;
  /** Violated conditions per instance k (empty: all fine). */
  readonly violations: readonly { readonly k: number; readonly violations: readonly Violation[] }[];
  readonly marksFit: boolean;
}

/** Checks a given point sequence (e.g. from a link) against the parameters. */
export function checkSequence(
  params: IncrementalParams,
  points: readonly Point[],
  backend: MipBackend,
): SequenceCheck {
  const track = makeTrack(points[0]!, params.widthMm, params.heightMm, params.trackInsetMm);
  const steps: IncrementalStep[] = [];
  const violations: { k: number; violations: Violation[] }[] = [];
  for (let k = 3; k <= points.length; k++) {
    const result = analyzeStep(
      backend,
      params,
      track,
      points.slice(0, k),
      steps.at(-1) ?? null,
      false,
    );
    if (!result.step) return { puzzle: null, violations, marksFit: false };
    steps.push(result.step);
    if (result.violations.length > 0) violations.push({ k, violations: [...result.violations] });
  }
  return {
    puzzle: {
      params: { ...params, n: points.length },
      points,
      steps,
      track,
      stats: { checks: steps.length, restarts: 0 },
    },
    violations,
    marksFit: marksFit(steps, track),
  };
}

function tourLengthMm(points: readonly Point[], tour: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < tour.length; i++) {
    const a = points[tour[i]!]!;
    const b = points[tour[(i + 1) % tour.length]!]!;
    sum += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return sum;
}

/** Smallest interior angle of a triangle (radians). */
function minAngle([a, b, c]: readonly [Point, Point, Point]): number {
  const angle = (p: Point, q: Point, r: Point) => {
    const ux = q[0] - p[0];
    const uy = q[1] - p[1];
    const vx = r[0] - p[0];
    const vy = r[1] - p[1];
    return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  };
  return Math.min(angle(a, b, c), angle(b, c, a), angle(c, a, b));
}

/** Raster of candidate positions inside the margins. */
function raster(params: IncrementalParams): Point[] {
  const { widthMm: w, heightMm: h, marginMm: m, rasterMm: g } = params;
  const out: Point[] = [];
  for (let y = m; y <= h - m + 1e-9; y += g)
    for (let x = m; x <= w - m + 1e-9; x += g) out.push([x, y]);
  return out;
}

interface Candidate {
  readonly point: Point;
  readonly score: number;
}

/** Candidates for the next point, best first (Euclidean proxies of the conditions). */
function candidates(
  ctx: Context,
  grid: readonly Point[],
  points: readonly Point[],
  steps: readonly IncrementalStep[],
): Candidate[] {
  const { params } = ctx;
  const last = steps[steps.length - 1]!;
  const field = new InsertionField(points, {
    tour: last.tour,
    length: tourLengthMm(points, last.tour),
  });
  // Euclidean optimum of the current points: the growth proxy for the marks' spacing.
  const baseLength =
    points.length >= 3 ? twoShortestTours(points.length, distanceMatrix(points)).best : 0;
  const segments: [Point, Point][] = [];
  for (const step of steps) {
    for (let i = 0; i < step.tour.length; i++)
      segments.push([points[step.tour[i]!]!, points[step.tour[(i + 1) % step.tour.length]!]!]);
  }
  const track = ctx.track!;
  segments.push([track.polyline[0]!, track.polyline[1]!]);
  const delta = params.targetGapMm;
  const eps = params.spacingMm;
  const out: Candidate[] = [];
  for (const p of grid) {
    let near = Infinity;
    for (const q of points) near = Math.min(near, Math.hypot(p[0] - q[0], p[1] - q[1]));
    if (near < params.minDistanceMm) continue;
    let clear = Infinity;
    for (const [a, b] of segments) clear = Math.min(clear, segmentDistance(p, a, b));
    if (clear < params.clearanceMm) continue;
    const ins = field.evaluate(p);
    if (ins.unchanged && points.length >= 4) continue;
    const gap = ins.second - ins.best;
    const growth = ins.best - baseLength;
    // The string adds wraps; keep some headroom on the Euclidean proxies.
    if (gap < 1.2 * delta || growth < 1.2 * eps) continue;
    const score = Math.min(
      gap / delta - 1,
      growth / eps - 1,
      near / params.minDistanceMm - 1,
      clear / params.clearanceMm - 1,
    );
    out.push({ point: p, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function extend(
  ctx: Context,
  grid: readonly Point[],
  points: Point[],
  steps: IncrementalStep[],
): boolean {
  ctx.reached = Math.max(ctx.reached, points.length);
  if (points.length === ctx.params.n) return true;
  const list = candidates(ctx, grid, points, steps);
  // Randomised choice among the best: draw from the top candidates, better ones more likely.
  const pool = list.slice(0, Math.max(ctx.params.triesPerStep * 6, 12));
  const tried = new Set<number>();
  for (let t = 0; t < ctx.params.triesPerStep && tried.size < pool.length; t++) {
    if (ctx.checks >= ctx.params.maxChecks) return false;
    let index = Math.floor(Math.pow(ctx.rng.float(), 2) * pool.length);
    while (tried.has(index)) index = (index + 1) % pool.length;
    tried.add(index);
    const p = pool[index]!.point;
    const next = [...points, p];
    const step = checkStep(ctx, next, steps[steps.length - 1]!);
    if (!step) continue;
    points.push(p);
    steps.push(step);
    if (extend(ctx, grid, points, steps)) return true;
    points.pop();
    steps.pop();
  }
  return false;
}

export function generateIncremental(
  params: IncrementalParams,
  backend: MipBackend,
): GenerationResult {
  if (params.n < 4 || params.n > 16) throw new Error('n must be between 4 and 16');
  const ctx: Context = {
    params,
    backend,
    rng: new Rng(params.seed),
    checks: 0,
    reached: 0,
    track: null,
  };
  const grid = raster(params);
  let restarts = 0;
  while (ctx.checks < params.maxChecks && restarts < 100) {
    // Initial triangle: random raster points at the minimum distance, no sliver (all angles
    // at least 25°), so the first instance reads as a triangle on the board.
    const points: Point[] = [];
    for (let attempt = 0; points.length < 3 && attempt < 1000; attempt++) {
      const p = ctx.rng.pick(grid);
      if (!points.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= params.minDistanceMm))
        continue;
      if (points.length === 2 && minAngle([points[0]!, points[1]!, p]) < (25 * Math.PI) / 180)
        continue;
      points.push(p);
    }
    ctx.track = makeTrack(points[0]!, params.widthMm, params.heightMm, params.trackInsetMm);
    const leg: [Point, Point] = [ctx.track.polyline[0]!, ctx.track.polyline[1]!];
    const first = points
      .slice(1)
      .every((p) => segmentDistance(p, leg[0], leg[1]) >= params.clearanceMm)
      ? checkStep(ctx, points, null)
      : null;
    if (first) {
      const steps = [first];
      if (extend(ctx, grid, points, steps)) {
        const track = ctx.track;
        // The marks of all instances must fit on the track (calibrated with the full instance).
        const fits = marksFit(steps, track);
        if (fits)
          return {
            puzzle: { params, points, steps, track, stats: { checks: ctx.checks, restarts } },
            reached: params.n,
            checks: ctx.checks,
          };
      }
    }
    restarts++;
  }
  return { puzzle: null, reached: ctx.reached, checks: ctx.checks };
}

/** First mark (instance N) this far along the track after the first peg, mm. */
export const FIRST_MARK_MM = 25;

export interface Mark {
  readonly k: number;
  /** Arc length of the mark (optimum wound in tour order), and its zone (both directions). */
  readonly s: number;
  readonly from: number;
  readonly to: number;
}

/**
 * Marks along the track, calibrated so that the full instance wound in tour order ends at the
 * first mark: longer optima leave less string, so instance N comes first and instance 3 last.
 */
export function trackMarks(steps: readonly IncrementalStep[], track: Track): Mark[] {
  const full = steps[steps.length - 1]!;
  const base = track.at[1]! + FIRST_MARK_MM + full.forwardUm / 1000;
  return steps.map((s) => ({
    k: s.k,
    s: base - s.forwardUm / 1000,
    from: base - Math.max(s.forwardUm, s.backwardUm) / 1000,
    to: base - Math.min(s.forwardUm, s.backwardUm) / 1000,
  }));
}

function marksFit(steps: readonly IncrementalStep[], track: Track): boolean {
  return trackMarks(steps, track).every((m) => m.to <= track.end - 5 && m.from >= track.at[1]!);
}

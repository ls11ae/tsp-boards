// Board plan: where the start nail, the measuring scale, the title block, the footer and the
// labels go, and the measured gap the board guarantees. The plan holds positions only; the
// drawing (board/drawing.ts) turns it into paths.
//
// Start nails are ranked by the cheap bound on the measured gap (measure.ts) among those whose
// scale fits on the board without touching other nails; for the best ones the title, footer and
// labels are placed with the scale as an obstacle, and with a MIP backend the measured gap is
// computed exactly. The first start nail whose layout is complete and whose exact measured gap
// reaches the target wins; otherwise the best one found.

import type { Point } from '../geometry';
import type { Instance } from '../instance';
import type { ExactOptions, ExactStatus, MipBackend } from '../tsp/exact';
import type { Tour } from '../tsp/tour';
import {
  hitsObstacle,
  labelCandidates,
  placeLabels,
  type Box,
  type LabelCandidate,
  type LabelOptions,
  type Obstacle,
} from './labels';
import { checkMeasurement, measuredGapBound, outwardBisector, type Direction } from './measure';
import type { TextMetrics } from './text';

export interface ScaleSpec {
  /** Distance from the start nail centre to the target mark, mm. */
  readonly targetMm: number;
  /** Minimum length of the scale beyond the target, mm. */
  readonly overshootMm: number;
  /** Half width of the scale (ticks and numbers), mm. */
  readonly halfWidthMm: number;
}

export const DEFAULT_SCALE: ScaleSpec = { targetMm: 60, overshootMm: 10, halfWidthMm: 9 };

export interface PlanInput {
  /** String instance of the nails (slot order), with r_eff. */
  readonly inst: Instance;
  /** String-optimal tour (slots) and the gap to the runner-up in µm. */
  readonly tour: Tour;
  readonly stringGapUm: number;
  /** Second-best string tour, if known (MIP start for the measured runner-up). */
  readonly second?: Tour | null;
  readonly targetGapUm: number;
  readonly width: number;
  readonly height: number;
  readonly nailDiameterMm: number;
  /** Label metrics per slot and options; null for a board without labels. */
  readonly labels: {
    readonly metrics: readonly TextMetrics[];
    readonly options: LabelOptions;
  } | null;
  /** Size [w, h] of the title block and of the one-line footer in mm (null: none). */
  readonly titleSize: readonly [number, number] | null;
  readonly footerSize: readonly [number, number] | null;
  readonly scale?: ScaleSpec;
  /** Distance of title, footer and scale from the board edge, mm. */
  readonly edgeMm?: number;
}

export interface ScalePlan {
  readonly slot: number;
  readonly origin: Point;
  readonly direction: Direction;
  /** Distances from the nail centre along the direction, mm. */
  readonly startMm: number;
  readonly targetMm: number;
  readonly endMm: number;
  readonly halfWidthMm: number;
  /** Area covered by the scale (convex polygon). */
  readonly band: readonly Point[];
}

export interface MeasuredGap {
  /** 'bound': only the cheap lower bound is known (no backend or the MIP failed). */
  readonly kind: 'exact' | 'bound';
  readonly status: ExactStatus | null;
  /** Measured gap in µm (exact, or the lower bound). */
  readonly gapUm: number;
  readonly boundUm: number;
  /** Measured length of the optimum from the loop to the arrival at s plus the end wrap, µm. */
  readonly lengthUm: number | null;
}

export interface PlacedLabel {
  readonly slot: number;
  /** Chosen position; the preferred one if the label did not fit. */
  readonly candidate: LabelCandidate;
  readonly fits: boolean;
}

export interface BoardPlan {
  readonly scale: ScalePlan;
  readonly measured: MeasuredGap;
  readonly title: Box | null;
  readonly footer: Box | null;
  readonly labels: readonly PlacedLabel[];
  readonly labelsComplete: boolean;
  /** Problems the user should know about. */
  readonly warnings: readonly PlanWarning[];
  /** Start nails examined (for diagnostics). */
  readonly examined: number;
}

export type PlanWarning =
  | { readonly kind: 'no-scale-space' }
  | { readonly kind: 'labels'; readonly unplaced: number }
  | { readonly kind: 'no-title-space' }
  | { readonly kind: 'gap-below-target'; readonly gapUm: number }
  | { readonly kind: 'optimum-differs' }
  | { readonly kind: 'measurement-unverified' };

/** Coordinates of p in the scale frame: along the direction and across it. */
function scaleFrame(origin: Point, u: Direction, p: Point): [number, number] {
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  return [dx * u[0] + dy * u[1], -dx * u[1] + dy * u[0]];
}

function scaleBand(origin: Point, u: Direction, t0: number, t1: number, h: number): Point[] {
  const at = (t: number, w: number): Point => [
    origin[0] + t * u[0] - w * u[1],
    origin[1] + t * u[1] + w * u[0],
  ];
  return [at(t0, -h), at(t1, -h), at(t1, h), at(t0, h)];
}

function insideBoard(points: readonly Point[], width: number, height: number, edge: number) {
  return points.every(
    ([x, y]) => x >= edge && y >= edge && x <= width - edge && y <= height - edge,
  );
}

interface Candidate {
  readonly scale: ScalePlan;
  readonly boundUm: number;
}

/** Start nails whose scale fits, best bound first. */
export function scaleCandidates(input: PlanInput): Candidate[] {
  const { inst, tour } = input;
  const spec = input.scale ?? DEFAULT_SCALE;
  const edge = input.edgeMm ?? 5;
  const points = inst.pointsMm();
  const nailRadius = input.nailDiameterMm / 2;
  const clearance = input.labels?.options.nailClearanceMm ?? nailRadius + 2.5;
  const overshoot = Math.max(spec.overshootMm, Math.min(input.stringGapUm / 1000, 40) / 2 + 4);
  const startMm = nailRadius + 3;
  const endMm = spec.targetMm + overshoot;
  const result: Candidate[] = [];
  for (let slot = 0; slot < inst.n; slot++) {
    const u = outwardBisector(points, tour, slot);
    if (!u) continue;
    const origin = points[slot]!;
    const band = scaleBand(origin, u, startMm - 1, endMm + 2, spec.halfWidthMm);
    if (!insideBoard(band, input.width, input.height, edge)) continue;
    const blocked = points.some((p, i) => {
      if (i === slot) return false;
      const [t, w] = scaleFrame(origin, u, p);
      const dt = Math.max(startMm - 1 - t, 0, t - endMm - 2);
      const dw = Math.max(Math.abs(w) - spec.halfWidthMm, 0);
      return Math.hypot(dt, dw) < clearance;
    });
    if (blocked) continue;
    result.push({
      scale: {
        slot,
        origin,
        direction: u,
        startMm,
        targetMm: spec.targetMm,
        endMm,
        halfWidthMm: spec.halfWidthMm,
        band,
      },
      boundUm: measuredGapBound(inst, tour, slot, u, input.stringGapUm),
    });
  }
  return result.sort((a, b) => b.boundUm - a.boundUm || a.scale.slot - b.scale.slot);
}

interface Layout {
  readonly title: Box | null;
  readonly footer: Box | null;
  readonly labels: PlacedLabel[];
  readonly complete: boolean;
  readonly unplaced: number;
  readonly titleMissing: boolean;
}

/** Title, footer and labels around a given scale. */
function layout(input: PlanInput, scale: ScalePlan): Layout {
  const points = input.inst.pointsMm();
  const edge = input.edgeMm ?? 5;
  const { width, height } = input;
  const clearance = input.labels?.options.nailClearanceMm ?? input.nailDiameterMm / 2 + 2.5;
  const scaleObstacle: Obstacle = { kind: 'polygon', points: scale.band };
  const free = (box: Box, others: readonly Obstacle[]) =>
    box[0] >= edge &&
    box[1] >= edge &&
    box[2] <= width - edge &&
    box[3] <= height - edge &&
    !points.some((p) => hitsObstacle(box, { kind: 'circle', centre: p, radius: clearance })) &&
    !others.some((o) => hitsObstacle(box, o));
  const asObstacle = (box: Box): Obstacle => ({
    kind: 'polygon',
    points: [
      [box[0], box[1]],
      [box[2], box[1]],
      [box[2], box[3]],
      [box[0], box[3]],
    ],
  });

  // Footer: bottom edge, centred, left or right.
  let footer: Box | null = null;
  if (input.footerSize) {
    const [w, h] = input.footerSize;
    const y = height - edge - h;
    for (const x of [(width - w) / 2, edge + 5, width - edge - 5 - w]) {
      const box: Box = [x, y, x + w, y + h];
      if (free(box, [scaleObstacle])) {
        footer = box;
        break;
      }
    }
  }
  // Title: the corner with room, preferring the top.
  let title: Box | null = null;
  if (input.titleSize) {
    const [w, h] = input.titleSize;
    const m = edge + 5;
    const corners: Box[] = [
      [m, m, m + w, m + h],
      [width - m - w, m, width - m, m + h],
      [m, height - m - h, m + w, height - m],
      [width - m - w, height - m - h, width - m, height - m],
    ];
    const blockers = [scaleObstacle, ...(footer ? [asObstacle(footer)] : [])];
    title = corners.find((box) => free(box, blockers)) ?? null;
  }

  const obstacles = [
    scaleObstacle,
    ...(title ? [asObstacle(title)] : []),
    ...(footer ? [asObstacle(footer)] : []),
  ];
  let labels: PlacedLabel[] = [];
  let complete = true;
  let unplaced = 0;
  if (input.labels) {
    const { metrics, options } = input.labels;
    const candidates = points.map((p, i) => labelCandidates(p, metrics[i]!, options));
    const placement = placeLabels({ points, candidates, obstacles, width, height, options });
    complete = placement.complete;
    unplaced = placement.unplaced;
    labels = placement.choice.map((choice, slot) => ({
      slot,
      candidate: candidates[slot]![Math.max(0, choice)]!,
      fits: choice >= 0,
    }));
  }
  return {
    title,
    footer,
    labels,
    complete,
    unplaced,
    titleMissing: input.titleSize !== null && title === null,
  };
}

export interface PlanOptions {
  /** Exact measured-gap checks to try at most (each a turn-cost MIP). */
  readonly maxExact?: number;
  /** Layouts (start nails) to try at most. */
  readonly maxLayouts?: number;
  readonly exact?: ExactOptions;
  readonly onProgress?: (step: string) => void;
}

/** Plans the board; with a backend the measured gap of the chosen start nail is exact. */
export function planBoard(
  input: PlanInput,
  backend?: MipBackend,
  options: PlanOptions = {},
): BoardPlan | null {
  const candidates = scaleCandidates(input);
  if (candidates.length === 0) return null;
  const maxLayouts = options.maxLayouts ?? 12;
  const maxExact = options.maxExact ?? 3;
  let best: { plan: BoardPlan; score: number } | null = null;
  let exactRuns = 0;
  let examined = 0;
  for (const candidate of candidates.slice(0, maxLayouts)) {
    examined++;
    const lay = layout(input, candidate.scale);
    const warnings: PlanWarning[] = [];
    if (!lay.complete) warnings.push({ kind: 'labels', unplaced: lay.unplaced });
    if (lay.titleMissing) warnings.push({ kind: 'no-title-space' });
    let measured: MeasuredGap = {
      kind: 'bound',
      status: null,
      gapUm: candidate.boundUm,
      boundUm: candidate.boundUm,
      lengthUm: null,
    };
    // Exact checks only for complete layouts (incomplete ones are fallbacks anyway).
    if (backend && lay.complete && exactRuns < maxExact) {
      exactRuns++;
      options.onProgress?.(`exact:${candidate.scale.slot}`);
      const check = checkMeasurement(
        backend,
        input.inst,
        input.tour,
        candidate.scale.slot,
        candidate.scale.direction,
        { second: input.second ?? undefined },
        options.exact ?? { timeLimitSec: 120 },
      );
      if (check.status === 'optimal') {
        measured = {
          kind: 'exact',
          status: check.status,
          gapUm: check.sameOptimum ? check.gapUm : 0,
          boundUm: candidate.boundUm,
          lengthUm: check.lengthUm,
        };
        if (!check.sameOptimum) warnings.push({ kind: 'optimum-differs' });
      } else {
        measured = { ...measured, status: check.status };
      }
    }
    if (measured.kind === 'bound') warnings.push({ kind: 'measurement-unverified' });
    if (measured.gapUm < input.targetGapUm)
      warnings.push({ kind: 'gap-below-target', gapUm: measured.gapUm });
    const plan: BoardPlan = {
      scale: candidate.scale,
      measured,
      title: lay.title,
      footer: lay.footer,
      labels: lay.labels,
      labelsComplete: lay.complete,
      warnings,
      examined,
    };
    // Complete layout first, then reaching the target, then the measured gap.
    const score =
      (lay.complete ? 4 : 0) +
      (lay.titleMissing ? 0 : 1) +
      (measured.gapUm >= input.targetGapUm ? 2 : 0) +
      Math.min(1, Math.max(0, measured.gapUm) / Math.max(1, 10 * input.targetGapUm));
    if (!best || score > best.score) best = { plan, score };
    const done =
      lay.complete &&
      !lay.titleMissing &&
      measured.gapUm >= input.targetGapUm &&
      (measured.kind === 'exact' || !backend);
    if (done) break;
    if (backend && exactRuns >= maxExact && best.plan.labelsComplete) break;
  }
  return best ? { ...best.plan, examined } : null;
}

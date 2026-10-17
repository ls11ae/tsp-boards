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
import type { FixedEdge, Instance } from '../instance';
import type { ExactOptions, ExactStatus, MipBackend } from '../tsp/exact';
import { openPath, type Tour } from '../tsp/tour';
import {
  hitsObstacle,
  labelCandidates,
  placeLabels,
  type Box,
  type LabelCandidate,
  type LabelOptions,
  type Obstacle,
} from './labels';
import {
  checkMeasurement,
  endWrapAngle,
  measuredGapBound,
  outwardBisector,
  type Direction,
} from './measure';
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
    /** Metrics per slot when that slot is the start nail (e.g. a caption below the label). */
    readonly startMetrics?: readonly TextMetrics[];
  } | null;
  /** Size [w, h] of the title block and of the one-line footer in mm (null: none). */
  readonly titleSize: readonly [number, number] | null;
  readonly footerSize: readonly [number, number] | null;
  readonly scale?: ScaleSpec;
  /** Distance of title, footer and scale from the board edge, mm. */
  readonly edgeMm?: number;
  /** Area kept free of scale, title, footer and labels (e.g. the legend box). */
  readonly reserved?: Box | null;
  /** Start nail tried first (slot), e.g. a place the board celebrates. */
  readonly preferredStart?: number | null;
  /**
   * The preferred start nail is kept if its measured gap reaches this (µm), even below the
   * target (roadmap 9.14: the Ruhr Innovation Lab with 4.14 mm at the scale). Default 4 mm.
   */
  readonly preferredStartMinGapUm?: number;
  /**
   * Lines drawn on the board that labels, title, footer and scale keep off (the given leg of an
   * open path, roadmap 9.15).
   */
  readonly lines?: readonly (readonly Point[])[];
}

/** Half width of a drawn line as an obstacle, mm. */
const LINE_CLEARANCE_MM = 1.5;

/** The segments of polylines as thin obstacles. */
function lineObstacles(lines: readonly (readonly Point[])[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (const line of lines)
    for (let i = 0; i + 1 < line.length; i++) {
      const [a, b] = [line[i]!, line[i + 1]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0) continue;
      const [nx, ny] = [
        ((a[1] - b[1]) / len) * LINE_CLEARANCE_MM,
        ((b[0] - a[0]) / len) * LINE_CLEARANCE_MM,
      ];
      out.push({
        kind: 'polygon',
        points: [
          [a[0] + nx, a[1] + ny],
          [b[0] + nx, b[1] + ny],
          [b[0] - nx, b[1] - ny],
          [a[0] - nx, a[1] - ny],
        ],
      });
    }
  return out;
}

/** A preferred start nail is kept with this measured gap (µm) unless the input says otherwise. */
export const PREFERRED_START_MIN_GAP_UM = 4000;

/** PlanInput as plain data (for workers): the instance is rebuilt from points and r_eff. */
export type PlanData = Omit<PlanInput, 'inst'> & {
  readonly points: readonly Point[];
  readonly rEffMm: number;
  readonly fixedEdge?: FixedEdge | null;
};

export function planData(input: PlanInput, rEffMm: number): PlanData {
  const { inst, ...rest } = input;
  return { ...rest, points: inst.pointsMm(), rEffMm, fixedEdge: inst.fixedEdge };
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
  /** The runner-up as read at the scale (slots), if solved exactly. */
  readonly second?: readonly number[] | null;
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
  /** The reserved legend box (null: none). */
  readonly legend?: Box | null;
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
  | { readonly kind: 'measurement-unverified' }
  /** Nails inside the reserved legend box. */
  | { readonly kind: 'legend-overlap'; readonly nails: number }
  /** The preferred start nail was not used (no room for its scale or its gap is too small). */
  | { readonly kind: 'start-not-preferred' };

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

/** The box as an obstacle (convex polygon). */
export function boxObstacle(box: Box): Obstacle {
  return {
    kind: 'polygon',
    points: [
      [box[0], box[1]],
      [box[2], box[1]],
      [box[2], box[3]],
      [box[0], box[3]],
    ],
  };
}

function insideBoard(points: readonly Point[], width: number, height: number, edge: number) {
  return points.every(
    ([x, y]) => x >= edge && y >= edge && x <= width - edge && y <= height - edge,
  );
}

interface Candidate {
  readonly scale: ScalePlan;
  readonly boundUm: number;
  /** Edges of the optimal tour crossing the scale (the rest of the string would lie on them). */
  readonly crossings: number;
}

/** Whether segment pq meets the convex polygon (endpoint inside or edge intersection). */
function segmentMeetsPolygon(p: Point, q: Point, polygon: readonly Point[]): boolean {
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (x: Point) => {
    let sign = 0;
    for (let i = 0; i < polygon.length; i++) {
      const c = cross(polygon[i]!, polygon[(i + 1) % polygon.length]!, x);
      if (c === 0) continue;
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  };
  if (inside(p) || inside(q)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (
      Math.sign(cross(p, q, a)) !== Math.sign(cross(p, q, b)) &&
      Math.sign(cross(a, b, p)) !== Math.sign(cross(a, b, q))
    )
      return true;
  }
  return false;
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
  const preferred = input.preferredStart ?? -1;
  const lines = lineObstacles(input.lines ?? []);
  // An open path (roadmap 9.15) is read at its end nail, coming from the last nail before it.
  const end = inst.fixedEdge?.[1] ?? -1;
  const arrival = (): Direction | null => {
    const path = openPath(inst, tour);
    if (!path) return null;
    const [a, b] = [points[path[path.length - 2]!]!, points[end]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : null;
  };
  for (let slot = 0; slot < inst.n; slot++) {
    if (end >= 0 && slot !== end) continue;
    const bisector = end >= 0 ? arrival() : outwardBisector(points, tour, slot);
    if (!bisector) continue;
    const origin = points[slot]!;
    // The scale runs along the outward bisector; for the preferred start nail also rotated
    // (the bisector may be blocked), keeping 30° from both tour edges at the nail.
    const [na, nb] = [
      tour[(tour.indexOf(slot) + inst.n - 1) % inst.n]!,
      tour[(tour.indexOf(slot) + 1) % inst.n]!,
    ];
    const directions: Direction[] = [bisector];
    if (slot === preferred || slot === end) {
      for (const deg of [15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90]) {
        const a = (deg * Math.PI) / 180;
        const u: Direction = [
          bisector[0] * Math.cos(a) - bisector[1] * Math.sin(a),
          bisector[0] * Math.sin(a) + bisector[1] * Math.cos(a),
        ];
        const limit = (150 * Math.PI) / 180;
        // At the end of an open path only the arrival wraps (the other neighbour is the start).
        const fromStart = inst.fixedEdge?.[0];
        if (
          (na === fromStart || endWrapAngle(origin, points[na]!, u) <= limit) &&
          (nb === fromStart || endWrapAngle(origin, points[nb]!, u) <= limit)
        )
          directions.push(u);
      }
    }
    for (const u of directions) {
      const band = scaleBand(origin, u, startMm - 1, endMm + 2, spec.halfWidthMm);
      if (!insideBoard(band, input.width, input.height, edge)) continue;
      if (input.reserved && hitsObstacle(input.reserved, { kind: 'polygon', points: band }))
        continue;
      if (
        lines.some(
          (o) =>
            o.kind === 'polygon' &&
            o.points.some((p, i) =>
              segmentMeetsPolygon(p, o.points[(i + 1) % o.points.length]!, band),
            ),
        )
      )
        continue;
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
        crossings: tour.filter((v, i) => {
          const w = tour[(i + 1) % tour.length]!;
          return v !== slot && w !== slot && segmentMeetsPolygon(points[v]!, points[w]!, band);
        }).length,
      });
    }
  }
  // The preferred start nail first; then start nails whose bound reaches the target, among
  // them those whose scale crosses no tour edge, then the largest bound.
  const target = input.targetGapUm;
  return result.sort(
    (a, b) =>
      Number(b.scale.slot === preferred) - Number(a.scale.slot === preferred) ||
      Number(b.boundUm >= target) - Number(a.boundUm >= target) ||
      a.crossings - b.crossings ||
      b.boundUm - a.boundUm ||
      a.scale.slot - b.scale.slot,
  );
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
  const asObstacle = boxObstacle;
  const reserved = [
    ...(input.reserved ? [boxObstacle(input.reserved)] : []),
    ...lineObstacles(input.lines ?? []),
  ];

  // Footer: bottom edge, centred, left or right.
  let footer: Box | null = null;
  if (input.footerSize) {
    const [w, h] = input.footerSize;
    const y = height - edge - h;
    for (const x of [(width - w) / 2, edge + 5, width - edge - 5 - w]) {
      const box: Box = [x, y, x + w, y + h];
      if (free(box, [scaleObstacle, ...reserved])) {
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
    const blockers = [scaleObstacle, ...reserved, ...(footer ? [asObstacle(footer)] : [])];
    title = corners.find((box) => free(box, blockers)) ?? null;
  }

  const obstacles = [
    scaleObstacle,
    ...reserved,
    ...(title ? [asObstacle(title)] : []),
    ...(footer ? [asObstacle(footer)] : []),
  ];
  let labels: PlacedLabel[] = [];
  let complete = true;
  let unplaced = 0;
  if (input.labels) {
    const { options, startMetrics } = input.labels;
    const metrics = input.labels.metrics.map((m, i) =>
      i === scale.slot && startMetrics ? startMetrics[i]! : m,
    );
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
  // A preferred start nail may need checks of several scale directions first.
  const maxExact = options.maxExact ?? (input.preferredStart != null ? 6 : 3);
  // Nails inside the legend box (the map would have to move).
  const reservedBox = input.reserved ?? null;
  const inLegend = reservedBox
    ? input.inst
        .pointsMm()
        .filter(
          ([x, y]) =>
            x > reservedBox[0] && x < reservedBox[2] && y > reservedBox[1] && y < reservedBox[3],
        ).length
    : 0;
  let best: { plan: BoardPlan; score: number } | null = null;
  let exactRuns = 0;
  let examined = 0;
  for (const candidate of candidates.slice(0, maxLayouts)) {
    examined++;
    const lay = layout(input, candidate.scale);
    const warnings: PlanWarning[] = [];
    if (inLegend > 0) warnings.push({ kind: 'legend-overlap', nails: inLegend });
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
          second: check.second,
        };
        if (!check.sameOptimum) warnings.push({ kind: 'optimum-differs' });
      } else {
        measured = { ...measured, status: check.status };
      }
    }
    if (measured.kind === 'bound') warnings.push({ kind: 'measurement-unverified' });
    if (measured.gapUm < input.targetGapUm)
      warnings.push({ kind: 'gap-below-target', gapUm: measured.gapUm });
    const preferred = input.preferredStart ?? null;
    if (preferred !== null && candidate.scale.slot !== preferred)
      warnings.push({ kind: 'start-not-preferred' });
    const plan: BoardPlan = {
      scale: candidate.scale,
      measured,
      title: lay.title,
      footer: lay.footer,
      legend: reservedBox,
      labels: lay.labels,
      labelsComplete: lay.complete,
      warnings,
      examined,
    };
    // Complete layout first, then reaching the target (for the preferred start nail its own,
    // lower bar), then the measured gap.
    const reaches =
      measured.gapUm >= input.targetGapUm ||
      (preferred !== null &&
        candidate.scale.slot === preferred &&
        measured.kind === 'exact' &&
        measured.gapUm >= (input.preferredStartMinGapUm ?? PREFERRED_START_MIN_GAP_UM));
    const score =
      (lay.complete ? 4 : 0) +
      (lay.titleMissing ? 0 : 1) +
      (reaches ? 2 : 0) +
      (preferred !== null && candidate.scale.slot === preferred && reaches ? 0.5 : 0) +
      Math.min(0.49, (0.49 * Math.max(0, measured.gapUm)) / Math.max(1, 10 * input.targetGapUm));
    if (!best || score > best.score) best = { plan, score };
    const done =
      lay.complete && !lay.titleMissing && reaches && (measured.kind === 'exact' || !backend);
    if (done) break;
    if (backend && exactRuns >= maxExact && best.plan.labelsComplete) break;
  }
  return best ? { ...best.plan, examined } : null;
}

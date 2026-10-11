// Label placement: every nail gets its city name at one of eight positions around it (the
// classic 8-position model), without overlapping other labels, nails, obstacles (the scale,
// the title) or the board edge. Used as a feasibility constraint in the search and for the
// export, with the same deterministic solver, so the board shows what the search checked.
//
// Solver: backtracking with forward checking, smallest domain first, positions tried in order
// of preference; a node limit bounds the effort (the search uses a small one). The result is
// then improved greedily towards preferred positions. If no complete placement is found, a
// greedy placement reports how many labels did not fit.

import type { Point } from '../geometry';
import { FONT_METRICS, type TextMetrics } from './text';

/** Positions in order of preference. */
export const POSITIONS = ['E', 'NE', 'SE', 'W', 'NW', 'SW', 'N', 'S'] as const;
export type LabelPosition = (typeof POSITIONS)[number];

export interface LabelOptions {
  /** Font size (em) in mm. */
  readonly sizeMm: number;
  /** Keep-out radius around every nail centre in mm (nail head, string, a little air). */
  readonly nailClearanceMm: number;
  /** Distance between the keep-out circle of a label's own nail and its ink box, mm. */
  readonly gapMm: number;
  /** Minimum distance between two labels' ink boxes, mm. */
  readonly spacingMm: number;
  /** Labels stay this far inside the board edge, mm. */
  readonly edgeMm: number;
}

export const DEFAULT_LABELS: LabelOptions = {
  sizeMm: 8,
  nailClearanceMm: 3,
  gapMm: 1,
  spacingMm: 1.5,
  edgeMm: 5,
};

/** Label options for a font size and nail diameter (mm): keep 2.5 mm around the nail. */
export function labelOptions(sizeMm: number, nailDiameterMm: number): LabelOptions {
  return { ...DEFAULT_LABELS, sizeMm, nailClearanceMm: nailDiameterMm / 2 + 2.5 };
}

/** Axis-parallel box [x0, y0, x1, y1] in mm. */
export type Box = readonly [number, number, number, number];

export interface LabelCandidate {
  readonly position: LabelPosition;
  /** Preference rank (0 = best). */
  readonly rank: number;
  /** Ink box on the board. */
  readonly box: Box;
  /** Start of the baseline (text anchor 'start'). */
  readonly baseline: Point;
}

/** Obstacles labels must avoid: convex polygons (any orientation) or circles. */
export type Obstacle =
  | { readonly kind: 'polygon'; readonly points: readonly Point[] }
  | { readonly kind: 'circle'; readonly centre: Point; readonly radius: number };

/** The eight candidate ink boxes of a label for a nail at p. */
export function labelCandidates(
  p: Point,
  metrics: TextMetrics,
  options: LabelOptions,
): LabelCandidate[] {
  const [px, py] = p;
  const w = metrics.inkRight - metrics.inkLeft;
  const h = metrics.inkBottom - metrics.inkTop;
  const r = options.nailClearanceMm + options.gapMm;
  const d = r / Math.SQRT2;
  // E and W: the cap height is centred on the nail, so labels line up regardless of descenders.
  const capTop = py - (FONT_METRICS.capHeight * options.sizeMm) / 2;
  const sideTop = capTop + (FONT_METRICS.capHeight * options.sizeMm + metrics.inkTop);
  const corners: Record<LabelPosition, Point> = {
    E: [px + r, sideTop],
    W: [px - r - w, sideTop],
    NE: [px + d, py - d - h],
    SE: [px + d, py + d],
    NW: [px - d - w, py - d - h],
    SW: [px - d - w, py + d],
    N: [px - w / 2, py - r - h],
    S: [px - w / 2, py + r],
  };
  return POSITIONS.map((position, rank) => {
    const [x0, y0] = corners[position];
    return {
      position,
      rank,
      box: [x0, y0, x0 + w, y0 + h],
      baseline: [x0 - metrics.inkLeft, y0 - metrics.inkTop],
    };
  });
}

function boxesOverlap(a: Box, b: Box, spacing: number): boolean {
  return (
    a[0] < b[2] + spacing && b[0] < a[2] + spacing && a[1] < b[3] + spacing && b[1] < a[3] + spacing
  );
}

function boxCircle(box: Box, centre: Point, radius: number): boolean {
  const dx = Math.max(box[0] - centre[0], 0, centre[0] - box[2]);
  const dy = Math.max(box[1] - centre[1], 0, centre[1] - box[3]);
  return dx * dx + dy * dy < radius * radius;
}

/** Separating axis test between a box and a convex polygon. */
function boxPolygon(box: Box, polygon: readonly Point[]): boolean {
  const corners: Point[] = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ];
  const axes: Point[] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[(i + 1) % polygon.length]!;
    axes.push([ay - by, bx - ax]);
  }
  for (const [nx, ny] of axes) {
    let [min1, max1, min2, max2] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of corners) {
      const v = x * nx + y * ny;
      min1 = Math.min(min1, v);
      max1 = Math.max(max1, v);
    }
    for (const [x, y] of polygon) {
      const v = x * nx + y * ny;
      min2 = Math.min(min2, v);
      max2 = Math.max(max2, v);
    }
    if (max1 <= min2 || max2 <= min1) return false;
  }
  return true;
}

export function hitsObstacle(box: Box, obstacle: Obstacle): boolean {
  return obstacle.kind === 'circle'
    ? boxCircle(box, obstacle.centre, obstacle.radius)
    : boxPolygon(box, obstacle.points);
}

export interface PlacementProblem {
  /** Nail positions (all nails on the board, each with a label). */
  readonly points: readonly Point[];
  /** Candidates per nail (from labelCandidates). */
  readonly candidates: readonly (readonly LabelCandidate[])[];
  readonly obstacles?: readonly Obstacle[];
  /** Board size in mm. */
  readonly width: number;
  readonly height: number;
  readonly options: LabelOptions;
  /** Backtracking node limit. */
  readonly nodeLimit?: number;
}

export interface Placement {
  /** Chosen candidate index per nail; -1 where no label fits (incomplete placements only). */
  readonly choice: readonly number[];
  readonly complete: boolean;
  /** Labels that could not be placed (0 if complete). */
  readonly unplaced: number;
  /** Backtracking nodes used. */
  readonly nodes: number;
}

export const SEARCH_NODE_LIMIT = 2000;
export const EXPORT_NODE_LIMIT = 200_000;

export function placeLabels(problem: PlacementProblem): Placement {
  const { points, candidates, options } = problem;
  const n = points.length;
  const k = POSITIONS.length;
  const edge = options.edgeMm;
  const clearance = options.nailClearanceMm;

  // Unary filtering: board edge, nails, obstacles.
  const valid = new Uint8Array(n * k);
  for (let i = 0; i < n; i++) {
    const list = candidates[i]!;
    for (let a = 0; a < list.length; a++) {
      const box = list[a]!.box;
      if (box[0] < edge || box[1] < edge) continue;
      if (box[2] > problem.width - edge || box[3] > problem.height - edge) continue;
      if (points.some((p) => boxCircle(box, p, clearance))) continue;
      if (problem.obstacles?.some((o) => hitsObstacle(box, o))) continue;
      valid[i * k + a] = 1;
    }
  }

  // Pairwise conflicts between valid candidates of different nails.
  const conflicts: number[][] = Array.from({ length: n * k }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let a = 0; a < k; a++) {
        if (!valid[i * k + a]) continue;
        const boxA = candidates[i]![a]!.box;
        for (let b = 0; b < k; b++) {
          if (!valid[j * k + b]) continue;
          if (boxesOverlap(boxA, candidates[j]![b]!.box, options.spacingMm)) {
            conflicts[i * k + a]!.push(j * k + b);
            conflicts[j * k + b]!.push(i * k + a);
          }
        }
      }
    }
  }

  const solution = backtrack(n, k, valid, conflicts, problem.nodeLimit ?? EXPORT_NODE_LIMIT);
  if (solution.choice) {
    improve(solution.choice, k, valid, conflicts);
    return { choice: solution.choice, complete: true, unplaced: 0, nodes: solution.nodes };
  }
  const choice = greedy(n, k, valid, conflicts);
  const unplaced = choice.filter((c) => c < 0).length;
  return { choice, complete: unplaced === 0, unplaced, nodes: solution.nodes };
}

function backtrack(
  n: number,
  k: number,
  valid: Uint8Array,
  conflicts: readonly (readonly number[])[],
  nodeLimit: number,
): { choice: number[] | null; nodes: number } {
  // count[v] > 0: candidate v is blocked by that many chosen candidates (or invalid).
  const blocked = new Int32Array(n * k);
  for (let v = 0; v < n * k; v++) if (!valid[v]) blocked[v] = 1;
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) if (!blocked[i * k + a]) size[i]!++;
  const choice = new Array<number>(n).fill(-1);
  let nodes = 0;
  let aborted = false;

  const assign = (v: number, delta: 1 | -1): void => {
    for (const w of conflicts[v]!) {
      const i = Math.floor(w / k);
      // Candidates of assigned nails are not tracked (every deeper assignment is undone first).
      if (choice[i]! >= 0) continue;
      const before = blocked[w]!;
      blocked[w] = before + delta;
      if (before === 0 && delta === 1) size[i]!--;
      else if (before === 1 && delta === -1) size[i]!++;
    }
  };

  const solve = (assigned: number): boolean => {
    if (assigned === n) return true;
    if (++nodes > nodeLimit) {
      aborted = true;
      return false;
    }
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (choice[i]! >= 0) continue;
      if (size[i] === 0) return false;
      if (best < 0 || size[i]! < size[best]!) best = i;
    }
    for (let a = 0; a < k; a++) {
      const v = best * k + a;
      if (blocked[v]) continue;
      choice[best] = a;
      assign(v, 1);
      if (solve(assigned + 1)) return true;
      assign(v, -1);
      choice[best] = -1;
      if (aborted) return false;
    }
    return false;
  };
  return { choice: solve(0) ? choice : null, nodes: Math.min(nodes, nodeLimit) };
}

/** Moves labels to more preferred positions while the placement stays conflict-free. */
function improve(
  choice: number[],
  k: number,
  valid: Uint8Array,
  conflicts: readonly (readonly number[])[],
): void {
  const chosen = (w: number) => choice[Math.floor(w / k)] === w % k;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < choice.length; i++) {
      for (let a = 0; a < choice[i]!; a++) {
        const v = i * k + a;
        if (!valid[v] || conflicts[v]!.some(chosen)) continue;
        choice[i] = a;
        changed = true;
        break;
      }
    }
  }
}

function greedy(
  n: number,
  k: number,
  valid: Uint8Array,
  conflicts: readonly (readonly number[])[],
): number[] {
  const choice = new Array<number>(n).fill(-1);
  const chosen = (w: number) => choice[Math.floor(w / k)] === w % k;
  const options = (i: number) => {
    let count = 0;
    for (let a = 0; a < k; a++) if (valid[i * k + a]) count++;
    return count;
  };
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => options(i) - options(j));
  for (const i of order) {
    for (let a = 0; a < k; a++) {
      const v = i * k + a;
      if (valid[v] && !conflicts[v]!.some(chosen)) {
        choice[i] = a;
        break;
      }
    }
  }
  return choice;
}

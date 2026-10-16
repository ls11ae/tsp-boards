// Drawing of the incremental board: numbered nails, the measuring track around the corner
// pegs with one mark per instance, and a line of text. Same layers as the map board
// (board/drawing.ts), so the SVG and PDF writers apply unchanged.

import type { BoardDrawing, DrawItem, HoleMode } from '../board/drawing';
import { labelCandidates, labelOptions, placeLabels, type Obstacle } from '../board/labels';
import { circlePath, polygonPath, polylinePath, rectPath, type PathCommand } from '../board/shapes';
import { measureText, textPath, FONT_METRICS } from '../board/text';
import type { Point } from '../geometry';
import { trackMarks, type IncrementalPuzzle } from './generate';
import { cornerPegs, trackPoint } from './track';

export interface IncrementalDrawingOptions {
  readonly nailDiameterMm: number;
  readonly labelSizeMm: number;
  readonly holes: HoleMode;
  /** Cut the board outline. */
  readonly edge?: boolean;
  readonly cornerRadiusMm: number;
  /** Text along the bottom edge. */
  readonly line: string;
}

const MARK_TEXT_MM = 5;
const LINE_TEXT_MM = 4;

/** Polygon around segment ab, `half` mm to each side. */
function band(a: Point, b: Point, half: number): Point[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

export function drawIncremental(
  puzzle: IncrementalPuzzle,
  options: IncrementalDrawingOptions,
): { drawing: BoardDrawing; labelsComplete: boolean } {
  const { params, points, track } = puzzle;
  const { widthMm: w, heightMm: h } = params;
  const score: PathCommand[] = [];
  const engrave: PathCommand[] = [];
  const cut: PathCommand[] = [];
  const pits: PathCommand[] = [];
  const obstacles: Obstacle[] = [];

  // Track: the first leg and the edges around the pegs.
  score.push(...polylinePath(track.polyline));
  for (let i = 1; i < track.polyline.length; i++)
    obstacles.push({
      kind: 'polygon',
      points: band(track.polyline[i - 1]!, track.polyline[i]!, 6),
    });

  // Marks: a bar across the track, the field covering both directions, the number inside.
  for (const mark of trackMarks(puzzle.steps, track)) {
    const { point, direction } = trackPoint(track, mark.s);
    const n: Point = [-direction[1], direction[0]];
    const at = (s: number, off: number): Point => {
      const p = trackPoint(track, s).point;
      return [p[0] + n[0] * off, p[1] + n[1] * off];
    };
    engrave.push(
      ...polygonPath([
        at(mark.s - 0.35, -5),
        at(mark.s + 0.35, -5),
        at(mark.s + 0.35, 5),
        at(mark.s - 0.35, 5),
      ]),
    );
    if (mark.to - mark.from > 0.3)
      engrave.push(
        ...polygonPath([
          at(mark.from, -1.5),
          at(mark.to, -1.5),
          at(mark.to, 1.5),
          at(mark.from, 1.5),
        ]),
      );
    const label = String(mark.k);
    const centre: Point = [point[0] + n[0] * 10, point[1] + n[1] * 10];
    const m = measureText(label, MARK_TEXT_MM);
    const x = centre[0] - m.width / 2;
    const y = centre[1] + (FONT_METRICS.capHeight * MARK_TEXT_MM) / 2;
    engrave.push(...textPath(label, x, y, MARK_TEXT_MM));
    obstacles.push({
      kind: 'polygon',
      points: [
        [x - 1, y - 6],
        [x + m.width + 1, y - 6],
        [x + m.width + 1, y + 2],
        [x - 1, y + 2],
      ],
    });
  }

  // Pegs and nails.
  const pegs = cornerPegs(w, h, params.trackInsetMm);
  const r = options.nailDiameterMm / 2;
  for (const [x, y] of [...points, ...pegs]) {
    if (options.holes === 'cut') cut.push(...circlePath(x, y, r));
    else if (options.holes === 'pit') pits.push(...circlePath(x, y, 0.5));
    else {
      score.push(
        ...polylinePath([
          [x - 1.5, y],
          [x + 1.5, y],
        ]),
      );
      score.push(
        ...polylinePath([
          [x, y - 1.5],
          [x, y + 1.5],
        ]),
      );
      score.push(...circlePath(x, y, r));
    }
  }
  const start = points[0]!;
  score.push(...circlePath(start[0], start[1], r + 3));

  // Numbers at the nails.
  const lopts = labelOptions(options.labelSizeMm, options.nailDiameterMm);
  const texts = points.map((_, i) => String(i + 1));
  const candidates = points.map((p, i) =>
    labelCandidates(p, measureText(texts[i]!, lopts.sizeMm), lopts),
  );
  for (const p of pegs)
    obstacles.push({ kind: 'circle', centre: p, radius: lopts.nailClearanceMm });
  const placement = placeLabels({
    points,
    candidates,
    obstacles,
    width: w,
    height: h,
    options: lopts,
  });
  points.forEach((_, i) => {
    const candidate = candidates[i]![Math.max(0, placement.choice[i]!)]!;
    engrave.push(
      ...textPath(texts[i]!, candidate.baseline[0], candidate.baseline[1], lopts.sizeMm),
    );
  });

  // Line of text along the bottom edge, outside the track.
  const lineWidth = measureText(options.line, LINE_TEXT_MM).width;
  const size = lineWidth > w - 40 ? (LINE_TEXT_MM * (w - 40)) / lineWidth : LINE_TEXT_MM;
  engrave.push(...textPath(options.line, w / 2, h - 5, size, { anchor: 'middle' }));

  const edge = options.edge === false ? [] : rectPath(0, 0, w, h, options.cornerRadiusMm);
  const items: DrawItem[] = [
    { layer: 'score', path: score, fill: false },
    { layer: 'engrave', path: engrave, fill: true },
    { layer: 'pit', path: pits, fill: true },
    { layer: 'cut', path: cut, fill: false },
    { layer: 'edge', path: edge, fill: false },
  ].filter((i) => i.path.length > 0) as DrawItem[];
  return {
    drawing: { width: w, height: h, items },
    labelsComplete: placement.complete,
  };
}

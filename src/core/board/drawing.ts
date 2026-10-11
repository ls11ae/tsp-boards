// The board as vector drawing in mm, by laser operation:
//   cut      board outline and nail holes (cut through),
//   score    thin lines: inner borders, neighbouring countries, the scale, nail marks,
//   outline  the country/region outline (scored with more power),
//   engrave  filled shapes: labels, title, footer, scale numbers and target mark.
// The SVG and PDF writers style these layers for the laser or for printing.

import type { Point } from '../geometry';
import type { LabelOptions } from './labels';
import type { MapLines } from './map-lines';
import { subtractHoles } from './map-lines';
import type { BoardPlan, ScalePlan } from './plan';
import {
  circlePath,
  polygonPath,
  polylinePath,
  rectPath,
  type Path,
  type PathCommand,
} from './shapes';
import { FONT_METRICS, measureText, textPath } from './text';

export type Layer = 'cut' | 'score' | 'outline' | 'engrave';
export const LAYERS: readonly Layer[] = ['engrave', 'score', 'outline', 'cut'];

export interface DrawItem {
  readonly layer: Layer;
  readonly path: Path;
  /** Filled shape (engraved area) rather than a line. */
  readonly fill: boolean;
}

export interface BoardDrawing {
  readonly width: number;
  readonly height: number;
  readonly items: readonly DrawItem[];
}

export interface TextLine {
  readonly text: string;
  readonly sizeMm: number;
}

const LINE_HEIGHT = 1.2;

/** Size [w, h] of a block of text lines (line height 1.2 em). */
export function textBlockSize(lines: readonly TextLine[]): [number, number] {
  return [
    Math.max(0, ...lines.map((l) => measureText(l.text, l.sizeMm).width)),
    lines.reduce((h, l) => h + LINE_HEIGHT * l.sizeMm, 0),
  ];
}

function textBlockPath(lines: readonly TextLine[], x: number, y: number): PathCommand[] {
  const out: PathCommand[] = [];
  let top = y;
  for (const line of lines) {
    out.push(...textPath(line.text, x, top + FONT_METRICS.ascender * line.sizeMm, line.sizeMm));
    top += LINE_HEIGHT * line.sizeMm;
  }
  return out;
}

export interface DrawingOptions {
  /** Cut the nail holes, or only engrave a centre mark for drilling. */
  readonly holes: 'cut' | 'mark';
  readonly holeDiameterMm: number;
  readonly cornerRadiusMm: number;
  /** Map lines end this far inside the board edge, mm. */
  readonly lineInsetMm: number;
  /** Free space between map lines and text, mm. */
  readonly haloMm: number;
}

export const DEFAULT_DRAWING: DrawingOptions = {
  holes: 'cut',
  holeDiameterMm: 2,
  cornerRadiusMm: 5,
  lineInsetMm: 3,
  haloMm: 1.2,
};

export interface DrawingInput {
  readonly width: number;
  readonly height: number;
  /** Nail positions in slot order. */
  readonly points: readonly Point[];
  readonly plan: BoardPlan;
  /** Label text per slot (null: no labels). */
  readonly labelTexts: readonly string[] | null;
  readonly labelOptions: LabelOptions | null;
  readonly title: readonly TextLine[] | null;
  readonly footer: TextLine | null;
  readonly scaleCaption: string;
  /** Map lines, already clipped to the board inset. */
  readonly map: MapLines;
}

const SCALE_TEXT_MM = 3.5;

/** Frame of the scale: point at distance t along the direction, w across it. */
function scalePoint(s: ScalePlan, t: number, w: number): Point {
  const [ux, uy] = s.direction;
  return [s.origin[0] + t * ux - w * uy, s.origin[1] + t * uy + w * ux];
}

function scaleRect(s: ScalePlan, t0: number, t1: number, w0: number, w1: number): PathCommand[] {
  return polygonPath([
    scalePoint(s, t0, w0),
    scalePoint(s, t1, w0),
    scalePoint(s, t1, w1),
    scalePoint(s, t0, w1),
  ]);
}

/** Text centred at (t, w) of the scale frame, running along the scale and never upside down. */
function scaleText(s: ScalePlan, text: string, t: number, w: number, size: number): PathCommand[] {
  const [ux, uy] = s.direction;
  const angle = ux >= -1e-9 ? Math.atan2(uy, ux) : Math.atan2(-uy, -ux);
  const [cx, cy] = scalePoint(s, t, w);
  const drop = (FONT_METRICS.capHeight * size) / 2;
  const x = cx - Math.sin(angle) * drop;
  const y = cy + Math.cos(angle) * drop;
  return textPath(text, x, y, size, { anchor: 'middle', angle });
}

/** Scale: axis, ticks every 5 mm, numbers every 10 mm (mm of string beyond the optimum). */
function drawScale(s: ScalePlan, gapUm: number, caption: string): DrawItem[] {
  const score: PathCommand[] = [];
  const engrave: PathCommand[] = [];
  const line = (t0: number, w0: number, t1: number, w1: number) =>
    score.push(...polylinePath([scalePoint(s, t0, w0), scalePoint(s, t1, w1)]));
  line(s.startMm, 0, s.endMm, 0);
  const D = s.targetMm;
  for (let k = -Math.floor((s.endMm - D) / 5); D - 5 * k >= s.startMm + 1; k++) {
    if (k === 0) continue;
    const t = D - 5 * k;
    const half = k % 2 === 0 ? 3 : 1.5;
    line(t, -half, t, half);
    if (k > 0 && k % 2 === 0 && t >= s.startMm + 4)
      engrave.push(...scaleText(s, String(5 * k), t, half + 3, SCALE_TEXT_MM));
  }
  // Target: bar across the axis, the tolerance zone (half the measured gap, at most 10 mm)
  // as a frame, and "0".
  engrave.push(...scaleRect(s, D - 0.4, D + 0.4, -6, 6));
  const zone = Math.max(1, Math.min(10, gapUm / 2000));
  score.push(...scaleRect(s, D - zone, D + zone, -4, 4));
  engrave.push(...scaleText(s, '0', D, 6 + 3, SCALE_TEXT_MM));
  const middle = (s.startMm + D) / 2;
  engrave.push(...scaleText(s, caption, middle, -5.5, SCALE_TEXT_MM * 0.85));
  // Ring around the start nail.
  score.push(...circlePath(s.origin[0], s.origin[1], s.startMm - 0.5));
  return [
    { layer: 'score', path: score, fill: false },
    { layer: 'engrave', path: engrave, fill: true },
  ];
}

function boxPolygon(box: readonly [number, number, number, number], halo: number): Point[] {
  return [
    [box[0] - halo, box[1] - halo],
    [box[2] + halo, box[1] - halo],
    [box[2] + halo, box[3] + halo],
    [box[0] - halo, box[3] + halo],
  ];
}

function circlePolygon([x, y]: Point, r: number, sides = 16): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides;
    return [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  });
}

export function drawBoard(
  input: DrawingInput,
  options: DrawingOptions = DEFAULT_DRAWING,
): BoardDrawing {
  const { plan, points, width, height } = input;
  const items: DrawItem[] = [];
  const halo = options.haloMm;

  // Text and the scale interrupt the map lines.
  const holes: Point[][] = [
    plan.scale.band.map((p) => p),
    ...points.map((p) => circlePolygon(p, 3)),
  ];
  if (plan.title) holes.push(boxPolygon(plan.title, halo));
  if (plan.footer) holes.push(boxPolygon(plan.footer, halo));
  for (const l of plan.labels) holes.push(boxPolygon(l.candidate.box, halo));

  const lines = (list: readonly Point[][]) =>
    subtractHoles(list, holes).flatMap((l) => polylinePath(l));
  items.push({ layer: 'score', path: lines(input.map.thin), fill: false });
  items.push({ layer: 'outline', path: lines(input.map.strong), fill: false });

  // Labels.
  if (input.labelTexts && input.labelOptions) {
    const size = input.labelOptions.sizeMm;
    const path: PathCommand[] = [];
    for (const l of plan.labels) {
      const [x, y] = l.candidate.baseline;
      path.push(...textPath(input.labelTexts[l.slot]!, x, y, size));
    }
    items.push({ layer: 'engrave', path, fill: true });
  }
  if (plan.title && input.title)
    items.push({
      layer: 'engrave',
      path: textBlockPath(input.title, plan.title[0], plan.title[1]),
      fill: true,
    });
  if (plan.footer && input.footer)
    items.push({
      layer: 'engrave',
      path: textBlockPath([input.footer], plan.footer[0], plan.footer[1]),
      fill: true,
    });
  items.push(...drawScale(plan.scale, plan.measured.gapUm, input.scaleCaption));

  // Nails.
  const nails: PathCommand[] = [];
  const marks: PathCommand[] = [];
  for (const [x, y] of points) {
    if (options.holes === 'cut') {
      nails.push(...circlePath(x, y, options.holeDiameterMm / 2));
    } else {
      marks.push(
        ...polylinePath([
          [x - 1.5, y],
          [x + 1.5, y],
        ]),
      );
      marks.push(
        ...polylinePath([
          [x, y - 1.5],
          [x, y + 1.5],
        ]),
      );
      marks.push(...circlePath(x, y, options.holeDiameterMm / 2));
    }
  }
  if (marks.length > 0) items.push({ layer: 'score', path: marks, fill: false });
  items.push({ layer: 'cut', path: nails, fill: false });
  items.push({
    layer: 'cut',
    path: rectPath(0, 0, width, height, options.cornerRadiusMm),
    fill: false,
  });
  return { width, height, items: items.filter((i) => i.path.length > 0) };
}

// Poster export (roadmap 9.7, 9.9): one page in a DIN format (A4 to A0 or B2 to B0, portrait or
// landscape)
// with the map scaled to fit, the shortest round trip drawn as a strong line on top, the places
// as dots with labels, the problem in one line and the length as the answer in large type. A
// poster is not a puzzle: the solution is shown, lengths are great-circle kilometres
// ("Luftlinie", poster-tour.ts).
//
// One place can be emphasized (the Ruhr Innovation Lab on the chair's poster): the round trip
// starts and ends there, its name is large, bold and red (or its logo stands large in free space
// near it), and a composite place shows its cities as named dots in a red outline. Labels keep
// off the legs of the tour, other outlines and the logo, and each sits clearly next to its own
// dot.
//
// Design themes (roadmap 9.10) set the colours of title, length, tour and alliances, a logo at
// the top with its clear space, logos at both ends of the footer and the sender line. Logos on
// the map stay one colour; logos at the top, in the footer and in the legend keep their colours.
//
// Everything is vector, text as outlines (as on the boards), with a white margin and no bleed.
// Typography and lines scale with the paper's short side: A1 is the reference (A0 is A1 enlarged
// by √2, B1 by 707/594), and title and length are readable from about 3 m there.

import type { CountryFile, LabelLanguage } from '../data';
import type { Point } from '../geometry';
import { boardProjection, type BoardProjection } from '../projection';
import type { LegendEntry } from '../puzzle-file';
import { projectionKind, regionFrame, regionOutline, type RegionId } from '../region';
import {
  DEFAULT_LABELS,
  EXPORT_NODE_LIMIT,
  POSITIONS,
  hitsObstacle,
  labelCandidates,
  placeLabels,
  type Box,
  type LabelCandidate,
  type LabelOptions,
  type Obstacle,
} from './labels';
import { logoHeight, type Logo } from './logo';
import { isColorLogo } from './logo-color';
import { boardMapLines } from './map-lines';
import { pageSize, type DinPaper, type Orientation } from './paper';
import { PdfDocument, type Rgb, type StrokeStyle } from './pdf';
import {
  possibleTours,
  startAtPlace,
  stopPoints,
  type PosterStop,
  type PosterTour,
} from './poster-tour';
import { qrMatrix, qrPath } from './qr';
import { logoMetrics } from './setup';
import {
  circlePath,
  polygonPath,
  polylinePath,
  ringPath,
  svgPathData,
  transformPath,
  translate,
  type Matrix,
  type Path,
  type PathCommand,
} from './shapes';
import { FONT_METRICS, measureText, textPath, wrapText, type TextMetrics } from './text';
import { POSTER_TEXTS } from './texts';
import { scaleBarKm } from './worksheet';

export { DIN_PAPERS, DIN_SIZES, pageSize, type DinPaper, type Orientation } from './paper';

const INK: Rgb = [0.1, 0.1, 0.1];
const GREY: Rgb = [0.42, 0.42, 0.42];
const LIGHT: Rgb = [0.74, 0.74, 0.74];
const LAND: Rgb = [0.955, 0.94, 0.915];
const TOUR: Rgb = [0.78, 0.13, 0.09];
const GROUP: Rgb = [0.99, 0.9, 0.84];
const WHITE: Rgb = [1, 1, 1];

/**
 * A label at a corner of its dot keeps other places (dots, labels, outlines) at least this many
 * times as far as its dot; a label above or below its dot keeps them farther than its dot
 * (roadmap 9.11).
 */
export const CORNER_CLEAR = 1.5;

/** Lines of colour logos are at least this wide on paper (mm). */
export const MIN_LOGO_LINE = 0.25;

export interface PosterItem {
  readonly path: Path;
  readonly fill?: Rgb;
  /** Filled by the even-odd rule (logos). */
  readonly evenOdd?: boolean;
  readonly stroke?: {
    readonly color: Rgb;
    readonly width: number;
    readonly dash?: number[];
  } & StrokeStyle;
}

export interface LabelInfo {
  readonly text: string;
  readonly anchor: Point;
  readonly dot: boolean;
  /** The alliance whose outline the label belongs to (its member or its name). */
  readonly group: string | null;
}

/** Colours of a poster (roadmap 9.10). */
export interface PosterColors {
  readonly title: Rgb;
  /** The length, the answer. */
  readonly length: Rgb;
  /** The round trip, the outlines of alliances and the emphasized place. */
  readonly tour: Rgb;
  /** The tint inside the outlines of alliances. */
  readonly group: Rgb;
  /**
   * The names of alliances drawn as outlines (not the emphasized place): ink next to a red
   * round trip, where red names would stand out too much; the tour colour where it is calm
   * (RUB blue).
   */
  readonly groupName: Rgb;
}

export const NEUTRAL_COLORS: PosterColors = {
  title: INK,
  length: TOUR,
  tour: TOUR,
  group: GROUP,
  groupName: INK,
};

/** A logo at the top of the poster, with clear space around it. */
export interface PosterHeaderLogo {
  readonly logo: Logo;
  readonly align: 'left' | 'right';
  /** Height on A1 (scaled with the paper like everything else). */
  readonly heightMm: number;
  /** Free space around the logo, as a fraction of its height (corporate design rules). */
  readonly clearSpace: number;
}

/**
 * A design theme (roadmap 9.10): colours, a logo at the top, logos at both ends of the footer
 * and the sender line. Logos come from local files only.
 */
export interface PosterTheme {
  readonly colors: PosterColors;
  readonly header: PosterHeaderLogo | null;
  readonly footerLeft: Logo | null;
  readonly footerRight: Logo | null;
  /** Height of the footer logos on A1. */
  readonly footerHeightMm: number;
  /** The sender line of the footer instead of the chair line ('' keeps the chair line). */
  readonly sender: string;
}

export interface PosterDrawing {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly items: readonly PosterItem[];
  /** Where the facts went: below the map or beside it. */
  readonly layout: 'band' | 'column';
  /** Paper millimetres per kilometre on the map. */
  readonly mmPerKm: number;
  /** Labels placed at their preferred position although they overlap (0 if all fit). */
  readonly unplacedLabels: number;
  /**
   * Labels above, below or at a corner of their dot with another place (dot, label or outline)
   * too near (see CORNER_CLEAR; 0 unless the placement is incomplete).
   */
  readonly unclearLabels: number;
  /** For checks: the labels' ink boxes, the legs of the tour, the emphasized place's logo. */
  readonly labelBoxes: readonly Box[];
  /**
   * For checks, per label (as in labelBoxes): its first line, its anchor (its dot, or an
   * outline's centre for the outline's name) and whether it names a dot.
   */
  readonly labelInfo: readonly LabelInfo[];
  readonly legs: readonly (readonly [Point, Point])[];
  readonly logoBox: Box | null;
}

/** The emphasized place (roadmap 9.9) and its logo (from a local file, never stored). */
export interface PosterEmphasis {
  /** Index of the place in the puzzle's place list. */
  readonly place: number;
  readonly logo: Logo | null;
}

export interface PosterInput {
  readonly file: CountryFile;
  readonly region: RegionId;
  readonly stops: readonly PosterStop[];
  readonly tour: PosterTour;
  readonly title: string;
  readonly subtitle: string;
  readonly paper: DinPaper;
  readonly orientation: Orientation;
  readonly language: LabelLanguage;
  /** Legend lines (ring: marked places, nail: plain places, none: a note). */
  readonly legend: readonly LegendEntry[];
  readonly emphasis?: PosterEmphasis | null;
  /** Logos instead of other places' labels, by place index (local files, never stored). */
  readonly logos?: ReadonlyMap<number, Logo>;
  readonly legendLogo?: Logo | null;
  /** A logo at the bottom right, e.g. the university's (local files only; a theme's footer
   * logo takes its place). */
  readonly cornerLogo?: Logo | null;
  /** Design theme (default: neutral, no logos). */
  readonly theme?: PosterTheme | null;
  /** The play link of the poster's puzzle as a QR code at the bottom right (roadmap 9.10). */
  readonly qrUrl?: string | null;
  /** No map lines (points placed by hand on a blank board). */
  readonly blankMap?: boolean;
}

/**
 * Sizes in mm for a page whose short side is `short` mm (A1: 594). Everything scales with the
 * short side, so A0 is A1 enlarged by √2 (only the minimum margin and footer size are fixed).
 */
export function posterSizes(short: number) {
  const f = short / 594;
  return {
    f,
    margin: Math.max(10, 18 * f),
    gap: 9 * f,
    title: 24 * f,
    subtitle: 11 * f,
    /** The problem line, and the length as the answer. */
    problem: 12 * f,
    length: 36 * f,
    caption: 7 * f,
    legend: 7.5 * f,
    label: 9 * f,
    /** The emphasized place's name and its "start and finish" line. */
    emphasis: 13.5 * f,
    startCaption: 7.5 * f,
    /** Width of the emphasized place's logo. */
    logo: 100 * f,
    /** The chair line of the footer (cap height about 5 mm on A1) and the credits under it. */
    chair: 7.2 * f,
    footer: Math.max(2.4, 4.2 * f),
    cornerLogo: 70 * f,
    /** The QR code to the game (with its quiet zone). */
    qr: 40 * f,
    dot: 2.4 * f,
    ringOuter: 4.6 * f,
    ringInner: 3.8 * f,
    tour: 2.2 * f,
    strong: 0.5 * f,
    thin: 0.28 * f,
    halo: 1.1 * f,
  };
}
type Sizes = ReturnType<typeof posterSizes>;
/** Sizes and the theme's colours. */
type Style = Sizes & { readonly color: PosterColors };

// --- text --------------------------------------------------------------------------------------

/** A piece of text with its own size and a rise above the baseline (exponents). */
interface Run {
  readonly text: string;
  readonly size: number;
  readonly rise?: number;
}

const runsWidth = (runs: readonly Run[]) =>
  runs.reduce((w, r) => w + measureText(r.text, r.size).width, 0);

function runsPath(runs: readonly Run[], x: number, baseline: number): PathCommand[] {
  const out: PathCommand[] = [];
  let pen = x;
  for (const r of runs) {
    out.push(...textPath(r.text, pen, baseline - (r.rise ?? 0), r.size));
    pen += measureText(r.text, r.size).width;
  }
  return out;
}

class Canvas {
  readonly items: PosterItem[] = [];

  fill(path: Path, color: Rgb, evenOdd = false): void {
    if (path.length > 0) this.items.push({ path, fill: color, ...(evenOdd ? { evenOdd } : {}) });
  }

  stroke(path: Path, color: Rgb, width: number, dash?: number[], style: StrokeStyle = {}): void {
    if (path.length > 0)
      this.items.push({ path, stroke: { color, width, ...(dash ? { dash } : {}), ...style } });
  }

  /**
   * A logo fitted into the box (aspect kept, centred): a one-colour logo in ink, a colour logo
   * in its colours, its lines at least MIN_LOGO_LINE wide.
   */
  logo(logo: Logo, box: Box): void {
    const [x0, y0, x1, y1] = logo.box;
    const scale = (b: Box) => Math.min((b[2] - b[0]) / (x1 - x0), (b[3] - b[1]) / (y1 - y0));
    // Lines widened to the minimum may reach past the logo's box: keep them inside.
    const widened =
      isColorLogo(logo) &&
      logo.parts.some((p) => p.stroke && p.stroke.width * scale(box) < MIN_LOGO_LINE);
    const e = widened ? MIN_LOGO_LINE / 2 : 0;
    const inner: Box = [box[0] + e, box[1] + e, box[2] - e, box[3] - e];
    const k = scale(inner);
    const m: Matrix = [
      k,
      0,
      0,
      k,
      inner[0] + (inner[2] - inner[0] - k * (x1 - x0)) / 2 - k * x0,
      inner[1] + (inner[3] - inner[1] - k * (y1 - y0)) / 2 - k * y0,
    ];
    if (!isColorLogo(logo)) {
      this.fill(transformPath(logo.path, m), INK);
      return;
    }
    for (const part of logo.parts) {
      const path = transformPath(part.path, m);
      if (part.fill) this.fill(path, part.fill, part.evenOdd);
      if (part.stroke) {
        const { color, width, cap, join, miterLimit } = part.stroke;
        this.stroke(path, color, Math.max(MIN_LOGO_LINE, width * k), undefined, {
          cap,
          join,
          miterLimit,
        });
      }
    }
  }

  /** Text with its baseline start at (x, y). */
  text(value: string, x: number, y: number, size: number, color = INK): void {
    this.fill(textPath(value, x, y, size), color);
  }

  /** Text on a white halo (over map lines and the tour). */
  haloText(path: Path, halo: number, color = INK): void {
    this.stroke(path, WHITE, halo);
    this.fill(path, color);
  }
}

/** Wrapped lines from the top y; returns the y below the last line. */
function paragraph(
  c: Canvas | null,
  value: string,
  x: number,
  top: number,
  width: number,
  size: number,
  color = INK,
): number {
  let y = top;
  for (const line of wrapText(value, size, width)) {
    c?.text(line, x, y + FONT_METRICS.ascender * size, size, color);
    y += 1.22 * size;
  }
  return y;
}

// --- number formats ----------------------------------------------------------------------------

function formatter(language: LabelLanguage) {
  const locale = language === 'de' ? 'de-DE' : 'en-GB';
  return (value: number, decimals: number) =>
    value.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
}

/**
 * The problem line with the number of round trips, (n − 1)!/2: "Kürzeste Rundreise unter
 * 3,1 · 10²³ Möglichkeiten:" (the font has no superscript digits: a raised exponent).
 */
export function problemRuns(n: number, size: number, language: LabelLanguage): Run[] {
  const t = POSTER_TEXTS[language];
  const fmt = formatter(language);
  const count = possibleTours(n);
  const number: Run[] =
    count.exact !== null
      ? [{ text: fmt(count.exact, 0), size }]
      : [
          { text: `${fmt(count.mantissa, 1)} ${t.times} 10`, size },
          { text: String(count.exponent), size: size * 0.62, rise: size * 0.42 },
        ];
  return [{ text: t.problemBefore, size }, ...number, { text: t.problemAfter, size }];
}

/** The text of runs, the exponent written as ^ (for reports and tests). */
export function runsText(runs: readonly Run[]): string {
  return runs.map((r) => (r.rise ? `^${r.text}` : r.text)).join('');
}

// --- blocks: facts and legend ------------------------------------------------------------------

interface Block {
  readonly height: number;
  draw(c: Canvas, x: number, y: number): void;
}

function stack(blocks: readonly Block[], gap: number): Block {
  const height = blocks.reduce((h, b, i) => h + b.height + (i > 0 ? gap : 0), 0);
  return {
    height,
    draw(c, x, y) {
      let top = y;
      for (const b of blocks) {
        b.draw(c, x, top);
        top += b.height + gap;
      }
    },
  };
}

/**
 * The problem in one line, the length below it in large type (the answer), and one short
 * line in small type. The problem line shrinks if it does not fit the width.
 */
function factsBlock(problem: Run[], length: string, proof: string, width: number, s: Style): Block {
  const scale = Math.min(1, width / runsWidth(problem));
  const runs = problem.map((r) => ({
    ...r,
    size: r.size * scale,
    ...(r.rise ? { rise: r.rise * scale } : {}),
  }));
  const problemSize = s.problem * scale;
  const lengthTop = 1.3 * problemSize;
  const proofTop = lengthTop + FONT_METRICS.capHeight * s.length + 0.45 * s.length;
  const height = paragraph(null, proof, 0, proofTop, width, s.caption);
  return {
    height,
    draw(c, x, y) {
      c.fill(runsPath(runs, x, y + FONT_METRICS.capHeight * problemSize), INK);
      c.text(
        length,
        x,
        y + lengthTop + FONT_METRICS.capHeight * s.length,
        s.length,
        s.color.length,
      );
      paragraph(c, proof, x, y + proofTop, width, s.caption, GREY);
    },
  };
}

/**
 * The QR code to the game with "Selbst spielen" and the link (without "https://", broken
 * before "#") in small type below it, right-aligned.
 */
function qrBlock(url: string, caption: string, s: Sizes): Block & { readonly width: number } {
  const matrix = qrMatrix(url);
  const shown = url.replace(/^https?:\/\//, '');
  const cut = shown.indexOf('#');
  const urlLines = cut > 0 ? [shown.slice(0, cut), shown.slice(cut)] : [shown];
  const captionSize = s.caption * 1.25;
  const lineW = (text: string, size: number) => measureText(text, size).width;
  const width = Math.max(
    s.qr,
    lineW(caption, captionSize),
    ...urlLines.map((l) => lineW(l, s.footer)),
  );
  const height = s.qr + 1.4 * captionSize + urlLines.length * 1.3 * s.footer;
  return {
    width,
    height,
    draw(c, x, y) {
      const right = x + width;
      c.fill(qrPath(matrix, right - s.qr, y, s.qr), INK);
      let base = y + s.qr + FONT_METRICS.ascender * captionSize;
      c.text(caption, right - lineW(caption, captionSize), base, captionSize);
      base += 0.25 * captionSize + 1.3 * s.footer;
      for (const line of urlLines) {
        c.text(line, right - lineW(line, s.footer), base, s.footer, GREY);
        base += 1.3 * s.footer;
      }
    },
  };
}

type Symbol = 'ring' | 'nail' | 'group' | 'centroid' | null;

/** The legend lines with symbols (symbol lines first), and an optional logo on the left. */
function legendBlock(
  entries: readonly { readonly symbol: Symbol; readonly text: string }[],
  logo: Logo | null,
  width: number,
  s: Style,
): Block | null {
  if (entries.length === 0 && !logo) return null;
  const size = s.legend;
  // A symbol column only if some line has a symbol.
  const symbolW = entries.some((e) => e.symbol) ? 5 * s.ringOuter : 0;
  let textX = 0;
  let logoBox: [number, number] | null = null;
  if (logo) {
    const w = Math.min(width * 0.3, 90 * s.f);
    const h = Math.min(45 * s.f, logoHeight(logo, w));
    logoBox = [w, h];
    textX = w + s.gap;
  }
  const textW = width - textX - symbolW;
  const lines: { symbol: Symbol; text: string; y: number }[] = [];
  let y = 0;
  for (const e of entries) {
    wrapText(e.text, size, textW).forEach((line, i) => {
      lines.push({ symbol: i === 0 ? e.symbol : null, text: line, y });
      y += 1.25 * size;
    });
    y += 0.35 * size;
  }
  const height = Math.max(y, logoBox?.[1] ?? 0);
  return {
    height,
    draw(c, x, top) {
      if (logo && logoBox) {
        c.logo(logo, [x, top, x + logoBox[0], top + logoBox[1]]);
      }
      const shift = (height - y) / 2;
      for (const l of lines) {
        const base = top + shift + l.y + FONT_METRICS.ascender * size;
        c.text(l.text, x + textX + symbolW, base, size);
        if (!l.symbol) continue;
        const cx = x + textX + 2.2 * s.ringOuter;
        const cy = base - (FONT_METRICS.capHeight * size) / 2;
        const d = s.ringOuter * 0.9;
        if (l.symbol === 'group') {
          const shape = roundedHull(
            [
              [cx - d, cy],
              [cx + d, cy],
            ],
            s.ringOuter * 1.15,
          );
          c.fill(shape, s.color.group);
          c.stroke(shape, s.color.tour, s.strong);
          c.fill(
            [...circlePath(cx - d, cy, s.dot * 0.8), ...circlePath(cx + d, cy, s.dot * 0.8)],
            INK,
          );
          continue;
        }
        if (l.symbol === 'centroid') {
          // Two cities (small grey dots) and the stop in their middle.
          c.stroke(
            polylinePath([
              [cx - d, cy + 0.5 * d],
              [cx + d, cy - 0.5 * d],
            ]),
            GREY,
            s.thin * 1.4,
            [1.5 * s.f, 1.2 * s.f],
          );
          c.fill(
            [
              ...circlePath(cx - d, cy + 0.5 * d, s.dot * 0.55),
              ...circlePath(cx + d, cy - 0.5 * d, s.dot * 0.55),
            ],
            GREY,
          );
          c.fill(circlePath(cx, cy, s.dot), INK);
          continue;
        }
        c.fill(circlePath(cx, cy, s.dot), INK);
        if (l.symbol === 'ring') c.fill(ringPath(cx, cy, s.ringOuter, s.ringInner), INK);
      }
    },
  };
}

// --- shapes ------------------------------------------------------------------------------------

/** Convex hull (Andrew's monotone chain), counter-clockwise in y-up terms. */
function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The points' convex hull widened by r (rounded corners), as a convex polygon. */
export function roundedHullPoints(points: readonly Point[], r: number): Point[] {
  const hull = convexHull(points);
  const out: Point[] = [];
  const arc = (c: Point, from: number, sweep: number) => {
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    for (let k = 0; k <= steps; k++) {
      const a = from + (sweep * k) / steps;
      out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
  };
  if (hull.length === 1) {
    arc(hull[0]!, 0, 2 * Math.PI);
    return out.slice(0, -1);
  }
  const m = hull.length;
  for (let i = 0; i < m; i++) {
    const prev = hull[(i - 1 + m) % m]!;
    const cur = hull[i]!;
    const next = hull[(i + 1) % m]!;
    // Outward normals of the edges into and out of this corner (the hull runs counter-
    // clockwise in y-up terms, so the outward normal of (dx, dy) is (dy, -dx)).
    const nIn = Math.atan2(-(cur[0] - prev[0]), cur[1] - prev[1]);
    const nOut = Math.atan2(-(next[0] - cur[0]), next[1] - cur[1]);
    // At a convex corner the normal turns counter-clockwise by the exterior angle; a hull of
    // two points turns by half a circle at each end.
    let sweep = m === 2 ? Math.PI : nOut - nIn;
    while (sweep <= 0) sweep += 2 * Math.PI;
    while (sweep > 2 * Math.PI) sweep -= 2 * Math.PI;
    arc(cur, nIn, sweep);
  }
  return out;
}

/** The outline of the points' convex hull widened by r (rounded corners): an alliance's group. */
export function roundedHull(points: readonly Point[], r: number): PathCommand[] {
  return polygonPath(roundedHullPoints(points, r));
}

// --- geometry helpers --------------------------------------------------------------------------

/** Distance from a point to an axis-parallel box (0 inside). */
/** Distance between a point and the segment ab. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Distance between a box and a closed outline (0 if they meet). */
function boxOutlineDistance(box: Box, outline: readonly Point[]): number {
  if (hitsObstacle(box, { kind: 'polygon', points: outline })) return 0;
  const corners: Point[] = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ];
  let best = Infinity;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    if (segmentMeetsBox(a, b, box)) best = 0;
    best = Math.min(best, boxDistance(box, a), ...corners.map((c) => segmentDistance(c, a, b)));
  });
  return best;
}

/** Distance between two boxes (0 if they touch or overlap). */
function boxGap(a: Box, b: Box): number {
  const dx = Math.max(a[0] - b[2], b[0] - a[2], 0);
  const dy = Math.max(a[1] - b[3], b[1] - a[3], 0);
  return Math.hypot(dx, dy);
}

function boxDistance(box: Box, p: Point): number {
  const dx = Math.max(box[0] - p[0], 0, p[0] - box[2]);
  const dy = Math.max(box[1] - p[1], 0, p[1] - box[3]);
  return Math.hypot(dx, dy);
}

/** Whether the segment ab meets the box (Liang–Barsky clipping). */
export function segmentMeetsBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges: [number, number][] = [
    [-dx, a[0] - box[0]],
    [dx, box[2] - a[0]],
    [-dy, a[1] - box[1]],
    [dy, box[3] - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** A leg of the tour as a thin rectangle (an obstacle for labels and the logo). */
function legPolygon(a: Point, b: Point, half: number): Point[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = ((b[0] - a[0]) / len) * half;
  const uy = ((b[1] - a[1]) / len) * half;
  return [
    [a[0] - ux - uy, a[1] - uy + ux],
    [b[0] + ux - uy, b[1] + uy + ux],
    [b[0] + ux + uy, b[1] + uy - ux],
    [a[0] - ux + uy, a[1] - uy - ux],
  ];
}

function boxPolygon(box: Box): Point[] {
  return [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ];
}

/** Point in any of the rings (even-odd). */
function insideRings(p: Point, rings: readonly (readonly Point[])[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  }
  return inside;
}

/**
 * The eight label positions around a box (an outline), in the order of preference of
 * `labelCandidates`: beside it at mid-height, at the corners, above and below.
 */
function candidatesAroundBox(around: Box, m: TextMetrics, gap: number): LabelCandidate[] {
  const [x0, y0, x1, y1] = around;
  const w = m.inkRight - m.inkLeft;
  const h = m.inkBottom - m.inkTop;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const d = gap / Math.SQRT2;
  const corners: Record<(typeof POSITIONS)[number], Point> = {
    E: [x1 + gap, cy - h / 2],
    W: [x0 - gap - w, cy - h / 2],
    NE: [x1 - 0.25 * (x1 - x0) + d, y0 - d - h],
    SE: [x1 - 0.25 * (x1 - x0) + d, y1 + d],
    NW: [x0 + 0.25 * (x1 - x0) - d - w, y0 - d - h],
    SW: [x0 + 0.25 * (x1 - x0) - d - w, y1 + d],
    N: [cx - w / 2, y0 - gap - h],
    S: [cx - w / 2, y1 + gap],
  };
  return POSITIONS.map((position, rank) => {
    const [bx, by] = corners[position];
    return {
      position,
      rank,
      box: [bx, by, bx + w, by + h],
      baseline: [bx - m.inkLeft, by - m.inkTop],
    };
  });
}

// --- the map -----------------------------------------------------------------------------------

interface MapBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function mapProjection(input: PosterInput, box: MapBox, s: Sizes): BoardProjection {
  return boardProjection(
    regionFrame(input.file, input.region),
    { widthMm: box.w, heightMm: box.h, marginMm: 1.2 * s.label },
    projectionKind(input.file),
  );
}

/** An alliance drawn as one outline: its members as separate stops, or the emphasized place. */
interface Group {
  readonly name: string;
  readonly place: number;
  readonly emphasized: boolean;
  /** Dots inside the outline (map coordinates). */
  readonly points: readonly Point[];
  readonly hull: readonly Point[];
  readonly centre: Point;
  /** Largest distance from the centre to the outline. */
  readonly reach: number;
}

/** A line of a label: text, size, colour, bold (the emphasized place). */
interface LabelLine {
  readonly text: string;
  readonly size: number;
  readonly color: Rgb;
  readonly bold: boolean;
}

interface LabelItem {
  readonly anchor: Point;
  /** Keep-out radius around the anchor (the outline's reach for groups). */
  readonly reach: number;
  readonly lines: readonly LabelLine[];
  /** A logo instead of the text (other places with a logo). */
  readonly logo: Logo | null;
  readonly metrics: TextMetrics;
  /** The group whose outline the label may touch (its own), and whose dots it may be near. */
  readonly group: string | null;
}

/** Ink box of label lines relative to the first line's baseline start. */
function linesMetrics(lines: readonly LabelLine[]): TextMetrics {
  let bottom = 0;
  let width = 0;
  let y = 0;
  lines.forEach((l, i) => {
    if (i > 0) y += 0.3 * lines[i - 1]!.size + l.size;
    const m = measureText(l.text, l.size);
    width = Math.max(width, m.inkRight);
    bottom = y + m.inkBottom;
  });
  const first = measureText(lines[0]!.text, lines[0]!.size);
  return {
    width,
    inkLeft: Math.min(0, first.inkLeft),
    inkRight: width,
    inkTop: first.inkTop,
    inkBottom: Math.max(bottom, first.inkBottom),
  };
}

interface MapResult {
  readonly unplaced: number;
  readonly unclear: number;
  readonly labelInfo: readonly LabelInfo[];
  /** Ink boxes of all labels, the legs of the tour and the logo, in page coordinates. */
  readonly labelBoxes: readonly Box[];
  readonly legs: readonly (readonly [Point, Point])[];
  readonly logoBox: Box | null;
}

/** Draws the map with the tour, dots, groups, logo and labels into `c` (page coordinates). */
function drawMap(c: Canvas, input: PosterInput, box: MapBox, s: Style): MapResult {
  const projection = mapProjection(input, box, s);
  const { stops } = input;
  const t = POSTER_TEXTS[input.language];
  const at = (p: Point): Point => [p[0] + box.x, p[1] + box.y];
  const move = (path: Path) => transformPath(path, translate(box.x, box.y));
  const points = stopPoints(stops, projection);
  const emphasis = input.emphasis ?? null;
  const emphasized = (place: number) => emphasis !== null && emphasis.place === place;
  const tour = emphasis
    ? startAtPlace(stops, input.tour.tour, emphasis.place)
    : [...input.tour.tour];

  // Land and borders.
  let land: Point[][] = [];
  if (!input.blankMap) {
    const outline = regionOutline(input.file, input.region).geometry;
    const rings =
      outline.type === 'Polygon'
        ? outline.coordinates
        : outline.type === 'MultiPolygon'
          ? outline.coordinates.flat()
          : [];
    land = rings.map((ring) => ring.map(([lon, lat]) => projection.project(lon!, lat!)));
    c.fill(move(land.flatMap((ring) => polygonPath(ring))), LAND);
    // Clipped a line width inside the box, so strokes stay in the white margin's bounds.
    const e = s.strong;
    const lines = boardMapLines(input.file, input.region, projection, [e, e, box.w - e, box.h - e]);
    c.stroke(move(lines.thin.flatMap((l) => polylinePath(l))), LIGHT, s.thin);
    c.stroke(move(lines.strong.flatMap((l) => polylinePath(l))), GREY, s.strong);
  }

  // Groups: alliances with separate stops, and the emphasized place with its member cities.
  const groupReach = 2.4 * s.ringOuter;
  const groups: Group[] = [];
  const makeGroup = (name: string, place: number, pts: Point[]): Group => {
    const hull = roundedHullPoints(pts, groupReach);
    const centre: Point = [
      pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
      pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
    ];
    const reach = Math.max(...hull.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1])));
    return { name, place, emphasized: emphasized(place), points: pts, hull, centre, reach };
  };
  const byGroup = new Map<string, number[]>();
  stops.forEach((st, i) => {
    if (st.group) byGroup.set(st.group, [...(byGroup.get(st.group) ?? []), i]);
  });
  for (const [name, members] of byGroup)
    groups.push(
      makeGroup(
        name,
        stops[members[0]!]!.place,
        members.map((i) => points[i]!),
      ),
    );
  // The emphasized place as one stop at its centre: its cities are named dots in the outline.
  const emphasizedCentre = stops.findIndex((st) => st.members && emphasized(st.place));
  const centreMembers =
    emphasizedCentre >= 0
      ? stops[emphasizedCentre]!.members!.map((m) => ({
          name: m.name,
          point: projection.project(m.lon, m.lat),
        }))
      : [];
  if (emphasizedCentre >= 0) {
    const st = stops[emphasizedCentre]!;
    groups.push({
      ...makeGroup(
        st.name,
        st.place,
        centreMembers.map((m) => m.point),
      ),
      centre: points[emphasizedCentre]!,
    });
  }
  for (const g of groups) {
    const hull = move(polygonPath(g.hull));
    c.fill(hull, s.color.group);
    c.stroke(hull, s.color.tour, g.emphasized ? 2 * s.strong : s.strong);
  }

  // Composite stops at their centroid: the members as small dots, connected to the stop.
  const memberDots: Point[] = [];
  stops.forEach((st, i) => {
    if (!st.members) return;
    const named = i === emphasizedCentre;
    for (const m of st.members) {
      const p = projection.project(m.lon, m.lat);
      if (!named) memberDots.push(p);
      c.stroke(move(polylinePath([p, points[i]!])), GREY, s.thin * 1.4, [1.5 * s.f, 1.2 * s.f]);
    }
  });
  c.fill(move(memberDots.flatMap(([x, y]) => circlePath(x, y, s.dot * 0.55))), GREY);

  // The round trip.
  const legs = tour.map((v, i): [Point, Point] => [
    points[v]!,
    points[tour[(i + 1) % tour.length]!]!,
  ]);
  c.stroke(
    move(
      polylinePath(
        tour.map((i) => points[i]!),
        true,
      ),
    ),
    s.color.tour,
    s.tour,
  );

  // Dots and rings; the named cities of the emphasized place; the start and finish.
  const named = centreMembers.map((m) => m.point);
  const dots = [...points, ...named];
  c.fill(move(dots.flatMap(([x, y]) => circlePath(x, y, s.dot + 0.5 * s.f))), WHITE);
  c.fill(move(dots.flatMap(([x, y]) => circlePath(x, y, s.dot))), INK);
  c.fill(
    move(
      points.flatMap(([x, y], i) => {
        const st = stops[i]!;
        return st.highlight && !st.group && !emphasized(st.place)
          ? ringPath(x, y, s.ringOuter, s.ringInner)
          : [];
      }),
    ),
    INK,
  );
  if (emphasis && tour.length > 0) {
    const [x, y] = points[tour[0]!]!;
    c.fill(move(ringPath(x, y, 1.3 * s.ringOuter, 1.3 * s.ringOuter - 1.2 * s.f)), s.color.tour);
  }

  // Scale bar at the bottom left of the map.
  const km = scaleBarKm(projection.mmPerKm, 40 * s.f);
  const barLen = km * projection.mmPerKm;
  const barX = 0.5 * s.label;
  const barY = box.h - 0.6 * s.label;
  const unit = `${formatter(input.language)(km, 0)} km`;
  const tick = 1.6 * s.f * 1.5;
  c.stroke(
    move([
      ...polylinePath([
        [barX, barY],
        [barX + barLen, barY],
      ]),
      ...polylinePath([
        [barX, barY - tick],
        [barX, barY + tick],
      ]),
      ...polylinePath([
        [barX + barLen, barY - tick],
        [barX + barLen, barY + tick],
      ]),
    ]),
    INK,
    s.strong * 1.3,
  );
  const unitW = measureText(unit, s.caption).width;
  c.text(
    '0',
    box.x + barX - measureText('0', s.caption).width / 2,
    box.y + barY - 1.6 * tick,
    s.caption,
  );
  c.text(unit, box.x + barX + barLen - unitW / 2, box.y + barY - 1.6 * tick, s.caption);
  const scaleBox: Box = [0, barY - 1.6 * tick - s.caption, barX + barLen + unitW, box.h];

  // Obstacles of labels and the logo: the legs, the scale bar, small member dots.
  const legObstacles = legs.map(([a, b]): Obstacle => ({
    kind: 'polygon',
    points: legPolygon(a, b, s.tour / 2 + 0.4 * s.f),
  }));
  const obstacles: Obstacle[] = [
    { kind: 'polygon', points: boxPolygon(scaleBox) },
    ...legObstacles,
    ...memberDots.map((p): Obstacle => ({ kind: 'circle', centre: p, radius: s.dot })),
  ];

  // The emphasized place's logo: large, in free space near its outline, with a leader line.
  const emphasisGroup = groups.find((g) => g.emphasized) ?? null;
  const emphasisAnchor: Point | null = emphasisGroup
    ? emphasisGroup.centre
    : emphasis
      ? (points[stops.findIndex((st) => st.place === emphasis.place)] ?? null)
      : null;
  let logoBox: Box | null = null;
  if (emphasis?.logo && emphasisAnchor) {
    const logo = emphasis.logo;
    const w = s.logo;
    const h = Math.min(logoHeight(logo, w), 0.75 * w);
    const lw = h < logoHeight(logo, w) ? (w * h) / logoHeight(logo, w) : w;
    const keepOut: Obstacle[] = [
      ...dots.map((p): Obstacle => ({ kind: 'circle', centre: p, radius: 2.2 * s.label })),
      ...legs.map(([a, b]): Obstacle => ({
        kind: 'polygon',
        points: legPolygon(a, b, s.tour / 2 + 2 * s.f),
      })),
      ...groups.map((g): Obstacle => ({ kind: 'polygon', points: g.hull })),
      { kind: 'polygon', points: boxPolygon(scaleBox) },
    ];
    const nearest = (b: Box) =>
      emphasisGroup
        ? Math.min(...emphasisGroup.hull.map((p) => boxDistance(b, p)))
        : boxDistance(b, emphasisAnchor);
    // Over land of the region costs: the map stays readable (sea or neighbours are free). A
    // raster of the land (cells of 5 mm on A1) answers it quickly for every candidate.
    const cell = 5 * s.f;
    const cols = Math.ceil(box.w / cell);
    const rows = Math.ceil(box.h / cell);
    const mask = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++)
        mask[j * cols + i] = insideRings([(i + 0.5) * cell, (j + 0.5) * cell], land) ? 1 : 0;
    const onLand = (b: Box) => {
      const i0 = Math.max(0, Math.floor(b[0] / cell));
      const i1 = Math.min(cols - 1, Math.floor(b[2] / cell));
      const j0 = Math.max(0, Math.floor(b[1] / cell));
      const j1 = Math.min(rows - 1, Math.floor(b[3] / cell));
      let count = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) count += mask[j * cols + i]!;
      return count / Math.max(1, (i1 - i0 + 1) * (j1 - j0 + 1));
    };
    const step = 3 * s.f;
    const edge = 2 * s.f;
    let best: { box: Box; score: number } | null = null;
    for (let x = edge; x + lw <= box.w - edge; x += step) {
      for (let y = edge; y + h <= box.h - edge; y += step) {
        const b: Box = [x, y, x + lw, y + h];
        const gap = nearest(b);
        if (gap < 3 * s.f) continue;
        const score = gap + 400 * s.f * onLand(b);
        if (best && score >= best.score) continue;
        if (keepOut.some((o) => hitsObstacle(b, o))) continue;
        best = { box: b, score };
      }
    }
    if (best) {
      logoBox = best.box;
      // Leader line from the nearest point of the outline to the logo's box.
      const from = emphasisGroup
        ? emphasisGroup.hull.reduce((p, q) =>
            boxDistance(best.box, q) < boxDistance(best.box, p) ? q : p,
          )
        : emphasisAnchor;
      const to: Point = [
        Math.min(Math.max(from[0], best.box[0]), best.box[2]),
        Math.min(Math.max(from[1], best.box[1]), best.box[3]),
      ];
      c.stroke(move(polylinePath([from, to])), s.color.tour, 0.8 * s.f);
      const [bx0, by0, bx1, by1] = best.box;
      c.logo(logo, [bx0 + box.x, by0 + box.y, bx1 + box.x, by1 + box.y]);
      obstacles.push({ kind: 'polygon', points: boxPolygon(best.box) });
    }
  }

  // Labels: places, the named cities of the emphasized place, the groups' names.
  const clearance = (stops.some((st) => st.highlight) ? s.ringOuter : s.dot) + 0.6 * s.f;
  const plain = (text: string, color = INK): LabelLine[] => [
    { text, size: s.label, color, bold: false },
  ];
  const items: LabelItem[] = [];
  const item = (
    anchor: Point,
    reach: number,
    lines: LabelLine[],
    group: string | null,
    logo: Logo | null = null,
  ) => items.push({ anchor, reach, lines, logo, metrics: linesMetrics(lines), group });
  const emphasisLines = (name: string): LabelLine[] => [
    ...(logoBox ? [] : [{ text: name, size: s.emphasis, color: s.color.tour, bold: true }]),
    { text: t.startFinish, size: s.startCaption, color: s.color.tour, bold: false },
  ];
  stops.forEach((st, i) => {
    if (st.group || i === emphasizedCentre) return;
    if (emphasized(st.place)) item(points[i]!, clearance, emphasisLines(st.name), null);
    else item(points[i]!, clearance, plain(st.name), null, input.logos?.get(st.place) ?? null);
  });
  stops.forEach((st, i) => {
    if (st.group) item(points[i]!, clearance, plain(st.name), st.group);
  });
  for (const m of centreMembers)
    item(m.point, clearance, plain(m.name), stops[emphasizedCentre]!.name);
  for (const g of groups)
    item(
      g.centre,
      g.reach + 0.2 * s.label,
      g.emphasized ? emphasisLines(g.name) : plain(g.name, s.color.groupName),
      g.name,
    );

  const options: LabelOptions = {
    ...DEFAULT_LABELS,
    sizeMm: s.label,
    nailClearanceMm: clearance,
    gapMm: 0.2 * s.label,
    spacingMm: 0.25 * s.label,
    // Halos stay inside the map box (and the white margin).
    edgeMm: 1.2 * s.halo,
  };
  const anchors = items.map((it) => it.anchor);
  const isOwn = (it: LabelItem, q: Point) =>
    q === it.anchor || (q[0] === it.anchor[0] && q[1] === it.anchor[1]);
  // Only a label beside its dot (E, W) has the dot on its line of text. Above or below (N, S)
  // it faces the dot with one side, at a corner (NE, SE, SW, NW) with a corner only, and other
  // places along its sides claim it: Würzburg between the labels of the Rhine-Main alliance
  // read as a fourth city of it (roadmap 9.11). Such labels keep other dots, labels and
  // outlines farther than their own dot: N and S as far, corners CORNER_CLEAR times as far.
  // Outlines' names are exempt (they sit around the outline).
  const placeLabel = items.map(
    (it) => !groups.some((g) => g.name === it.group && g.centre === it.anchor),
  );
  const clearFactor = (i: number, b: Box): number => {
    const [x, y] = items[i]!.anchor;
    if (!placeLabel[i] || (y >= b[1] && y <= b[3])) return 0;
    return x >= b[0] && x <= b[2] ? 1 : CORNER_CLEAR;
  };
  const offLineClear = (i: number, b: Box): boolean => {
    const k = clearFactor(i, b);
    if (k === 0) return true;
    const it = items[i]!;
    const need = k * boxDistance(b, it.anchor);
    const own = groups.find((g) => g.name === it.group) ?? null;
    return (
      dots.every((q) => isOwn(it, q) || boxDistance(b, q) >= need) &&
      groups.every((g) => g === own || boxOutlineDistance(b, g.hull) >= need)
    );
  };
  const pairClear = (i: number, a: Box, j: number, b: Box): boolean => {
    // A member's label next to the name of its own alliance is no confusion.
    const ii = items[i]!;
    const jj = items[j]!;
    if (ii.group !== null && ii.group === jj.group && placeLabel[i] !== placeLabel[j]) return true;
    const gap = boxGap(a, b);
    return (
      gap >= clearFactor(i, a) * boxDistance(a, ii.anchor) &&
      gap >= clearFactor(j, b) * boxDistance(b, jj.anchor)
    );
  };
  // A label sits clearly closer to its own dot than to any other dot or outline (its group's
  // dots aside), stays off the outlines of other groups, and keeps clear of other places at a
  // corner.
  const accept = (i: number, b: Box): boolean => {
    const it = items[i]!;
    const own = groups.find((g) => g.name === it.group) ?? null;
    if (groups.some((g) => g !== own && hitsObstacle(b, { kind: 'polygon', points: g.hull })))
      return false;
    const d0 = boxDistance(b, it.anchor);
    const margin = d0 + 0.35 * s.label;
    return (
      dots.every(
        (q) =>
          isOwn(it, q) ||
          (own !== null && it.anchor === own.centre && own.points.includes(q)) ||
          boxDistance(b, q) >= margin,
      ) &&
      // The outline of another alliance is a place too (Würzburg left of its dot, near the
      // Rhine-Main outline).
      (!placeLabel[i] ||
        groups.every((g) => g === own || boxOutlineDistance(b, g.hull) >= margin)) &&
      offLineClear(i, b)
    );
  };
  // Logos of other places replace their labels if the labels still fit with them.
  let metrics = items.map((it) => it.metrics);
  const logoAt: (Logo | null)[] = items.map(() => null);
  const extra = items.map(() => 0);
  // A group's name sits around its outline's box (the outline is wide and low, a circle of
  // its longest radius would leave the name floating); other labels around their dots.
  const groupBox = (it: LabelItem): Box | null => {
    const g = groups.find((x) => x.name === it.group && x.centre === it.anchor);
    if (!g) return null;
    const xs = g.hull.map((p) => p[0]);
    const ys = g.hull.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const place = (trial: readonly TextMetrics[]) => {
    const candidates = anchors.map((p, i) => {
      const gap = options.gapMm + extra[i]!;
      const around = groupBox(items[i]!);
      return around
        ? candidatesAroundBox(around, trial[i]!, gap)
        : labelCandidates(p, trial[i]!, {
            ...options,
            nailClearanceMm: items[i]!.reach,
            gapMm: gap,
          });
    });
    const placement = placeLabels({
      points: anchors,
      candidates,
      obstacles,
      accept,
      acceptPair: pairClear,
      width: box.w,
      height: box.h,
      options,
      nodeLimit: EXPORT_NODE_LIMIT,
    });
    return { candidates, placement };
  };
  items.forEach((it, i) => {
    if (!it.logo) return;
    for (const w of [64, 54, 46, 38].map((v) => v * s.f)) {
      const trial = metrics.map((m, j) => (j === i ? logoMetrics(it.logo!, w, s.label) : m));
      if (place(trial).placement.complete) {
        metrics = trial;
        logoAt[i] = it.logo;
        return;
      }
    }
  });
  // Labels without room move a little farther from their dots (twice at most).
  let result = place(metrics);
  for (let round = 1; round <= 2 && !result.placement.complete; round++) {
    result.placement.choice.forEach((choice, i) => {
      if (choice < 0) extra[i] = round * 0.6 * s.label;
    });
    const next = place(metrics);
    if (next.placement.unplaced <= result.placement.unplaced) result = next;
  }
  const { candidates, placement } = result;
  const chosen = placement.choice.map((choice, i) => candidates[i]![Math.max(0, choice)]!.box);
  const unclear = chosen.filter(
    (b, i) => !offLineClear(i, b) || chosen.some((o, j) => j !== i && !pairClear(i, b, j, o)),
  ).length;
  const labelBoxes: Box[] = [];
  placement.choice.forEach((choice, i) => {
    const cand: LabelCandidate = candidates[i]![Math.max(0, choice)]!;
    const [x0, y0, x1, y1] = cand.box;
    labelBoxes.push([x0 + box.x, y0 + box.y, x1 + box.x, y1 + box.y]);
    const logo = logoAt[i];
    if (logo) {
      c.logo(logo, [box.x + x0, box.y + y0, box.x + x1, box.y + y0 + logoHeight(logo, x1 - x0)]);
      return;
    }
    let y = box.y + cand.baseline[1];
    items[i]!.lines.forEach((l, k) => {
      if (k > 0) y += 0.3 * items[i]!.lines[k - 1]!.size + l.size;
      const path = textPath(l.text, box.x + cand.baseline[0], y, l.size);
      c.haloText(path, s.halo * 2 + (l.bold ? 0.08 * l.size : 0), l.color);
      // Bold: the outline stroked in the text colour (the font has one weight).
      if (l.bold) c.stroke(path, l.color, 0.05 * l.size);
    });
  });
  return {
    unplaced: placement.unplaced,
    unclear,
    labelInfo: items.map((it, i) => ({
      text: it.lines[0]?.text ?? '',
      anchor: at(it.anchor),
      dot: placeLabel[i]!,
      group: it.group,
    })),
    labelBoxes,
    legs: legs.map(([a, b]) => [at(a), at(b)] as const),
    logoBox: logoBox
      ? [logoBox[0] + box.x, logoBox[1] + box.y, logoBox[2] + box.x, logoBox[3] + box.y]
      : null,
  };
}

// --- the page ----------------------------------------------------------------------------------

/** Legend lines: the given ones and the automatic ones, symbol lines first, notes last. */
export function legendEntries(input: PosterInput): { symbol: Symbol; text: string }[] {
  const t = POSTER_TEXTS[input.language];
  // Posters draw closed round trips: a dashed line (an open path's given leg) is text only.
  const given = input.legend.map((e) => ({
    symbol: e.symbol === 'none' || e.symbol === 'dashed' ? null : e.symbol,
    text: e.text,
  }));
  const emphasized = (st: PosterStop) => input.emphasis?.place === st.place;
  const auto: { symbol: Symbol; text: string }[] = [];
  if (
    input.stops.some((st) => st.highlight && !st.group && !emphasized(st)) &&
    !given.some((e) => e.symbol === 'ring')
  )
    auto.push({ symbol: 'ring', text: t.markedLegend });
  if (input.stops.some((st) => st.group)) auto.push({ symbol: 'group', text: t.groupLegend });
  if (input.stops.some((st) => st.members && !emphasized(st)))
    auto.push({ symbol: 'centroid', text: t.centroidLegend });
  const all = [...given, ...auto];
  return [...all.filter((e) => e.symbol), ...all.filter((e) => !e.symbol)];
}

export function drawPoster(input: PosterInput): PosterDrawing {
  const [W, H] = pageSize(input.paper, input.orientation);
  const theme = input.theme ?? null;
  const s: Style = { ...posterSizes(Math.min(W, H)), color: theme?.colors ?? NEUTRAL_COLORS };
  const t = POSTER_TEXTS[input.language];
  const fmt = formatter(input.language);
  const M = s.margin;
  const contentW = W - 2 * M;
  const n = input.stops.length;

  // Logo sizes: by height, at most a share of the content width.
  const sized = (logo: Logo, h: number, maxW: number): [number, number] => {
    const w = Math.min(maxW, (h * (logo.box[2] - logo.box[0])) / (logo.box[3] - logo.box[1]));
    return [w, logoHeight(logo, w)];
  };

  // Header: a theme's logo at the top with its clear space, then the title.
  const head = theme?.header ?? null;
  let headBox: Box | null = null;
  let titleTop = M;
  if (head) {
    const [w, h] = sized(head.logo, head.heightMm * s.f, 0.5 * contentW);
    const x = head.align === 'left' ? M : W - M - w;
    headBox = [x, M, x + w, M + h];
    titleTop = M + h + Math.max(head.clearSpace * h, s.gap);
  }
  // The title on one line, smaller if it does not fit (roadmap 9.10).
  const titleSize = Math.min(s.title, contentW / Math.max(1e-6, measureText(input.title, 1).width));
  const titleLines = [input.title];
  const subtitleLines = input.subtitle ? wrapText(input.subtitle, s.subtitle, contentW) : [];
  const headerH = 1.12 * titleSize + subtitleLines.length * 1.25 * s.subtitle + 0.4 * s.gap;
  const mapTop = titleTop + headerH + s.gap;

  // Footer: the chair or the theme's sender line (large) and the credits; logos at the bottom
  // left and right (a theme's, by height), or a corner logo at the bottom right.
  const footerLogoH = (theme?.footerHeightMm ?? 0) * s.f;
  const left = theme?.footerLeft ?? null;
  const right = theme?.footerRight ?? input.cornerLogo ?? null;
  const [leftW, leftH] = left ? sized(left, footerLogoH, 0.3 * contentW) : [0, 0];
  const [rightW, rightH] = !right
    ? [0, 0]
    : theme?.footerRight
      ? sized(right, footerLogoH, 0.3 * contentW)
      : [s.cornerLogo, Math.min(logoHeight(right, s.cornerLogo), 0.6 * s.cornerLogo)];
  const footerX = M + (left ? leftW + s.gap : 0);
  const footerW = contentW - (left ? leftW + s.gap : 0) - (right ? rightW + s.gap : 0);
  const chairLines = wrapText(theme?.sender || t.chair, s.chair, footerW);
  const creditLines = wrapText(t.attribution, s.footer, footerW);
  const footerTextH = chairLines.length * 1.25 * s.chair + creditLines.length * 1.3 * s.footer;
  const footerH = Math.max(footerTextH, leftH, rightH);
  const bottom = H - M - footerH - 0.6 * s.gap;

  // The problem, the answer, the legend.
  const problem = problemRuns(n, s.problem, input.language);
  const length = `${fmt(Math.round(input.tour.lengthKm), 0)} km`;
  const entries = legendEntries(input);
  const qr = input.qrUrl ? qrBlock(input.qrUrl, t.playYourself, s) : null;
  const facts = (width: number) =>
    stack(
      [
        factsBlock(problem, length, t.proof, width, s),
        legendBlock(entries, input.legendLogo ?? null, width, s),
      ].filter((b): b is Block => b !== null),
      s.gap,
    );
  // Below the map the code stands right of the facts; beside the map below them.
  const side = (width: number, wide: boolean): Block => {
    if (!qr) return facts(width);
    if (!wide) return stack([facts(width), qr], s.gap);
    const left = facts(width - qr.width - 2 * s.gap);
    return {
      height: Math.max(left.height, qr.height),
      draw(c, x, y) {
        left.draw(c, x, y);
        qr.draw(c, x + width - qr.width, y + Math.max(0, left.height - qr.height));
      },
    };
  };

  // Facts below the map (band) or beside it (column): the larger map wins.
  type Option = {
    layout: 'band' | 'column';
    box: MapBox;
    side: Block;
    sideX: number;
    sideY: number;
    scale: number;
  };
  const options: Option[] = [];
  {
    const block = side(contentW, true);
    const box: MapBox = { x: M, y: mapTop, w: contentW, h: bottom - block.height - s.gap - mapTop };
    if (box.h > 0.25 * H)
      options.push({
        layout: 'band',
        box,
        side: block,
        sideX: M,
        sideY: box.y + box.h + s.gap,
        scale: mapProjection(input, box, s).mmPerKm,
      });
  }
  {
    const colW = 0.34 * contentW;
    const block = side(colW, false);
    const box: MapBox = { x: M, y: mapTop, w: contentW - colW - s.gap, h: bottom - mapTop };
    if (block.height <= box.h)
      options.push({
        layout: 'column',
        box,
        side: block,
        sideX: M + box.w + s.gap,
        // The column sits at the bottom of the map's height.
        sideY: bottom - block.height,
        scale: mapProjection(input, box, s).mmPerKm,
      });
  }
  if (options.length === 0) throw new Error('the poster has no room for the map');
  // Ties (within 3 %) go to the band: the facts read best under the map.
  const best = options.reduce((a, b) => (b.scale > a.scale * 1.03 ? b : a));

  const c = new Canvas();
  if (head && headBox) c.logo(head.logo, headBox);
  let y = titleTop;
  for (const line of titleLines) {
    c.text(line, M, y + FONT_METRICS.ascender * titleSize, titleSize, s.color.title);
    y += 1.12 * titleSize;
  }
  for (const line of subtitleLines) {
    c.text(line, M, y + FONT_METRICS.ascender * s.subtitle, s.subtitle, GREY);
    y += 1.25 * s.subtitle;
  }
  const map = drawMap(c, input, best.box, s);
  best.side.draw(c, best.sideX, best.sideY);
  let fy = H - M - footerH + (footerH - footerTextH);
  for (const line of chairLines) {
    c.text(line, footerX, fy + FONT_METRICS.ascender * s.chair, s.chair);
    fy += 1.25 * s.chair;
  }
  for (const line of creditLines) {
    c.text(line, footerX, fy + FONT_METRICS.ascender * s.footer, s.footer, GREY);
    fy += 1.3 * s.footer;
  }
  if (left) c.logo(left, [M, H - M - leftH, M + leftW, H - M]);
  if (right) c.logo(right, [W - M - rightW, H - M - rightH, W - M, H - M]);
  return {
    width: W,
    height: H,
    title: input.title,
    items: c.items,
    layout: best.layout,
    mmPerKm: best.scale,
    unplacedLabels: map.unplaced,
    unclearLabels: map.unclear,
    labelBoxes: map.labelBoxes,
    labelInfo: map.labelInfo,
    legs: map.legs,
    logoBox: map.logoBox,
  };
}

// --- output ------------------------------------------------------------------------------------

export function posterPdf(drawing: PosterDrawing): Uint8Array<ArrayBuffer> {
  const doc = new PdfDocument(drawing.title);
  doc.addPage(drawing.width, drawing.height, (c) => {
    for (const item of drawing.items) {
      if (item.fill) c.fill(item.path, item.fill, item.evenOdd);
      if (item.stroke)
        c.stroke(item.path, item.stroke.color, item.stroke.width, item.stroke.dash, item.stroke);
    }
  });
  return doc.toBytes();
}

const rgb = (c: Rgb) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The poster's items as SVG elements (no document wrapper), for nesting in a contact sheet. */
export function posterSvgBody(drawing: PosterDrawing): string {
  const out = [`<rect width="${drawing.width}" height="${drawing.height}" fill="#fff"/>`];
  for (const item of drawing.items) {
    const d = svgPathData(item.path, 2);
    if (item.fill)
      out.push(
        `<path d="${d}" fill="${rgb(item.fill)}"${item.evenOdd ? ' fill-rule="evenodd"' : ''}/>`,
      );
    if (item.stroke) {
      const st = item.stroke;
      const dash = st.dash ? ` stroke-dasharray="${st.dash.join(' ')}"` : '';
      const miter = st.miterLimit !== undefined ? ` stroke-miterlimit="${st.miterLimit}"` : '';
      out.push(
        `<path d="${d}" fill="none" stroke="${rgb(st.color)}" stroke-width="${st.width.toFixed(3)}" stroke-linecap="${st.cap ?? 'round'}" stroke-linejoin="${st.join ?? 'round'}"${miter}${dash}/>`,
      );
    }
  }
  return out.join('\n');
}

export function posterSvg(drawing: PosterDrawing): string {
  const { width: w, height: h } = drawing;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `<title>${escape(drawing.title)}</title>`,
    posterSvgBody(drawing),
    '</svg>',
    '',
  ].join('\n');
}

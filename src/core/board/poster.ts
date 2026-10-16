// Poster export (roadmap 9.7): one page in a DIN format (A4 to A0, portrait or landscape) with
// the map scaled to fit, the shortest round trip drawn as a strong line on top, the places as
// dots with labels, and the length and a few facts in large type. A poster is not a puzzle:
// the solution is shown, lengths are great-circle kilometres ("Luftlinie", poster-tour.ts).
//
// Everything is vector, text as outlines (as on the boards), with a white margin and no bleed.
// Typography scales with the paper: A1 is the reference, and title and length are readable
// from about 3 m there (cap heights of 17 and 21 mm). The facts go below the map or beside it,
// whichever leaves the larger map.

import type { CountryFile, LabelLanguage } from '../data';
import type { Point } from '../geometry';
import { boardProjection, type BoardProjection } from '../projection';
import type { LegendEntry } from '../puzzle-file';
import { projectionKind, regionFrame, regionOutline, type RegionId } from '../region';
import {
  DEFAULT_LABELS,
  EXPORT_NODE_LIMIT,
  labelCandidates,
  placeLabels,
  type LabelCandidate,
  type LabelOptions,
  type Obstacle,
} from './labels';
import { fitLogo, logoHeight, placeLogo, type Logo } from './logo';
import { boardMapLines } from './map-lines';
import { pageSize, type DinPaper, type Orientation } from './paper';
import { PdfDocument, type Rgb } from './pdf';
import { possibleTours, stopPoints, type PosterStop, type PosterTour } from './poster-tour';
import { logoMetrics } from './setup';
import {
  circlePath,
  polygonPath,
  polylinePath,
  ringPath,
  svgPathData,
  transformPath,
  translate,
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

export interface PosterItem {
  readonly path: Path;
  readonly fill?: Rgb;
  readonly stroke?: { readonly color: Rgb; readonly width: number; readonly dash?: number[] };
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
  /** Logos instead of a place's label, by place index (local files, never stored). */
  readonly logos?: ReadonlyMap<number, Logo>;
  readonly legendLogo?: Logo | null;
  /** No map lines (points placed by hand on a blank board). */
  readonly blankMap?: boolean;
}

/** Sizes in mm for a page whose short side is `short` mm (A1: 594). */
function sizes(short: number) {
  const f = short / 594;
  return {
    f,
    margin: Math.max(10, 18 * f),
    gap: 9 * f,
    title: 24 * f,
    subtitle: 11 * f,
    length: 32 * f,
    value: 18 * f,
    caption: 7 * f,
    text: 7.5 * f,
    legend: 7.5 * f,
    label: 9 * f,
    footer: Math.max(2.4, 4.2 * f),
    dot: 2.4 * f,
    ringOuter: 4.6 * f,
    ringInner: 3.8 * f,
    tour: 2.2 * f,
    strong: 0.5 * f,
    thin: 0.28 * f,
    halo: 1.1 * f,
  };
}
type Sizes = ReturnType<typeof sizes>;

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

  fill(path: Path, color: Rgb): void {
    if (path.length > 0) this.items.push({ path, fill: color });
  }

  stroke(path: Path, color: Rgb, width: number, dash?: number[]): void {
    if (path.length > 0)
      this.items.push({ path, stroke: { color, width, ...(dash ? { dash } : {}) } });
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

/** "3,1 · 10²³" as runs (the font has no superscript digits: a raised smaller exponent). */
function toursRuns(n: number, size: number, fmt: ReturnType<typeof formatter>): Run[] {
  const t = possibleTours(n);
  if (t.exact !== null) return [{ text: fmt(t.exact, 0), size }];
  return [
    { text: `${fmt(t.mantissa, 1)} · 10`, size },
    { text: String(t.exponent), size: size * 0.62, rise: size * 0.42 },
  ];
}

// --- blocks: facts and legend ------------------------------------------------------------------

interface Block {
  readonly height: number;
  draw(c: Canvas, x: number, y: number): void;
}

interface Fact {
  readonly value: Run[];
  readonly caption: string;
}

/** A value in large type with its caption below, at most `width` wide. */
function factCell(fact: Fact, width: number, s: Sizes): Block {
  const valueSize = fact.value[0]?.size ?? s.value;
  const captionTop = valueSize * FONT_METRICS.capHeight + 0.35 * valueSize;
  const height = paragraph(null, fact.caption, 0, captionTop, width, s.caption);
  return {
    height,
    draw(c, x, y) {
      c.fill(runsPath(fact.value, x, y + valueSize * FONT_METRICS.capHeight), INK);
      paragraph(c, fact.caption, x, y + captionTop, width, s.caption, GREY);
    },
  };
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

/** Blocks side by side in columns of the given widths (top aligned). */
function row(blocks: readonly Block[], widths: readonly number[], gap: number): Block {
  return {
    height: Math.max(0, ...blocks.map((b) => b.height)),
    draw(c, x, y) {
      let left = x;
      blocks.forEach((b, i) => {
        b.draw(c, left, y);
        left += widths[i]! + gap;
      });
    },
  };
}

interface FactsInput {
  readonly length: Fact;
  readonly others: readonly Fact[];
  readonly notes: readonly string[];
}

/** The facts: the length, the other figures, the notes; laid out for `width` mm. */
function factsBlock(facts: FactsInput, width: number, s: Sizes, wide: boolean): Block {
  const notes: Block = {
    height: facts.notes.reduce(
      (h, n, i) => paragraph(null, n, 0, h + (i > 0 ? 0.4 * s.text : 0), width, s.text),
      0,
    ),
    draw(c, x, y) {
      let top = y;
      facts.notes.forEach((n, i) => {
        top = paragraph(c, n, x, top + (i > 0 ? 0.4 * s.text : 0), width, s.text);
      });
    },
  };
  const others = facts.others;
  if (wide) {
    // Length on the left, the other figures in columns on the right, the notes below.
    const leftW = width * 0.4;
    const rightW = width - leftW - s.gap;
    const cellW = (rightW - (others.length - 1) * s.gap) / others.length;
    const fits = others.every((f) => runsWidth(f.value) <= cellW);
    const right = fits
      ? row(
          others.map((f) => factCell(f, cellW, s)),
          others.map(() => cellW),
          s.gap,
        )
      : stack(
          others.map((f) => factCell(f, rightW, s)),
          0.6 * s.gap,
        );
    const top = row([factCell(facts.length, leftW, s), right], [leftW, rightW], s.gap);
    return stack([top, notes], s.gap);
  }
  return stack(
    [factCell(facts.length, width, s), ...others.map((f) => factCell(f, width, s)), notes],
    0.8 * s.gap,
  );
}

type Symbol = 'ring' | 'nail' | 'group' | null;

/** The legend lines with symbols, and an optional logo on the left. */
function legendBlock(
  entries: readonly { readonly symbol: Symbol; readonly text: string }[],
  logo: Logo | null,
  width: number,
  s: Sizes,
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
        c.fill(fitLogo(logo, [x, top, x + logoBox[0], top + logoBox[1]]), INK);
      }
      const shift = (height - y) / 2;
      for (const l of lines) {
        const base = top + shift + l.y + FONT_METRICS.ascender * size;
        c.text(l.text, x + textX + symbolW, base, size);
        if (!l.symbol) continue;
        const cx = x + textX + 2.2 * s.ringOuter;
        const cy = base - (FONT_METRICS.capHeight * size) / 2;
        if (l.symbol === 'group') {
          const d = s.ringOuter * 0.9;
          const shape = roundedHull(
            [
              [cx - d, cy],
              [cx + d, cy],
            ],
            s.ringOuter * 1.15,
          );
          c.fill(shape, GROUP);
          c.stroke(shape, TOUR, s.strong);
          c.fill(
            [...circlePath(cx - d, cy, s.dot * 0.8), ...circlePath(cx + d, cy, s.dot * 0.8)],
            INK,
          );
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

/** The outline of the points' convex hull widened by r (rounded corners): an alliance's group. */
export function roundedHull(points: readonly Point[], r: number): PathCommand[] {
  const hull = convexHull(points);
  if (hull.length === 1) return circlePath(hull[0]![0], hull[0]![1], r);
  const out: Point[] = [];
  const arc = (c: Point, from: number, sweep: number) => {
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    for (let k = 0; k <= steps; k++) {
      const a = from + (sweep * k) / steps;
      out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
  };
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
  return polygonPath(out);
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

interface LabelItem {
  readonly text: string | null;
  readonly logo: Logo | null;
  readonly metrics: TextMetrics;
}

/** Draws the map with the tour, dots, groups and labels into `c` (page coordinates). */
function drawMap(c: Canvas, input: PosterInput, box: MapBox, s: Sizes): number {
  const projection = mapProjection(input, box, s);
  const { stops } = input;
  const at = (p: Point): Point => [p[0] + box.x, p[1] + box.y];
  const move = (path: Path) => transformPath(path, translate(box.x, box.y));
  const points = stopPoints(stops, projection);

  // Land and borders.
  if (!input.blankMap) {
    const outline = regionOutline(input.file, input.region).geometry;
    const rings =
      outline.type === 'Polygon'
        ? outline.coordinates
        : outline.type === 'MultiPolygon'
          ? outline.coordinates.flat()
          : [];
    c.fill(
      rings.flatMap((ring) =>
        polygonPath(ring.map(([lon, lat]) => at(projection.project(lon!, lat!)))),
      ),
      LAND,
    );
    // Clipped a line width inside the box, so strokes stay in the white margin's bounds.
    const e = s.strong;
    const lines = boardMapLines(input.file, input.region, projection, [e, e, box.w - e, box.h - e]);
    c.stroke(move(lines.thin.flatMap((l) => polylinePath(l))), LIGHT, s.thin);
    c.stroke(move(lines.strong.flatMap((l) => polylinePath(l))), GREY, s.strong);
  }

  // Alliances with their members as separate stops: one shape around the members.
  const groups = new Map<string, number[]>();
  stops.forEach((st, i) => {
    if (st.group) groups.set(st.group, [...(groups.get(st.group) ?? []), i]);
  });
  const groupReach = 2.4 * s.ringOuter;
  for (const members of groups.values()) {
    const hull = move(
      roundedHull(
        members.map((i) => points[i]!),
        groupReach,
      ),
    );
    c.fill(hull, GROUP);
    c.stroke(hull, TOUR, s.strong);
  }

  // Composite stops at their centroid: the members as small dots, connected to the stop.
  const memberDots: Point[] = [];
  stops.forEach((st, i) => {
    if (!st.members) return;
    for (const m of st.members) {
      const p = projection.project(m.lon, m.lat);
      memberDots.push(p);
      c.stroke(move(polylinePath([p, points[i]!])), GREY, s.thin * 1.4, [1.5 * s.f, 1.2 * s.f]);
    }
  });
  c.fill(move(memberDots.flatMap(([x, y]) => circlePath(x, y, s.dot * 0.55))), GREY);

  // The round trip.
  c.stroke(
    move(
      polylinePath(
        input.tour.tour.map((i) => points[i]!),
        true,
      ),
    ),
    TOUR,
    s.tour,
  );

  // Dots and rings.
  c.fill(move(points.flatMap(([x, y]) => circlePath(x, y, s.dot + 0.5 * s.f))), WHITE);
  c.fill(move(points.flatMap(([x, y]) => circlePath(x, y, s.dot))), INK);
  c.fill(
    move(
      points.flatMap(([x, y], i) =>
        stops[i]!.highlight && !stops[i]!.group ? ringPath(x, y, s.ringOuter, s.ringInner) : [],
      ),
    ),
    INK,
  );

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
  c.text(
    '0',
    box.x + barX - measureText('0', s.caption).width / 2,
    box.y + barY - 1.6 * tick,
    s.caption,
  );
  c.text(
    unit,
    box.x + barX + barLen - measureText(unit, s.caption).width / 2,
    box.y + barY - 1.6 * tick,
    s.caption,
  );
  const scaleBox: Point[] = [
    [0, barY - 1.6 * tick - s.caption],
    [barX + barLen + measureText(unit, s.caption).width, barY - 1.6 * tick - s.caption],
    [barX + barLen + measureText(unit, s.caption).width, box.h],
    [0, box.h],
  ];

  // Labels: places, and the names of groups (or a logo instead of either).
  const clearance = (stops.some((st) => st.highlight) ? s.ringOuter : s.dot) + 0.6 * s.f;
  const options: LabelOptions = {
    ...DEFAULT_LABELS,
    sizeMm: s.label,
    nailClearanceMm: clearance,
    gapMm: 0.2 * s.label,
    spacingMm: 0.25 * s.label,
    // Halos stay inside the map box (and the white margin).
    edgeMm: 1.2 * s.halo,
  };
  const logoFor = (place: number) => input.logos?.get(place) ?? null;
  const items: LabelItem[] = [];
  const anchors: Point[] = [];
  const reach: number[] = [];
  stops.forEach((st, i) => {
    const logo = st.group ? null : logoFor(st.place);
    items.push({ text: st.name, logo, metrics: measureText(st.name, s.label) });
    anchors.push(points[i]!);
    reach.push(clearance);
  });
  for (const [name, members] of groups) {
    const pts = members.map((i) => points[i]!);
    const centre: Point = [
      pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
      pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
    ];
    const spread = Math.max(...pts.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1])));
    const place = stops[members[0]!]!.place;
    items.push({ text: name, logo: logoFor(place), metrics: measureText(name, s.label) });
    anchors.push(centre);
    reach.push(spread + groupReach);
  }
  const obstacles: Obstacle[] = [
    { kind: 'polygon', points: scaleBox },
    ...memberDots.map((p): Obstacle => ({ kind: 'circle', centre: p, radius: s.dot })),
  ];
  const place = (trial: readonly TextMetrics[]) => {
    const candidates = anchors.map((p, i) =>
      labelCandidates(p, trial[i]!, { ...options, nailClearanceMm: reach[i]! }),
    );
    const placement = placeLabels({
      points: anchors,
      candidates,
      obstacles,
      width: box.w,
      height: box.h,
      options,
      nodeLimit: EXPORT_NODE_LIMIT,
    });
    return { candidates, placement };
  };
  // A logo replaces a label if the labels still fit with it (largest width first).
  let metrics = items.map((it) => it.metrics);
  const logoAt: (Logo | null)[] = items.map(() => null);
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
  const { candidates, placement } = place(metrics);
  placement.choice.forEach((choice, i) => {
    const cand: LabelCandidate = candidates[i]![Math.max(0, choice)]!;
    const logo = logoAt[i];
    if (logo) {
      const [x0, y0, x1] = cand.box;
      c.fill(placeLogo(logo, box.x + x0, box.y + y0, x1 - x0), INK);
      return;
    }
    const group = i >= stops.length;
    const path = textPath(
      items[i]!.text ?? '',
      box.x + cand.baseline[0],
      box.y + cand.baseline[1],
      s.label,
    );
    c.haloText(path, s.halo * 2, group ? TOUR : INK);
  });
  return placement.unplaced;
}

// --- the page ----------------------------------------------------------------------------------

export function drawPoster(input: PosterInput): PosterDrawing {
  const [W, H] = pageSize(input.paper, input.orientation);
  const s = sizes(Math.min(W, H));
  const t = POSTER_TEXTS[input.language];
  const fmt = formatter(input.language);
  const M = s.margin;
  const contentW = W - 2 * M;
  const n = input.stops.length;

  // Header.
  const titleLines = wrapText(input.title, s.title, contentW);
  const subtitleLines = input.subtitle ? wrapText(input.subtitle, s.subtitle, contentW) : [];
  const headerH =
    titleLines.length * 1.12 * s.title + subtitleLines.length * 1.25 * s.subtitle + 0.4 * s.gap;
  const mapTop = M + headerH + s.gap;

  // Facts, notes, legend, footer.
  const second = input.tour.secondKm;
  const facts: FactsInput = {
    length: {
      value: [{ text: `${fmt(Math.round(input.tour.lengthKm), 0)} km`, size: s.length }],
      caption: t.lengthCaption(fmt(n, 0)),
    },
    others: [
      { value: [{ text: fmt(n, 0), size: s.value }], caption: t.places },
      { value: toursRuns(n, s.value, fmt), caption: t.tours },
      ...(second !== null
        ? [{ value: [{ text: `+${fmt(second, 1)} km`, size: s.value }], caption: t.second }]
        : []),
    ],
    notes: [t.proof, ...(input.stops.some((st) => st.members) ? [t.centroid] : [])],
  };
  const legendEntries: { symbol: Symbol; text: string }[] = input.legend.map((e) => ({
    symbol: e.symbol === 'none' ? null : e.symbol,
    text: e.text,
  }));
  if (
    input.stops.some((st) => st.highlight && !st.group) &&
    !legendEntries.some((e) => e.symbol === 'ring')
  )
    legendEntries.unshift({ symbol: 'ring', text: t.markedLegend });
  if (input.stops.some((st) => st.group))
    legendEntries.push({ symbol: 'group', text: t.groupLegend });
  const footerText = `${t.chair} · ${t.attribution}`;
  const footerLines = wrapText(footerText, s.footer, contentW);
  const footerH = footerLines.length * 1.25 * s.footer;
  const bottom = H - M - footerH - 0.6 * s.gap;

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
    const side = stack(
      [
        factsBlock(facts, contentW, s, true),
        legendBlock(legendEntries, input.legendLogo ?? null, contentW, s),
      ].filter((b): b is Block => b !== null),
      s.gap,
    );
    const box: MapBox = { x: M, y: mapTop, w: contentW, h: bottom - side.height - s.gap - mapTop };
    if (box.h > 0.25 * H)
      options.push({
        layout: 'band',
        box,
        side,
        sideX: M,
        sideY: box.y + box.h + s.gap,
        scale: mapProjection(input, box, s).mmPerKm,
      });
  }
  {
    const colW = 0.34 * contentW;
    const side = stack(
      [
        factsBlock(facts, colW, s, false),
        legendBlock(legendEntries, input.legendLogo ?? null, colW, s),
      ].filter((b): b is Block => b !== null),
      s.gap,
    );
    const box: MapBox = { x: M, y: mapTop, w: contentW - colW - s.gap, h: bottom - mapTop };
    if (side.height <= box.h)
      options.push({
        layout: 'column',
        box,
        side,
        sideX: M + box.w + s.gap,
        // The column sits at the bottom of the map's height.
        sideY: bottom - side.height,
        scale: mapProjection(input, box, s).mmPerKm,
      });
  }
  if (options.length === 0) throw new Error('the poster has no room for the map');
  // Ties (within 3 %) go to the band: the facts read best under the map.
  const best = options.reduce((a, b) => (b.scale > a.scale * 1.03 ? b : a));

  const c = new Canvas();
  let y = M;
  for (const line of titleLines) {
    c.text(line, M, y + FONT_METRICS.ascender * s.title, s.title);
    y += 1.12 * s.title;
  }
  for (const line of subtitleLines) {
    c.text(line, M, y + FONT_METRICS.ascender * s.subtitle, s.subtitle, GREY);
    y += 1.25 * s.subtitle;
  }
  const unplaced = drawMap(c, input, best.box, s);
  best.side.draw(c, best.sideX, best.sideY);
  let fy = H - M - footerH;
  for (const line of footerLines) {
    c.text(line, M, fy + FONT_METRICS.ascender * s.footer, s.footer, GREY);
    fy += 1.25 * s.footer;
  }
  return {
    width: W,
    height: H,
    title: input.title,
    items: c.items,
    layout: best.layout,
    mmPerKm: best.scale,
    unplacedLabels: unplaced,
  };
}

// --- output ------------------------------------------------------------------------------------

export function posterPdf(drawing: PosterDrawing): Uint8Array<ArrayBuffer> {
  const doc = new PdfDocument(drawing.title);
  doc.addPage(drawing.width, drawing.height, (c) => {
    for (const item of drawing.items) {
      if (item.fill) c.fill(item.path, item.fill);
      if (item.stroke) c.stroke(item.path, item.stroke.color, item.stroke.width, item.stroke.dash);
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
    if (item.fill) out.push(`<path d="${d}" fill="${rgb(item.fill)}"/>`);
    if (item.stroke) {
      const dash = item.stroke.dash ? ` stroke-dasharray="${item.stroke.dash.join(' ')}"` : '';
      out.push(
        `<path d="${d}" fill="none" stroke="${rgb(item.stroke.color)}" stroke-width="${item.stroke.width.toFixed(3)}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`,
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

// Printable PDFs: the board as a 1:1 template tiled over A4/A3 pages (for building a board
// without a laser cutter) and the solution sheet for the person who builds the board.

import type { Point } from '../geometry';
import type { BoardDrawing, Layer } from './drawing';
import { PdfCanvas, PdfDocument, type Rgb } from './pdf';
import type { BoardPlan } from './plan';
import {
  circlePath,
  polylinePath,
  rectPath,
  translate,
  type Matrix,
  type PathCommand,
} from './shapes';
import { FONT_METRICS, measureText, textPath, wrapText } from './text';
import type { BoardTexts } from './texts';

export type Paper = 'A4' | 'A3';
export const PAPER_SIZES: Record<Paper, readonly [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
};

export const BLACK: Rgb = [0, 0, 0];
export const GREY: Rgb = [0.45, 0.45, 0.45];
const LIGHT: Rgb = [0.75, 0.75, 0.75];
export const RED: Rgb = [0.8, 0.1, 0.05];

const PRINT_STYLE: Record<Layer, { color: Rgb; width: number }> = {
  cut: { color: BLACK, width: 0.35 },
  edge: { color: BLACK, width: 0.35 },
  score: { color: GREY, width: 0.25 },
  outline: { color: BLACK, width: 0.45 },
  engrave: { color: BLACK, width: 0 },
  pit: { color: BLACK, width: 0 },
};

/** Draws the board drawing with print styles (black and grey). */
export function drawForPrint(c: PdfCanvas, drawing: BoardDrawing, lineScale = 1): void {
  for (const layer of ['score', 'outline', 'cut', 'edge', 'engrave', 'pit'] as const) {
    const style = PRINT_STYLE[layer];
    for (const item of drawing.items) {
      if (item.layer !== layer) continue;
      if (item.fill) c.fill(item.path, style.color);
      else c.stroke(item.path, style.color, style.width * lineScale);
    }
  }
}

export function text(
  c: PdfCanvas,
  value: string,
  x: number,
  y: number,
  size: number,
  color = BLACK,
): void {
  c.fill(textPath(value, x, y, size), color);
}

/** Wrapped paragraphs from (x, y) (top), returns the y below the last line. */
export function paragraphs(
  c: PdfCanvas,
  list: readonly string[],
  x: number,
  y: number,
  width: number,
  size: number,
  gap = 0.6,
): number {
  let top = y;
  for (const p of list) {
    for (const line of wrapText(p, size, width)) {
      text(c, line, x, top + FONT_METRICS.ascender * size, size);
      top += 1.25 * size;
    }
    top += gap * size;
  }
  return top;
}

export interface TileLayout {
  readonly paper: Paper;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly cols: number;
  readonly rows: number;
  /** Board area per tile (incl. overlap) and the step between tiles, mm. */
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly stepX: number;
  readonly stepY: number;
  /** Top left of the tile area on the page. */
  readonly left: number;
  readonly top: number;
}

export const MARGIN = 10;
const HEADER = 10;
const OVERLAP = 10;

/** Tiles in portrait or landscape, whichever needs fewer pages. */
export function tileLayout(width: number, height: number, paper: Paper): TileLayout {
  const [a, b] = PAPER_SIZES[paper];
  const options = [
    [a, b],
    [b, a],
  ].map(([pw, ph]) => {
    const tileWidth = pw! - 2 * MARGIN;
    const tileHeight = ph! - 2 * MARGIN - HEADER;
    const stepX = tileWidth - OVERLAP;
    const stepY = tileHeight - OVERLAP;
    const cols = width <= tileWidth ? 1 : Math.ceil((width - OVERLAP) / stepX);
    const rows = height <= tileHeight ? 1 : Math.ceil((height - OVERLAP) / stepY);
    return {
      paper,
      pageWidth: pw!,
      pageHeight: ph!,
      cols,
      rows,
      tileWidth,
      tileHeight,
      stepX,
      stepY,
      left: MARGIN,
      top: MARGIN + HEADER,
    };
  });
  return options.reduce((best, o) => (o.cols * o.rows < best.cols * best.rows ? o : best));
}

const tileName = (row: number, col: number) => `${String.fromCharCode(65 + col)}${row + 1}`;

function checkBar(c: PdfCanvas, x: number, y: number, label: string): void {
  c.fill(rectPath(x, y, 50, 1.5), BLACK);
  c.stroke(
    polylinePath([
      [x, y - 1.5],
      [x, y + 3],
    ]),
    BLACK,
    0.2,
  );
  c.stroke(
    polylinePath([
      [x + 50, y - 1.5],
      [x + 50, y + 3],
    ]),
    BLACK,
    0.2,
  );
  text(c, label, x + 52, y + 1.8, 3);
}

export interface TemplateText {
  readonly title: string;
  /** Instructions for the overview page. */
  readonly steps: (pages: number, paper: Paper) => string[];
  readonly tile: (name: string, row: number, col: number) => string;
  readonly checkBar: string;
}

export interface TemplateInput extends TemplateText {
  /** The board drawn with drill marks (holes: 'mark'). */
  readonly drawing: BoardDrawing;
  readonly paper: Paper;
}

/** Template texts of a map puzzle board. */
export function mapTemplateText(
  texts: BoardTexts,
  region: string,
  nailDiameterMm: number,
): TemplateText {
  return {
    title: texts.templateTitle(region),
    steps: (pages, paper) => texts.templateSteps({ nailMm: nailDiameterMm, pages, paper }),
    tile: texts.tile,
    checkBar: texts.checkBar,
  };
}

/** Print template: overview page with instructions, then the 1:1 tiles. */
export function templatePdf(input: TemplateInput): Uint8Array<ArrayBuffer> {
  const { drawing } = input;
  const layout = tileLayout(drawing.width, drawing.height, input.paper);
  const doc = new PdfDocument(input.title);
  doc.addForm('Board', drawing.width, drawing.height, (c) => drawForPrint(c, drawing));
  const pages = layout.cols * layout.rows;

  // Overview: instructions, then the board with the tile grid, scaled to fit.
  const [pw, ph] = PAPER_SIZES[input.paper];
  doc.addPage(pw, ph, (c) => {
    let y = MARGIN;
    const width = pw - 2 * MARGIN;
    for (const line of wrapText(input.title, 6, width)) {
      text(c, line, MARGIN, y + FONT_METRICS.ascender * 6, 6);
      y += 7.5;
    }
    y += 2;
    y = paragraphs(c, input.steps(pages, input.paper), MARGIN, y, width, 3.6);
    const avail = ph - MARGIN - y - 4;
    const scale = Math.min(width / drawing.width, avail / drawing.height);
    const ox = MARGIN + (width - drawing.width * scale) / 2;
    const oy = y + 4;
    c.save().transform([scale, 0, 0, scale, ox, oy]).drawForm('Board');
    c.clip(rectPath(0, 0, drawing.width, drawing.height));
    for (let row = 0; row < layout.rows; row++) {
      for (let col = 0; col < layout.cols; col++) {
        const x = col * layout.stepX;
        const yy = row * layout.stepY;
        c.stroke(rectPath(x, yy, layout.tileWidth, layout.tileHeight), RED, 0.3 / scale, [
          2 / scale,
          1.5 / scale,
        ]);
        const label = tileName(row, col);
        c.fill(textPath(label, x + OVERLAP + 2 / scale, yy + OVERLAP + 6 / scale, 5 / scale), RED);
      }
    }
    c.restore();
  });

  // Tiles.
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      doc.addPage(layout.pageWidth, layout.pageHeight, (c) => {
        const bx = col * layout.stepX;
        const by = row * layout.stepY;
        const name = tileName(row, col);
        text(c, input.tile(name, row + 1, col + 1), MARGIN, MARGIN + 4, 4);
        checkBar(c, layout.pageWidth - MARGIN - 62, MARGIN + 1.5, input.checkBar);
        c.save()
          .clip(rectPath(layout.left, layout.top, layout.tileWidth, layout.tileHeight))
          .transform(translate(layout.left - bx, layout.top - by))
          .drawForm('Board')
          .restore();
        // Frame of the printed area; dashed cut lines in the middle of the overlaps.
        c.stroke(
          rectPath(layout.left, layout.top, layout.tileWidth, layout.tileHeight),
          LIGHT,
          0.2,
        );
        const half = OVERLAP / 2;
        if (col > 0) {
          const x = layout.left + half;
          c.stroke(
            polylinePath([
              [x, layout.top],
              [x, layout.top + layout.tileHeight],
            ]),
            BLACK,
            0.25,
            [3, 2],
          );
        }
        if (row > 0) {
          const y = layout.top + half;
          c.stroke(
            polylinePath([
              [layout.left, y],
              [layout.left + layout.tileWidth, y],
            ]),
            BLACK,
            0.25,
            [3, 2],
          );
        }
      });
    }
  }
  return doc.toBytes();
}

export interface SolutionInput {
  readonly drawing: BoardDrawing;
  readonly texts: BoardTexts;
  readonly region: string;
  readonly plan: BoardPlan;
  readonly points: readonly Point[];
  /** Tour over slots starting at the start nail. */
  readonly tour: readonly number[];
  readonly names: readonly string[];
  /** Closed string length S, centre length L, measured length M of the optimum (µm). */
  readonly stringLengthUm: number;
  readonly centreLengthUm: number;
  readonly measuredLengthUm: number;
  /** String gap to the runner-up (µm). */
  readonly stringGapUm: number;
  readonly link: string;
  readonly formatNumber: (value: number, decimals: number) => string;
  /** An open path from tour[0] to the last nail (roadmap 9.15): drawn open, its own texts. */
  readonly path?: boolean;
}

/** One A4 page: the board with the tour, the order of cities, figures and calibration. */
export function solutionPdf(input: SolutionInput): Uint8Array<ArrayBuffer> {
  const { drawing, texts, plan, points, tour } = input;
  const doc = new PdfDocument(texts.solutionTitle(input.region));
  doc.addForm('Board', drawing.width, drawing.height, (c) => drawForPrint(c, drawing, 2.5));
  const [pw, ph] = PAPER_SIZES.A4;
  const fmt = input.formatNumber;
  doc.addPage(pw, ph, (c) => {
    text(c, texts.solutionTitle(input.region), MARGIN, MARGIN + 6, 7);
    text(c, texts.solutionWarning, MARGIN, MARGIN + 12, 3.4, RED);

    // Board with the tour, left.
    const top = MARGIN + 17;
    const boxW = 112;
    const boxH = 150;
    const scale = Math.min(boxW / drawing.width, boxH / drawing.height);
    const m: Matrix = [scale, 0, 0, scale, MARGIN, top];
    c.save().transform(m).drawForm('Board');
    const tourPath: PathCommand[] = polylinePath(
      tour.map((s) => points[s]!),
      !input.path,
    );
    c.stroke(tourPath, RED, 0.5 / scale);
    const start = points[tour[0]!]!;
    c.stroke(circlePath(start[0], start[1], 2.2 / scale), RED, 0.6 / scale);
    c.restore();

    // Order of cities, right.
    const listX = MARGIN + boxW + 6;
    const listW = pw - MARGIN - listX;
    const t = input.path ? { ...texts, ...texts.path } : texts;
    text(c, t.tourOrder, listX, top + 3, 3.6);
    const size = tour.length > 45 ? 2.6 : 3;
    const perColumn = Math.ceil(tour.length / 2);
    const colW = listW / 2;
    tour.forEach((s, i) => {
      const col = Math.floor(i / perColumn);
      const row = i % perColumn;
      const y = top + 9 + row * size * 1.3;
      const label = `${i + 1}. ${input.names[s]!}`;
      let shown = label;
      while (shown.length > 4 && measureText(shown, size).width > colW - 2)
        shown = `${shown.slice(0, -2)}…`;
      text(c, shown, listX + col * colW, y, size);
    });

    // Figures and calibration, below.
    let y = top + Math.max(boxH, 9 + perColumn * size * 1.3) + 6;
    const width = pw - 2 * MARGIN;
    const mm = (um: number, d = 1) => fmt(um / 1000, d);
    const cut = Math.ceil((input.measuredLengthUm / 1000 + plan.scale.targetMm + 150) / 50) * 50;
    text(c, texts.figures, MARGIN, y + 4, 4.2);
    y = paragraphs(
      c,
      [
        t.stringLength(mm(input.stringLengthUm)),
        t.centreLength(mm(input.centreLengthUm)),
        t.gap(mm(input.stringGapUm, 2)),
        t.measuredLength(
          mm(input.measuredLengthUm + plan.scale.targetMm * 1000, 0),
          fmt(plan.scale.targetMm, 0),
        ),
        t.measuredGap(mm(plan.measured.gapUm, 2), plan.measured.kind === 'exact'),
      ],
      MARGIN,
      y + 7,
      width,
      3.2,
      0.2,
    );
    text(c, texts.calibrationTitle, MARGIN, y + 6, 4.2);
    y = paragraphs(
      c,
      t.calibrationSteps({ gapMm: mm(plan.measured.gapUm, 1), cutMm: fmt(cut, 0) }),
      MARGIN,
      y + 9,
      width,
      3.2,
      0.4,
    );
    text(c, texts.puzzleLink, MARGIN, y + 5, 3.2);
    // Long links: break anywhere (no spaces).
    const linkSize = 2.4;
    const perLine = Math.max(20, Math.floor(width / (0.47 * linkSize)));
    for (let i = 0, line = 0; i < input.link.length; i += perLine, line++) {
      text(c, input.link.slice(i, i + perLine), MARGIN, y + 9.5 + line * 3, linkSize, GREY);
    }
  });
  return doc.toBytes();
}

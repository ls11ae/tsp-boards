// Classroom worksheet (Phase 6): one A4/A3 page with the map scaled to fit, the places as dots
// with their labels and a kilometre scale, and a separate solution page with the shortest
// round trip. On paper the round trip is drawn between the dots, so the solution is the
// Euclidean optimum and lengths are given in km.

import type { Point } from '../geometry';
import { labelCandidates, placeLabels, EXPORT_NODE_LIMIT, type Box } from './labels';
import { boardMapLines, subtractHoles } from './map-lines';
import { PdfDocument, type PdfCanvas } from './pdf';
import { BLACK, GREY, MARGIN, PAPER_SIZES, RED, paragraphs, text, type Paper } from './print';
import type { BoardSetup } from './setup';
import { circlePath, polylinePath, type Matrix, type PathCommand } from './shapes';
import { measureText, textPath } from './text';

export interface WorksheetInput {
  readonly setup: BoardSetup;
  readonly paper: Paper;
  /** Title of the puzzle (the region's name if empty). */
  readonly title: string;
  /** Euclidean optimum over slots, its length and the gap to the runner-up (µm on the board). */
  readonly tour: readonly number[];
  readonly lengthUm: number;
  readonly gapUm: number;
  /** Place names per slot (board language) for the order on the solution page. */
  readonly names: readonly string[];
  readonly formatNumber: (value: number, decimals: number) => string;
}

/** Dot radius and label size on paper, mm. */
const DOT_MM = 1.1;
const LIGHT_LINE = 0.2;
const STRONG_LINE = 0.4;

/** A round length in km whose bar is at least `minMm` long on paper (1, 2, 5 × 10^k). */
export function scaleBarKm(paperMmPerKm: number, minMm = 25): number {
  const raw = minMm / paperMmPerKm;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const f of [1, 2, 5, 10]) if (f * power >= raw) return f * power;
  return 10 * power;
}

interface Layout {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly mapX: number;
  readonly mapY: number;
}

/** Page size (portrait or landscape, whichever fits the board better) and the map's place. */
function layout(setup: BoardSetup, paper: Paper, headerMm: number, footerMm: number): Layout {
  const [a, b] = PAPER_SIZES[paper];
  const { boardWidthMm: w, boardHeightMm: h } = setup.params;
  const fit = (pw: number, ph: number) =>
    Math.min((pw - 2 * MARGIN) / w, (ph - 2 * MARGIN - headerMm - footerMm) / h);
  const [width, height] = fit(a, b) >= fit(b, a) ? [a, b] : [b, a];
  const scale = fit(width, height);
  return {
    width,
    height,
    scale,
    mapX: (width - w * scale) / 2,
    mapY: MARGIN + headerMm,
  };
}

/** The map (lines, dots, labels) in board mm, sized for printing at `scale`. */
function drawMap(c: PdfCanvas, setup: BoardSetup, scale: number): void {
  const { boardWidthMm: w, boardHeightMm: h } = setup.params;
  const points = setup.points;
  const dot = DOT_MM / scale;
  const labelBoxes: Box[] = [];
  const labelPaths: PathCommand[] = [];
  if (setup.labels) {
    const { metrics, options, texts } = setup.labels;
    const candidates = points.map((p, i) => labelCandidates(p, metrics[i]!, options));
    const placement = placeLabels({
      points,
      candidates,
      width: w,
      height: h,
      options,
      nodeLimit: EXPORT_NODE_LIMIT,
    });
    placement.choice.forEach((choice, i) => {
      // Labels that do not fit keep their preferred position.
      const candidate = candidates[i]![Math.max(0, choice)]!;
      labelBoxes.push(candidate.box);
      labelPaths.push(
        ...textPath(texts[i]!, candidate.baseline[0], candidate.baseline[1], options.sizeMm),
      );
    });
  }
  const map = setup.params.blankBoard
    ? { strong: [], thin: [] }
    : boardMapLines(setup.file, setup.params.region, setup.projection, [0, 0, w, h]);
  const halo = 1.2;
  const holes: Point[][] = [
    ...labelBoxes.map(([x0, y0, x1, y1]): Point[] => [
      [x0 - halo, y0 - halo],
      [x1 + halo, y0 - halo],
      [x1 + halo, y1 + halo],
      [x0 - halo, y1 + halo],
    ]),
  ];
  const lines = (list: readonly Point[][]) =>
    subtractHoles(list, holes).flatMap((l) => polylinePath(l));
  c.stroke(lines(map.thin), GREY, LIGHT_LINE / scale);
  c.stroke(lines(map.strong), BLACK, STRONG_LINE / scale);
  c.fill(labelPaths, BLACK);
  c.fill(
    points.flatMap(([x, y]) => circlePath(x, y, dot)),
    BLACK,
  );
}

/** Scale bar of `km` kilometres at (x, y) on the page. */
function scaleBar(
  c: PdfCanvas,
  x: number,
  y: number,
  km: number,
  mmPerKm: number,
  label: string,
): void {
  const len = km * mmPerKm;
  c.stroke(
    [
      ...polylinePath([
        [x, y],
        [x + len, y],
      ]),
      ...polylinePath([
        [x, y - 1.2],
        [x, y + 1.2],
      ]),
      ...polylinePath([
        [x + len, y - 1.2],
        [x + len, y + 1.2],
      ]),
    ],
    BLACK,
    0.35,
  );
  text(c, '0', x - 0.8, y - 2, 2.6);
  text(c, label, x + len - measureText(label, 2.6).width / 2, y - 2, 2.6);
}

export function worksheetPdf(input: WorksheetInput): Uint8Array<ArrayBuffer> {
  const { setup, paper, formatNumber: fmt } = input;
  const t = setup.texts;
  const title = input.title || setup.title[0]?.text || '';
  const n = setup.points.length;
  const header = 26;
  const footer = 10;
  const page = layout(setup, paper, header, footer);
  const { boardWidthMm: w, boardHeightMm: h } = setup.params;
  const doc = new PdfDocument(title);
  doc.addForm('Map', w, h, (c) => drawMap(c, setup, page.scale));
  const paperMmPerKm = setup.projection.mmPerKm * page.scale;
  const km = scaleBarKm(paperMmPerKm);
  const textWidth = page.width - 2 * MARGIN;
  const mapMatrix: Matrix = [page.scale, 0, 0, page.scale, page.mapX, page.mapY];
  const bottom = page.height - MARGIN - footer;

  const map = (c: PdfCanvas) => {
    c.save().transform(mapMatrix).drawForm('Map').restore();
    scaleBar(c, MARGIN + 1, page.height - MARGIN - 4, km, paperMmPerKm, `${fmt(km, 0)} km`);
    const attribution = setup.footer.text;
    text(
      c,
      attribution,
      page.width - MARGIN - measureText(attribution, 2.2).width,
      page.height - MARGIN - 1,
      2.2,
      GREY,
    );
  };

  // Task.
  doc.addPage(page.width, page.height, (c) => {
    text(c, title, MARGIN, MARGIN + 6, 6.5);
    paragraphs(c, [t.worksheetTask(n), t.worksheetName], MARGIN, MARGIN + 10, textWidth, 3.4, 0.5);
    map(c);
  });

  // Solution.
  doc.addPage(page.width, page.height, (c) => {
    text(c, t.solutionTitle(title), MARGIN, MARGIN + 6, 6.5);
    const kmOf = (um: number) => um / 1000 / setup.projection.mmPerKm;
    const lines = [t.worksheetLength(fmt(kmOf(input.lengthUm), 0))];
    if (Number.isFinite(input.gapUm)) lines.push(t.worksheetSecond(fmt(kmOf(input.gapUm), 1)));
    paragraphs(c, lines, MARGIN, MARGIN + 10, textWidth, 3.4, 0.3);
    map(c);
    c.save().transform(mapMatrix);
    c.stroke(
      polylinePath(
        input.tour.map((s) => setup.points[s]!),
        true,
      ),
      RED,
      0.6 / page.scale,
    );
    c.restore();
    // Order below the map if there is room, else nothing (the map shows it).
    const mapBottom = page.mapY + h * page.scale;
    const names = input.tour.map((s, i) => `${i + 1}. ${input.names[s]!}`).join(' – ');
    if (bottom - mapBottom > 12) paragraphs(c, [names], MARGIN, mapBottom + 4, textWidth, 2.6, 0);
  });
  return doc.toBytes();
}

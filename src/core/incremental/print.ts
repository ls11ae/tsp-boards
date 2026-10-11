// Solution sheet of the incremental board: the optimal round trip of every instance with its
// lengths and gaps, how to calibrate the string, and small maps of all optimal round trips.

import type { BoardDrawing } from '../board/drawing';
import { PdfDocument } from '../board/pdf';
import {
  BLACK,
  GREY,
  MARGIN,
  PAPER_SIZES,
  RED,
  drawForPrint,
  paragraphs,
  text,
  type TemplateText,
} from '../board/print';
import { polylinePath, rectPath } from '../board/shapes';
import { measureText } from '../board/text';
import { stepGapUm, trackMarks, type IncrementalPuzzle } from './generate';
import type { IncrementalTexts } from './texts';

export function incrementalTemplateText(
  texts: IncrementalTexts,
  nailDiameterMm: number,
): TemplateText {
  return {
    title: texts.templateTitle,
    steps: (pages, paper) => texts.templateSteps({ nailMm: nailDiameterMm, pages, paper }),
    tile: texts.tile,
    checkBar: texts.checkBar,
  };
}

export interface IncrementalSolutionInput {
  readonly puzzle: IncrementalPuzzle;
  /** The board drawn with drill marks. */
  readonly drawing: BoardDrawing;
  readonly texts: IncrementalTexts;
  readonly link: string;
  readonly formatNumber: (value: number, decimals: number) => string;
}

const order = (tour: readonly number[]) => [...tour, tour[0]!].map((v) => v + 1).join(' – ');

export function incrementalSolutionPdf(input: IncrementalSolutionInput): Uint8Array<ArrayBuffer> {
  const { puzzle, drawing, texts } = input;
  const fmt = input.formatNumber;
  const n = puzzle.points.length;
  const doc = new PdfDocument(texts.solutionTitle(n));
  doc.addForm('Board', drawing.width, drawing.height, (c) => drawForPrint(c, drawing, 2));
  const [pw, ph] = PAPER_SIZES.A4;
  const width = pw - 2 * MARGIN;
  const mm = (um: number, d = 1) => (um === Infinity ? '–' : fmt(um / 1000, d));

  doc.addPage(pw, ph, (c) => {
    text(c, texts.solutionTitle(n), MARGIN, MARGIN + 6, 6.5);
    text(c, texts.solutionWarning, MARGIN, MARGIN + 12, 3.4, RED);
    // Table: k, order, string length, gap, gap at the track.
    const cols = [MARGIN, MARGIN + 9, MARGIN + 126, MARGIN + 150, MARGIN + 170];
    let y = MARGIN + 22;
    const head = texts.tableHead;
    head.forEach((h, i) => text(c, h, cols[i]!, y, 3.2));
    y += 2;
    c.stroke(
      polylinePath([
        [MARGIN, y],
        [pw - MARGIN, y],
      ]),
      GREY,
      0.2,
    );
    y += 5;
    const size = n > 13 ? 2.6 : 3;
    for (const step of puzzle.steps) {
      text(c, String(step.k), cols[0]!, y, size);
      let tour = order(step.tour);
      while (measureText(tour, size).width > cols[2]! - cols[1]! - 3)
        tour = `${tour.slice(0, -5)}…`;
      text(c, tour, cols[1]!, y, size);
      text(c, `${mm(step.stringUm)} mm`, cols[2]!, y, size);
      text(c, step.k > 3 ? `${mm(step.stringGapUm, 1)} mm` : '–', cols[3]!, y, size);
      text(c, step.k > 3 ? `${mm(stepGapUm(step), 1)} mm` : '–', cols[4]!, y, size);
      y += size * 1.45;
    }
    y += 4;
    const full = puzzle.steps[puzzle.steps.length - 1]!;
    const first = trackMarks(puzzle.steps, puzzle.track).find((m) => m.k === n)!;
    const cut = Math.ceil((full.forwardUm / 1000 + first.s + 150) / 50) * 50;
    text(c, texts.calibrationTitle, MARGIN, y + 4, 4.2);
    y = paragraphs(
      c,
      texts.calibrationSteps({ n, cutMm: fmt(cut, 0), tour: order(full.tour) }),
      MARGIN,
      y + 7,
      width,
      3.2,
      0.4,
    );
    text(c, texts.link, MARGIN, y + 5, 3.2);
    const linkSize = 2.4;
    const perLine = Math.max(20, Math.floor(width / (0.47 * linkSize)));
    for (let i = 0, line = 0; i < input.link.length; i += perLine, line++)
      text(c, input.link.slice(i, i + perLine), MARGIN, y + 9.5 + line * 3, linkSize, GREY);
  });

  // Small maps of the optimal round trips, four per row.
  doc.addPage(pw, ph, (c) => {
    text(c, texts.solutionTitle(n), MARGIN, MARGIN + 6, 5);
    const cell = (width - 3 * 4) / 4;
    const scale = Math.min(cell / drawing.width, (cell - 6) / drawing.height);
    puzzle.steps.forEach((step, i) => {
      const x = MARGIN + (i % 4) * (cell + 4);
      const y = MARGIN + 12 + Math.floor(i / 4) * (cell + 6);
      text(c, `k = ${step.k}`, x, y + 3.5, 3.4);
      c.save()
        .transform([scale, 0, 0, scale, x, y + 6])
        .drawForm('Board');
      c.stroke(
        polylinePath(
          step.tour.map((v) => puzzle.points[v]!),
          true,
        ),
        RED,
        0.5 / scale,
      );
      c.restore();
      c.stroke(rectPath(x, y + 6, drawing.width * scale, drawing.height * scale), BLACK, 0.15);
    });
  });
  return doc.toBytes();
}

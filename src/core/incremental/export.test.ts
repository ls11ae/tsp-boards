import { writeFileSync } from 'node:fs';
import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { pathBounds } from '../board/shapes';
import { boardSvg } from '../board/svg';
import { templatePdf } from '../board/print';
import type { MipBackend } from '../tsp/exact';
import { drawIncremental } from './drawing';
import { DEFAULT_INCREMENTAL, generateIncremental, type IncrementalPuzzle } from './generate';
import { incrementalSolutionPdf, incrementalTemplateText } from './print';
import { INCREMENTAL_TEXTS } from './texts';

let backend: MipBackend;
let puzzle: IncrementalPuzzle;
beforeAll(async () => {
  backend = await loadHighs();
  puzzle = generateIncremental({ ...DEFAULT_INCREMENTAL, n: 10, seed: 2 }, backend).puzzle!;
}, 120_000);

const options = {
  nailDiameterMm: 2,
  labelSizeMm: 8,
  holes: 'cut' as const,
  cornerRadiusMm: 5,
  line: INCREMENTAL_TEXTS.de.boardLine(10),
};

describe('incremental board export', () => {
  it('draws nails, pegs, track, marks and numbers inside the board', () => {
    const { drawing, labelsComplete } = drawIncremental(puzzle, options);
    expect(labelsComplete).toBe(true);
    const cut = drawing.items.filter((i) => i.layer === 'cut').flatMap((i) => i.path);
    // 10 nails and 4 pegs; the board outline is a layer of its own.
    expect(cut.filter((c) => c[0] === 'M')).toHaveLength(10 + 4);
    expect(drawing.items.some((i) => i.layer === 'edge')).toBe(true);
    for (const item of drawing.items) {
      const b = pathBounds(item.path)!;
      expect(b[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[2]).toBeLessThanOrEqual(400 + 1e-6);
      expect(b[3]).toBeLessThanOrEqual(400 + 1e-6);
    }
    const svg = boardSvg(drawing, { strokeMm: 0.1, title: 'TSP step by step' });
    expect(svg).toContain('width="400mm"');
    expect(svg).not.toContain('NaN');
    if (process.env.BOARD_SVG) writeFileSync(`${process.env.BOARD_SVG}-incremental.svg`, svg);
  });

  it('writes the template and the solution sheet', () => {
    const marked = drawIncremental(puzzle, { ...options, holes: 'mark' }).drawing;
    const template = templatePdf({
      drawing: marked,
      ...incrementalTemplateText(INCREMENTAL_TEXTS.de, 2),
      paper: 'A4',
    });
    const solution = incrementalSolutionPdf({
      puzzle,
      drawing: marked,
      texts: INCREMENTAL_TEXTS.de,
      link: '#v=1&m=inc',
      formatNumber: (v, d) => v.toFixed(d),
    });
    for (const pdf of [template, solution]) {
      const text = Buffer.from(pdf).toString('latin1');
      expect(text.startsWith('%PDF-1.4')).toBe(true);
      expect(text).not.toContain('NaN');
    }
    expect(Buffer.from(solution).toString('latin1')).toContain('/Count 2');
    if (process.env.BOARD_PDF) {
      writeFileSync(`${process.env.BOARD_PDF}-incremental-template.pdf`, template);
      writeFileSync(`${process.env.BOARD_PDF}-incremental-solution.pdf`, solution);
    }
  });
});

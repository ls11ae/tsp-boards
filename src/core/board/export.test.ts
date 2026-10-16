import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCountryFile } from '../data';
import { DEFAULT_PARAMS, type PuzzleParams } from '../params';
import { greedySelection } from '../search/search';
import { boardPoints, cityPool, regionOutline } from '../region';
import { boardProjection } from '../projection';
import type { MipBackend } from '../tsp/exact';
import { iteratedLocalSearch } from '../tsp/ils';
import { Rng } from '../rng';
import { euclideanLength, stringLength } from '../tsp/tour';
import { verifyCandidate, type Verification } from '../verify';
import { measuredLength } from './measure';
import { mapTemplateText, solutionPdf, templatePdf, tileLayout } from './print';
import { pathBounds } from './shapes';
import { planBoard, type BoardPlan } from './plan';
import { boardPlanInput, boardSetup, drawPuzzleBoard, type BoardSetup } from './setup';
import { boardSvg } from './svg';
import { scaleBarKm, worksheetPdf } from './worksheet';

const file = parseCountryFile(
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '../../../public/data/countries/de.json'),
      'utf8',
    ),
  ),
);

let backend: MipBackend;
let setup: BoardSetup;
let plan: BoardPlan;
let verification: Verification;
const params: PuzzleParams = { ...DEFAULT_PARAMS, n: 25, minDistanceMm: 40 };

beforeAll(async () => {
  backend = await loadHighs();
  // The 25 largest cities at 40 mm: a fixed, realistic selection.
  const pool = cityPool(file, 'DE', { minPopulation: params.minPopulation });
  const projection = boardProjection(regionOutline(file, 'DE'), {
    widthMm: params.boardWidthMm,
    heightMm: params.boardHeightMm,
    marginMm: params.marginMm,
  });
  const points = boardPoints(pool, projection);
  const { selection } = greedySelection(
    { points, population: pool.map((c) => c.pop), pinned: [] },
    params.n,
    params.minDistanceMm,
  );
  setup = boardSetup(
    file,
    params,
    selection.map((i) => pool[i]!.id),
  );
  const heuristic = iteratedLocalSearch(setup.inst, new Rng(1)).tour;
  const v = verifyCandidate(backend, setup.inst, heuristic, 'string-exact', { timeLimitSec: 60 });
  verification = v;
  plan = planBoard(
    boardPlanInput(setup, {
      tour: v.string!.optimal,
      second: v.string!.second,
      gapUm: v.string!.gap,
    }),
    backend,
  )!;
}, 120_000);

describe('board export (Germany, 25 cities)', () => {
  it('sets up the selected cities with labels and texts', () => {
    expect(setup.cities).toHaveLength(25);
    expect(setup.missing).toEqual([]);
    expect(setup.labels!.texts).toContain('Berlin');
    expect(setup.title[0]!.text).toBe('Deutschland');
  });

  it('plans a complete layout with an exact measured gap', () => {
    expect(plan.labelsComplete).toBe(true);
    expect(plan.title).not.toBeNull();
    expect(plan.footer).not.toBeNull();
    expect(plan.measured.kind).toBe('exact');
  });

  it('draws all layers inside the board', () => {
    const drawing = drawPuzzleBoard(setup, plan);
    const layers = new Set(drawing.items.map((i) => i.layer));
    expect([...layers].sort()).toEqual(['cut', 'edge', 'engrave', 'outline', 'score']);
    for (const item of drawing.items) {
      const b = pathBounds(item.path)!;
      expect(b[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[2]).toBeLessThanOrEqual(params.boardWidthMm + 1e-6);
      expect(b[3]).toBeLessThanOrEqual(params.boardHeightMm + 1e-6);
    }
    // One closed circle per nail in the cut layer; the board outline in its own layer.
    const moves = (d: typeof drawing, layer: string) =>
      d.items
        .filter((i) => i.layer === layer)
        .flatMap((i) => i.path)
        .filter((c) => c[0] === 'M').length;
    expect(moves(drawing, 'cut')).toBe(25);
    expect(moves(drawing, 'edge')).toBe(1);
    const marked = drawPuzzleBoard(setup, plan, { holes: 'mark' });
    expect(moves(marked, 'cut')).toBe(0);
    expect(moves(marked, 'edge')).toBe(1);
  });

  it('writes a laser SVG in millimetres with one group per operation', () => {
    const svg = boardSvg(drawPuzzleBoard(setup, plan), { strokeMm: 0.1, title: 'Deutschland' });
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('width="600mm" height="800mm" viewBox="0 0 600 800"');
    for (const id of ['cut', 'score', 'outline', 'engrave']) expect(svg).toContain(`<g id="${id}"`);
    expect(svg).not.toContain('NaN');
    expect(svg.length).toBeLessThan(3_000_000);
    if (process.env.BOARD_SVG) writeFileSync(process.env.BOARD_SVG, svg);
  });

  it('tiles the board over the fewest pages', () => {
    // A4 landscape (3 × 5) beats portrait (4 × 4).
    expect(tileLayout(600, 800, 'A4')).toMatchObject({ cols: 3, rows: 5, pageWidth: 297 });
    expect(tileLayout(600, 800, 'A3')).toMatchObject({ cols: 2, rows: 4, pageWidth: 420 });
    const small = tileLayout(180, 250, 'A4');
    expect(small.cols * small.rows).toBe(1);
  });

  it('writes a valid print template and solution sheet', () => {
    const template = templatePdf({
      drawing: drawPuzzleBoard(setup, plan, { holes: 'mark' }),
      ...mapTemplateText(setup.texts, 'Deutschland', 2),
      paper: 'A4',
    });
    checkPdf(template, 1 + 15);
    const optimal = verification.string!.optimal;
    const start = optimal.indexOf(plan.scale.slot);
    const tour = optimal.map((_, i) => optimal[(start + i) % optimal.length]!);
    const solution = solutionPdf({
      drawing: drawPuzzleBoard(setup, plan, { holes: 'mark' }),
      texts: setup.texts,
      region: 'Deutschland',
      plan,
      points: setup.points,
      tour,
      names: setup.cities.map((c) => c.name),
      stringLengthUm: stringLength(setup.inst, tour),
      centreLengthUm: euclideanLength(setup.inst, tour),
      measuredLengthUm: measuredLength(setup.inst, tour, plan.scale.slot, plan.scale.direction),
      stringGapUm: verification.string!.gap,
      link: '#v=1&d=de@1&sel=abc',
      formatNumber: (v, d) => v.toFixed(d),
    });
    checkPdf(solution, 1);
    if (process.env.BOARD_PDF) {
      writeFileSync(`${process.env.BOARD_PDF}-template.pdf`, template);
      writeFileSync(`${process.env.BOARD_PDF}-solution.pdf`, solution);
    }
  });

  it('writes a classroom worksheet with a solution page', () => {
    const e = verification.euclidean!;
    for (const paper of ['A4', 'A3'] as const) {
      const sheet = worksheetPdf({
        setup,
        paper,
        title: '',
        tour: e.optimal,
        lengthUm: e.optimalLength,
        gapUm: e.gap,
        names: setup.cities.map((c) => c.name),
        formatNumber: (v, d) => v.toFixed(d),
      });
      checkPdf(sheet, 2);
      if (process.env.BOARD_PDF)
        writeFileSync(`${process.env.BOARD_PDF}-worksheet-${paper}.pdf`, sheet);
    }
    expect(scaleBarKm(0.3)).toBe(100);
    expect(scaleBarKm(2)).toBe(20);
    expect(scaleBarKm(0.05, 30)).toBe(1000);
  });
});

/** Structure check: header, object offsets in the xref table, page count, trailer. */
function checkPdf(bytes: Uint8Array, pages: number): void {
  const text = Buffer.from(bytes).toString('latin1');
  expect(text.startsWith('%PDF-1.4')).toBe(true);
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
  expect(text.slice(startxref, startxref + 4)).toBe('xref');
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
    Number(m[1]),
  );
  expect(entries.length).toBeGreaterThan(pages);
  entries.forEach((offset, i) =>
    expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
  );
  expect(Number(/\/Count (\d+)/.exec(text)![1])).toBe(pages);
  expect(text).not.toContain('NaN');
}

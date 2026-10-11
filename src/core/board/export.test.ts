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
import { verifyCandidate } from '../verify';
import { pathBounds } from './shapes';
import { planBoard, type BoardPlan } from './plan';
import { boardPlanInput, boardSetup, drawPuzzleBoard, type BoardSetup } from './setup';
import { boardSvg } from './svg';

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
    expect([...layers].sort()).toEqual(['cut', 'engrave', 'outline', 'score']);
    for (const item of drawing.items) {
      const b = pathBounds(item.path)!;
      expect(b[0]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[1]).toBeGreaterThanOrEqual(-1e-6);
      expect(b[2]).toBeLessThanOrEqual(params.boardWidthMm + 1e-6);
      expect(b[3]).toBeLessThanOrEqual(params.boardHeightMm + 1e-6);
    }
    // One closed circle per nail plus the board outline in the cut layer.
    const cut = drawing.items.filter((i) => i.layer === 'cut').flatMap((i) => i.path);
    expect(cut.filter((c) => c[0] === 'M')).toHaveLength(25 + 1);
    const marked = drawPuzzleBoard(setup, plan, { holes: 'mark' });
    const cutOnly = marked.items.filter((i) => i.layer === 'cut').flatMap((i) => i.path);
    expect(cutOnly.filter((c) => c[0] === 'M')).toHaveLength(1);
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
});

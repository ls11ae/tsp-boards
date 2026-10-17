// Board extras of roadmap 9.1: logos from SVG files, the legend box, marked places with rings,
// a preferred start nail with a rotated scale, and map lines without clip edges.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCountryFile, citiesFromColumns } from '../data';
import { Instance } from '../instance';
import { DEFAULT_PARAMS } from '../params';
import { listCities, parsePlaceLines } from '../places';
import { localText, parsePuzzleDoc } from '../puzzle-file';
import { Rng } from '../rng';
import type { MipBackend } from '../tsp/exact';
import { iteratedLocalSearch } from '../tsp/ils';
import { verifyCandidate } from '../verify';
import { drawLegend, layoutLegend, wrapText } from './legend';
import { parsePathData, parseSvgLogo, parseTransform, placeLogo } from './logo';
import { withoutBoxEdges } from '../region';
import {
  calibrationTour,
  checkMeasurement,
  directionSpread,
  measuredLength,
  outwardBisector,
} from './measure';
import { PREFERRED_START_MIN_GAP_UM, planBoard } from './plan';
import { boardPlanInput, boardSetup, drawPuzzleBoard, logoMetrics } from './setup';
import { pathBounds } from './shapes';

const file = parseCountryFile(
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '../../../public/data/countries/de.json'),
      'utf8',
    ),
  ),
);
const towns = new Map(citiesFromColumns(file.cities, file.states).map((c) => [c.id, c]));

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

const POTRACE = `<?xml version="1.0" standalone="no"?>
<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="300pt" height="100pt" viewBox="0 0 300 100">
<metadata>Created by potrace</metadata>
<defs><path id="hidden" d="M0 0 L1000 1000"/></defs>
<g transform="translate(0,100) scale(0.1,-0.1)" fill="#000000" stroke="none">
<path d="M100 100 l0 800 800 0 0 -800 z m200 200 l400 0 0 400 -400 0 z"/>
<path d="M1100 100 l400 0 0 800 -400 0 z" fill="#ffffff"/>
</g>
</svg>`;

describe('logos', () => {
  it('read potrace output: group transforms, relative commands, holes, no white or defs', () => {
    const logo = parseSvgLogo(POTRACE);
    // The square of 80 × 80 units at (10, 10)–(90, 90) after the y flip; the white bar is left out.
    expect(logo.box[0]).toBeCloseTo(10, 6);
    expect(logo.box[1]).toBeCloseTo(10, 6);
    expect(logo.box[2]).toBeCloseTo(90, 6);
    expect(logo.box[3]).toBeCloseTo(90, 6);
    const placed = placeLogo(logo, 50, 20, 30);
    expect(pathBounds(placed)).toEqual([50, 20, 80, 50]);
    expect(() => parseSvgLogo('<svg><text>no shapes</text></svg>')).toThrow();
  });

  it('turn arcs, quadratic and smooth curves into cubic Béziers', () => {
    const arc = parsePathData('M0 0 A10 10 0 0 1 20 0');
    expect(arc.every((c) => c[0] === 'M' || c[0] === 'C')).toBe(true);
    const end = arc.at(-1)!;
    expect(end[5]).toBeCloseTo(20, 9);
    expect(end[6]).toBeCloseTo(0, 9);
    // The half circle bulges to y = −10 (sweep flag 1 runs clockwise on screen).
    const bounds = pathBounds(arc)!;
    expect(bounds[1]).toBeLessThan(-9);
    expect(parsePathData('M0 0 Q5 10 10 0 T20 0 S30 5 40 0 H50 V5 Z').length).toBe(7);
    expect(parseTransform('translate(5) scale(2)')).toEqual([2, 0, 0, 2, 5, 0]);
  });

  it('act as label metrics centred on the nail at side positions', () => {
    const logo = parseSvgLogo(POTRACE);
    const m = logoMetrics(logo, 20, 5);
    expect(m.inkRight - m.inkLeft).toBe(20);
    expect(m.inkBottom - m.inkTop).toBeCloseTo(20, 9);
  });
});

describe('legend', () => {
  it('wraps lines to the width and puts the footer last', () => {
    const lines = wrapText('eins zwei drei vier fünf sechs sieben', 5, 40);
    expect(lines.length).toBeGreaterThan(1);
    const layout = layoutLegend(
      [
        { symbol: 'ring', text: 'Exzellenzuniversität oder -verbund ab 2027' },
        { symbol: 'nail', text: 'weiterer Standort' },
        { symbol: 'none', text: 'Förderung 2026–2033' },
      ],
      parseSvgLogo(POTRACE),
      'Städte: GeoNames (CC BY 4.0)',
      290,
    );
    expect(layout.lines[0]!.symbol).toBe('ring');
    expect(layout.lines.at(-1)!.text).toContain('GeoNames');
    expect(layout.logo).not.toBeNull();
    // Text right of the logo.
    expect(layout.lines[0]!.x).toBeGreaterThan(layout.logo!.box[2]);
    expect(layout.height).toBeGreaterThan(layout.logo!.box[3]);
  });

  it('scores a dashed line for the given leg of an open path (roadmap 9.17)', () => {
    const layout = layoutLegend(
      [{ symbol: 'dashed', text: 'Gestrichelt: der Rückflug über den Pazifik ist vorgegeben' }],
      null,
      'Städte: GeoNames (CC BY 4.0)',
      120,
    );
    expect(layout.width).toBe(120);
    const paths = drawLegend(layout, 10, 250, { ringOuterMm: 3, ringInnerMm: 2, nailRadiusMm: 1 });
    expect(paths.score.filter((c) => c[0] === 'M')).toHaveLength(3);
    expect(
      parsePuzzleDoc({
        schema: 1,
        id: 'x',
        kind: 'map',
        title: 'X',
        map: {
          params: {},
          places: [],
          board: { legend: [{ symbol: 'dashed', text: 'a' }], legendWidthMm: 120 },
        },
      }).map!.board,
    ).toMatchObject({ legend: [{ symbol: 'dashed' }], legendWidthMm: 120 });
  });
});

describe('map lines', () => {
  it('drop segments along the bounding box (clip edges of the data)', () => {
    const lines = withoutBoxEdges({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 5],
          [5, 8],
        ],
      ],
    });
    // [0,0]–[10,0] lies on the southern edge, [10,0]–[10,5] on the eastern one.
    expect(lines.coordinates).toEqual([
      [
        [10, 5],
        [5, 8],
      ],
    ]);
  });
});

describe('a rotated scale', () => {
  it('certifies the gap with the spread of the two directions subtracted', () => {
    const points = [
      [0, 0],
      [120, 10],
      [200, 120],
      [90, 200],
      [10, 150],
      [60, 80],
    ] as const;
    const inst = new Instance(points, 1.5);
    const v = verifyCandidate(
      backend,
      inst,
      iteratedLocalSearch(inst, new Rng(1)).tour,
      'string-exact',
      {
        timeLimitSec: 30,
      },
    );
    const opt = v.string!.optimal;
    const slot = 0;
    const u = outwardBisector(inst.pointsMm(), opt, slot)!;
    expect(directionSpread(inst, opt, slot, u)).toBeLessThanOrEqual(1);
    const a = Math.PI / 6;
    const r: [number, number] = [
      u[0] * Math.cos(a) - u[1] * Math.sin(a),
      u[0] * Math.sin(a) + u[1] * Math.cos(a),
    ];
    const spread = directionSpread(inst, opt, slot, r);
    expect(spread).toBeGreaterThan(0);
    const straight = checkMeasurement(backend, inst, opt, slot, u, {}, { timeLimitSec: 30 });
    const turned = checkMeasurement(backend, inst, opt, slot, r, {}, { timeLimitSec: 30 });
    expect(turned.gapUm).toBeLessThanOrEqual(straight.gapUm);
    // Calibration uses the longer direction: its measured length is the optimum's length.
    const tour = calibrationTour(inst, opt, slot, r);
    expect(tour[0]).toBe(slot);
    expect(measuredLength(inst, tour, slot, r)).toBe(turned.lengthUm);
  });
});

describe('the Excellence Strategy board', () => {
  const text = readFileSync(
    path.resolve(
      import.meta.dirname,
      '../../../docs/data/curated/exzellenzstrategie-2027-brett.txt',
    ),
    'utf8',
  );

  it('marks the 14 university places in the list', () => {
    expect(parsePlaceLines(text).filter((l) => l.highlight).length).toBe(14);
  });

  it('keeps marks, legend and start nail in the puzzle file and on the board', () => {
    const doc = parsePuzzleDoc(
      JSON.parse(
        readFileSync(
          path.resolve(
            import.meta.dirname,
            '../../../public/puzzles/exzellenzstrategie-2027-brett.tsp.json',
          ),
          'utf8',
        ),
      ),
    );
    const map = doc.map!;
    expect(map.places.filter((p) => p.highlight).length).toBe(14);
    expect(map.board!.legend.length).toBe(4);
    expect(map.places[map.board!.startPlace!]!.name).toBe('Ruhr Innovation Lab');
    const pool = listCities(map.places, towns);
    const setup = boardSetup(
      file,
      { ...DEFAULT_PARAMS, ...map.params },
      pool.map((c) => c.id),
      localText(doc.title, 'de'),
      pool,
      { board: map.board },
    );
    expect(setup.highlight.filter(Boolean).length).toBe(14);
    expect(setup.legend).not.toBeNull();
    expect(setup.title[1]!.text).toContain('25 Orte');
    expect(setup.cities[setup.preferredStart!]!.name).toBe('Ruhr Innovation Lab');
    const v = verifyCandidate(backend, setup.inst, map.results!.tour, 'string-exact', {
      timeLimitSec: 60,
    });
    const plan = planBoard(
      boardPlanInput(setup, {
        tour: v.string!.optimal,
        second: v.string!.second,
        gapUm: v.string!.gap,
      }),
      backend,
    )!;
    // The legend box is free of nails, scale and labels, and is drawn.
    expect(plan.legend).not.toBeNull();
    expect(plan.warnings.map((w) => w.kind)).not.toContain('legend-overlap');
    // The Ruhr Innovation Lab is the start nail; its gap at the scale is below the 5 mm target
    // but above the 4 mm a preferred start nail needs (roadmap 9.14).
    expect(setup.cities[plan.scale.slot]!.name).toBe('Ruhr Innovation Lab');
    expect(plan.measured.gapUm).toBeGreaterThanOrEqual(PREFERRED_START_MIN_GAP_UM);
    const drawing = drawPuzzleBoard(setup, plan);
    expect(drawing.width).toBe(300);
    expect(drawing.height).toBe(600);
    // Drilled boards (roadmap 9.5): pits on their own layer, no holes cut, no outline cut.
    const drilled = drawPuzzleBoard(setup, plan, { holes: 'pit', edge: false });
    const layers = new Set(drilled.items.map((i) => i.layer));
    expect(layers.has('pit')).toBe(true);
    expect(layers.has('cut')).toBe(false);
    expect(layers.has('edge')).toBe(false);
    expect(new Set(drawing.items.map((i) => i.layer)).has('edge')).toBe(true);
    expect(map.board!.export).toEqual({ holes: 'pit', edge: false });
  }, 120_000);
});

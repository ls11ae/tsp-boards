// Boards of an open path whose leg back is given (roadmap 9.15): the end points as slots, their
// captions, the given leg as a line the layout keeps off, and the scale at the end nail.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { citiesFromColumns, parseCountryFile } from '../data';
import { DEFAULT_PARAMS } from '../params';
import { listCities } from '../places';
import { Rng } from '../rng';
import type { MipBackend } from '../tsp/exact';
import { iteratedLocalSearch } from '../tsp/ils';
import { openPath } from '../tsp/tour';
import { verifyCandidate } from '../verify';
import { planBoard } from './plan';
import { boardPlanInput, boardSetup, drawPuzzleBoard } from './setup';

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

/** The largest town of each name. */
function places(names: readonly string[]) {
  const all = [...towns.values()];
  return names.map((name) => {
    const town = all.filter((t) => t.name === name).sort((a, b) => b.pop - a.pop)[0]!;
    return { id: town.id, name: town.name, lat: town.lat, lon: town.lon };
  });
}

describe('an open path on a board', () => {
  it('has its end points, captions and given leg, and the scale at the end nail', () => {
    const pool = listCities(
      places([
        'Berlin',
        'Hamburg',
        'München',
        'Köln',
        'Frankfurt am Main',
        'Stuttgart',
        'Leipzig',
        'Dresden',
        'Hannover',
        'Nürnberg',
      ]),
      towns,
    );
    const params = {
      ...DEFAULT_PARAMS,
      boardWidthMm: 300,
      boardHeightMm: 400,
      marginMm: 20,
      n: pool.length,
    };
    const setup = boardSetup(
      file,
      params,
      pool.map((c) => c.id),
      'Weg',
      pool,
      { path: { start: 1, end: 2 } },
    );
    expect(setup.path).toEqual({ start: 1, end: 2 });
    expect(setup.inst.fixedEdge).toEqual([1, 2]);
    expect(setup.captions.map((c) => [c.slot, c.text])).toEqual([
      [1, 'Start'],
      [2, 'Ziel'],
    ]);
    expect(setup.givenLeg.length).toBeGreaterThan(0);
    expect(setup.title[1]!.text).toContain('von Hamburg nach München');

    const v = verifyCandidate(
      backend,
      setup.inst,
      iteratedLocalSearch(setup.inst, new Rng(1)).tour,
      'string-exact',
      { timeLimitSec: 60 },
    );
    const optimal = v.string!.optimal;
    const route = openPath(setup.inst, optimal)!;
    expect(route[0]).toBe(1);
    expect(route.at(-1)).toBe(2);
    const plan = planBoard(
      boardPlanInput(setup, {
        tour: optimal,
        second: v.string!.second,
        gapUm: v.string!.gap,
      }),
      backend,
    )!;
    // The string is tied at the start and read at the end nail.
    expect(plan.scale.slot).toBe(2);
    expect(plan.measured.kind).toBe('exact');
    const drawing = drawPuzzleBoard(setup, plan);
    expect(drawing.items.length).toBeGreaterThan(0);
  }, 120_000);
});

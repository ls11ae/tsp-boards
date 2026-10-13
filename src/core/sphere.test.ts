// The world (roadmap 8.2): great-circle distances, the Equal Earth map, regions of the world
// file, and the teaching point "shortest tour on the flat map".

import { readFileSync } from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseCountryFile } from './data';
import { greatCircleKm, type Point } from './geometry';
import { Instance } from './instance';
import { boardProjection } from './projection';
import { citySphere, cityPool, projectionKind, regionFrame, regionInfo, regionsOf } from './region';
import { offeredRegions } from './region-check';
import { insertionFrames } from './teaching';
import { hullInsertion, insertionStart } from './tsp/construct';
import type { MipBackend } from './tsp/exact';
import { isTour } from './tsp/tour';
import { flatOptimum, verifyCandidate } from './verify';
import { iteratedLocalSearch } from './tsp/ils';
import { Rng } from './rng';

const world = parseCountryFile(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../../public/data/countries/wo.json'), 'utf8'),
  ),
);
const board = { widthMm: 1000, heightMm: 520, marginMm: 10 };

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

/** An instance of places given as [lon, lat] on a map 1 mm per 10 km (map points unused). */
function sphereInstance(lonLat: readonly Point[]): Instance {
  return new Instance(
    lonLat.map(([lon, lat]) => [lon * 10, -lat * 10]),
    1.5,
    { lonLat, mmPerKm: 0.1 },
  );
}

describe('great-circle distances', () => {
  it('measure kilometres on the sphere, in map millimetres', () => {
    expect(greatCircleKm([0, 0], [1, 0])).toBeCloseTo(111.195, 2);
    expect(greatCircleKm([0, 0], [180, 0])).toBeCloseTo(Math.PI * 6371.0088, 2);
    // Across the antimeridian: Fiji to Samoa is short.
    expect(greatCircleKm([178, -18], [-172, -14])).toBeLessThan(1200);
    const inst = sphereInstance([
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(inst.dist(0, 1)).toBe(Math.round(111.195 * 0.1 * 1000));
    // No string on a sphere: r_eff is 0.
    expect(inst.rEffUm).toBe(0);
    expect(inst.turn(0, 1, 2)).toBe(0);
  });

  it('follow moved points, also in copies', () => {
    const inst = sphereInstance([
      [0, 0],
      [10, 0],
      [0, 10],
      [10, 10],
    ]);
    const copy = inst.clone();
    expect(() => copy.movePoint(3, 0, 0)).toThrow();
    copy.movePoint(3, 200, -200, [20, 20]);
    expect(copy.dist(0, 3)).toBe(Math.round(greatCircleKm([0, 0], [20, 20]) * 100));
    expect(inst.dist(0, 3)).toBe(Math.round(greatCircleKm([0, 0], [10, 10]) * 100));
    // The flat map measures the map points instead.
    expect(inst.plane().dist(0, 1)).toBe(100_000);
    expect(inst.euclidean().sphere).not.toBeNull();
  });

  it('start the insertion heuristic at the farthest pair (a sphere has no convex hull)', () => {
    const lonLat: Point[] = [
      [0, 0],
      [10, 5],
      [170, 0],
      [-20, 40],
      [100, -30],
      [60, 60],
    ];
    const inst = sphereInstance(lonLat);
    const start = insertionStart(inst);
    let far = 0;
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) far = Math.max(far, inst.dist(i, j));
    expect(inst.dist(start[0]!, start[1]!)).toBe(far);
    expect(isTour(hullInsertion(inst), 6)).toBe(true);
    expect(insertionFrames(inst)[0]!.note.kind).toBe('pair');
  });
});

describe('the world map', () => {
  it('uses Equal Earth, fitted to the whole sphere for the world', () => {
    expect(world.metric).toBe('sphere');
    expect(projectionKind(world)).toBe('equal-earth');
    expect(regionFrame(world, 'WO')).toEqual({ type: 'Sphere' });
    const projection = boardProjection(regionFrame(world, 'WO'), board, 'equal-earth');
    expect(projection.centralMeridian).toBe(0);
    // Both poles and the antimeridian lie on the board.
    for (const [lon, lat] of [
      [0, 90],
      [0, -90],
      [-180, 0],
      [180, 0],
    ] as const) {
      const [x, y] = projection.project(lon, lat);
      expect(x).toBeGreaterThanOrEqual(9.9);
      expect(x).toBeLessThanOrEqual(990.1);
      expect(y).toBeGreaterThanOrEqual(9.9);
      expect(y).toBeLessThanOrEqual(510.1);
    }
  });

  it('centres a region across the antimeridian on it', () => {
    const projection = boardProjection(
      {
        type: 'Polygon',
        coordinates: [
          [
            [170, -40],
            [170, -10],
            [-170, -10],
            [-170, -40],
            [170, -40],
          ],
        ],
      },
      board,
      'equal-earth',
    );
    expect(Math.abs(projection.centralMeridian)).toBeCloseTo(180, 5);
  });

  it('offers continents and their unions as regions', () => {
    const offered = offeredRegions(world).map((r) => r.id);
    expect(offered).toContain('WO');
    expect(offered).toContain('WO-AS+EU');
    for (const c of ['AF', 'AS', 'EU', 'NA', 'SA']) expect(offered).toContain(`WO-${c}`);
    expect(regionInfo(world, 'WO-NA+SA').name).toBe('Amerika');
    expect(regionsOf(world).find((r) => r.id === 'WO-EU')?.nameEn).toBe('Europe');
    const europe = cityPool(world, 'WO-EU', { minPopulation: 1_000_000 }).map((c) => c.name);
    expect(europe).toContain('Istanbul');
    expect(europe).toContain('Moskau');
    expect(europe).not.toContain('Nowosibirsk');
  });
});

describe('the teaching point', () => {
  it('measures the flat-map optimum on the sphere: never shorter than the optimum', () => {
    const projection = boardProjection(regionFrame(world, 'WO'), board, 'equal-earth');
    const names = ['London', 'New York City', 'Tokio', 'Sydney', 'Kapstadt', 'Lima', 'Moskau'];
    const pool = cityPool(world, 'WO', { minPopulation: 250_000 });
    const cities = names.map((n) => pool.find((c) => c.name === n)!);
    const sphere = citySphere(world, cities, projection)!;
    const inst = new Instance(
      cities.map((c) => projection.project(c.lon, c.lat)),
      0,
      sphere,
    );
    const v = verifyCandidate(
      backend,
      inst,
      iteratedLocalSearch(inst, new Rng(1)).tour,
      'euclid-exact-string-local',
      { timeLimitSec: 30 },
    );
    const flat = flatOptimum(backend, inst)!;
    expect(isTour(flat.tour, names.length)).toBe(true);
    expect(flat.sphereLength).toBeGreaterThanOrEqual(v.euclidean!.optimalLength);
    // On the map it is the shortest: the sphere optimum is not shorter there.
    const plane = inst.plane();
    const mapLength = (tour: readonly number[]) =>
      tour.reduce((s, a, i) => s + plane.dist(a, tour[(i + 1) % tour.length]!), 0);
    expect(flat.mapLength).toBeLessThanOrEqual(mapLength(v.euclidean!.optimal));
    // Plane instances have no flat-map comparison.
    expect(flatOptimum(backend, plane)).toBeNull();
  });
});

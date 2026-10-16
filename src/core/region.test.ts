import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCountryFile } from './data';
import { boardProjection } from './projection';
import {
  REGION_ID_PATTERN,
  cityPool,
  mapLines,
  outlineLines,
  regionInfo,
  regionOutline,
  regionStates,
  regionsOf,
  unionId,
} from './region';
import { MIN_PUZZLE_PLACES, offeredRegions, regionCapacity } from './region-check';

const file = parseCountryFile(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../../public/data/countries/de.json'), 'utf8'),
  ),
);
const board = { widthMm: 600, heightMm: 800, marginMm: 30 };

describe('regions', () => {
  it('names unions of states and parses their ids', () => {
    expect(unionId('DE', ['DE-BE', 'DE-BB'])).toBe('DE-BB+BE');
    expect(regionStates(file, 'DE-BB+BE')).toEqual(['DE-BB', 'DE-BE']);
    expect(regionStates(file, 'DE')).toBeNull();
    expect(() => regionStates(file, 'DE-XX')).toThrow();
    expect(regionInfo(file, 'DE-BB+BE').name).toBe('Berlin und Brandenburg');
    expect(regionInfo(file, 'DE-BY+HE').nameEn).toBe('Bavaria + Hesse');
    expect(regionsOf(file).every((r) => REGION_ID_PATTERN.test(r.id))).toBe(true);
  });

  it('pools the towns of all states of a union; Berlin joins Brandenburg', () => {
    const pool = cityPool(file, 'DE-BB+BE', { minPopulation: 5000 });
    expect(pool.some((c) => c.name === 'Berlin')).toBe(true);
    expect(pool.every((c) => c.state === 'DE-BB' || c.state === 'DE-BE')).toBe(true);
  });

  it('dissolves the outline of a union (no inner border around Berlin)', () => {
    const outline = regionOutline(file, 'DE-BB+BE');
    const projection = boardProjection(outline, board);
    const berlin = cityPool(file, 'DE-BE', { minPopulation: 0 })[0]!;
    const [x, y] = projection.project(berlin.lon, berlin.lat);
    expect(x).toBeGreaterThan(30);
    expect(y).toBeGreaterThan(30);
    // One ring per polygon: Brandenburg alone has Berlin as a hole, the union has none.
    const rings = (g: typeof outline.geometry) =>
      g.type === 'Polygon'
        ? g.coordinates.length
        : g.type === 'MultiPolygon'
          ? g.coordinates.reduce((s, p) => s + p.length, 0)
          : 0;
    expect(rings(outline.geometry)).toBeLessThan(rings(regionOutline(file, 'DE-BB').geometry));
  });

  it('offers only regions that hold a minimum puzzle', () => {
    expect(regionCapacity(file, 'DE-BE')).toBe(1);
    expect(regionCapacity(file, 'DE-HB')).toBe(2);
    const ids = offeredRegions(file).map((r) => r.id);
    expect(ids).not.toContain('DE-BE');
    expect(ids).not.toContain('DE-HH');
    expect(ids).not.toContain('DE-HB');
    expect(ids).toContain('DE-BB+BE');
    expect(ids).toContain('DE-HB+HH+MV+NI+SH');
    for (const id of ids) expect(regionCapacity(file, id)).toBe(MIN_PUZZLE_PLACES);
  });
});

describe('regions of other countries', () => {
  const load = (cc: string) =>
    parseCountryFile(
      JSON.parse(
        readFileSync(
          path.resolve(import.meta.dirname, `../../public/data/countries/${cc}.json`),
          'utf8',
        ),
      ),
    );

  it('offers Vienna with Lower Austria, Basel-Stadt with Basel-Landschaft', () => {
    const at = load('at');
    const ids = offeredRegions(at).map((r) => r.id);
    expect(ids).not.toContain('AT-9');
    expect(ids).toContain('AT-3+9');
    expect(regionInfo(at, 'AT-3+9').name).toBe('Wien und Niederösterreich');
    const ch = offeredRegions(load('ch')).map((r) => r.id);
    expect(ch).not.toContain('CH-BS');
    expect(ch).toContain('CH-BL+BS');
    expect(ch).toContain('CH-AI+AR+GL+GR+SG+SH+TG');
  });

  it('keeps the Caribbean Netherlands off the board of the Netherlands', () => {
    const nl = load('nl');
    expect(nl.states.map((s) => s.id)).not.toContain('NL-BQ1');
    const projection = boardProjection(regionOutline(nl, 'NL'), board);
    expect(projection.mmPerKm).toBeGreaterThan(1.5);
  });

  it('draws Europe without the cut at 45° E (roadmap 9.6)', () => {
    const eu = load('eu');
    // The data clips Russia at 45° E (quantised: 45.00025°).
    const at45 = (x: number) => Math.abs(x - 45) < 1e-3;
    const onCut = (lines: { coordinates: number[][][] }) =>
      lines.coordinates.some((line) =>
        line.some((p, i) => i > 0 && at45(p[0]!) && at45(line[i - 1]![0]!)),
      );
    const outline = regionOutline(eu, 'EU');
    const rings =
      outline.geometry.type === 'MultiPolygon' ? outline.geometry.coordinates.flat() : [];
    expect(onCut({ coordinates: rings })).toBe(true);
    expect(onCut(outlineLines(outline))).toBe(false);
    const lines = mapLines(eu);
    expect(onCut(lines.country)).toBe(false);
    expect(onCut(lines.states)).toBe(false);
    expect(lines.states.coordinates.length).toBeGreaterThan(40);
  });
});

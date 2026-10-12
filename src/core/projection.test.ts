import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCountryFile } from './data';
import { distance } from './geometry';
import { boardProjection, geodesicKm } from './projection';
import { cityPool, regionOutline, regionsOf } from './region';

const file = parseCountryFile(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../../public/data/countries/de.json'), 'utf8'),
  ),
);
const board = { widthMm: 600, heightMm: 800, marginMm: 30 };

describe('board projection for Germany', () => {
  const projection = boardProjection(regionOutline(file, 'DE'), board);
  const cities = cityPool(file, 'DE', { minPopulation: 100_000 });
  const city = (name: string) => cities.find((c) => c.name === name)!;

  it('fits the country into the board margins', () => {
    for (const c of cities) {
      const [x, y] = projection.project(c.lon, c.lat);
      expect(x).toBeGreaterThan(board.marginMm - 5);
      expect(x).toBeLessThan(board.widthMm - board.marginMm + 5);
      expect(y).toBeGreaterThan(board.marginMm - 5);
      expect(y).toBeLessThan(board.heightMm - board.marginMm + 5);
    }
    expect(projection.parallels[0]).toBeGreaterThan(47);
    expect(projection.parallels[1]).toBeLessThan(55);
  });

  it('keeps distances proportional across the country (conformal, < 0.5 % scale error)', () => {
    const pairs = [
      ['Berlin', 'München'],
      ['Hamburg', 'Freiburg im Breisgau'],
      ['Kiel', 'Rostock'],
      ['Aachen', 'Dresden'],
    ] as const;
    for (const [a, b] of pairs) {
      const ca = city(a);
      const cb = city(b);
      const mm = distance(projection.project(ca.lon, ca.lat), projection.project(cb.lon, cb.lat));
      const km = geodesicKm([ca.lon, ca.lat], [cb.lon, cb.lat]);
      expect(Math.abs(mm / km / projection.mmPerKm - 1)).toBeLessThan(0.005);
    }
    // Berlin–München is about 504 km.
    expect(
      geodesicKm(
        [city('Berlin').lon, city('Berlin').lat],
        [city('München').lon, city('München').lat],
      ),
    ).toBeCloseTo(504, -1);
  });

  it('lists the country, the named unions and the 16 states as regions', () => {
    expect(regionsOf(file).filter((r) => r.kind === 'state' && !r.id.includes('+'))).toHaveLength(
      16,
    );
    expect(
      cityPool(file, 'DE-NW', { minPopulation: 100_000 }).every((c) => c.state === 'DE-NW'),
    ).toBe(true);
  });

  it('produces SVG path data in board mm', () => {
    const d = projection.path(regionOutline(file, 'DE'));
    expect(d.startsWith('M')).toBe(true);
    expect(d.length).toBeGreaterThan(1000);
  });
});

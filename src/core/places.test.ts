import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { citiesFromColumns, parseCountryFile } from './data';
import {
  NameIndex,
  decodePlaceList,
  encodePlaceList,
  listCities,
  mergePlaces,
  normalizeName,
  parsePlaceLines,
  type ListPlace,
} from './places';

const file = parseCountryFile(
  JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../../public/data/countries/de.json'), 'utf8'),
  ),
);
const cities = citiesFromColumns(file.cities, file.states);
const index = new NameIndex(cities);

describe('place lines', () => {
  it('reads names, CSV rows, comments and a header', () => {
    const lines = parsePlaceLines(
      [
        'name, lat, lon, label',
        'Dortmund',
        '  # a comment',
        'TU Dortmund, 51.4924, 7.4127, TU',
        'RWTH; 50,7778; 6,0775',
        'Frankfurt am Main # the big one',
        '',
      ].join('\n'),
    );
    expect(lines).toEqual([
      { line: 2, text: 'Dortmund', name: 'Dortmund' },
      {
        line: 4,
        text: 'TU Dortmund, 51.4924, 7.4127, TU',
        name: 'TU Dortmund',
        lat: 51.4924,
        lon: 7.4127,
        label: 'TU',
      },
      { line: 5, text: 'RWTH; 50,7778; 6,0775', name: 'RWTH', lat: 50.7778, lon: 6.0775 },
      { line: 6, text: 'Frankfurt am Main # the big one', name: 'Frankfurt am Main' },
    ]);
  });

  it('normalises names', () => {
    expect(normalizeName('Mönchengladbach')).toBe('monchengladbach');
    expect(normalizeName('Halle (Saale)')).toBe('halle saale');
    expect(normalizeName('Gießen')).toBe('giessen');
  });
});

describe('name matching against the country data', () => {
  it('finds exact names, transliterations and English names', () => {
    for (const q of ['München', 'Muenchen', 'munchen', 'Munich']) {
      const m = index.match(q);
      expect(m.status).toBe('matched');
      expect(m.options[0]!.name).toBe('München');
    }
  });

  it('offers a choice for prefixes and duplicates, largest first', () => {
    const frankfurt = index.match('Frankfurt');
    expect(frankfurt.status).toBe('ambiguous');
    expect(frankfurt.options.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Frankfurt am Main', 'Frankfurt (Oder)']),
    );
    expect(frankfurt.options[0]!.name).toBe('Frankfurt am Main');
  });

  it('suggests corrections for typos, and gives up on nonsense', () => {
    const typo = index.match('Dortmnud');
    expect(typo.status).toBe('ambiguous');
    expect(typo.options[0]!.name).toBe('Dortmund');
    expect(index.match('Xyzzyqwerty').status).toBe('not-found');
  });
});

describe('merging and list cities', () => {
  const place = (p: Omit<ListPlace, 'lines' | 'names'>, line: number): ListPlace => ({
    ...p,
    lines: [line],
    names: [p.name],
  });

  it('merges the same town and very close places, naming all of them', () => {
    const merged = mergePlaces(
      [
        place({ id: 1, name: 'Aachen', lat: 50.776, lon: 6.084 }, 1),
        place({ id: 1, name: 'Aachen', lat: 50.776, lon: 6.084 }, 2),
        place({ name: 'Cluster A', lat: 51.0, lon: 7.0 }, 3),
        place({ name: 'Cluster B', lat: 51.003, lon: 7.0 }, 4),
        place({ name: 'Far away', lat: 52.0, lon: 7.0 }, 5),
      ],
      1,
    );
    expect(merged).toHaveLength(3);
    expect(merged[0]).toMatchObject({ id: 1, lines: [1, 2] });
    expect(merged[0]!.label).toBeUndefined();
    expect(merged[1]).toMatchObject({ label: 'Cluster A · Cluster B', lines: [3, 4] });
    expect(merged[2]!.lines).toEqual([5]);
  });

  it('turns custom places into pool cities with negative ids', () => {
    const dortmund = cities.find((c) => c.name === 'Dortmund')!;
    const list = listCities(
      [
        { id: dortmund.id, name: 'Dortmund', lat: 0, lon: 0, label: 'DO' },
        { name: 'Somewhere', lat: 51, lon: 7 },
      ],
      new Map(cities.map((c) => [c.id, c])),
    );
    expect(list[0]).toMatchObject({ id: dortmund.id, label: 'DO', lat: dortmund.lat });
    expect(list[1]).toMatchObject({ id: -2, name: 'Somewhere', label: 'Somewhere', pop: 1 });
  });
});

describe('place lists in links', () => {
  it('round-trip towns, labels and custom places compactly', () => {
    const places = [
      { id: 2935517, name: 'Dortmund', lat: 51.5, lon: 7.46 },
      { id: 2928810, name: 'Essen', lat: 51.45, lon: 7.01, label: 'Essen (Ruhr)' },
      { name: 'Exzellenzcluster „Ökologie“', lat: 51.123456, lon: 7.987654, label: 'Öko' },
    ];
    const text = encodePlaceList('fixed', places);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePlaceList(text)).toEqual({
      mode: 'fixed',
      places: [
        { id: 2935517 },
        { id: 2928810, label: 'Essen (Ruhr)' },
        { name: 'Exzellenzcluster „Ökologie“', lat: 51.12346, lon: 7.98765, label: 'Öko' },
      ],
    });
    expect(decodePlaceList(encodePlaceList('pool', []))).toEqual({ mode: 'pool', places: [] });
    expect(decodePlaceList('not!base64')).toBeNull();
    expect(decodePlaceList('AAAA')).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { citiesFromColumns, parseCountryFile } from './data';
import { boardProjection } from './projection';
import { parsePuzzleDoc } from './puzzle-file';
import { boardPoints, regionOutline } from './region';
import {
  NameIndex,
  compositePlace,
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

  it('reads a town with a label of its own after a semicolon (roadmap 9.13)', () => {
    expect(parsePlaceLines(['* München; München ×2', 'Köln;Cologne'].join('\n'))).toEqual([
      {
        line: 1,
        text: '* München; München ×2',
        name: 'München',
        label: 'München ×2',
        highlight: true,
      },
      { line: 2, text: 'Köln;Cologne', name: 'Köln', label: 'Cologne' },
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
      highlight: [],
    });
    expect(decodePlaceList(encodePlaceList('pool', []))).toEqual({
      mode: 'pool',
      places: [],
      highlight: [],
    });
    expect(decodePlaceList('not!base64')).toBeNull();
    expect(decodePlaceList('AAAA')).toBeNull();
  });

  it('carry marked places ("* name": a ring on the board)', () => {
    const [aachen, ril, plain] = parsePlaceLines(
      ['* Aachen', '*Ruhr Innovation Lab = Bochum + Dortmund', 'Siegen'].join('\n'),
    );
    expect(aachen).toMatchObject({ name: 'Aachen', highlight: true });
    expect(ril).toMatchObject({ name: 'Ruhr Innovation Lab', highlight: true });
    expect(plain!.highlight).toBeUndefined();
    const places = [
      { id: 2935517, name: 'Dortmund', lat: 51.5, lon: 7.46, highlight: true },
      { id: 2928810, name: 'Essen', lat: 51.45, lon: 7.01 },
    ];
    expect(decodePlaceList(encodePlaceList('fixed', places))!.highlight).toEqual([0]);
    const towns = new Map(cities.map((c) => [c.id, c]));
    expect(listCities(places.slice(0, 1), towns)[0]!.highlight).toBe(true);
  });
});

describe('composite places', () => {
  const bochum = { id: 2947416, name: 'Bochum', lat: 51.4818, lon: 7.2162 };
  const dortmund = { id: 2935517, name: 'Dortmund', lat: 51.5149, lon: 7.466 };

  it('read "name = A + B" with town names and points, and an optional label', () => {
    const [ril, campus] = parsePlaceLines(
      [
        'Ruhr Innovation Lab = Bochum + Dortmund; RIL',
        'Campus = Nord (51.49, 7.41) + Süd (51,48; 7,40) + Essen',
      ].join('\n'),
    );
    expect(ril).toMatchObject({
      name: 'Ruhr Innovation Lab',
      label: 'RIL',
      members: [{ name: 'Bochum' }, { name: 'Dortmund' }],
    });
    expect(campus!.members).toEqual([
      { name: 'Nord', lat: 51.49, lon: 7.41 },
      { name: 'Süd', lat: 51.48, lon: 7.4 },
      { name: 'Essen' },
    ]);
    // One member is no composite: an ordinary line.
    expect(parsePlaceLines('A = B')[0]!.members).toBeUndefined();
  });

  it('are one node at the mean of the projected members, never merged', () => {
    const ril = compositePlace('Ruhr Innovation Lab', [bochum, dortmund]);
    expect(ril.lat).toBeCloseTo((bochum.lat + dortmund.lat) / 2, 5);
    const towns = new Map(cities.map((c) => [c.id, c]));
    const [city] = listCities([ril], towns);
    expect(city!.id).toBeLessThan(0);
    expect(city!.members).toHaveLength(2);
    expect(city!.state).toBe('DE-NW');
    expect(city!.pop).toBe(towns.get(bochum.id)!.pop + towns.get(dortmund.id)!.pop);
    const projection = boardProjection(regionOutline(file, 'DE-NW'), {
      widthMm: 600,
      heightMm: 800,
      marginMm: 30,
    });
    const [p] = boardPoints([city!], projection);
    const a = projection.project(bochum.lon, bochum.lat);
    const b = projection.project(dortmund.lon, dortmund.lat);
    expect(p![0]).toBeCloseTo((a[0] + b[0]) / 2, 6);
    expect(p![1]).toBeCloseTo((a[1] + b[1]) / 2, 6);
    const near = { ...dortmund, lines: [2], names: ['Dortmund'] };
    const merged = mergePlaces([{ ...ril, lines: [1], names: ['RIL'] }, near], 50);
    expect(merged).toHaveLength(2);
  });

  it('keep their members in links and puzzle files', () => {
    const ril = compositePlace('Ruhr Innovation Lab', [
      bochum,
      { name: 'Campus', lat: 51.49, lon: 7.41 },
    ]);
    const decoded = decodePlaceList(encodePlaceList('fixed', [ril]))!;
    expect(decoded.places[0]).toEqual({
      name: 'Ruhr Innovation Lab',
      members: [{ id: bochum.id }, { name: 'Campus', lat: 51.49, lon: 7.41 }],
    });
    const doc = parsePuzzleDoc({
      schema: 1,
      id: 'x',
      kind: 'map',
      title: 'X',
      map: { params: {}, places: [{ ...ril, lat: 0, lon: 0 }] },
    });
    // The stored position is recomputed from the members.
    expect(doc.map!.places[0]).toEqual(ril);
  });
});

describe('English names (roadmap 9.16)', () => {
  const towns = new Map(cities.map((c) => [c.id, c]));
  const bonn = cities.find((c) => c.name === 'Bonn')!;
  const koeln = cities.find((c) => c.name === 'Köln' && c.pop > 500_000)!;
  const member = (c: (typeof cities)[number]) => ({
    id: c.id,
    name: c.name,
    lat: c.lat,
    lon: c.lon,
  });

  it('read "Name | English name" for composite and custom places', () => {
    const [rmu, point] = parsePlaceLines(
      [
        'Rhein-Main-Universitäten | Rhine-Main Universities = Darmstadt + Mainz; RMU',
        'Messe | Fair; 51.5; 7.4',
      ].join('\n'),
    );
    expect(rmu).toMatchObject({
      name: 'Rhein-Main-Universitäten',
      nameEn: 'Rhine-Main Universities',
      label: 'RMU',
    });
    expect(point).toMatchObject({ name: 'Messe', nameEn: 'Fair', lat: 51.5, lon: 7.4 });
  });

  it('name pool cities in English: towns by the data, "A/B" from its members', () => {
    const slash = compositePlace('Bonn/Köln', [member(bonn), member(koeln)]);
    const own = compositePlace('Rheinland', [member(bonn), member(koeln)], undefined, 'Rhineland');
    const plain = compositePlace('Rheinschiene', [member(bonn), member(koeln)]);
    const [a, b, c, d] = listCities(
      [slash, own, plain, { ...member(koeln), label: 'Köln ×2' }],
      towns,
    );
    expect(a!.nameEn).toBe('Bonn/Cologne');
    expect(a!.members![1]!.nameEn).toBe('Cologne');
    expect(b!.nameEn).toBe('Rhineland');
    expect(c!.nameEn).toBe('Rheinschiene');
    expect(d!.nameEn).toBe('Cologne');
    expect(d!.label).toBe('Köln ×2');
  });

  it('keep English names in links', () => {
    const own = compositePlace('Rheinland', [member(bonn), member(koeln)], 'RL', 'Rhineland');
    const point = { name: 'Messe', nameEn: 'Fair', lat: 51.5, lon: 7.4 };
    const decoded = decodePlaceList(encodePlaceList('fixed', [own, point]))!;
    expect(decoded.places[0]).toMatchObject({
      name: 'Rheinland',
      nameEn: 'Rhineland',
      label: 'RL',
    });
    expect(decoded.places[1]).toEqual(point);
  });
});

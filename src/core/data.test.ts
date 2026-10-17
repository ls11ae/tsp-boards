import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  boardLabel,
  citiesFromColumns,
  citiesToColumns,
  listName,
  parseCountryFile,
  placeName,
  prominence,
  type City,
  type Manifest,
  type StateInfo,
} from './data';

const DATA = path.resolve(import.meta.dirname, '../../public/data');

describe('city columns', () => {
  it('round-trips cities, storing labels and English names sparsely', () => {
    const states: StateInfo[] = [
      { id: 'DE-BY', name: 'Bayern', nameEn: 'Bavaria' },
      { id: 'DE-NW', name: 'Nordrhein-Westfalen', nameEn: 'North Rhine-Westphalia' },
    ];
    const cities: City[] = [
      {
        id: 1,
        name: 'München',
        label: 'München',
        nameEn: 'Munich',
        lat: 48.1,
        lon: 11.6,
        pop: 1_500_000,
        state: 'DE-BY',
        wikidata: null,
        flags: 0,
      },
      {
        id: 2,
        name: 'Mülheim an der Ruhr',
        label: 'Mülheim',
        nameEn: 'Mülheim an der Ruhr',
        lat: 51.4,
        lon: 6.9,
        pop: 170_000,
        state: 'DE-NW',
        wikidata: 'Q3042',
        flags: 0,
      },
    ];
    const columns = citiesToColumns(cities, states);
    expect(columns.label).toEqual({ '1': 'Mülheim' });
    expect(columns.nameEn).toEqual({ '0': 'Munich' });
    expect(columns.state).toEqual([0, 1]);
    expect(citiesFromColumns(columns, states)).toEqual(cities);
    expect(columns.fame).toBeUndefined();
  });

  it('stores the fame column of the world and ranks by it (roadmap 9.6)', () => {
    const states: StateInfo[] = [{ id: 'WO-EU', name: 'Europa', nameEn: 'Europe' }];
    const town = (id: number, name: string, pop: number, fame: number): City => ({
      id,
      name,
      label: name,
      nameEn: name,
      lat: 0,
      lon: 0,
      pop,
      state: 'WO-EU',
      wikidata: null,
      flags: 0,
      fame,
    });
    const cities = [town(1, 'Paris', 2_100_000, 366), town(2, 'Kleinstadt', 3_000_000, 1)];
    const back = citiesFromColumns(citiesToColumns(cities, states), states);
    expect(back).toEqual(cities);
    expect(prominence(back[0]!)).toBeGreaterThan(prominence(back[1]!));
    // Without fame: the population.
    expect(prominence({ ...back[1]!, fame: undefined })).toBe(3_000_000);
  });
});

describe('committed data files', () => {
  const manifest = JSON.parse(readFileSync(path.join(DATA, 'manifest.json'), 'utf8')) as Manifest;

  it.each(manifest.countries.map((c) => [c.country, c] as const))(
    '%s matches the manifest',
    (_, entry) => {
      const file = parseCountryFile(JSON.parse(readFileSync(path.join(DATA, entry.file), 'utf8')));
      expect(file.country).toBe(entry.country);
      expect(file.dataVersion).toBe(entry.dataVersion);
      const cities = citiesFromColumns(file.cities, file.states);
      expect(cities).toHaveLength(entry.cityCount);
      expect(new Set(cities.map((c) => c.id)).size).toBe(cities.length);
      for (const c of cities) {
        expect(c.pop).toBeGreaterThanOrEqual(file.minPopulation);
        expect(c.lat).toBeGreaterThanOrEqual(entry.bbox[1] - 0.1);
        expect(c.lat).toBeLessThanOrEqual(entry.bbox[3] + 0.1);
      }
      expect(Object.keys(file.regions.objects).sort()).toEqual(['country', 'neighbors', 'states']);
      expect(file.attribution.en).toContain('GeoNames');
      // The world ranks its towns by Wikipedia editions (fame), the others by population.
      expect(file.cities.fame !== undefined).toBe(file.country === 'WO');
    },
  );
});

describe('board labels', () => {
  const munich = {
    id: 2867714,
    name: 'München',
    label: 'München',
    nameEn: 'Munich',
    lat: 48.14,
    lon: 11.58,
    pop: 1_500_000,
    state: 'DE-BY',
  } as City;
  it('uses English exonyms and keeps an addition of the label to the name (9.13)', () => {
    expect(boardLabel(munich, 'de')).toBe('München');
    expect(boardLabel(munich, 'en')).toBe('Munich');
    const twice = { ...munich, label: 'München ×2' };
    expect(boardLabel(twice, 'de')).toBe('München ×2');
    expect(boardLabel(twice, 'en')).toBe('Munich ×2');
    // A label that is no addition gives way to the exonym.
    expect(boardLabel({ ...munich, label: 'TUM' }, 'en')).toBe('Munich');
  });

  it('names places and the members of composites in a language (9.16)', () => {
    expect(placeName(munich, 'en')).toBe('Munich');
    expect(placeName(munich, 'de')).toBe('München');
    const pair = {
      ...munich,
      name: 'Bonn/Köln',
      nameEn: 'Bonn/Cologne',
      members: [
        { name: 'Bonn', lat: 50.7, lon: 7.1 },
        { name: 'Köln', nameEn: 'Cologne', lat: 50.9, lon: 6.9 },
      ],
    };
    expect(listName(pair, 'en')).toBe('Bonn/Cologne (Bonn, Cologne)');
    expect(listName(pair, 'de')).toBe('Bonn/Köln (Bonn, Köln)');
  });
});

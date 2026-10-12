import { describe, expect, it } from 'vitest';
import { CityFlag } from '../../src/core/data';
import {
  buildCities,
  cleanMunicipalityName,
  isAbbreviated,
  isExonym,
  parseAlternateNames,
  parseGeoNames,
  SCHEMES,
  type AltName,
  type GeoNameRow,
} from './geonames';

let nextId = 1;
function row(
  name: string,
  featureCode: string,
  admin4: string,
  population: number,
  lat = 50,
  lon = 10,
): GeoNameRow {
  return {
    id: nextId++,
    name,
    lat,
    lon,
    featureClass: featureCode === 'ADM4' ? 'A' : 'P',
    featureCode,
    admin1: '07',
    admin2: '',
    admin3: '',
    admin4,
    population,
  };
}

function alt(lang: string, name: string, flags: Partial<AltName> = {}): AltName {
  return {
    lang,
    name,
    preferred: false,
    short: false,
    colloquial: false,
    historic: false,
    ...flags,
  };
}

const options = { minPopulation: 1000, nearLargerKm: 3, nearLargerFactor: 5 };

describe('buildCities', () => {
  it('keeps one city per municipality, named after the municipality', () => {
    const adm4 = row('Dortmund', 'ADM4', '05913000', 600_000);
    const city = row('Dortmund', 'PPLA3', '05913000', 588_462, 51.51, 7.47);
    const district = row('Brackel', 'PPL', '05913000', 24_930);
    const section = row('Hörde', 'PPLX', '05913000', 30_000);
    const cities = buildCities([adm4, city, district, section], new Map(), options);
    expect(cities).toHaveLength(1);
    expect(cities[0]).toMatchObject({ id: city.id, name: 'Dortmund', pop: 600_000, lat: 51.51 });
  });

  it('prefers the place named like the municipality over a wrongly coded seat', () => {
    const adm4 = row('Clausthal-Zellerfeld', 'ADM4', '03153018', 13_912);
    const seat = row('Schulenberg im Oberharz', 'PPLA4', '03153018', 0);
    const town = row('Clausthal-Zellerfeld', 'PPL', '03153018', 15_345);
    const alts = new Map([[seat.id, [alt('de', 'Schulenberg im Oberharz', { preferred: true })]]]);
    const [city] = buildCities([adm4, seat, town], alts, options);
    expect(city).toMatchObject({ id: town.id, name: 'Clausthal-Zellerfeld' });
  });

  it('uses the official municipality name instead of a long place name', () => {
    const adm4 = row('Greifswald', 'ADM4', '13075039', 56_092);
    const place = row('Universitäts- und Hansestadt Greifswald', 'PPLA3', '13075039', 52_731);
    const [city] = buildCities([adm4, place], new Map(), options);
    expect(city).toMatchObject({ id: place.id, name: 'Greifswald', label: 'Greifswald' });
  });

  it('drops municipalities below the population threshold, keeps places without admin4', () => {
    const small = row('Kleindorf', 'ADM4', '01000001', 999);
    const smallPlace = row('Kleindorf', 'PPL', '01000001', 999);
    const loose = row('Einzelort', 'PPL', '', 2_000);
    const cities = buildCities([small, smallPlace, loose], new Map(), options);
    expect(cities.map((c) => c.name)).toEqual(['Einzelort']);
  });

  it('falls back to the municipality point when no populated place is kept', () => {
    const adm4 = row('Waldsolms', 'ADM4', '06532023', 4_660);
    const section = row('Brandoberndorf', 'PPLX', '06532023', 1_500);
    const [city] = buildCities([adm4, section], new Map(), options);
    expect(city).toMatchObject({ id: adm4.id, flags: CityFlag.MunicipalityPoint });
  });

  it('uses unambiguous German short labels and genuine English exonyms only', () => {
    const halleAdm4 = row('Halle (Saale)', 'ADM4', '15002000', 226_767);
    const halle = row('Halle (Saale)', 'PPL', '15002000', 237_865);
    const munichAdm4 = row('München, Landeshauptstadt', 'ADM4', '09162000', 1_505_005);
    const munich = row('Munich', 'PPLA', '09162000', 1_505_005);
    const meissenAdm4 = row('Meißen', 'ADM4', '14627170', 28_000);
    const alts = new Map([
      [halle.id, [alt('de', 'Halle', { short: true }), alt('en', 'Halle', { preferred: true })]],
      [munichAdm4.id, [alt('en', 'Munich', { preferred: true })]],
      [meissenAdm4.id, [alt('en', 'Meissen', { preferred: true })]],
    ]);
    const cities = buildCities([halleAdm4, halle, munichAdm4, munich, meissenAdm4], alts, options);
    const byName = new Map(cities.map((c) => [c.name, c]));
    expect(byName.get('Halle (Saale)')).toMatchObject({ label: 'Halle', nameEn: 'Halle (Saale)' });
    expect(byName.get('München')).toMatchObject({ id: munich.id, nameEn: 'Munich' });
    expect(byName.get('Meißen')?.nameEn).toBe('Meißen');
  });

  it('falls back to the full name for ambiguous labels and flags duplicate names', () => {
    const a = row('Bergen auf Rügen', 'PPL', '13073010', 13_457);
    const b = row('Bergen', 'PPL', '03351002', 12_991);
    const c = row('Münster', 'PPL', '05515000', 308_258);
    const d = row('Münster', 'PPL', '06432016', 14_813);
    const alts = new Map([[a.id, [alt('de', 'Bergen', { short: true })]]]);
    const cities = buildCities([a, b, c, d], alts, options);
    const rugen = cities.find((x) => x.id === a.id)!;
    expect(rugen.label).toBe('Bergen auf Rügen');
    expect(rugen.flags & CityFlag.AmbiguousLabel).toBeTruthy();
    expect(cities.filter((x) => x.flags & CityFlag.DuplicateName).map((x) => x.id)).toEqual([
      c.id,
      d.id,
    ]);
  });

  it('flags small cities right next to a much larger one', () => {
    const big = row('Großstadt', 'PPL', '01000010', 100_000, 50, 10);
    const near = row('Nachbarort', 'PPL', '01000011', 5_000, 50.01, 10);
    const far = row('Fernort', 'PPL', '01000012', 5_000, 50.5, 10);
    const cities = buildCities([big, near, far], new Map(), options);
    const flags = new Map(cities.map((c) => [c.name, c.flags & CityFlag.NearLarger]));
    expect(flags).toEqual(
      new Map([
        ['Großstadt', 0],
        ['Nachbarort', CityFlag.NearLarger],
        ['Fernort', 0],
      ]),
    );
  });
});

describe('cleanMunicipalityName', () => {
  it.each([
    ['Gelnhausen, Barbarossastadt', [], 'Gelnhausen'],
    ['Henstedt-Ulzburg Municipality', [], 'Henstedt-Ulzburg'],
    ['Stadt Buttstädt', [], 'Buttstädt'],
    ['Stadt Wehlen', [], 'Stadt Wehlen'],
    ['Bautzen/Budyšin', [], 'Bautzen'],
    ['Dillingen/ Saar', [], 'Dillingen/Saar'],
    ['Kahl a.Main', ['Kahl am Main'], 'Kahl am Main'],
    ['Kirchheim b.München', [], 'Kirchheim bei München'],
    ['Altenstadt a.d.Waldnaab', [], 'Altenstadt an der Waldnaab'],
    ['Burgberg i.Allgäu', [], 'Burgberg im Allgäu'],
    ['St. Georgen im Schwarzwald', [], 'St. Georgen im Schwarzwald'],
  ])('%s -> %s', (name, expansions, expected) => {
    expect(cleanMunicipalityName(name, expansions)).toBe(expected);
  });

  it('detects abbreviations', () => {
    expect(isAbbreviated('Pausa/Vogtl.')).toBe(true);
    expect(isAbbreviated('Rothenburg/O.L.')).toBe(true);
    expect(isAbbreviated('Neustadt a. d. Aisch')).toBe(true);
    expect(isAbbreviated('St. Ingbert')).toBe(false);
    expect(isAbbreviated('Frankfurt (Oder)')).toBe(false);
  });

  it('recognises exonyms', () => {
    expect(isExonym('Munich', 'München')).toBe(true);
    expect(isExonym('Meissen', 'Meißen')).toBe(false);
    expect(isExonym('Saint Blasien', 'St. Blasien')).toBe(false);
    expect(isExonym('Heidenheim', 'Heidenheim an der Brenz')).toBe(false);
    expect(isExonym('Burgdorf, Hanover', 'Burgdorf')).toBe(false);
  });
});

describe('parsing', () => {
  it('parses GeoNames rows and keeps populated places and ADM2 to ADM4 only', () => {
    const line = (id: number, name: string, cls: string, code: string, pop: number) =>
      [
        id,
        name,
        name,
        '',
        '51.5',
        '7.4',
        cls,
        code,
        'DE',
        '',
        '07',
        '059',
        '05913',
        '05913000',
        pop,
        '',
        '90',
        'Europe/Berlin',
        '2024-01-01',
      ].join('\t');
    const rows = parseGeoNames(
      [
        line(1, 'Dortmund', 'P', 'PPLA3', 588462),
        line(2, 'Dortmund', 'A', 'ADM4', 600000),
        line(3, 'Westfalenpark', 'L', 'PRK', 0),
      ].join('\n'),
    );
    expect(rows.map((r) => [r.id, r.featureCode, r.admin4, r.population])).toEqual([
      [1, 'PPLA3', '05913000', 588462],
      [2, 'ADM4', '05913000', 600000],
    ]);
  });

  it('parses alternate names with flags', () => {
    const text = [
      '10\t1\tde\tMünchen\t1\t\t\t\t\t',
      '11\t1\ten\tMunich\t1\t1\t\t\t\t',
      '12\t2\tde\tAndere\t\t\t\t\t\t',
    ].join('\n');
    const alts = parseAlternateNames(text, new Set([1]));
    expect(alts.get(1)).toEqual([
      alt('de', 'München', { preferred: true }),
      alt('en', 'Munich', { preferred: true, short: true }),
    ]);
    expect(alts.has(2)).toBe(false);
  });
});

describe('municipality schemes', () => {
  const place = (
    name: string,
    featureCode: string,
    admin: Partial<Pick<GeoNameRow, 'admin1' | 'admin2' | 'admin3' | 'admin4'>>,
    population: number,
  ): GeoNameRow => ({
    ...row(name, featureCode, '', population),
    featureClass: featureCode.startsWith('ADM') ? 'A' : 'P',
    admin1: '01',
    ...admin,
  });

  it('Austria: Vienna is one municipality, its districts are not', () => {
    const rows = [
      place('Wien Stadt', 'ADM2', { admin1: '09', admin2: '900' }, 2_000_000),
      place(
        'Gemeindebezirk Favoriten',
        'ADM3',
        { admin1: '09', admin2: '900', admin3: '910' },
        200_000,
      ),
      place('Vienna', 'PPLC', { admin1: '09', admin2: '900' }, 1_700_000),
      place('Favoriten', 'PPL', { admin1: '09', admin2: '900', admin3: '910' }, 200_000),
      place(
        'Gemeinde Ramsau am Dachstein',
        'ADM3',
        { admin1: '06', admin2: '612', admin3: '61262' },
        2_800,
      ),
      place('Ramsau am Dachstein', 'PPL', { admin1: '06', admin2: '612', admin3: '61262' }, 2_700),
    ];
    const cities = buildCities(rows, new Map(), options, SCHEMES.AT);
    expect(cities.map((c) => [c.name, c.pop])).toEqual([
      ['Wien', 2_000_000],
      ['Ramsau am Dachstein', 2_800],
    ]);
  });

  it('Switzerland and the Netherlands: municipality names without designations', () => {
    const ch = buildCities(
      [
        place('Bern/Berne/Berna', 'ADM3', { admin1: 'BE', admin3: '351' }, 134_000),
        place('Bern', 'PPLC', { admin1: 'BE', admin3: '351' }, 121_000),
      ],
      new Map(),
      options,
      SCHEMES.CH,
    );
    expect(ch.map((c) => c.name)).toEqual(['Bern']);
    const nl = buildCities(
      [
        place('Gemeente Den Haag', 'ADM2', { admin1: '11', admin2: '0518' }, 530_000),
        place('The Hague', 'PPLG', { admin1: '11', admin2: '0518' }, 470_000),
        place('Scheveningen', 'PPL', { admin1: '11', admin2: '0518' }, 50_000),
      ],
      new Map(),
      options,
      SCHEMES.NL,
    );
    expect(nl.map((c) => [c.name, c.pop])).toEqual([['Den Haag', 530_000]]);
  });
});

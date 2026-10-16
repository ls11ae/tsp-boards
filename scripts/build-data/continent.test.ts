import { describe, expect, it } from 'vitest';
import { CONTINENTS } from './continent-sources';
import {
  cityRadiusKm,
  continentRows,
  mergeDistricts,
  parseCityTable,
  type CityRow,
} from './continent';

const row = (
  id: number,
  lat: number,
  lon: number,
  population: number,
  extra: Partial<CityRow> = {},
) => ({
  id,
  name: `T${id}`,
  alternates: [],
  lat,
  lon,
  featureCode: 'PPL',
  country: 'DE',
  population,
  ...extra,
});

describe('continent towns', () => {
  it('grow the radius in which a city absorbs its districts with its size', () => {
    expect(cityRadiusKm(50_000, 5)).toBe(5);
    expect(cityRadiusKm(3_400_000, 5)).toBeCloseTo(17.5, 1);
    expect(cityRadiusKm(15_700_000, 5)).toBeCloseTo(37.6, 1);
  });

  it('drop districts near a larger city, keep separate towns', () => {
    const big = row(1, 52.52, 13.4, 3_400_000);
    const district = row(2, 52.6, 13.45, 300_000); // ~9 km
    const potsdam = row(3, 52.4, 13.06, 180_000); // ~27 km
    expect(mergeDistricts([district, potsdam, big], 5).map((r) => r.id)).toEqual([1, 3]);
  });

  it('merge districts within a country only; the capital stands for its cluster', () => {
    const kinshasa = row(1, -4.33, 15.31, 16_000_000, { country: 'CD', featureCode: 'PPLC' });
    const brazzaville = row(2, -4.27, 15.28, 1_300_000, { country: 'CG', featureCode: 'PPLC' });
    const delhi = row(3, 28.65, 77.23, 11_000_000, { country: 'IN' });
    const newDelhi = row(4, 28.61, 77.21, 320_000, { country: 'IN', featureCode: 'PPLC' });
    const merged = mergeDistricts([kinshasa, brazzaville, delhi, newDelhi], 10);
    expect(merged.map((r) => [r.id, r.population])).toEqual([
      [1, 16_000_000],
      [4, 11_000_000],
      [2, 1_300_000],
    ]);
  });

  it('keep a big administrative seat beside a larger city, but not right next to it', () => {
    const tokyo = row(1, 35.69, 139.69, 9_700_000, { country: 'JP', featureCode: 'PPLC' });
    const yokohama = row(2, 35.44, 139.64, 3_700_000, { country: 'JP', featureCode: 'PPLA' });
    const ward = row(3, 35.6, 139.7, 900_000, { country: 'JP' });
    const giza = row(4, 30.01, 31.21, 4_000_000, { country: 'EG', featureCode: 'PPLA' });
    const cairo = row(5, 30.06, 31.25, 9_600_000, { country: 'EG', featureCode: 'PPLC' });
    const ids = mergeDistricts([tokyo, yokohama, ward, giza, cairo], 10).map((r) => r.id);
    expect(ids).toEqual([1, 5, 2]);
  });

  it('prefer the town known under more names in a cluster', () => {
    const guadalajara = row(1, 20.67, -103.39, 1_400_000, { alternates: ['a', 'b', 'c', 'd'] });
    const zapopan = row(2, 20.72, -103.39, 1_500_000);
    expect(mergeDistricts([zapopan, guadalajara], 10).map((r) => r.id)).toEqual([1]);
  });

  it('keep towns of the continent: countries, extent, population, feature codes', () => {
    const eu = CONTINENTS.EU!;
    const rows = [
      row(1, 48.1, 11.6, 1_500_000),
      row(2, 28.1, -15.4, 380_000, { country: 'ES' }), // Canaries: outside the extent
      row(3, 51.5, 7.5, 40_000), // too small
      row(4, 52.5, 13.4, 200_000, { featureCode: 'PPLX' }), // a section
      row(5, 40.0, -3.7, 3_000_000, { country: 'US' }), // not in Europe
    ];
    expect(continentRows(rows, eu).map((r) => r.id)).toEqual([1]);
  });

  it('parse the GeoNames town table', () => {
    const line = [
      '2950159',
      'Berlin',
      'Berlin',
      'Berlino,Berlin',
      '52.52437',
      '13.41053',
      'P',
      'PPLC',
      'DE',
      '',
      '16',
      '00',
      '11000',
      '11000000',
      '3426354',
      '',
      '74',
      'Europe/Berlin',
      '2022-03-09',
    ].join('\t');
    expect(parseCityTable(line)).toEqual([
      {
        id: 2950159,
        name: 'Berlin',
        alternates: ['Berlino', 'Berlin'],
        lat: 52.52437,
        lon: 13.41053,
        featureCode: 'PPLC',
        country: 'DE',
        population: 3426354,
      },
    ]);
  });
});

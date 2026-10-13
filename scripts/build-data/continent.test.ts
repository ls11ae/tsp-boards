import { describe, expect, it } from 'vitest';
import { CONTINENTS } from './continent-sources';
import {
  cityRadiusKm,
  continentRows,
  dropNearLarger,
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
    expect(dropNearLarger([district, potsdam, big], 5).map((r) => r.id)).toEqual([1, 3]);
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

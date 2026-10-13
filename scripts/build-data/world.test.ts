import { describe, expect, it } from 'vitest';
import { WORLD, parseCountryInfo, worldRows } from './world';

describe('world data', () => {
  it('reads the continent of each country from GeoNames’ country table', () => {
    const text = [
      '# ISO\tISO3\tISO-Numeric\tfips\tCountry\tCapital\tArea\tPopulation\tContinent',
      'DE\tDEU\t276\tGM\tGermany\tBerlin\t357021\t82927922\tEU\t.de',
      'TR\tTUR\t792\tTU\tTurkey\tAnkara\t780580\t82319724\tAS\t.tr',
      '',
    ].join('\n');
    expect([...parseCountryInfo(text)]).toEqual([
      ['DE', 'EU'],
      ['TR', 'AS'],
    ]);
  });

  it('keep towns from the population threshold on, without city sections', () => {
    const row = (id: number, population: number, featureCode = 'PPL') => ({
      id,
      name: `T${id}`,
      alternates: [],
      lat: 0,
      lon: 0,
      featureCode,
      country: 'DE',
      population,
    });
    const rows = [
      row(1, WORLD.minPopulation),
      row(2, WORLD.minPopulation - 1),
      row(3, 5_000_000, 'PPLX'),
      row(4, 5_000_000, 'PPLC'),
    ];
    expect(worldRows(rows).map((r) => r.id)).toEqual([1, 4]);
  });
});

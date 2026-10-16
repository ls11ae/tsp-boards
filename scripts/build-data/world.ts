// The world (roadmap 8.2): towns with at least 250,000 inhabitants from GeoNames' global list
// (cities15000), city districts merged (mergeDistricts), one region per continent (Natural
// Earth admin-1 dissolved per continent; Russia east of the Urals counts as Asia), German and
// English names from GeoNames' alternate names. The file is marked as metric 'sphere': the app
// measures great-circle distances, and world puzzles are digital.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { geoContains } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';
import type { City, CountryFile, LocalizedText, StateInfo } from '../../src/core/data';
import {
  mergeDistricts,
  namedCities,
  readAdmin1,
  readAlternates,
  readCityTable,
  writeAreaFile,
  type CityRow,
} from './continent';
import { KEPT_CODES } from './continent-sources';
import { WIKIDATA_SITELINKS, articleUrl, readSitelinks, type TownLinks } from './fame';
import { buildWorldRegions, type NeProperties } from './natural-earth';
import { GEONAMES_COUNTRY_INFO, RAW_DIR, geonamesSources, type RawSource } from './sources';

export const WORLD = {
  code: 'WO',
  name: { en: 'World', de: 'Welt' } satisfies LocalizedText,
  minPopulation: 250_000,
  mergeKm: 10,
  /** Coarse coastlines: a world map of 1 m width shows 40 km per millimetre. */
  simplifyMetres: 25_000,
  /** Russian federal districts (Natural Earth admin-1 `region`) east of the Urals: Asia. */
  asianRussia: ['Urals', 'Siberian', 'Far Eastern'],
  /** Turkey's European part (East Thrace and Istanbul, as in the Europe file): Europe. */
  europeanTurkey: ['TR-22', 'TR-39', 'TR-59', 'TR-34'],
} as const;

/** GeoNames continent codes -> region names (Antarctica is map context only). */
export const CONTINENT_NAMES: Readonly<Record<string, { name: string; nameEn: string }>> = {
  AF: { name: 'Afrika', nameEn: 'Africa' },
  AS: { name: 'Asien', nameEn: 'Asia' },
  EU: { name: 'Europa', nameEn: 'Europe' },
  NA: { name: 'Nordamerika', nameEn: 'North America' },
  OC: { name: 'Ozeanien', nameEn: 'Oceania' },
  SA: { name: 'Südamerika', nameEn: 'South America' },
};

/**
 * Natural Earth units without an ISO code (iso_a2 '-1'): the country they belong to, as far as
 * the continent goes.
 */
const ISO_OF_ADM0: Readonly<Record<string, string>> = {
  CYN: 'CY', // Northern Cyprus
  ESB: 'CY', // Dhekelia
  WSB: 'CY', // Akrotiri
  KAB: 'KZ', // Baikonur
  KAS: 'IN', // Siachen Glacier
  SOL: 'SO', // Somaliland
  USG: 'CU', // Guantánamo
  IOA: 'CX', // Indian Ocean Territories
  CSI: 'AU', // Coral Sea Islands
  PGA: 'PH', // Spratly Islands
  CLP: 'MX', // Clipperton (North America)
};

/** ISO 3166-1 alpha-2 -> GeoNames continent code, from countryInfo.txt. */
export function parseCountryInfo(text: string): Map<string, string> {
  const continents = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    if (c[0] && c[8]) continents.set(c[0], c[8]);
  }
  return continents;
}

/** Towns of the world: population and kept feature codes (before merging). */
export function worldRows(rows: readonly CityRow[]): CityRow[] {
  return rows.filter((r) => KEPT_CODES.has(r.featureCode) && r.population >= WORLD.minPopulation);
}

/** The world's towns before merging with their Wikidata items and Wikipedia articles. */
export async function worldTownLinks(): Promise<TownLinks[]> {
  const rows = worldRows(await readCityTable());
  const { cities } = await namedCities(WORLD.code, rows, () => '');
  const alts = await readAlternates(rows);
  return cities.map((c) => ({
    id: c.id,
    wikidata: c.wikidata,
    articles: (alts.get(c.id) ?? [])
      .filter((a) => a.lang === 'link')
      .map((a) => articleUrl(a.name))
      .filter((a): a is string => a !== null),
  }));
}

/** Alternate-name files needed: the countries with towns in the world file. */
export async function worldNameSources(): Promise<RawSource[]> {
  const countries = new Set(worldRows(await readCityTable()).map((r) => r.country));
  return [...countries].sort().map((cc) => geonamesSources(cc).alternateNames);
}

export async function buildWorld(
  dataDir: string,
  serialize: (file: CountryFile) => string,
): Promise<void> {
  const prefix = WORLD.code;
  const continents = parseCountryInfo(
    await readFile(path.join(RAW_DIR, GEONAMES_COUNTRY_INFO.file), 'utf8'),
  );
  const admin1 = await readAdmin1();
  const asianRussia = admin1.features.filter(
    (f) =>
      f.properties.adm0_a3 === 'RUS' &&
      (WORLD.asianRussia as readonly string[]).includes(
        (f.properties as NeProperties & { region?: string }).region ?? '',
      ),
  );
  const europeanTurkey = admin1.features.filter(
    (f) =>
      f.properties.adm0_a3 === 'TUR' &&
      (WORLD.europeanTurkey as readonly string[]).includes(f.properties.iso_3166_2),
  );
  const continentOfFeature = (f: Feature<Geometry, NeProperties>): string | null => {
    if (asianRussia.includes(f)) return 'AS';
    if (europeanTurkey.includes(f)) return 'EU';
    const iso = ISO_OF_ADM0[f.properties.adm0_a3] ?? (f.properties as { iso_a2?: string }).iso_a2;
    return (iso && continents.get(iso)) ?? null;
  };
  const inside = (parts: readonly Feature[], r: CityRow) =>
    parts.some((f) => geoContains(f, [r.lon, r.lat]));
  const continentOfRow = (r: CityRow): string | null =>
    r.country === 'RU' && inside(asianRussia, r)
      ? 'AS'
      : r.country === 'TR' && inside(europeanTurkey, r)
        ? 'EU'
        : (continents.get(r.country) ?? null);

  const rows = mergeDistricts(worldRows(await readCityTable()), WORLD.mergeKm).filter(
    (r) => CONTINENT_NAMES[continentOfRow(r) ?? ''] !== undefined,
  );
  const named = await namedCities(prefix, rows, (r) => `${prefix}-${continentOfRow(r)!}`);
  const { unnamed } = named;
  // Fame: Wikipedia editions by GeoNames id (and the QID where GeoNames has none).
  const sitelinks = await readSitelinks();
  const cities = named.cities.map((c): City => {
    const s = sitelinks.get(c.id);
    return { ...c, wikidata: c.wikidata ?? s?.[0] ?? null, fame: Math.max(1, s?.[1] ?? 1) };
  });

  console.log('build regions');
  const regions = await buildWorldRegions(admin1, {
    stateOf: (f) => {
      const c = continentOfFeature(f);
      return c && CONTINENT_NAMES[c] ? `${prefix}-${c}` : null;
    },
    simplifyMetres: WORLD.simplifyMetres,
  });
  const states: StateInfo[] = Object.entries(CONTINENT_NAMES)
    .map(([code, names]) => ({ id: `${prefix}-${code}`, ...names }))
    .filter((s) => regions.stateIds.includes(s.id));
  const known = new Set(states.map((s) => s.id));
  const placed = cities.filter((c) => known.has(c.state));
  const bytes = await writeAreaFile(
    {
      code: prefix,
      name: WORLD.name,
      minPopulation: WORLD.minPopulation,
      states,
      cities: placed,
      topology: regions.topology,
      bbox: regions.bbox,
      countries: [...new Set(rows.map((r) => r.country))],
      extraGeoNames: [GEONAMES_COUNTRY_INFO.key],
      wikidata: [WIKIDATA_SITELINKS.key],
      metric: 'sphere',
    },
    dataDir,
    serialize,
  );
  const perContinent = states
    .map((s) => `${s.nameEn} ${placed.filter((c) => c.state === s.id).length}`)
    .join(', ');
  console.log(
    `${placed.length} towns (${perContinent}; ${unnamed} without a German name, ${placed.filter((c) => !sitelinks.has(c.id)).length} without Wikipedia editions), ${Math.round(bytes / 1024)} KB`,
  );
}

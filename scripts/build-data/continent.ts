// Continent data files (roadmap 8.1): towns from GeoNames' global list (cities15000) in the
// countries of a continent, one region per country (Natural Earth admin-1 dissolved per country,
// cut to the continent's extent), German and English names from GeoNames' alternate names of
// the countries. The result has the
// format of a country file whose "states" are countries ('EU-DE'), so the app, the search and
// the board export work unchanged.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import {
  DATA_FORMAT,
  citiesToColumns,
  type City,
  type CountryFile,
  type DataSource,
  type Manifest,
  type ManifestEntry,
  type LocalizedText,
  type StateInfo,
} from '../../src/core/data';
import { geodesicKm } from '../../src/core/projection';
import { geoContains } from 'd3-geo';
import { KEPT_CODES, cleanEnglish, cleanGerman, type ContinentConfig } from './continent-sources';
import { parseAlternateNames, type AltName } from './geonames';
import { buildContinentRegions, type NeProperties } from './natural-earth';
import {
  GEONAMES_CITIES15000,
  NATURAL_EARTH_ADMIN1,
  RAW_DIR,
  geonamesSources,
  type DownloadsManifest,
} from './sources';

export interface CityRow {
  readonly id: number;
  readonly name: string;
  /** GeoNames' alternate names (all languages, not tagged). */
  readonly alternates: readonly string[];
  readonly lat: number;
  readonly lon: number;
  readonly featureCode: string;
  readonly country: string;
  readonly population: number;
}

/** Rows of GeoNames' cities15000 table (19 tab-separated columns). */
export function parseCityTable(text: string): CityRow[] {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const c = line.split('\t');
      return {
        id: Number(c[0]),
        name: c[1]!,
        alternates: (c[3] ?? '').split(',').filter(Boolean),
        lat: Number(c[4]),
        lon: Number(c[5]),
        featureCode: c[7]!,
        country: c[8]!,
        population: Number(c[14]) || 0,
      };
    });
}

/** Towns of the continent: countries, extent, population, kept feature codes. */
export function continentRows(rows: readonly CityRow[], config: ContinentConfig): CityRow[] {
  const countries = new Set(Object.values(config.countries));
  const [w, s, e, n] = config.bbox;
  return rows.filter(
    (r) =>
      countries.has(r.country) &&
      KEPT_CODES.has(r.featureCode) &&
      r.population >= config.minPopulation &&
      r.lon >= w &&
      r.lon <= e &&
      r.lat >= s &&
      r.lat <= n,
  );
}

/** Big administrative seats farther apart than this stay separate places, km. */
const SEPARATE_KM = 15;

/** Radius within which a city absorbs smaller towns (its districts), km. */
export function cityRadiusKm(population: number, minKm: number): number {
  return Math.max(minKm, 3 * Math.sqrt(population / 100_000));
}

/**
 * Which town of a cluster stands for it: the capital, else the larger town, where a town known
 * under many names counts as larger (Manila over Quezon City, Guadalajara over Zapopan, New
 * York City over Brooklyn, Birmingham over West Bromwich).
 */
function prominence(r: CityRow): number {
  return (r.featureCode === 'PPLC' ? 1e12 : 0) + r.population * (1 + r.alternates.length / 20);
}

/**
 * Merges the districts of a city that GeoNames codes as towns (the districts of Istanbul,
 * Moscow or Shanghai, the boroughs of New York, Yokohama with Tokyo): a town within the larger
 * of the two radii (cityRadiusKm) of a more prominent town of the same country joins that
 * town, which keeps the cluster's largest population (New Delhi stands for Delhi). A seat of
 * a first-order division with a million inhabitants more than 15 km away stays separate.
 */
export function mergeDistricts(rows: readonly CityRow[], minKm: number): CityRow[] {
  const kept: CityRow[] = [];
  for (const r of [...rows].sort((a, b) => prominence(b) - prominence(a) || a.id - b.id)) {
    const at = kept.findIndex((k) => {
      if (k.country !== r.country) return false;
      const km = geodesicKm([k.lon, k.lat], [r.lon, r.lat]);
      // The less prominent town is a city of its own if it is the seat of a first-order
      // division with a million inhabitants and not right next to the other (Yokohama and
      // Saitama stay beside Tokyo; the districts of Shanghai or Istanbul still merge).
      if (km > SEPARATE_KM && r.featureCode === 'PPLA' && r.population >= 1e6) return false;
      return km < Math.max(cityRadiusKm(k.population, minKm), cityRadiusKm(r.population, minKm));
    });
    if (at < 0) kept.push(r);
    else if (r.population > kept[at]!.population)
      kept[at] = { ...kept[at]!, population: r.population };
  }
  return kept.sort((a, b) => b.population - a.population || a.id - b.id);
}

export async function readCityTable(): Promise<CityRow[]> {
  const zip = unzipSync(await readFile(path.join(RAW_DIR, GEONAMES_CITIES15000.file)), {
    filter: (f) => f.name === 'cities15000.txt',
  });
  const data = zip['cities15000.txt'];
  if (!data) throw new Error('cities15000.zip: missing cities15000.txt');
  return parseCityTable(strFromU8(data));
}

/**
 * A usable name in a language: the preferred one, else the first that is neither historic nor
 * colloquial (e.g. 'de' -> "Neapel", 'en' -> "Naples").
 */
function altName(
  alts: ReadonlyMap<number, readonly AltName[]>,
  id: number,
  lang: string,
): string | null {
  const list = (alts.get(id) ?? []).filter((a) => a.lang === lang && !a.historic && !a.colloquial);
  return (list.find((a) => a.preferred) ?? list.find((a) => !a.short) ?? list[0])?.name ?? null;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Country names in German and English (ICU's region names). */
function countryName(iso2: string): { name: string; nameEn: string } {
  const de = new Intl.DisplayNames(['de'], { type: 'region' }).of(iso2) ?? iso2;
  const en = new Intl.DisplayNames(['en'], { type: 'region' }).of(iso2) ?? iso2;
  return { name: de, nameEn: en };
}

/**
 * Language-tagged alternate names of the towns, read from the countries' alternate-name files.
 * A missing file only costs the exonyms (the town keeps its GeoNames name).
 */
export async function readAlternates(
  rows: readonly CityRow[],
): Promise<Map<number, readonly AltName[]>> {
  const ids = new Set(rows.map((r) => r.id));
  const alts = new Map<number, readonly AltName[]>();
  for (const cc of [...new Set(rows.map((r) => r.country))].sort()) {
    const { alternateNames } = geonamesSources(cc);
    const file = path.join(RAW_DIR, alternateNames.file);
    if (!existsSync(file)) {
      console.warn(`missing ${alternateNames.file}: GeoNames names for ${cc}`);
      continue;
    }
    const zip = unzipSync(await readFile(file), { filter: (f) => f.name === `${cc}.txt` });
    const data = zip[`${cc}.txt`];
    if (!data) throw new Error(`${alternateNames.file}: missing ${cc}.txt`);
    for (const [id, list] of parseAlternateNames(strFromU8(data), ids)) alts.set(id, list);
  }
  return alts;
}

interface NameOverrides {
  /** Name, English name and Wikidata item (where GeoNames links none) per town. */
  readonly names: Readonly<Record<string, { name?: string; nameEn?: string; wikidata?: string }>>;
  /** Towns left out (e.g. a population error in GeoNames). */
  readonly exclude?: readonly number[];
}

async function readOverrides(code: string): Promise<NameOverrides> {
  const file = path.join(import.meta.dirname, 'overrides', `${code.toLowerCase()}.json`);
  return existsSync(file)
    ? (JSON.parse(await readFile(file, 'utf8')) as NameOverrides)
    : { names: {} };
}

/** Towns with German and English names (exonyms such as Moskau / Moscow). */
export async function namedCities(
  code: string,
  rows: readonly CityRow[],
  stateOf: (r: CityRow) => string,
): Promise<{ cities: City[]; unnamed: number }> {
  const overrides = await readOverrides(code);
  const excluded = new Set(overrides.exclude ?? []);
  const kept = rows.filter((r) => !excluded.has(r.id));
  const alts = await readAlternates(kept);
  let unnamed = 0;
  const cities = kept.map((r): City => {
    const de = altName(alts, r.id, 'de');
    const en = altName(alts, r.id, 'en');
    if (!de) unnamed++;
    const o = overrides.names[String(r.id)];
    const name = o?.name ?? (de ? cleanGerman(de) : r.name);
    return {
      id: r.id,
      name,
      label: name,
      nameEn: o?.nameEn ?? (en ? cleanEnglish(en) : r.name),
      lat: round4(r.lat),
      lon: round4(r.lon),
      pop: r.population,
      state: stateOf(r),
      wikidata: o?.wikidata ?? alts.get(r.id)?.find((a) => a.lang === 'wkdt')?.name ?? null,
      flags: 0,
    };
  });
  return { cities, unnamed };
}

/** A data file built from GeoNames' global town list (a continent or the world). */
export interface AreaContent {
  readonly code: string;
  readonly name: LocalizedText;
  readonly minPopulation: number;
  readonly states: readonly StateInfo[];
  readonly cities: readonly City[];
  readonly topology: Topology;
  readonly bbox: readonly [number, number, number, number];
  /** Countries whose alternate names were used. */
  readonly countries: readonly string[];
  /** Further GeoNames downloads used (e.g. the country table). */
  readonly extraGeoNames?: readonly string[];
  /** Wikidata downloads used (the world's sitelinks). */
  readonly wikidata?: readonly string[];
  readonly metric?: 'sphere';
}

/** Writes the data file (a new data version only when the content changed) and the manifest. */
export async function writeAreaFile(
  area: AreaContent,
  dataDir: string,
  serialize: (file: CountryFile) => string,
): Promise<number> {
  const downloads = JSON.parse(
    await readFile(path.join(RAW_DIR, 'downloads.json'), 'utf8'),
  ) as DownloadsManifest;
  const record = (key: string) => {
    const r = downloads[key];
    if (!r) throw new Error(`missing download ${key}`);
    return {
      url: r.url,
      lastModified: r.lastModified,
      downloadedAt: r.downloadedAt,
      sha256: r.sha256,
    };
  };
  const geoDate = (downloads[GEONAMES_CITIES15000.key]?.downloadedAt ?? '').slice(0, 10);
  const [y, m, d] = geoDate.split('-');
  const sources: DataSource[] = [
    {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      files: [
        record(GEONAMES_CITIES15000.key),
        ...(area.extraGeoNames ?? []).map(record),
        ...[...area.countries]
          .sort()
          .filter((cc) => downloads[geonamesSources(cc).alternateNames.key])
          .map((cc) => record(geonamesSources(cc).alternateNames.key)),
      ],
    },
    {
      name: 'Natural Earth',
      url: 'https://www.naturalearthdata.com/',
      license: 'Public domain',
      licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
      files: [record(NATURAL_EARTH_ADMIN1.key)],
    },
    ...(area.wikidata?.length
      ? [
          {
            name: 'Wikidata',
            url: 'https://www.wikidata.org/',
            license: 'CC0 1.0',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            files: area.wikidata.map(record),
          },
        ]
      : []),
  ];
  const prefix = area.code;
  const content = {
    format: DATA_FORMAT,
    country: prefix,
    name: area.name,
    minPopulation: area.minPopulation,
    states: area.states,
    cities: citiesToColumns(area.cities, area.states),
    regions: area.topology,
    ...(area.metric ? { metric: area.metric } : {}),
  };
  const contentHash =
    'sha256:' + createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const outPath = path.join(dataDir, 'countries', `${prefix.toLowerCase()}.json`);
  const previous = existsSync(outPath)
    ? (JSON.parse(await readFile(outPath, 'utf8')) as CountryFile)
    : null;
  let file: CountryFile;
  if (previous?.contentHash === contentHash) {
    console.log(`content unchanged (data version ${previous.dataVersion})`);
    file = previous;
  } else {
    file = {
      format: DATA_FORMAT,
      country: prefix,
      name: area.name,
      dataVersion: (previous?.dataVersion ?? 0) + 1,
      contentHash,
      generated: new Date().toISOString().slice(0, 10),
      sources,
      attribution: {
        en: `City data: GeoNames (geonames.org), CC BY 4.0, as of ${geoDate}. Boundaries: Natural Earth, public domain.${area.wikidata?.length ? ' Fame: Wikidata, CC0.' : ''}`,
        de: `Städtedaten: GeoNames (geonames.org), CC BY 4.0, Stand ${d}.${m}.${y}. Grenzen: Natural Earth, gemeinfrei.${area.wikidata?.length ? ' Bekanntheit: Wikidata, CC0.' : ''}`,
      },
      minPopulation: area.minPopulation,
      states: content.states,
      cities: content.cities,
      regions: content.regions,
      ...(area.metric ? { metric: area.metric } : {}),
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, serialize(file));
    console.log(`wrote ${outPath} (data version ${file.dataVersion})`);
  }
  const manifestPath = path.join(dataDir, 'manifest.json');
  const manifest: Manifest = existsSync(manifestPath)
    ? (JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest)
    : { format: DATA_FORMAT, countries: [] };
  const entry: ManifestEntry = {
    country: prefix,
    name: area.name,
    file: `countries/${prefix.toLowerCase()}.json`,
    dataVersion: file.dataVersion,
    cityCount: area.cities.length,
    bbox: area.bbox.map(round4) as unknown as ManifestEntry['bbox'],
  };
  const countries = [...manifest.countries.filter((c) => c.country !== prefix), entry].sort(
    (a, b) => a.country.localeCompare(b.country),
  );
  await writeFile(manifestPath, JSON.stringify({ format: DATA_FORMAT, countries }, null, 2) + '\n');
  return (await readFile(outPath)).length;
}

export async function readAdmin1(): Promise<FeatureCollection<Geometry, NeProperties>> {
  return JSON.parse(
    await readFile(path.join(RAW_DIR, NATURAL_EARTH_ADMIN1.file), 'utf8'),
  ) as FeatureCollection<Geometry, NeProperties>;
}

export async function buildContinent(
  config: ContinentConfig,
  dataDir: string,
  serialize: (file: CountryFile) => string,
): Promise<void> {
  const admin1 = await readAdmin1();
  // Countries reaching beyond the continent: towns inside their continental part only.
  const partial = new Map(
    Object.entries(config.partOnly ?? {}).map(([adm0, codes]) => [
      config.countries[adm0]!,
      admin1.features.filter(
        (f) => f.properties.adm0_a3 === adm0 && codes.includes(f.properties.iso_3166_2),
      ),
    ]),
  );
  const inside = (r: CityRow) => {
    const parts = partial.get(r.country);
    return !parts || parts.some((f) => geoContains(f, [r.lon, r.lat]));
  };
  const rows = mergeDistricts(
    continentRows(await readCityTable(), config).filter(inside),
    config.mergeKm,
  );
  const prefix = config.code;
  const { cities, unnamed } = await namedCities(prefix, rows, (r) => `${prefix}-${r.country}`);

  console.log('build regions');
  const regions = await buildContinentRegions(admin1, {
    ...(config.partOnly ? { partOnly: config.partOnly } : {}),
    countries: Object.fromEntries(
      Object.entries(config.countries).map(([adm0, iso2]) => [adm0, `${prefix}-${iso2}`]),
    ),
    bbox: config.bbox,
    contextMarginDeg: 3,
    simplifyMetres: config.simplifyMetres,
  });
  const states = regions.stateIds
    .map((id) => ({ id, ...countryName(id.slice(prefix.length + 1)) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const known = new Set(states.map((s) => s.id));
  const placed = cities.filter((c) => known.has(c.state));
  const bytes = await writeAreaFile(
    {
      code: prefix,
      name: config.name,
      minPopulation: config.minPopulation,
      states,
      cities: placed,
      topology: regions.topology,
      bbox: regions.bbox,
      countries: [...new Set(rows.map((r) => r.country))],
    },
    dataDir,
    serialize,
  );
  console.log(
    `${placed.length} towns in ${states.length} countries (${unnamed} without a German name), ${Math.round(bytes / 1024)} KB`,
  );
}

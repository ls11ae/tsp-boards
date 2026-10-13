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
import {
  DATA_FORMAT,
  citiesToColumns,
  type City,
  type CountryFile,
  type DataSource,
  type Manifest,
  type ManifestEntry,
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

/** Radius within which a city absorbs smaller towns (its districts), km. */
export function cityRadiusKm(population: number, minKm: number): number {
  return Math.max(minKm, 3 * Math.sqrt(population / 100_000));
}

/**
 * Drops towns within the radius of a larger kept town (city districts that GeoNames codes as
 * towns, e.g. the districts of Istanbul or Moscow); the largest town of a cluster stays.
 */
export function dropNearLarger(rows: readonly CityRow[], minKm: number): CityRow[] {
  const kept: CityRow[] = [];
  for (const r of [...rows].sort((a, b) => b.population - a.population || a.id - b.id)) {
    const near = kept.some(
      (k) => geodesicKm([k.lon, k.lat], [r.lon, r.lat]) < cityRadiusKm(k.population, minKm),
    );
    if (!near) kept.push(r);
  }
  return kept;
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

export async function buildContinent(
  config: ContinentConfig,
  dataDir: string,
  serialize: (file: CountryFile) => string,
): Promise<void> {
  const downloads = JSON.parse(
    await readFile(path.join(RAW_DIR, 'downloads.json'), 'utf8'),
  ) as DownloadsManifest;
  const overridesPath = path.join(
    import.meta.dirname,
    'overrides',
    `${config.code.toLowerCase()}.json`,
  );
  const overrides = existsSync(overridesPath)
    ? (JSON.parse(await readFile(overridesPath, 'utf8')) as {
        names: Record<string, { name?: string; nameEn?: string }>;
      })
    : { names: {} };
  const admin1 = JSON.parse(
    await readFile(path.join(RAW_DIR, NATURAL_EARTH_ADMIN1.file), 'utf8'),
  ) as FeatureCollection<Geometry, NeProperties>;
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
  const rows = dropNearLarger(
    continentRows(await readCityTable(), config).filter(inside),
    config.mergeKm,
  );
  const prefix = config.code;
  // Alternate names (language-tagged) of the kept towns, per country file.
  const ids = new Set(rows.map((r) => r.id));
  const alts = new Map<number, readonly AltName[]>();
  for (const cc of new Set(rows.map((r) => r.country))) {
    const { alternateNames } = geonamesSources(cc);
    const zip = unzipSync(await readFile(path.join(RAW_DIR, alternateNames.file)), {
      filter: (f) => f.name === `${cc}.txt`,
    });
    const data = zip[`${cc}.txt`];
    if (!data) throw new Error(`${alternateNames.file}: missing ${cc}.txt`);
    for (const [id, list] of parseAlternateNames(strFromU8(data), ids)) alts.set(id, list);
  }
  let unnamed = 0;
  const cities: City[] = rows.map((r) => {
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
      state: `${prefix}-${r.country}`,
      wikidata: alts.get(r.id)?.find((a) => a.lang === 'wkdt')?.name ?? null,
      flags: 0,
    };
  });

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
        ...[...new Set(rows.map((r) => r.country))]
          .sort()
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
  ];
  const content = {
    format: DATA_FORMAT,
    country: prefix,
    name: config.name,
    minPopulation: config.minPopulation,
    states,
    cities: citiesToColumns(placed, states),
    regions: regions.topology,
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
      name: config.name,
      dataVersion: (previous?.dataVersion ?? 0) + 1,
      contentHash,
      generated: new Date().toISOString().slice(0, 10),
      sources,
      attribution: {
        en: `City data: GeoNames (geonames.org), CC BY 4.0, as of ${geoDate}. Boundaries: Natural Earth, public domain.`,
        de: `Städtedaten: GeoNames (geonames.org), CC BY 4.0, Stand ${d}.${m}.${y}. Grenzen: Natural Earth, gemeinfrei.`,
      },
      minPopulation: config.minPopulation,
      states: content.states,
      cities: content.cities,
      regions: content.regions,
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, serialize(file));
    console.log(`wrote ${outPath} (data version ${file.dataVersion})`);
  }
  const bytes = (await readFile(outPath)).length;
  const manifestPath = path.join(dataDir, 'manifest.json');
  const manifest: Manifest = existsSync(manifestPath)
    ? (JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest)
    : { format: DATA_FORMAT, countries: [] };
  const entry: ManifestEntry = {
    country: prefix,
    name: config.name,
    file: `countries/${prefix.toLowerCase()}.json`,
    dataVersion: file.dataVersion,
    cityCount: placed.length,
    bbox: regions.bbox.map(round4) as unknown as ManifestEntry['bbox'],
  };
  const countries = [...manifest.countries.filter((c) => c.country !== prefix), entry].sort(
    (a, b) => a.country.localeCompare(b.country),
  );
  await writeFile(manifestPath, JSON.stringify({ format: DATA_FORMAT, countries }, null, 2) + '\n');
  console.log(
    `${placed.length} towns in ${states.length} countries (${unnamed} without a German name), ${Math.round(bytes / 1024)} KB`,
  );
}

// Builds public/data/countries/<cc>.json, updates public/data/manifest.json and writes the review
// report docs/data/<cc>-report.md from the raw downloads in data/raw/.
// Usage: npm run data:build -- de

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { geoContains } from 'd3-geo';
import { strFromU8, unzipSync } from 'fflate';
import type { FeatureCollection } from 'geojson';
import { feature } from 'topojson-client';
import {
  DATA_FORMAT,
  citiesFromColumns,
  citiesToColumns,
  type City,
  type CountryFile,
  type DataSource,
  type Manifest,
  type ManifestEntry,
} from '../../src/core/data';
import { buildContinent } from './continent';
import { CONTINENTS } from './continent-sources';
import { COUNTRIES, type CountryConfig } from './countries';
import {
  DEFAULT_CLEANING,
  SCHEMES,
  buildCities,
  groupMunicipalities,
  parseAlternateNames,
  parseGeoNames,
  type NameSource,
} from './geonames';
import { buildRegions } from './natural-earth';
import { renderReport } from './report';
import {
  DOWNLOADS_MANIFEST,
  NATURAL_EARTH_ADMIN1,
  RAW_DIR,
  geonamesSources,
  type DownloadRecord,
  type DownloadsManifest,
} from './sources';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA_DIR = path.join(ROOT, 'public/data');
const MANIFEST = path.join(DATA_DIR, 'manifest.json');

interface Overrides {
  readonly names: Readonly<Record<string, { name?: string; label?: string; nameEn?: string }>>;
  readonly exclude: readonly number[];
}

async function readZipEntry(file: string, entry: string): Promise<string> {
  const zip = unzipSync(await readFile(path.join(RAW_DIR, file)), {
    filter: (f) => f.name === entry,
  });
  const data = zip[entry];
  if (!data) throw new Error(`${file}: missing ${entry}`);
  return strFromU8(data);
}

function record(downloads: DownloadsManifest, key: string): DownloadRecord {
  const r = downloads[key];
  if (!r) throw new Error(`missing download ${key}; run npm run data:download first`);
  return r;
}

function sourceFile(r: DownloadRecord) {
  return {
    url: r.url,
    lastModified: r.lastModified,
    downloadedAt: r.downloadedAt,
    sha256: r.sha256,
  };
}

function isoDate(httpDate: string | null): string | null {
  return httpDate ? new Date(httpDate).toISOString().slice(0, 10) : null;
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** Compact but line-structured JSON: one top-level key (and one city column) per line. */
function serialize(file: CountryFile): string {
  const lines: string[] = [];
  const entries = Object.entries(file);
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    if (key === 'cities') {
      const cols = Object.entries(value as object);
      lines.push(`  "cities": {`);
      cols.forEach(([k, v], j) =>
        lines.push(
          `    ${JSON.stringify(k)}: ${JSON.stringify(v)}${j < cols.length - 1 ? ',' : ''}`,
        ),
      );
      lines.push(`  }${comma}`);
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
    }
  });
  return `{\n${lines.join('\n')}\n}\n`;
}

async function buildCountry(config: CountryConfig): Promise<void> {
  const cc = config.code.toLowerCase();
  const downloads = JSON.parse(await readFile(DOWNLOADS_MANIFEST, 'utf8')) as DownloadsManifest;
  const src = geonamesSources(config.code);
  const geoRecord = record(downloads, src.geonames.key);
  const altRecord = record(downloads, src.alternateNames.key);
  const neRecord = record(downloads, NATURAL_EARTH_ADMIN1.key);

  console.log('parse GeoNames');
  const rows = parseGeoNames(await readZipEntry(src.geonames.file, `${config.code}.txt`));
  const alts = parseAlternateNames(
    await readZipEntry(src.alternateNames.file, `${config.code}.txt`),
    new Set(rows.map((r) => r.id)),
  );
  const scheme = SCHEMES[config.code];
  if (!scheme) throw new Error(`no municipality scheme for ${config.code}`);
  const municipalities = groupMunicipalities(rows, scheme).length;
  const records = buildCities(
    rows,
    alts,
    { ...DEFAULT_CLEANING, minPopulation: config.minPopulation },
    scheme,
  );

  console.log('build regions');
  const admin1 = JSON.parse(
    await readFile(path.join(RAW_DIR, NATURAL_EARTH_ADMIN1.file), 'utf8'),
  ) as Parameters<typeof buildRegions>[0];
  const regions = await buildRegions(admin1, {
    adm0: config.adm0,
    contextMarginDeg: 2,
    simplifyMetres: 400,
    ...(config.stateName ? { stateName: config.stateName } : {}),
    ...(config.excludeStates ? { excludeStates: config.excludeStates } : {}),
  });

  const overridesPath = path.join(import.meta.dirname, 'overrides', `${cc}.json`);
  const overrides: Overrides = existsSync(overridesPath)
    ? (JSON.parse(await readFile(overridesPath, 'utf8')) as Overrides)
    : { names: {}, exclude: [] };
  const excluded = new Set(overrides.exclude);
  let overridesApplied = excluded.size;

  const nameSources = new Map<number, NameSource>();
  const cities: City[] = [];
  for (const r of records) {
    if (excluded.has(r.id)) continue;
    const state = regions.admin1ToState.get(r.admin1);
    if (!state) throw new Error(`city ${r.id} ${r.name}: unknown admin1 ${r.admin1}`);
    const o = overrides.names[String(r.id)];
    if (o) overridesApplied++;
    cities.push({
      id: r.id,
      name: o?.name ?? r.name,
      label: o?.label ?? o?.name ?? r.label,
      nameEn: o?.nameEn ?? r.nameEn,
      lat: round4(r.lat),
      lon: round4(r.lon),
      pop: r.pop,
      state,
      wikidata: r.wikidata,
      flags: r.flags,
    });
    nameSources.set(r.id, r.nameSource);
  }

  const statesGeo = feature(
    regions.topology,
    regions.topology.objects.states!,
  ) as FeatureCollection;
  const stateFeature = new Map(statesGeo.features.map((f) => [f.properties!.id as string, f]));
  const outsideState = cities.filter(
    (c) => !geoContains(stateFeature.get(c.state)!, [c.lon, c.lat]),
  );

  const geoDate = isoDate(geoRecord.lastModified) ?? geoRecord.downloadedAt.slice(0, 10);
  const sources: DataSource[] = [
    {
      name: 'GeoNames',
      url: 'https://www.geonames.org/',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      files: [sourceFile(geoRecord), sourceFile(altRecord)],
    },
    {
      name: 'Natural Earth',
      url: 'https://www.naturalearthdata.com/',
      license: 'Public domain',
      licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
      files: [sourceFile(neRecord)],
    },
  ];
  const [y, m, d] = geoDate.split('-');
  const content = {
    format: DATA_FORMAT,
    country: config.code,
    name: config.name,
    minPopulation: config.minPopulation,
    states: regions.states,
    cities: citiesToColumns(cities, regions.states),
    regions: regions.topology,
  };
  const contentHash =
    'sha256:' + createHash('sha256').update(JSON.stringify(content)).digest('hex');

  const outPath = path.join(DATA_DIR, 'countries', `${cc}.json`);
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
      country: config.code,
      name: config.name,
      dataVersion: (previous?.dataVersion ?? 0) + 1,
      contentHash,
      generated: new Date().toISOString().slice(0, 10),
      sources,
      attribution: {
        en: `City data: GeoNames (geonames.org), CC BY 4.0, as of ${geoDate}. Boundaries: Natural Earth, public domain.`,
        de: `Städtedaten: GeoNames (geonames.org), CC BY 4.0, Stand ${d}.${m}.${y}. Grenzen: Natural Earth, gemeinfrei.`,
      },
      minPopulation: content.minPopulation,
      states: content.states,
      cities: content.cities,
      regions: content.regions,
    };
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, serialize(file));
    console.log(`wrote ${path.relative(ROOT, outPath)} (data version ${file.dataVersion})`);
  }
  const fileBytes = (await readFile(outPath)).length;

  const manifest: Manifest = existsSync(MANIFEST)
    ? (JSON.parse(await readFile(MANIFEST, 'utf8')) as Manifest)
    : { format: DATA_FORMAT, countries: [] };
  const entry: ManifestEntry = {
    country: config.code,
    name: config.name,
    file: `countries/${cc}.json`,
    dataVersion: file.dataVersion,
    cityCount: cities.length,
    bbox: regions.bbox.map(round4) as unknown as ManifestEntry['bbox'],
  };
  const countries = [...manifest.countries.filter((c) => c.country !== config.code), entry].sort(
    (a, b) => a.country.localeCompare(b.country),
  );
  await writeFile(MANIFEST, JSON.stringify({ format: DATA_FORMAT, countries }, null, 2) + '\n');

  const reportPath = path.join(ROOT, 'docs/data', `${cc}-report.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    renderReport({
      file,
      cities: citiesFromColumns(file.cities, file.states),
      nameSources,
      geonamesRows: rows.length,
      municipalities,
      outsideState,
      overridesApplied,
      fileBytes,
    }),
  );
  console.log(
    `${cities.length} cities, ${outsideState.length} outside their state polygon, ${Math.round(fileBytes / 1024)} KB`,
  );
}

async function main(): Promise<void> {
  const code = process.argv[2]?.toUpperCase();
  const continent = code ? CONTINENTS[code] : undefined;
  if (continent) {
    await buildContinent(continent, DATA_DIR, serialize);
    return;
  }
  const config = code ? COUNTRIES[code] : undefined;
  if (!config)
    throw new Error(
      `Usage: data:build -- <${[...Object.keys(COUNTRIES), ...Object.keys(CONTINENTS)].join('|').toLowerCase()}>`,
    );
  await buildCountry(config);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

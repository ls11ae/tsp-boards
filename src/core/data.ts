// Format of the generated per-country data files (public/data/countries/<cc>.json) and of the
// manifest (public/data/manifest.json). Written by scripts/build-data, read by the app and CLI.

import type { Topology } from 'topojson-specification';

export const DATA_FORMAT = 1;

/** Bit flags on cities, set by the data build for review and display decisions. */
export const CityFlag = {
  /** No populated place found for the municipality; coordinates are the municipality point. */
  MunicipalityPoint: 1,
  /** Within a few km of a much larger city: possibly a district that slipped through. */
  NearLarger: 2,
  /** The short label was ambiguous within the country, so the full name is used as label. */
  AmbiguousLabel: 4,
  /** Another city in the country has the same name. */
  DuplicateName: 8,
} as const;

export interface LocalizedText {
  readonly en: string;
  readonly de: string;
}

export interface SourceFile {
  readonly url: string;
  /** HTTP Last-Modified of the downloaded file (the data state), if known. */
  readonly lastModified: string | null;
  readonly downloadedAt: string;
  readonly sha256: string;
}

export interface DataSource {
  readonly name: string;
  readonly url: string;
  readonly license: string;
  readonly licenseUrl: string | null;
  readonly files: readonly SourceFile[];
}

export interface StateInfo {
  /** ISO 3166-2 code, e.g. 'DE-NW'. Used as region id. */
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
}

/**
 * Cities in columnar form (compact JSON), sorted by population, descending. Rare values are
 * stored sparsely, keyed by row index.
 */
export interface CityColumns {
  /** GeoNames id of the representative populated place. Stable across data versions. */
  readonly id: readonly number[];
  readonly name: readonly string[];
  /** Short board label where it differs from the name. */
  readonly label: Readonly<Record<string, string>>;
  /** English name where it differs from the name. */
  readonly nameEn: Readonly<Record<string, string>>;
  /** Degrees, 4 decimals (~10 m). */
  readonly lat: readonly number[];
  readonly lon: readonly number[];
  /** Population of the municipality. */
  readonly pop: readonly number[];
  /** Index into CountryFile.states. */
  readonly state: readonly number[];
  /** Wikidata QID, if GeoNames links one. */
  readonly wikidata: readonly (string | null)[];
  readonly flags: readonly number[];
}

export interface CountryFile {
  readonly format: typeof DATA_FORMAT;
  /** ISO 3166-1 alpha-2, e.g. 'DE'. */
  readonly country: string;
  readonly name: LocalizedText;
  /** Increases whenever the content (cities, states, regions) changes. */
  readonly dataVersion: number;
  readonly contentHash: string;
  /** Build date, YYYY-MM-DD. */
  readonly generated: string;
  readonly sources: readonly DataSource[];
  readonly attribution: LocalizedText;
  readonly minPopulation: number;
  readonly states: readonly StateInfo[];
  readonly cities: CityColumns;
  /** Objects: 'country' (outline), 'states' (id = StateInfo.id), 'neighbors' (context). */
  readonly regions: Topology;
}

export interface ManifestEntry {
  readonly country: string;
  readonly name: LocalizedText;
  /** Path relative to public/data/. */
  readonly file: string;
  readonly dataVersion: number;
  readonly cityCount: number;
  /** [west, south, east, north] in degrees. */
  readonly bbox: readonly [number, number, number, number];
}

export interface Manifest {
  readonly format: typeof DATA_FORMAT;
  readonly countries: readonly ManifestEntry[];
}

export interface City {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly nameEn: string;
  readonly lat: number;
  readonly lon: number;
  readonly pop: number;
  /** StateInfo.id, e.g. 'DE-NW'. */
  readonly state: string;
  readonly wikidata: string | null;
  readonly flags: number;
  /** Members of a composite place; the board point is the mean of their projections. */
  readonly members?: readonly {
    readonly name: string;
    readonly lat: number;
    readonly lon: number;
  }[];
}

export type LabelLanguage = 'de' | 'en';

/** Name for lists and sheets; a composite place names its members: "RIL (Bochum, Dortmund)". */
export function listName(city: City, language: LabelLanguage): string {
  const name = language === 'en' ? city.nameEn : city.name;
  return city.members ? `${name} (${city.members.map((m) => m.name).join(', ')})` : name;
}

/** Text on the board: the short label, or the English exonym (Munich) for English boards. */
export function boardLabel(city: City, language: LabelLanguage): string {
  return language === 'en' && city.nameEn !== city.name ? city.nameEn : city.label;
}

export function citiesFromColumns(columns: CityColumns, states: readonly StateInfo[]): City[] {
  return columns.id.map((id, i) => {
    const name = columns.name[i]!;
    return {
      id,
      name,
      label: columns.label[i] ?? name,
      nameEn: columns.nameEn[i] ?? name,
      lat: columns.lat[i]!,
      lon: columns.lon[i]!,
      pop: columns.pop[i]!,
      state: states[columns.state[i]!]!.id,
      wikidata: columns.wikidata[i] ?? null,
      flags: columns.flags[i]!,
    };
  });
}

export function citiesToColumns(
  cities: readonly City[],
  states: readonly StateInfo[],
): CityColumns {
  const stateIndex = new Map(states.map((s, i) => [s.id, i]));
  const sparse = (value: (c: City) => string) =>
    Object.fromEntries(
      cities.flatMap((c, i) => (value(c) === c.name ? [] : [[String(i), value(c)]])),
    ) as Record<string, string>;
  return {
    id: cities.map((c) => c.id),
    name: cities.map((c) => c.name),
    label: sparse((c) => c.label),
    nameEn: sparse((c) => c.nameEn),
    lat: cities.map((c) => c.lat),
    lon: cities.map((c) => c.lon),
    pop: cities.map((c) => c.pop),
    state: cities.map((c) => {
      const index = stateIndex.get(c.state);
      if (index === undefined) throw new Error(`unknown state ${c.state}`);
      return index;
    }),
    wikidata: cities.map((c) => c.wikidata),
    flags: cities.map((c) => c.flags),
  };
}

/** Minimal structural validation of a fetched country file. */
export function parseCountryFile(json: unknown): CountryFile {
  const file = json as Partial<CountryFile> | null;
  if (!file || typeof file !== 'object') throw new Error('country file: not an object');
  if (file.format !== DATA_FORMAT) {
    throw new Error(`country file: unsupported format ${String(file.format)}`);
  }
  const cities = file.cities;
  if (!cities || !Array.isArray(cities.id)) throw new Error('country file: missing cities');
  const n = cities.id.length;
  const dense = ['name', 'lat', 'lon', 'pop', 'state', 'wikidata', 'flags'] as const;
  for (const key of dense) {
    if (cities[key].length !== n) throw new Error(`country file: column ${key} has wrong length`);
  }
  if (!file.regions || file.regions.type !== 'Topology') {
    throw new Error('country file: missing regions');
  }
  return file as CountryFile;
}

// Raw data sources for the offline data build. Downloads go to data/raw/ (gitignored).

import path from 'node:path';
import { CONTINENTS } from './continent-sources';

export const RAW_DIR = path.resolve(import.meta.dirname, '../../data/raw');
export const DOWNLOADS_MANIFEST = path.join(RAW_DIR, 'downloads.json');

export interface RawSource {
  /** Stable key used by the build. */
  readonly key: string;
  readonly url: string;
  /** Path relative to RAW_DIR. */
  readonly file: string;
}

export const NATURAL_EARTH_ADMIN1: RawSource = {
  key: 'naturalearth/admin1',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson',
  file: 'naturalearth/ne_10m_admin_1_states_provinces.geojson',
};

/** Per-country GeoNames dumps (all features) and alternate names. */
export function geonamesSources(countryCode: string): {
  readonly geonames: RawSource;
  readonly alternateNames: RawSource;
} {
  const cc = countryCode.toUpperCase();
  return {
    geonames: {
      key: `geonames/${cc}`,
      url: `https://download.geonames.org/export/dump/${cc}.zip`,
      file: `geonames/${cc}.zip`,
    },
    alternateNames: {
      key: `geonames/alternatenames/${cc}`,
      url: `https://download.geonames.org/export/dump/alternatenames/${cc}.zip`,
      file: `geonames/alternatenames-${cc}.zip`,
    },
  };
}

/** All places with at least 15,000 inhabitants (or capitals) worldwide: continents and the world. */
export const GEONAMES_CITIES15000: RawSource = {
  key: 'geonames/cities15000',
  url: 'https://download.geonames.org/export/dump/cities15000.zip',
  file: 'geonames/cities15000.zip',
};

/** Countries with their continent (the world's regions). */
export const GEONAMES_COUNTRY_INFO: RawSource = {
  key: 'geonames/countryInfo',
  url: 'https://download.geonames.org/export/dump/countryInfo.txt',
  file: 'geonames/countryInfo.txt',
};

/**
 * Continents (e.g. EU) use the global town list; countries their own dumps. The world ('WO')
 * also needs the alternate names of every country with towns, known only from the town list
 * (world.ts, worldNameSources).
 */
export function sourcesForCountry(countryCode: string): readonly RawSource[] {
  if (countryCode.toUpperCase() === 'WO')
    return [GEONAMES_CITIES15000, GEONAMES_COUNTRY_INFO, NATURAL_EARTH_ADMIN1];
  const continent = CONTINENTS[countryCode.toUpperCase()];
  if (continent) {
    const codes = [...new Set(Object.values(continent.countries))].sort();
    return [
      GEONAMES_CITIES15000,
      NATURAL_EARTH_ADMIN1,
      ...codes.map((cc) => geonamesSources(cc).alternateNames),
    ];
  }
  const { geonames, alternateNames } = geonamesSources(countryCode);
  return [geonames, alternateNames, NATURAL_EARTH_ADMIN1];
}

export interface DownloadRecord {
  readonly key: string;
  readonly url: string;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  /** ISO timestamp of the download. */
  readonly downloadedAt: string;
  /** HTTP Last-Modified header, if the server sent one. */
  readonly lastModified: string | null;
}

export type DownloadsManifest = Record<string, DownloadRecord>;

// Raw data sources for the offline data build. Downloads go to data/raw/ (gitignored).

import path from 'node:path';

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

export function sourcesForCountry(countryCode: string): readonly RawSource[] {
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

// Continents (roadmap 8.1): which countries, the map extent, and the towns taken from GeoNames'
// global list (cities15000). German and English names (exonyms such as Moskau / Moscow) and
// Wikidata ids come from GeoNames' alternate names of the countries.

import type { LocalizedText } from '../../src/core/data';

export interface ContinentConfig {
  /** Code used as the "country" of the data file, e.g. 'EU'. */
  readonly code: string;
  readonly name: LocalizedText;
  /** Natural Earth adm0_a3 -> ISO 3166-1 alpha-2 of the countries included. */
  readonly countries: Readonly<Record<string, string>>;
  /** Map extent [west, south, east, north] in degrees: parts outside are cut off. */
  readonly bbox: readonly [number, number, number, number];
  readonly minPopulation: number;
  /**
   * A town closer to a larger one than max(mergeKm, 3 km · √(population / 100,000)) of the
   * larger is dropped (districts coded as towns; Istanbul ~ 37 km, Berlin ~ 17 km).
   */
  readonly mergeKm: number;
  /** Visvalingam simplification interval in metres. */
  readonly simplifyMetres: number;
  /**
   * Countries reaching beyond the continent: only these admin-1 units (ISO 3166-2) belong to
   * it, and only towns inside them (e.g. Turkey: East Thrace and Istanbul).
   */
  readonly partOnly?: Readonly<Record<string, readonly string[]>>;
}

/** Feature codes of populated places kept (sections, historical and abandoned places dropped). */
export const KEPT_CODES = new Set([
  'PPLC',
  'PPLG',
  'PPLA',
  'PPLA2',
  'PPLA3',
  'PPLA4',
  'PPLA5',
  'PPL',
]);

export const CONTINENTS: Readonly<Record<string, ContinentConfig>> = {
  EU: {
    code: 'EU',
    name: { en: 'Europe', de: 'Europa' },
    countries: {
      ALB: 'AL',
      AND: 'AD',
      AUT: 'AT',
      BLR: 'BY',
      BEL: 'BE',
      BIH: 'BA',
      BGR: 'BG',
      HRV: 'HR',
      CYP: 'CY',
      // Northern Cyprus: GeoNames counts its towns as CY; the island is one region.
      CYN: 'CY',
      CZE: 'CZ',
      DNK: 'DK',
      EST: 'EE',
      FIN: 'FI',
      FRA: 'FR',
      DEU: 'DE',
      GRC: 'GR',
      HUN: 'HU',
      ISL: 'IS',
      IRL: 'IE',
      ITA: 'IT',
      KOS: 'XK',
      LVA: 'LV',
      LIE: 'LI',
      LTU: 'LT',
      LUX: 'LU',
      MLT: 'MT',
      MDA: 'MD',
      MCO: 'MC',
      MNE: 'ME',
      NLD: 'NL',
      MKD: 'MK',
      NOR: 'NO',
      POL: 'PL',
      PRT: 'PT',
      ROU: 'RO',
      RUS: 'RU',
      SMR: 'SM',
      SRB: 'RS',
      SVK: 'SK',
      SVN: 'SI',
      ESP: 'ES',
      SWE: 'SE',
      CHE: 'CH',
      TUR: 'TR',
      UKR: 'UA',
      GBR: 'GB',
      VAT: 'VA',
    },
    // Iceland to the Urals' foothills cut at 45° E, Cyprus and Crete to the North Cape; the
    // Canaries, Madeira, the Azores and Svalbard lie outside.
    bbox: [-25, 34, 45, 71.5],
    // Turkey: its European part (Edirne, Kırklareli, Tekirdağ) and Istanbul.
    partOnly: { TUR: ['TR-22', 'TR-39', 'TR-59', 'TR-34'] },
    minPopulation: 50_000,
    mergeKm: 5,
    simplifyMetres: 2000,
  },
};

const DESIGNATION_DE =
  /^(Kreisfreie Stadt|Landeshauptstadt|Stadtkreis|Stadtgemeinde|Stadt|Gemeinde|Hansestadt|Universitätsstadt|Bezirk) /u;
// A capitalised "City" is part of the name (Mexico City, Kuwait City, Ho Chi Minh City).
const DESIGNATION_EN = /^(City of|Municipality of) | (city|municipality|Municipality)$/u;

/** German name without a designation ("Kreisfreie Stadt München" -> "München"). */
export function cleanGerman(name: string): string {
  return name.replace(DESIGNATION_DE, '').trim();
}

/** English name without a designation ("Madrid city" -> "Madrid"). */
export function cleanEnglish(name: string): string {
  return name.replace(DESIGNATION_EN, '').trim();
}

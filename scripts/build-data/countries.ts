import type { LocalizedText } from '../../src/core/data';
import type { NeProperties } from './natural-earth';

export interface CountryConfig {
  /** ISO 3166-1 alpha-2. */
  readonly code: string;
  /** Natural Earth adm0_a3. */
  readonly adm0: string;
  readonly name: LocalizedText;
  readonly minPopulation: number;
  /** German state names (default: Natural Earth's `name`). */
  readonly stateName?: (p: NeProperties) => string;
  /** Natural Earth states left out (ISO 3166-2), e.g. overseas parts. */
  readonly excludeStates?: readonly string[];
}

export const COUNTRIES: Readonly<Record<string, CountryConfig>> = {
  DE: {
    code: 'DE',
    adm0: 'DEU',
    name: { en: 'Germany', de: 'Deutschland' },
    minPopulation: 1000,
  },
  AT: {
    code: 'AT',
    adm0: 'AUT',
    name: { en: 'Austria', de: 'Österreich' },
    minPopulation: 1000,
  },
  CH: {
    code: 'CH',
    adm0: 'CHE',
    name: { en: 'Switzerland', de: 'Schweiz' },
    minPopulation: 1000,
    // Natural Earth's names mix languages ("Lucerne", "Genève"); name_de is "Kanton Luzern".
    stateName: (p) => (p.name_de ?? p.name).replace(/^Kanton /u, ''),
  },
  NL: {
    code: 'NL',
    adm0: 'NLD',
    name: { en: 'Netherlands', de: 'Niederlande' },
    minPopulation: 1000,
    // The Caribbean Netherlands are not on a board of the Netherlands.
    excludeStates: ['NL-BQ1', 'NL-BQ2', 'NL-BQ3'],
  },
};

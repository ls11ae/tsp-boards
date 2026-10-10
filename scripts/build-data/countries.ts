import type { LocalizedText } from '../../src/core/data';

export interface CountryConfig {
  /** ISO 3166-1 alpha-2. */
  readonly code: string;
  /** Natural Earth adm0_a3. */
  readonly adm0: string;
  readonly name: LocalizedText;
  readonly minPopulation: number;
}

export const COUNTRIES: Readonly<Record<string, CountryConfig>> = {
  DE: {
    code: 'DE',
    adm0: 'DEU',
    name: { en: 'Germany', de: 'Deutschland' },
    minPopulation: 1000,
  },
};

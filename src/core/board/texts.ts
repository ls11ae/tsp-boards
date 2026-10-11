// Texts printed on the board and the sheets, in the board's label language (a board property,
// independent of the UI language).

import type { LabelLanguage } from '../data';

export interface BoardTexts {
  /** Subtitle under the region name. */
  readonly subtitle: (n: number) => string;
  /** Caption along the scale. */
  readonly scaleCaption: string;
  readonly attribution: string;
}

export const BOARD_TEXTS: Record<LabelLanguage, BoardTexts> = {
  de: {
    subtitle: (n) => `${n} Städte · Finde die kürzeste Rundreise!`,
    scaleCaption: 'mm Faden zu viel',
    attribution: 'Städte: GeoNames (CC BY 4.0) · Grenzen: Natural Earth · TSP Boards',
  },
  en: {
    subtitle: (n) => `${n} cities · Find the shortest round trip!`,
    scaleCaption: 'mm of string too many',
    attribution: 'Cities: GeoNames (CC BY 4.0) · Borders: Natural Earth · TSP Boards',
  },
};

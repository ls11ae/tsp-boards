// Puzzle parameters as the user sets them (board, search, labels), shared by the app, the
// permalinks and the CLI.

import type { LabelLanguage } from './data';
import { DEFAULT_SEARCH, type SearchParams } from './search/search';

export interface PuzzleParams {
  readonly region: string;
  readonly n: number;
  readonly boardWidthMm: number;
  readonly boardHeightMm: number;
  readonly marginMm: number;
  readonly nailDiameterMm: number;
  readonly stringThicknessMm: number;
  readonly minDistanceMm: number;
  readonly targetGapMm: number;
  readonly minPopulation: number;
  readonly seed: number;
  readonly iterations: number;
  readonly weightGap: number;
  readonly weightDifficulty: number;
  readonly weightRecognizability: number;
  /** Font size of the board labels in mm; 0 = no labels (and no label constraint). */
  readonly labelSizeMm: number;
  readonly labelLanguage: LabelLanguage;
}

/** Placeholders until the dimensions of the prototype boards are known. */
export const DEFAULT_PARAMS: PuzzleParams = {
  region: 'DE',
  n: 40,
  boardWidthMm: 600,
  boardHeightMm: 800,
  marginMm: 30,
  nailDiameterMm: 2,
  stringThicknessMm: 1,
  minDistanceMm: 25,
  targetGapMm: 5,
  minPopulation: 5000,
  seed: 1,
  iterations: 1000,
  weightGap: 1,
  weightDifficulty: 0.5,
  weightRecognizability: 0.5,
  labelSizeMm: 8,
  labelLanguage: 'de',
};

/** Nail radius plus half the string thickness (mm): the string's centre line wraps at r_eff. */
export function rEffMm(p: PuzzleParams): number {
  return p.nailDiameterMm / 2 + p.stringThicknessMm / 2;
}

export function searchParams(p: PuzzleParams): SearchParams {
  return {
    ...DEFAULT_SEARCH,
    n: p.n,
    minDistanceMm: p.minDistanceMm,
    targetGapMm: p.targetGapMm,
    rEffMm: rEffMm(p),
    iterations: p.iterations,
    seed: p.seed,
    weights: {
      gap: p.weightGap,
      difficulty: p.weightDifficulty,
      recognizability: p.weightRecognizability,
    },
  };
}

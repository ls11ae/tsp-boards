// Node helpers for CLI experiments: load committed country data and build board instances.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { labelOptions } from '../../src/core/board/labels';
import { measureText } from '../../src/core/board/text';
import {
  boardLabel,
  parseCountryFile,
  type City,
  type CountryFile,
  type LabelLanguage,
} from '../../src/core/data';
import { distance, type Point } from '../../src/core/geometry';
import { boardProjection, type BoardProjection, type BoardSpec } from '../../src/core/projection';
import { boardPoints, cityPool, regionOutline, type RegionId } from '../../src/core/region';
import { Rng } from '../../src/core/rng';
import type { PoolLabels } from '../../src/core/search/search';
import type { MipBackend } from '../../src/core/tsp/exact';

const DATA = path.resolve(import.meta.dirname, '../../public/data');

export function loadCountry(code: string): CountryFile {
  const file = path.join(DATA, 'countries', `${code.toLowerCase()}.json`);
  return parseCountryFile(JSON.parse(readFileSync(file, 'utf8')));
}

export async function loadBackend(): Promise<MipBackend> {
  return loadHighs();
}

export const DEFAULT_BOARD: BoardSpec = { widthMm: 600, heightMm: 800, marginMm: 30 };

export interface BoardPool {
  readonly projection: BoardProjection;
  readonly cities: City[];
  readonly points: Point[];
}

export function boardPool(
  file: CountryFile,
  region: RegionId,
  minPopulation: number,
  board: BoardSpec = DEFAULT_BOARD,
): BoardPool {
  const projection = boardProjection(regionOutline(file, region), board);
  const cities = cityPool(file, region, { minPopulation });
  return { projection, cities, points: boardPoints(cities, projection) };
}

/** Label constraint for the search: board labels of the pool cities at the given font size. */
export function poolLabels(
  pool: BoardPool,
  sizeMm: number,
  nailDiameterMm: number,
  language: LabelLanguage = 'de',
): PoolLabels {
  return {
    metrics: pool.cities.map((c) => measureText(boardLabel(c, language), sizeMm)),
    options: labelOptions(sizeMm, nailDiameterMm),
    width: pool.projection.board.widthMm,
    height: pool.projection.board.heightMm,
  };
}

/** Random subset of n pool indices with pairwise board distance ≥ minDistMm (greedy). */
export function randomSubset(
  pool: BoardPool,
  n: number,
  minDistMm: number,
  seed: number,
): number[] {
  const rng = new Rng(seed);
  const order = rng.shuffle(pool.points.map((_, i) => i));
  const chosen: number[] = [];
  for (const i of order) {
    if (chosen.every((j) => distance(pool.points[i]!, pool.points[j]!) >= minDistMm))
      chosen.push(i);
    if (chosen.length === n) return chosen;
  }
  throw new Error(`only ${chosen.length} cities fit with minimum distance ${minDistMm} mm`);
}

export function ms(start: number): number {
  return Math.round(performance.now() - start);
}

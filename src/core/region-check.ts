// Which regions are offered: only those whose pool holds a minimum puzzle on the default board
// (roadmap 5.6). City-states alone fail this (one or two towns) and appear only with their
// surrounding state.

import type { CountryFile } from './data';
import { DEFAULT_PARAMS, type PuzzleParams } from './params';
import { boardProjection } from './projection';
import {
  boardPoints,
  cityPool,
  projectionKind,
  regionFrame,
  regionsOf,
  type RegionInfo,
} from './region';
import { greedySelection } from './search/search';

/** Places a region must hold at the minimum distance to be offered. */
export const MIN_PUZZLE_PLACES = 10;

/** How many places fit greedily at the minimum distance, up to `places`. */
export function regionCapacity(
  file: CountryFile,
  id: string,
  params: PuzzleParams = DEFAULT_PARAMS,
  places = MIN_PUZZLE_PLACES,
): number {
  const projection = boardProjection(
    regionFrame(file, id),
    { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
    projectionKind(file),
  );
  const pool = cityPool(file, id, { minPopulation: params.minPopulation });
  const points = boardPoints(pool, projection);
  return greedySelection(
    { points, population: pool.map((c) => c.pop), pinned: [] },
    places,
    params.minDistanceMm,
  ).selection.length;
}

const offered = new WeakMap<CountryFile, RegionInfo[]>();

/**
 * Regions that hold a minimum puzzle on the default board with all towns of the data
 * (memoised per country file).
 */
export function offeredRegions(file: CountryFile): RegionInfo[] {
  let list = offered.get(file);
  if (!list) {
    // The smallest pool the data has: whether a region can hold a puzzle at all.
    const params = { ...DEFAULT_PARAMS, minPopulation: file.minPopulation };
    list = regionsOf(file).filter((r) => regionCapacity(file, r.id, params) >= MIN_PUZZLE_PLACES);
    offered.set(file, list);
  }
  return list;
}

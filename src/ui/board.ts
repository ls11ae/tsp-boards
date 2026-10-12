// Board geometry derived from the country data and the board parameters: projection, city pool
// with board coordinates, and SVG paths of the map layers (all in board mm).

import { useStore, type UiParams } from './store';
import { citiesFromColumns, type City, type CountryFile } from '../core/data';
import { listCities } from '../core/places';
import type { Place } from '../core/puzzle-file';
import type { Point } from '../core/geometry';
import { boardProjection, type BoardProjection } from '../core/projection';
import { boardPoints, cityPool, mapLayers, regionOutline } from '../core/region';

export interface BoardModel {
  readonly projection: BoardProjection;
  readonly pool: readonly City[];
  readonly points: readonly Point[];
  /** GeoNames id -> pool index. */
  readonly index: ReadonlyMap<number, number>;
  readonly paths: {
    readonly neighbors: string;
    readonly states: string;
    readonly country: string;
    /** Outline of the selected state (null for the whole country). */
    readonly region: string | null;
  };
}

let cached: {
  key: string;
  country: CountryFile;
  list: readonly Place[] | null;
  model: BoardModel;
} | null = null;

function boardKey(p: UiParams): string {
  return [
    p.region,
    p.boardWidthMm,
    p.boardHeightMm,
    p.marginMm,
    p.minPopulation,
    p.blankBoard,
  ].join('|');
}

/**
 * Memoised: recomputed only when the region, board size, population threshold or the place
 * list change. With a place list, the pool is the list (in its order) instead of the towns.
 */
export function getBoard(
  country: CountryFile,
  params: UiParams,
  list: readonly Place[] | null = useStore.getState().list?.places ?? null,
): BoardModel {
  const key = boardKey(params);
  if (cached && cached.country === country && cached.key === key && cached.list === list)
    return cached.model;
  const outline = regionOutline(country, params.region);
  const projection = boardProjection(outline, {
    widthMm: params.boardWidthMm,
    heightMm: params.boardHeightMm,
    marginMm: params.marginMm,
  });
  const pool = list
    ? listCities(list, townsById(country))
    : cityPool(country, params.region, { minPopulation: params.minPopulation });
  const layers = mapLayers(country);
  const model: BoardModel = {
    projection,
    pool,
    points: boardPoints(pool, projection),
    index: new Map(pool.map((c, i) => [c.id, i])),
    paths: params.blankBoard
      ? { neighbors: '', states: '', country: '', region: null }
      : {
          neighbors: projection.path(layers.neighbors),
          states: projection.path(layers.states),
          country: projection.path(layers.country),
          region: params.region === country.country ? null : projection.path(outline),
        },
  };
  cached = { key, country, list, model };
  return model;
}

let towns: { country: CountryFile; map: Map<number, City> } | null = null;

/** All towns of the country by GeoNames id (memoised). */
export function townsById(country: CountryFile): Map<number, City> {
  if (towns?.country !== country) {
    towns = {
      country,
      map: new Map(citiesFromColumns(country.cities, country.states).map((c) => [c.id, c])),
    };
  }
  return towns.map;
}

export function useBoard(): BoardModel | null {
  const country = useStore((s) => s.country);
  const params = useStore((s) => s.params);
  const list = useStore((s) => s.list?.places ?? null);
  return country ? getBoard(country, params, list) : null;
}

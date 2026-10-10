// Board geometry derived from the country data and the board parameters: projection, city pool
// with board coordinates, and SVG paths of the map layers (all in board mm).

import { useStore, type UiParams } from './store';
import type { City, CountryFile } from '../core/data';
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

let cached: { key: string; country: CountryFile; model: BoardModel } | null = null;

function boardKey(p: UiParams): string {
  return [p.region, p.boardWidthMm, p.boardHeightMm, p.marginMm, p.minPopulation].join('|');
}

/** Memoised: recomputed only when the region, board size or population threshold change. */
export function getBoard(country: CountryFile, params: UiParams): BoardModel {
  const key = boardKey(params);
  if (cached && cached.country === country && cached.key === key) return cached.model;
  const outline = regionOutline(country, params.region);
  const projection = boardProjection(outline, {
    widthMm: params.boardWidthMm,
    heightMm: params.boardHeightMm,
    marginMm: params.marginMm,
  });
  const pool = cityPool(country, params.region, { minPopulation: params.minPopulation });
  const layers = mapLayers(country);
  const model: BoardModel = {
    projection,
    pool,
    points: boardPoints(pool, projection),
    index: new Map(pool.map((c, i) => [c.id, i])),
    paths: {
      neighbors: projection.path(layers.neighbors),
      states: projection.path(layers.states),
      country: projection.path(layers.country),
      region: params.region === country.country ? null : projection.path(outline),
    },
  };
  cached = { key, country, model };
  return model;
}

export function useBoard(): BoardModel | null {
  const country = useStore((s) => s.country);
  const params = useStore((s) => s.params);
  return country ? getBoard(country, params) : null;
}

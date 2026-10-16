// Board geometry derived from the country data and the board parameters: projection, city pool
// with board coordinates, and SVG paths of the map layers (all in board mm).

import { useStore, type UiParams } from './store';
import { citiesFromColumns, type City, type CountryFile } from '../core/data';
import { listCities } from '../core/places';
import type { Place } from '../core/puzzle-file';
import { distance, greatCircleKm, type Point } from '../core/geometry';
import { boardProjection, type BoardProjection } from '../core/projection';
import { Instance, type Sphere } from '../core/instance';
import {
  boardPoints,
  citySphere,
  cityPool,
  mapLayers,
  projectionKind,
  regionFrame,
  regionOutline,
} from '../core/region';

export interface BoardModel {
  readonly projection: BoardProjection;
  readonly pool: readonly City[];
  readonly points: readonly Point[];
  /** Great-circle distances of the pool (world files); null on the plane. */
  readonly sphere: Sphere | null;
  /** GeoNames id -> pool index. */
  readonly index: ReadonlyMap<number, number>;
  readonly paths: {
    readonly neighbors: string;
    readonly states: string;
    readonly country: string;
    /** Outline of the selected state (null for the whole country). */
    readonly region: string | null;
    /** Edge of the world map (the sphere; null for other maps). */
    readonly sphere: string | null;
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
  const projection = boardProjection(
    regionFrame(country, params.region),
    { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
    projectionKind(country),
  );
  const pool = list
    ? listCities(list, townsById(country))
    : cityPool(country, params.region, { minPopulation: params.minPopulation });
  const layers = mapLayers(country);
  const model: BoardModel = {
    projection,
    pool,
    points: boardPoints(pool, projection),
    sphere: citySphere(country, pool, projection),
    index: new Map(pool.map((c, i) => [c.id, i])),
    paths: params.blankBoard
      ? { neighbors: '', states: '', country: '', region: null, sphere: null }
      : {
          neighbors: projection.path(layers.neighbors),
          states: projection.path(layers.states),
          country: projection.path(layers.country),
          region: params.region === country.country ? null : projection.path(outline),
          sphere: country.metric === 'sphere' ? projection.path({ type: 'Sphere' }) : null,
        },
  };
  cached = { key, country, list, model };
  return model;
}

/** Great-circle positions of some pool cities (slot order); null on the plane. */
export function slotSphere(board: BoardModel, members: readonly number[]): Sphere | null {
  return board.sphere
    ? { lonLat: members.map((c) => board.sphere!.lonLat[c]!), mmPerKm: board.sphere.mmPerKm }
    : null;
}

/** The instance of some pool cities (slot order), on the sphere for world files. */
export function boardInstance(
  board: BoardModel,
  members: readonly number[],
  rEffMm: number,
): Instance {
  return new Instance(
    members.map((c) => board.points[c]!),
    rEffMm,
    slotSphere(board, members),
  );
}

/**
 * SVG path data of legs between pool cities. On the sphere (world files) each leg is the
 * great-circle arc, cut where it leaves one side of the world map and continues on the other.
 */
export function legsPath(
  board: BoardModel,
  legs: readonly (readonly [number, number])[],
  /** Straight lines on the map also for world files (the flat-map comparison). */
  straight = false,
): string {
  if (board.sphere && !straight) {
    const lonLat = board.sphere.lonLat;
    return board.projection.path({
      type: 'MultiLineString',
      coordinates: legs.map(([a, b]) => [[...lonLat[a]!], [...lonLat[b]!]]),
    });
  }
  const at = (c: number) => board.points[c]!.map((v) => v.toFixed(2)).join(',');
  return legs.map(([a, b]) => `M${at(a)}L${at(b)}`).join('');
}

/** Length of the leg between two pool cities in board mm (on the sphere: the great circle). */
export function legMm(board: BoardModel, a: number, b: number): number {
  return board.sphere
    ? greatCircleKm(board.sphere.lonLat[a]!, board.sphere.lonLat[b]!) * board.sphere.mmPerKm
    : distance(board.points[a]!, board.points[b]!);
}

/** SVG path data of a route through pool cities; a closed route returns to its start. */
export function routePath(
  board: BoardModel,
  cities: readonly number[],
  closed: boolean,
  straight = false,
): string {
  if (cities.length < 2) return '';
  if (board.sphere && !straight) {
    const legs = cities.slice(closed ? 0 : 1).map((c, i): [number, number] => {
      const from = closed ? cities.at(i - 1)! : cities[i]!;
      return [from, c];
    });
    return legsPath(board, legs);
  }
  const at = (c: number) => board.points[c]!.map((v) => v.toFixed(2)).join(',');
  return `M${cities.map(at).join('L')}${closed ? 'Z' : ''}`;
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

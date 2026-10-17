// Board geometry derived from the country data and the board parameters: projection, city pool
// with board coordinates, and SVG paths of the map layers (all in board mm).

import { useMemo } from 'react';
import { useStore, type DocMeta, type UiParams } from './store';
import { citiesFromColumns, type City, type CountryFile } from '../core/data';
import { listCities } from '../core/places';
import type { Place } from '../core/puzzle-file';
import { distance, greatCircleKm, type Point } from '../core/geometry';
import { boardProjection, type BoardProjection } from '../core/projection';
import { Instance, type FixedEdge, type Sphere } from '../core/instance';
import {
  boardPoints,
  citySphere,
  cityPool,
  mapLayers,
  mapLines,
  outlineLines,
  projectionKind,
  regionFrame,
  regionOutline,
} from '../core/region';

export interface BoardModel {
  readonly projection: BoardProjection;
  readonly pool: readonly City[];
  readonly points: readonly Point[];
  /** Great-circle distances of the pool (world files, not a world board); null on the plane. */
  readonly sphere: Sphere | null;
  /** GeoNames id -> pool index. */
  readonly index: ReadonlyMap<number, number>;
  readonly paths: {
    /** Neighbouring countries as areas (filled, without a stroke: see `neighborLines`). */
    readonly neighbors: string;
    /** Their borders and coasts, without the edges of the data's clip box (roadmap 9.6). */
    readonly neighborLines: string;
    /** Borders between the states. */
    readonly states: string;
    /** Outline of the country (or the continents), without the clip box's edges. */
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
    p.flatMap,
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
  const lines = mapLines(country);
  const model: BoardModel = {
    projection,
    pool,
    points: boardPoints(pool, projection),
    // A world board measures on the flat map (roadmap 9.15).
    sphere: params.flatMap ? null : citySphere(country, pool, projection),
    index: new Map(pool.map((c, i) => [c.id, i])),
    paths: params.blankBoard
      ? { neighbors: '', neighborLines: '', states: '', country: '', region: null, sphere: null }
      : {
          neighbors: projection.path(layers.neighbors),
          neighborLines: projection.path(lines.neighbors),
          states: projection.path(lines.states),
          country: projection.path(lines.country),
          region: params.region === country.country ? null : projection.path(outlineLines(outline)),
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

/**
 * The given leg of the open puzzle's path (roadmap 9.15) as slots of these members: [start,
 * end], or null without a path (or if an end point is not among the members).
 */
export function pathEdge(
  board: BoardModel,
  members: readonly number[],
  path: DocMeta['path'] = useStore.getState().doc.path,
): FixedEdge | null {
  if (!path) return null;
  const slot = (id: number) => {
    const c = board.index.get(id);
    return c === undefined ? -1 : members.indexOf(c);
  };
  const [start, end] = [slot(path.start), slot(path.end)];
  return start >= 0 && end >= 0 && start !== end ? [start, end] : null;
}

/**
 * The instance of some pool cities (slot order), on the sphere for world files; with the open
 * puzzle's given leg (an open path) unless told otherwise.
 */
export function boardInstance(
  board: BoardModel,
  members: readonly number[],
  rEffMm: number,
  fixedEdge: FixedEdge | null = pathEdge(board, members),
): Instance {
  return new Instance(
    members.map((c) => board.points[c]!),
    rEffMm,
    slotSphere(board, members),
    fixedEdge,
  );
}

/** The end points of the open puzzle's path as pool indices [start, end], or null. */
export function pathCities(
  board: BoardModel,
  members: readonly number[],
  path: DocMeta['path'] = useStore.getState().doc.path,
): readonly [number, number] | null {
  const edge = pathEdge(board, members, path);
  return edge ? [members[edge[0]]!, members[edge[1]]!] : null;
}

/** pathCities of the shown puzzle, re-rendering when the document's path changes. */
export function usePathCities(
  board: BoardModel | null,
  members: readonly number[] | undefined,
): readonly [number, number] | null {
  const path = useStore((s) => s.doc.path);
  return useMemo(
    () => (board && members ? pathCities(board, members, path) : null),
    [board, members, path],
  );
}

/**
 * A round trip (pool indices) as drawn: with given end points (roadmap 9.15) the open path from
 * the start to the end, whose leg back is drawn on its own; else the closed round trip.
 */
export function shownRoute(
  tour: readonly number[],
  ends: readonly [number, number] | null,
): { readonly cities: readonly number[]; readonly closed: boolean } {
  if (!ends) return { cities: tour, closed: true };
  const n = tour.length;
  const i = tour.indexOf(ends[0]);
  const step = tour[(i + n - 1) % n] === ends[1] ? 1 : tour[(i + 1) % n] === ends[1] ? -1 : 0;
  if (i < 0 || step === 0) return { cities: tour, closed: true };
  return {
    cities: Array.from({ length: n }, (_, k) => tour[(i + step * k + n * n) % n]!),
    closed: false,
  };
}

/**
 * SVG path data of the given leg of an open path between two pool cities: the great-circle arc
 * from the end back to the start, cut where it leaves the map (as on the board, roadmap 9.15).
 */
export function givenLegPath(board: BoardModel, start: number, end: number): string {
  const at = (c: number): [number, number] => [board.pool[c]!.lon, board.pool[c]!.lat];
  return board.projection.path({ type: 'LineString', coordinates: [at(end), at(start)] });
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

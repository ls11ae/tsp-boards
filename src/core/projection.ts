// Board projection: one region-fitted conformal conic projection, used for the screen, all
// metrics and the physical board. Output coordinates are millimetres on the board, y down.

import {
  geoBounds,
  geoConicConformal,
  geoDistance,
  geoPath,
  type GeoPermissibleObjects,
} from 'd3-geo';

const EARTH_RADIUS_KM = 6371.0088;

export interface BoardSpec {
  readonly widthMm: number;
  readonly heightMm: number;
  /** Free border around the region outline (labels, markings). */
  readonly marginMm: number;
}

export interface BoardProjection {
  readonly board: BoardSpec;
  /** Standard parallels and central meridian in degrees. */
  readonly parallels: readonly [number, number];
  readonly centralMeridian: number;
  /** Board millimetres per kilometre on the ground, at the region centre. */
  readonly mmPerKm: number;
  project(lon: number, lat: number): [number, number];
  /** SVG path data in board mm (2 decimals). */
  path(object: GeoPermissibleObjects): string;
}

export function boardProjection(region: GeoPermissibleObjects, board: BoardSpec): BoardProjection {
  const [[west, south], [east, north]] = geoBounds(region);
  const span = north - south;
  const parallels: [number, number] = [south + span / 6, north - span / 6];
  const centralMeridian = (west + east) / 2;
  const m = board.marginMm;
  const projection = geoConicConformal()
    .parallels(parallels)
    .rotate([-centralMeridian, 0])
    .fitExtent(
      [
        [m, m],
        [board.widthMm - m, board.heightMm - m],
      ],
      region,
    );
  const project = (lon: number, lat: number): [number, number] => {
    const p = projection([lon, lat]);
    if (!p) throw new Error(`cannot project ${lon}, ${lat}`);
    return p;
  };
  const centre: [number, number] = [centralMeridian, (south + north) / 2];
  const nearby: [number, number] = [centralMeridian, (south + north) / 2 + 0.05];
  const [x1, y1] = project(...centre);
  const [x2, y2] = project(...nearby);
  const km = geoDistance(centre, nearby) * EARTH_RADIUS_KM;
  const mmPerKm = Math.hypot(x2 - x1, y2 - y1) / km;
  const pathGenerator = geoPath(projection).digits(2);
  return {
    board,
    parallels,
    centralMeridian,
    mmPerKm,
    project,
    path: (object) => pathGenerator(object) ?? '',
  };
}

/** Great-circle distance in km. */
export function geodesicKm(a: readonly [number, number], b: readonly [number, number]): number {
  return geoDistance([a[0], a[1]], [b[0], b[1]]) * EARTH_RADIUS_KM;
}

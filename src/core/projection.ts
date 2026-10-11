// Board projection: one region-fitted conformal conic projection, used for the screen, all
// metrics and the physical board. Output coordinates are millimetres on the board, y down.

import type { Point } from './geometry';
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
  /**
   * Polylines in board mm, clipped to the rectangle [x0, y0, x1, y1] (closed rings end at their
   * start). Pass line geometry (e.g. a topojson mesh): polygons would gain clip-edge segments.
   */
  lines(object: GeoPermissibleObjects, clip: readonly [number, number, number, number]): Point[][];
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
  const lines = (
    object: GeoPermissibleObjects,
    [x0, y0, x1, y1]: readonly [number, number, number, number],
  ): Point[][] => {
    const out: Point[][] = [];
    let current: [number, number][] = [];
    const context = {
      moveTo(x: number, y: number) {
        current = [[x, y]];
        out.push(current);
      },
      lineTo(x: number, y: number) {
        current.push([x, y]);
      },
      closePath() {
        if (current.length > 0) current.push(current[0]!);
      },
      arc() {},
      beginPath() {},
    };
    // d3-geo projections cannot be copied: rebuild the fitted one with a clip extent.
    const clipped = geoConicConformal()
      .parallels(parallels)
      .rotate([-centralMeridian, 0])
      .scale(projection.scale())
      .translate(projection.translate())
      .clipExtent([
        [x0, y0],
        [x1, y1],
      ]);
    geoPath(clipped, context)(object);
    return out.filter((line) => line.length >= 2);
  };
  return {
    board,
    parallels,
    centralMeridian,
    mmPerKm,
    project,
    path: (object) => pathGenerator(object) ?? '',
    lines,
  };
}

/** Great-circle distance in km. */
export function geodesicKm(a: readonly [number, number], b: readonly [number, number]): number {
  return geoDistance([a[0], a[1]], [b[0], b[1]]) * EARTH_RADIUS_KM;
}

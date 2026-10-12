// Map line work for the board: borders as polylines in board mm, each border segment once (a
// laser engraves a doubled line twice), clipped to the board, with holes where text and the
// scale go.
//
// Lines come from topojson meshes, so a border shared by two states is one line. Layers in
// order of priority: region outline (a state), country outline, inner state borders,
// neighbouring countries; a segment already drawn by an earlier layer is dropped later.

import type { MultiLineString, Position } from 'geojson';
import { mesh } from 'topojson-client';
import type { GeometryCollection } from 'topojson-specification';
import type { CountryFile } from '../data';
import type { Point } from '../geometry';
import type { BoardProjection } from '../projection';
import { regionStates, type RegionId } from '../region';

export interface MapLines {
  /** Country and region outline (engraved stronger). */
  readonly strong: Point[][];
  /** Inner borders and neighbouring countries. */
  readonly thin: Point[][];
}

function object(file: CountryFile, name: string): GeometryCollection {
  const o = file.regions.objects[name] as GeometryCollection | undefined;
  if (!o) throw new Error(`country file has no '${name}' layer`);
  return o;
}

/** Region id stored on a topojson geometry (typed differently across the tsconfig projects). */
const idOf = (properties: unknown) => (properties as { id?: string } | null | undefined)?.id;

const key = (a: Position, b: Position) => {
  const p = `${a[0]},${a[1]}`;
  const q = `${b[0]},${b[1]}`;
  return p < q ? `${p}|${q}` : `${q}|${p}`;
};

/** Removes segments already in `seen` and adds the remaining ones. */
function dedupe(lines: MultiLineString, seen: Set<string>): MultiLineString {
  const out: Position[][] = [];
  for (const line of lines.coordinates) {
    let current: Position[] = [];
    for (let i = 1; i < line.length; i++) {
      const k = key(line[i - 1]!, line[i]!);
      if (seen.has(k)) {
        if (current.length >= 2) out.push(current);
        current = [];
        continue;
      }
      seen.add(k);
      if (current.length === 0) current.push(line[i - 1]!);
      current.push(line[i]!);
    }
    if (current.length >= 2) out.push(current);
  }
  return { type: 'MultiLineString', coordinates: out };
}

/** Border lines of the map layers for a region, in board mm, clipped to `clip`. */
export function boardMapLines(
  file: CountryFile,
  region: RegionId,
  projection: BoardProjection,
  clip: readonly [number, number, number, number],
): MapLines {
  const topology = file.regions;
  const states = object(file, 'states');
  const seen = new Set<string>();
  const layers: { geometry: MultiLineString; strong: boolean }[] = [];
  const inside = regionStates(file, region);
  if (inside) {
    const own: GeometryCollection = {
      ...states,
      geometries: states.geometries.filter((g) => inside.includes(idOf(g.properties) ?? '')),
    };
    // Outer boundary only: borders between the states of a union stay thin.
    layers.push({ geometry: mesh(topology, own, (a, b) => a === b), strong: true });
  }
  layers.push({ geometry: mesh(topology, object(file, 'country')), strong: true });
  layers.push({ geometry: mesh(topology, states, (a, b) => a !== b), strong: false });
  layers.push({ geometry: mesh(topology, object(file, 'neighbors')), strong: false });
  const strong: Point[][] = [];
  const thin: Point[][] = [];
  for (const layer of layers) {
    const lines = projection.lines(dedupe(layer.geometry, seen), clip);
    (layer.strong ? strong : thin).push(...lines);
  }
  return { strong, thin };
}

/** Signed area (positive for clockwise rings on a y-down board). */
function signedArea(polygon: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % polygon.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Parameter interval [t0, t1] ⊆ [0, 1] of segment pq inside a convex polygon (Cyrus–Beck). */
function insideInterval(p: Point, q: Point, polygon: readonly Point[]): [number, number] | null {
  const orientation = signedArea(polygon) >= 0 ? 1 : -1;
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]!;
    const [bx, by] = polygon[(i + 1) % polygon.length]!;
    // Inward normal for the polygon's orientation.
    const nx = -(by - ay) * orientation;
    const ny = (bx - ax) * orientation;
    const num = nx * (p[0] - ax) + ny * (p[1] - ay);
    const den = nx * dx + ny * dy;
    if (den === 0) {
      if (num < 0) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  return [t0, t1];
}

/** Polylines minus the interiors of convex polygons (holes for text and the scale). */
export function subtractHoles(lines: readonly Point[][], holes: readonly Point[][]): Point[][] {
  if (holes.length === 0) return lines.map((l) => [...l]);
  const out: Point[][] = [];
  for (const line of lines) {
    let current: Point[] = [];
    const flush = () => {
      if (current.length >= 2) out.push(current);
      current = [];
    };
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1]!;
      const q = line[i]!;
      const cuts: [number, number][] = [];
      for (const hole of holes) {
        const interval = insideInterval(p, q, hole);
        if (interval) cuts.push(interval);
      }
      cuts.sort((a, b) => a[0] - b[0]);
      const at = (t: number): Point => [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      let t = 0;
      for (const [c0, c1] of cuts) {
        if (c0 > t) {
          if (current.length === 0) current.push(at(t));
          current.push(at(c0));
        }
        if (c1 > t) {
          flush();
          t = c1;
        }
      }
      if (t < 1) {
        if (current.length === 0) current.push(at(t));
        current.push(q);
      }
    }
    flush();
  }
  return out;
}

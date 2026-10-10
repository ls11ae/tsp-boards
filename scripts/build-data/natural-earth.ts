// Region outlines from Natural Earth 10m admin-1: the country's states, its outline (dissolved
// states) and neighbouring countries (dissolved, clipped) for context. Neighbours come from the
// same admin-1 file, so all borders share arcs and match exactly.

import type { Feature, FeatureCollection, Geometry } from 'geojson';
import mapshaper from 'mapshaper';
import type { Topology } from 'topojson-specification';
import type { StateInfo } from '../../src/core/data';

interface NeProperties {
  readonly adm0_a3: string;
  readonly iso_3166_2: string;
  readonly gn_a1_code: string | null;
  readonly name: string;
  readonly name_en: string | null;
}

export interface RegionOptions {
  /** Natural Earth adm0_a3 code, e.g. 'DEU'. */
  readonly adm0: string;
  /** Degrees added around the country's bounding box for neighbour context. */
  readonly contextMarginDeg: number;
  /** Visvalingam simplification interval in metres. */
  readonly simplifyMetres: number;
}

export interface RegionResult {
  readonly topology: Topology;
  readonly states: readonly StateInfo[];
  /** GeoNames admin1 code (e.g. '07') -> StateInfo.id (e.g. 'DE-NW'). */
  readonly admin1ToState: ReadonlyMap<string, string>;
  /** [west, south, east, north] of the country. */
  readonly bbox: readonly [number, number, number, number];
}

function bboxOf(features: readonly Feature<Geometry>[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coords: unknown): void => {
    if (typeof (coords as number[])[0] === 'number') {
      const [x, y] = coords as [number, number];
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    } else {
      for (const c of coords as unknown[]) visit(c);
    }
  };
  for (const f of features) {
    if (f.geometry.type === 'GeometryCollection') throw new Error('unexpected GeometryCollection');
    visit(f.geometry.coordinates);
  }
  return [w, s, e, n];
}

function overlaps(a: readonly number[], b: readonly number[]): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

export async function buildRegions(
  admin1: FeatureCollection<Geometry, NeProperties>,
  options: RegionOptions,
): Promise<RegionResult> {
  const own = admin1.features.filter((f) => f.properties.adm0_a3 === options.adm0);
  if (own.length === 0) throw new Error(`no admin-1 features for ${options.adm0}`);
  const bbox = bboxOf(own);
  const m = options.contextMarginDeg;
  const context = [bbox[0] - m, bbox[1] - m, bbox[2] + m, bbox[3] + m];
  const neighbours = admin1.features.filter(
    (f) => f.properties.adm0_a3 !== options.adm0 && overlaps(bboxOf([f]), context),
  );

  const states: StateInfo[] = own
    .map((f) => ({
      id: f.properties.iso_3166_2,
      name: f.properties.name,
      nameEn: f.properties.name_en ?? f.properties.name,
    }))
    .sort((x, y) => x.id.localeCompare(y.id));
  const admin1ToState = new Map<string, string>();
  for (const f of own) {
    const code = f.properties.gn_a1_code?.split('.')[1];
    if (!code) throw new Error(`state ${f.properties.iso_3166_2} has no gn_a1_code`);
    admin1ToState.set(code, f.properties.iso_3166_2);
  }

  const statesInput: FeatureCollection = {
    type: 'FeatureCollection',
    features: own.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: { id: f.properties.iso_3166_2 },
    })),
  };
  const neighboursInput: FeatureCollection = {
    type: 'FeatureCollection',
    features: neighbours.map((f) => ({
      type: 'Feature',
      geometry: f.geometry,
      properties: { id: f.properties.adm0_a3 },
    })),
  };
  const commands = [
    '-i states.json neighbors.json combine-files',
    `-clip bbox=${context.join(',')} target=neighbors`,
    '-dissolve id target=neighbors',
    `-simplify interval=${options.simplifyMetres} keep-shapes`,
    '-dissolve target=states + name=country',
    '-o format=topojson quantization=100000 target=* regions.json',
  ].join(' ');
  const output = await mapshaper.applyCommands(commands, {
    'states.json': statesInput,
    'neighbors.json': neighboursInput,
  });
  const text = output['regions.json'];
  if (typeof text !== 'string' && !(text instanceof Uint8Array))
    throw new Error('mapshaper: no output');
  const topology = JSON.parse(
    typeof text === 'string' ? text : new TextDecoder().decode(text),
  ) as Topology;
  return { topology, states, admin1ToState, bbox };
}

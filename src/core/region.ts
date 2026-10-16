// Regions (a country, one of its states or a union of states) and the city pool inside them.

import type { Feature, FeatureCollection, Geometry, MultiLineString, Position } from 'geojson';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon } from 'topojson-specification';
import { citiesFromColumns, type City, type CountryFile } from './data';
import type { Point } from './geometry';
import type { Sphere } from './instance';
import type { GeoPermissibleObjects } from 'd3-geo';
import type { BoardProjection, ProjectionKind } from './projection';

/**
 * Region id: the country code ('DE'), a state id ('DE-NW') or a union of states, the state
 * codes sorted and joined by '+' ('DE-BB+BE').
 */
export type RegionId = string;

export const REGION_ID_PATTERN = /^[A-Z]{2}(-[A-Z0-9]{1,3}(\+[A-Z0-9]{1,3})*)?$/;

export interface RegionInfo {
  readonly id: RegionId;
  readonly name: string;
  readonly nameEn: string;
  /** 'multi': several states (e.g. Northern Germany), 'state': one state or a city-state with
   * its surrounding state. */
  readonly kind: 'country' | 'multi' | 'state';
}

interface NamedRegion {
  readonly states: readonly string[];
  readonly name: string;
  readonly nameEn: string;
  readonly kind: 'multi' | 'state';
}

/**
 * Unions of states with a name. City-states have one or two towns (one place per
 * municipality), so they come with their surrounding state (roadmap 5.6); the same holds for
 * Vienna, Basel-Stadt and the two Appenzell.
 */
const NAMED_REGIONS: Readonly<Record<string, readonly NamedRegion[]>> = {
  DE: [
    {
      states: ['BB', 'BE'],
      name: 'Berlin und Brandenburg',
      nameEn: 'Berlin and Brandenburg',
      kind: 'state',
    },
    {
      states: ['HB', 'NI'],
      name: 'Bremen und Niedersachsen',
      nameEn: 'Bremen and Lower Saxony',
      kind: 'state',
    },
    {
      states: ['HH', 'SH'],
      name: 'Hamburg und Schleswig-Holstein',
      nameEn: 'Hamburg and Schleswig-Holstein',
      kind: 'state',
    },
    {
      states: ['RP', 'SL'],
      name: 'Rheinland-Pfalz und Saarland',
      nameEn: 'Rhineland-Palatinate and Saarland',
      kind: 'state',
    },
    {
      states: ['HB', 'HH', 'MV', 'NI', 'SH'],
      name: 'Norddeutschland',
      nameEn: 'Northern Germany',
      kind: 'multi',
    },
    {
      states: ['BB', 'BE', 'MV', 'SN', 'ST', 'TH'],
      name: 'Ostdeutschland',
      nameEn: 'Eastern Germany',
      kind: 'multi',
    },
    {
      states: ['SN', 'ST', 'TH'],
      name: 'Mitteldeutschland',
      nameEn: 'Central Germany',
      kind: 'multi',
    },
    { states: ['BW', 'BY'], name: 'Süddeutschland', nameEn: 'Southern Germany', kind: 'multi' },
  ],
  // Vienna with the state around it; the NUTS 1 regions.
  AT: [
    {
      states: ['3', '9'],
      name: 'Wien und Niederösterreich',
      nameEn: 'Vienna and Lower Austria',
      kind: 'state',
    },
    { states: ['1', '3', '9'], name: 'Ostösterreich', nameEn: 'Eastern Austria', kind: 'multi' },
    { states: ['2', '6'], name: 'Südösterreich', nameEn: 'Southern Austria', kind: 'multi' },
    {
      states: ['4', '5', '7', '8'],
      name: 'Westösterreich',
      nameEn: 'Western Austria',
      kind: 'multi',
    },
  ],
  // The two Basel and the two Appenzell; the seven statistical major regions (Grossregionen,
  // Zurich and Ticino are single cantons).
  CH: [
    {
      states: ['BL', 'BS'],
      name: 'Basel-Stadt und Basel-Landschaft',
      nameEn: 'Basel-Stadt and Basel-Landschaft',
      kind: 'state',
    },
    {
      states: ['AI', 'AR'],
      name: 'Appenzell (beide Halbkantone)',
      nameEn: 'Appenzell (both half-cantons)',
      kind: 'state',
    },
    {
      states: ['GE', 'VD', 'VS'],
      name: 'Genferseeregion',
      nameEn: 'Lake Geneva Region',
      kind: 'multi',
    },
    {
      states: ['BE', 'FR', 'JU', 'NE', 'SO'],
      name: 'Espace Mittelland',
      nameEn: 'Espace Mittelland',
      kind: 'multi',
    },
    {
      states: ['AG', 'BL', 'BS'],
      name: 'Nordwestschweiz',
      nameEn: 'Northwestern Switzerland',
      kind: 'multi',
    },
    {
      states: ['AI', 'AR', 'GL', 'GR', 'SG', 'SH', 'TG'],
      name: 'Ostschweiz',
      nameEn: 'Eastern Switzerland',
      kind: 'multi',
    },
    {
      states: ['LU', 'NW', 'OW', 'SZ', 'UR', 'ZG'],
      name: 'Zentralschweiz',
      nameEn: 'Central Switzerland',
      kind: 'multi',
    },
  ],
  // The NUTS 1 regions.
  NL: [
    {
      states: ['DR', 'FR', 'GR'],
      name: 'Noord-Nederland',
      nameEn: 'Northern Netherlands',
      kind: 'multi',
    },
    {
      states: ['FL', 'GE', 'OV'],
      name: 'Oost-Nederland',
      nameEn: 'Eastern Netherlands',
      kind: 'multi',
    },
    {
      states: ['NH', 'UT', 'ZE', 'ZH'],
      name: 'West-Nederland',
      nameEn: 'Western Netherlands',
      kind: 'multi',
    },
    { states: ['LI', 'NB'], name: 'Zuid-Nederland', nameEn: 'Southern Netherlands', kind: 'multi' },
  ],
  // Europe (roadmap 8.1): its "states" are countries.
  EU: [
    { states: ['AT', 'CH', 'DE', 'LI'], name: 'DACH', nameEn: 'DACH', kind: 'multi' },
    { states: ['BE', 'LU', 'NL'], name: 'Benelux', nameEn: 'Benelux', kind: 'multi' },
    { states: ['GB', 'IE'], name: 'Britische Inseln', nameEn: 'British Isles', kind: 'multi' },
    {
      states: ['AD', 'ES', 'PT'],
      name: 'Iberische Halbinsel',
      nameEn: 'Iberian Peninsula',
      kind: 'multi',
    },
    { states: ['DK', 'NO', 'SE'], name: 'Skandinavien', nameEn: 'Scandinavia', kind: 'multi' },
    {
      states: ['DK', 'FI', 'IS', 'NO', 'SE'],
      name: 'Nordeuropa',
      nameEn: 'Nordic countries',
      kind: 'multi',
    },
    { states: ['EE', 'LT', 'LV'], name: 'Baltikum', nameEn: 'Baltic states', kind: 'multi' },
    {
      states: ['AT', 'CH', 'CZ', 'DE', 'HU', 'LI', 'PL', 'SI', 'SK'],
      name: 'Mitteleuropa',
      nameEn: 'Central Europe',
      kind: 'multi',
    },
    {
      states: ['AL', 'BA', 'ME', 'MK', 'RS', 'XK'],
      name: 'Westbalkan',
      nameEn: 'Western Balkans',
      kind: 'multi',
    },
    {
      states: ['CY', 'ES', 'FR', 'GR', 'HR', 'IT', 'MT', 'PT', 'SI'],
      name: 'Mittelmeerländer der EU',
      nameEn: 'Mediterranean EU countries',
      kind: 'multi',
    },
    {
      states: [
        'AT',
        'BE',
        'BG',
        'CY',
        'CZ',
        'DE',
        'DK',
        'EE',
        'ES',
        'FI',
        'FR',
        'GR',
        'HR',
        'HU',
        'IE',
        'IT',
        'LT',
        'LU',
        'LV',
        'MT',
        'NL',
        'PL',
        'PT',
        'RO',
        'SE',
        'SI',
        'SK',
      ],
      name: 'Europäische Union',
      nameEn: 'European Union',
      kind: 'multi',
    },
  ],
  // The world (roadmap 8.2): its "states" are continents.
  WO: [
    { states: ['NA', 'SA'], name: 'Amerika', nameEn: 'The Americas', kind: 'multi' },
    { states: ['AS', 'EU'], name: 'Eurasien', nameEn: 'Eurasia', kind: 'multi' },
    { states: ['AF', 'EU'], name: 'Europa und Afrika', nameEn: 'Europe and Africa', kind: 'multi' },
    { states: ['AS', 'OC'], name: 'Asien und Ozeanien', nameEn: 'Asia and Oceania', kind: 'multi' },
  ],
};

/** Id of the union of the given states (ISO codes such as 'DE-BE'). */
export function unionId(country: string, states: readonly string[]): RegionId {
  const codes = [...new Set(states.map((s) => s.slice(country.length + 1)))].sort();
  return `${country}-${codes.join('+')}`;
}

/** State ids of a region; null for the whole country. Throws for an unknown region. */
export function regionStates(file: CountryFile, id: RegionId): string[] | null {
  if (id === file.country) return null;
  const [country, codes] = id.split('-');
  const known = new Set(file.states.map((s) => s.id));
  const states = (codes ?? '').split('+').map((c) => `${country}-${c}`);
  if (country !== file.country || !states.every((s) => known.has(s)))
    throw new Error(`unknown region ${id}`);
  return states;
}

/** Name of any region, also of unions without a name of their own ('A + B'). */
export function regionInfo(file: CountryFile, id: RegionId): RegionInfo {
  const states = regionStates(file, id);
  if (!states) return { id, name: file.name.de, nameEn: file.name.en, kind: 'country' };
  const named = (NAMED_REGIONS[file.country] ?? []).find(
    (r) =>
      unionId(
        file.country,
        r.states.map((s) => `${file.country}-${s}`),
      ) === id,
  );
  if (named) return { id, name: named.name, nameEn: named.nameEn, kind: named.kind };
  const infos = states.map((s) => file.states.find((x) => x.id === s)!);
  return {
    id,
    name: infos.map((s) => s.name).join(' + '),
    nameEn: infos.map((s) => s.nameEn).join(' + '),
    kind: states.length === 1 ? 'state' : 'multi',
  };
}

/** All regions: the country, the named unions of states, and every state. */
export function regionsOf(file: CountryFile): RegionInfo[] {
  const unions = (NAMED_REGIONS[file.country] ?? []).map((r) =>
    regionInfo(
      file,
      unionId(
        file.country,
        r.states.map((s) => `${file.country}-${s}`),
      ),
    ),
  );
  return [
    regionInfo(file, file.country),
    ...unions,
    ...file.states.map((s): RegionInfo => ({
      id: s.id,
      name: s.name,
      nameEn: s.nameEn,
      kind: 'state',
    })),
  ];
}

function layer(
  file: CountryFile,
  name: 'country' | 'states' | 'neighbors',
): FeatureCollection<Geometry> {
  const object = file.regions.objects[name] as GeometryCollection | undefined;
  if (!object) throw new Error(`country file has no '${name}' layer`);
  return feature(file.regions, object);
}

/** Outline of the region (the dissolved country, one state, or the dissolved states). */
export function regionOutline(file: CountryFile, id: RegionId): Feature<Geometry> {
  const states = regionStates(file, id);
  if (!states) {
    const country = layer(file, 'country').features[0];
    if (!country) throw new Error('empty country layer');
    return country;
  }
  // Geometries of the states layer, in the order of its features (which carry the ids).
  const object = file.regions.objects.states as GeometryCollection | undefined;
  const features = layer(file, 'states').features;
  const geometries = (object?.geometries ?? []).filter((_, i) =>
    states.includes(String(features[i]?.properties?.id)),
  ) as (Polygon | MultiPolygon)[];
  if (geometries.length !== states.length) throw new Error(`unknown region ${id}`);
  if (geometries.length === 1) {
    return features.find((f) => f.properties?.id === id)!;
  }
  return { type: 'Feature', properties: { id }, geometry: merge(file.regions, geometries) };
}

/**
 * Drops segments along the edges of the layer's bounding box in longitude and latitude: the
 * data build clips neighbouring countries (and continents) to a box, and its edges are no
 * borders (a straight line through Sweden or Russia on a tall board).
 */
export function withoutBoxEdges(lines: MultiLineString): MultiLineString {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of lines.coordinates) {
    for (const [x, y] of line) {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    }
  }
  const eps = 1e-6;
  const onEdge = (a: Position, b: Position) =>
    (Math.abs(a[0]! - b[0]!) < eps && (Math.abs(a[0]! - w) < eps || Math.abs(a[0]! - e) < eps)) ||
    (Math.abs(a[1]! - b[1]!) < eps && (Math.abs(a[1]! - s) < eps || Math.abs(a[1]! - n) < eps));
  const out: Position[][] = [];
  for (const line of lines.coordinates) {
    let current: Position[] = [];
    for (let i = 1; i < line.length; i++) {
      if (onEdge(line[i - 1]!, line[i]!)) {
        if (current.length >= 2) out.push(current);
        current = [];
        continue;
      }
      if (current.length === 0) current.push(line[i - 1]!);
      current.push(line[i]!);
    }
    if (current.length >= 2) out.push(current);
  }
  return { type: 'MultiLineString', coordinates: out };
}

/**
 * Border lines of the map layers for the screen, without the edges of the data's clip box: the
 * country outline (coasts and outer borders), the borders between its states, and the
 * neighbouring countries. The layers' areas are filled without a stroke.
 */
export interface MapLines {
  readonly country: MultiLineString;
  readonly states: MultiLineString;
  readonly neighbors: MultiLineString;
}

export function mapLines(file: CountryFile): MapLines {
  const object = (name: 'country' | 'states' | 'neighbors') => {
    const o = file.regions.objects[name] as GeometryCollection | undefined;
    if (!o) throw new Error(`country file has no '${name}' layer`);
    return o;
  };
  return {
    country: withoutBoxEdges(mesh(file.regions, object('country'))),
    states: withoutBoxEdges(mesh(file.regions, object('states'), (a, b) => a !== b)),
    neighbors: withoutBoxEdges(mesh(file.regions, object('neighbors'))),
  };
}

/** The rings of an area as lines, without the edges of the data's clip box. */
export function outlineLines(area: Feature<Geometry>): MultiLineString {
  const g = area.geometry;
  const rings: Position[][] =
    g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  return withoutBoxEdges({ type: 'MultiLineString', coordinates: rings });
}

export interface MapLayers {
  readonly country: FeatureCollection<Geometry>;
  readonly states: FeatureCollection<Geometry>;
  readonly neighbors: FeatureCollection<Geometry>;
}

export function mapLayers(file: CountryFile): MapLayers {
  return {
    country: layer(file, 'country'),
    states: layer(file, 'states'),
    neighbors: layer(file, 'neighbors'),
  };
}

export interface PoolOptions {
  readonly minPopulation: number;
  readonly excluded?: ReadonlySet<number>;
}

/** Cities of the region with at least the minimum population, sorted by population. */
export function cityPool(file: CountryFile, id: RegionId, options: PoolOptions): City[] {
  const states = regionStates(file, id);
  const inside = states ? new Set(states) : null;
  return citiesFromColumns(file.cities, file.states).filter(
    (c) =>
      (!inside || inside.has(c.state)) &&
      c.pop >= options.minPopulation &&
      !options.excluded?.has(c.id),
  );
}

/**
 * Board coordinates (mm) of cities. A composite place lies at the mean of its members'
 * board points, so it is between them on the board.
 */
export function boardPoints(cities: readonly City[], projection: BoardProjection): Point[] {
  return cities.map((c): Point => {
    if (!c.members || c.members.length === 0) return projection.project(c.lon, c.lat);
    const points = c.members.map((m) => projection.project(m.lon, m.lat));
    return [
      points.reduce((s, p) => s + p[0], 0) / points.length,
      points.reduce((s, p) => s + p[1], 0) / points.length,
    ];
  });
}

/** The map projection of a data file: Equal Earth for the world (sphere), else conic conformal. */
export function projectionKind(file: CountryFile): ProjectionKind {
  return file.metric === 'sphere' ? 'equal-earth' : 'conformal';
}

/**
 * Positions for great-circle distances on a world file (null on the plane): each city's
 * longitude and latitude (a composite place's centre) and the map scale.
 */
export function citySphere(
  file: CountryFile,
  cities: readonly City[],
  projection: BoardProjection,
): Sphere | null {
  return file.metric === 'sphere'
    ? { lonLat: cities.map((c): Point => [c.lon, c.lat]), mmPerKm: projection.mmPerKm }
    : null;
}

/**
 * What the board projection is fitted to: the region's outline, or for the whole world the
 * full outline of the Equal Earth map (the sphere), so that great-circle legs near the poles
 * and the map's edges stay on the board.
 */
export function regionFrame(file: CountryFile, id: RegionId): GeoPermissibleObjects {
  return file.metric === 'sphere' && id === file.country
    ? { type: 'Sphere' }
    : regionOutline(file, id);
}

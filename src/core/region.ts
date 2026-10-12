// Regions (a country, one of its states or a union of states) and the city pool inside them.

import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon } from 'topojson-specification';
import { citiesFromColumns, type City, type CountryFile } from './data';
import type { Point } from './geometry';
import type { BoardProjection } from './projection';

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
 * municipality), so they come with their surrounding state (roadmap 5.6).
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

/** Board coordinates (mm) of cities. */
export function boardPoints(cities: readonly City[], projection: BoardProjection): Point[] {
  return cities.map((c) => projection.project(c.lon, c.lat));
}

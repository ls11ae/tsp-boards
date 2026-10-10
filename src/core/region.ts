// Regions (a country or one of its states) and the city pool inside them.

import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection } from 'topojson-specification';
import { citiesFromColumns, type City, type CountryFile } from './data';
import type { Point } from './geometry';
import type { BoardProjection } from './projection';

/** Region id: the country code ('DE') or a state id ('DE-NW'). */
export type RegionId = string;

export interface RegionInfo {
  readonly id: RegionId;
  readonly name: string;
  readonly nameEn: string;
}

export function regionsOf(file: CountryFile): RegionInfo[] {
  return [
    { id: file.country, name: file.name.de, nameEn: file.name.en },
    ...file.states.map((s) => ({ id: s.id, name: s.name, nameEn: s.nameEn })),
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

/** Outline of the region (the dissolved country or one state). */
export function regionOutline(file: CountryFile, id: RegionId): Feature<Geometry> {
  if (id === file.country) {
    const country = layer(file, 'country').features[0];
    if (!country) throw new Error('empty country layer');
    return country;
  }
  const state = layer(file, 'states').features.find((f) => f.properties?.id === id);
  if (!state) throw new Error(`unknown region ${id}`);
  return state;
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
  return citiesFromColumns(file.cities, file.states).filter(
    (c) =>
      (id === file.country || c.state === id) &&
      c.pop >= options.minPopulation &&
      !options.excluded?.has(c.id),
  );
}

/** Board coordinates (mm) of cities. */
export function boardPoints(cities: readonly City[], projection: BoardProjection): Point[] {
  return cities.map((c) => projection.project(c.lon, c.lat));
}

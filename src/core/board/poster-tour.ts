// The round trip of a poster (roadmap 9.7): the stops (a composite place as one stop at its
// centroid, or its members as separate stops), the exact shortest round trip by great-circle
// distance ("Luftlinie") with the runner-up, and a check that the optimum on the flat map (the
// one the app judges digital puzzles against) is the same round trip.

import type { City } from '../data';
import { greatCircleKm, type Point } from '../geometry';
import { Instance } from '../instance';
import type { BoardProjection } from '../projection';
import { optimalAndSecond, type MipBackend } from '../tsp/exact';

export type MembersMode = 'centroid' | 'separate';

export interface PosterStop {
  /** Label on the map. */
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** Marked place (a ring, as on the board). */
  readonly highlight: boolean;
  /** Index of the place in the puzzle's place list (logos refer to it). */
  readonly place: number;
  /** Name of the alliance if this stop is one member of a composite place. */
  readonly group: string | null;
  /** Members of a composite place drawn as one stop at their centroid (names as labels). */
  readonly members:
    readonly { readonly name: string; readonly lat: number; readonly lon: number }[] | null;
}

/**
 * Stops from the puzzle's places (slot order). `label` gives a member's label (e.g. the short
 * town label); members keep their own names otherwise.
 */
export function posterStops(
  cities: readonly City[],
  mode: MembersMode,
  label: (cityLabel: string, member: boolean) => string = (name) => name,
): PosterStop[] {
  return cities.flatMap((c, place): PosterStop[] => {
    const highlight = c.highlight === true;
    if (c.members && c.members.length >= 2) {
      if (mode === 'separate') {
        return c.members.map((m) => ({
          name: label(m.name, true),
          lat: m.lat,
          lon: m.lon,
          highlight,
          place,
          group: c.name,
          members: null,
        }));
      }
      return [
        {
          name: label(c.label, false),
          lat: c.lat,
          lon: c.lon,
          highlight,
          place,
          group: null,
          members: c.members.map((m) => ({ name: label(m.name, true), lat: m.lat, lon: m.lon })),
        },
      ];
    }
    return [
      {
        name: label(c.label, false),
        lat: c.lat,
        lon: c.lon,
        highlight,
        place,
        group: null,
        members: null,
      },
    ];
  });
}

/** Map points of the stops: a composite stop at the mean of its members' points, as on boards. */
export function stopPoints(stops: readonly PosterStop[], projection: BoardProjection): Point[] {
  return stops.map((s): Point => {
    if (!s.members) return projection.project(s.lon, s.lat);
    const pts = s.members.map((m) => projection.project(m.lon, m.lat));
    return [
      pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
      pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
    ];
  });
}

export interface PosterTour {
  /** Shortest round trip by great-circle distance (stop indices). */
  readonly tour: readonly number[];
  readonly lengthKm: number;
  /** How much longer the second-shortest round trip is, km (null if there is none). */
  readonly secondKm: number | null;
  /** The optimum on the flat map is the same round trip. */
  readonly mapAgrees: boolean;
  /** The optimum on the flat map, and its great-circle length in km. */
  readonly mapTour: readonly number[];
  readonly mapTourKm: number;
}

/**
 * The tour rotated to start at a place (roadmap 9.9: "start and finish" at the emphasized
 * place): at its stop, or with separate members at the member where the tour enters the group.
 */
export function startAtPlace(
  stops: readonly PosterStop[],
  tour: readonly number[],
  place: number,
): number[] {
  const n = tour.length;
  const at = (i: number) => stops[tour[(i + n) % n]!]!.place === place;
  const first = tour.findIndex((_, i) => at(i) && !at(i - 1));
  const start = first >= 0 ? first : tour.findIndex((_, i) => at(i));
  if (start < 0) return [...tour];
  return [...tour.slice(start), ...tour.slice(0, start)];
}

/** A tour as a canonical string (rotation and direction removed). */
export function tourKey(tour: readonly number[]): string {
  const n = tour.length;
  if (n === 0) return '';
  const at = tour.indexOf(Math.min(...tour));
  const r = [...tour.slice(at), ...tour.slice(0, at)];
  const reversed = [r[0]!, ...r.slice(1).reverse()];
  return (n > 2 && r[1]! > r[n - 1]! ? reversed : r).join(',');
}

/** Great-circle length of a closed tour, km. */
export function sphereLengthKm(
  stops: readonly { readonly lat: number; readonly lon: number }[],
  tour: readonly number[],
): number {
  let km = 0;
  for (let i = 0; i < tour.length; i++) {
    const a = stops[tour[i]!]!;
    const b = stops[tour[(i + 1) % tour.length]!]!;
    km += greatCircleKm([a.lon, a.lat], [b.lon, b.lat]);
  }
  return km;
}

/**
 * The exact great-circle optimum and runner-up of the stops (distances in metres, so the
 * solver's integer costs are exact to the metre), and the optimum on the flat map at the given
 * map points for comparison.
 */
export function posterTour(
  backend: MipBackend,
  stops: readonly PosterStop[],
  mapPoints: readonly Point[],
): PosterTour {
  const n = stops.length;
  if (n < 3) throw new Error('a round trip needs at least three stops');
  const lonLat = stops.map((s): Point => [s.lon, s.lat]);
  // Board units are mm and costs µm: 1 mm per km makes the costs metres.
  const sphere = new Instance(mapPoints, 0, { lonLat, mmPerKm: 1 });
  const ranked = optimalAndSecond(backend, sphere, 'euclidean');
  const best = ranked.optimal;
  if (best.status !== 'optimal' || !best.tour) throw new Error('no optimal round trip found');
  const second = ranked.second?.status === 'optimal' ? ranked.second : null;
  const flat = optimalAndSecond(backend, new Instance(mapPoints, 0), 'euclidean').optimal;
  if (flat.status !== 'optimal' || !flat.tour) throw new Error('no optimum on the map');
  return {
    tour: best.tour,
    lengthKm: sphereLengthKm(stops, best.tour),
    secondKm: second ? (second.cost - best.cost) / 1000 : null,
    mapAgrees: tourKey(flat.tour) === tourKey(best.tour),
    mapTour: flat.tour,
    mapTourKm: sphereLengthKm(stops, flat.tour),
  };
}

/** (n − 1)!/2 round trips through n stops: exactly below a million, else as m · 10^e. */
export function possibleTours(n: number): {
  readonly exact: number | null;
  readonly mantissa: number;
  readonly exponent: number;
} {
  if (n < 3) return { exact: 1, mantissa: 1, exponent: 0 };
  let log = -Math.log10(2);
  for (let k = 2; k < n; k++) log += Math.log10(k);
  let exponent = Math.floor(log);
  let mantissa = Math.round(10 ** (log - exponent) * 10) / 10;
  if (mantissa >= 10) {
    mantissa = 1;
    exponent += 1;
  }
  const exact = log < 6 ? Math.round(10 ** log) : null;
  return { exact, mantissa, exponent };
}

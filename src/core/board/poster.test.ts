import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { citiesFromColumns, parseCountryFile, type City } from '../data';
import type { Point } from '../geometry';
import { Instance } from '../instance';
import { listCities } from '../places';
import { boardProjection } from '../projection';
import { parsePuzzleDoc } from '../puzzle-file';
import { projectionKind, regionFrame } from '../region';
import { Rng } from '../rng';
import { allTours } from '../tsp/brute-force';
import type { MipBackend } from '../tsp/exact';
import { DIN_PAPERS, DIN_SIZES, pageSize } from './paper';
import { drawPoster, posterPdf, posterSvg, roundedHull } from './poster';
import {
  possibleTours,
  posterStops,
  posterTour,
  sphereLengthKm,
  stopPoints,
  tourKey,
  type PosterStop,
} from './poster-tour';
import { pathBounds } from './shapes';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const de = parseCountryFile(
  JSON.parse(readFileSync(path.join(ROOT, 'public/data/countries/de.json'), 'utf8')),
);
const towns = new Map(citiesFromColumns(de.cities, de.states).map((c) => [c.id, c]));

function puzzleCities(id: string): { cities: City[]; region: string } {
  const doc = parsePuzzleDoc(
    JSON.parse(readFileSync(path.join(ROOT, `public/puzzles/${id}.tsp.json`), 'utf8')),
  );
  return { cities: listCities(doc.map!.places, towns), region: doc.map!.params.region };
}

const projection = boardProjection(
  regionFrame(de, 'DE'),
  { widthMm: 600, heightMm: 800, marginMm: 30 },
  projectionKind(de),
);

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

describe('poster paper', () => {
  it('has the ISO 216 sizes in both orientations', () => {
    expect(DIN_SIZES).toEqual({
      A0: [841, 1189],
      A1: [594, 841],
      A2: [420, 594],
      A3: [297, 420],
      A4: [210, 297],
    });
    for (const p of DIN_PAPERS) {
      const [w, h] = pageSize(p, 'portrait');
      expect(pageSize(p, 'landscape')).toEqual([h, w]);
      // Each size is half the next larger one (within the rounding of ISO 216).
      expect(
        Math.abs(w * h - (DIN_SIZES.A0[0] * DIN_SIZES.A0[1]) / 2 ** Number(p[1])),
      ).toBeLessThan(0.02 * w * h);
    }
  });
});

describe('poster round trip', () => {
  it('is the exact great-circle optimum with the runner-up (brute force)', () => {
    const rng = new Rng(5);
    for (let trial = 0; trial < 3; trial++) {
      const stops: PosterStop[] = Array.from({ length: 8 }, (_, i) => ({
        name: `P${i}`,
        lat: 47.5 + rng.float() * 7,
        lon: 6 + rng.float() * 9,
        highlight: false,
        place: i,
        group: null,
        members: null,
      }));
      const points = stopPoints(stops, projection);
      const tour = posterTour(backend, stops, points);
      const sphere = new Instance(points, 0, {
        lonLat: stops.map((s): Point => [s.lon, s.lat]),
        mmPerKm: 1,
      });
      const ranked = allTours(sphere);
      expect(tourKey(tour.tour)).toBe(tourKey(ranked[0]!.tour));
      expect(tour.lengthKm).toBeCloseTo(ranked[0]!.length / 1000, 2);
      expect(tour.secondKm!).toBeCloseTo((ranked[1]!.length - ranked[0]!.length) / 1000, 3);
      const flat = allTours(new Instance(points, 0));
      expect(tourKey(tour.mapTour)).toBe(tourKey(flat[0]!.tour));
      expect(tour.mapAgrees).toBe(tourKey(flat[0]!.tour) === tourKey(ranked[0]!.tour));
    }
  });

  it('gives the figures of the Universities of Excellence (Kevin’s check, 9.7)', () => {
    const { cities } = puzzleCities('exzellenzuniversitaeten-2027');
    const stops = posterStops(cities, 'centroid');
    const tour = posterTour(backend, stops, stopPoints(stops, projection));
    expect(stops).toHaveLength(14);
    expect(Math.round(tour.lengthKm)).toBe(2039);
    expect(tour.secondKm!).toBeGreaterThan(3.3);
    expect(tour.secondKm!).toBeLessThan(3.6);
    expect(tour.mapAgrees).toBe(true);
    // The length is the sum of great-circle legs.
    expect(sphereLengthKm(stops, tour.tour)).toBeCloseTo(tour.lengthKm, 6);
    const separate = posterStops(cities, 'separate');
    expect(separate).toHaveLength(17);
    expect(separate.filter((s) => s.group === 'Ruhr Innovation Lab').map((s) => s.name)).toEqual([
      'Bochum',
      'Dortmund',
    ]);
    const t17 = posterTour(backend, separate, stopPoints(separate, projection));
    expect(Math.round(t17.lengthKm)).toBe(2078);
  });

  it('counts the possible round trips', () => {
    expect(possibleTours(5)).toEqual({ exact: 12, mantissa: 1.2, exponent: 1 });
    expect(possibleTours(10).exact).toBe(181_440);
    const t14 = possibleTours(14);
    expect([t14.exact, t14.mantissa, t14.exponent]).toEqual([null, 3.1, 9]);
    const t25 = possibleTours(25);
    expect([t25.mantissa, t25.exponent]).toEqual([3.1, 23]);
    const t37 = possibleTours(37);
    expect([t37.mantissa, t37.exponent]).toEqual([1.9, 41]);
  });
});

describe('poster drawing', () => {
  const { cities, region } = puzzleCities('exzellenzstrategie-2027-brett');
  const stops = posterStops(cities, 'separate');
  let tour: ReturnType<typeof posterTour>;
  beforeAll(() => {
    tour = posterTour(backend, stops, stopPoints(stops, projection));
  });

  it('fits every DIN size and orientation, with the page size in the PDF', () => {
    for (const paper of DIN_PAPERS) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        const d = drawPoster({
          file: de,
          region,
          stops,
          tour,
          title: 'Die kürzeste Rundreise durch Deutschlands Exzellenz',
          subtitle: 'Test',
          paper,
          orientation,
          language: 'de',
          legend: [{ symbol: 'ring', text: 'Exzellenzuniversität' }],
        });
        const [w, h] = pageSize(paper, orientation);
        expect([d.width, d.height]).toEqual([w, h]);
        // Everything inside the page with a margin of at least 10 mm (no bleed).
        for (const item of d.items) {
          const b = pathBounds(item.path);
          if (!b) continue;
          const pad = item.stroke ? item.stroke.width / 2 + 0.01 : 0.01;
          expect(b[0] - pad).toBeGreaterThanOrEqual(10 - 1e-6);
          expect(b[1] - pad).toBeGreaterThanOrEqual(10 - 1e-6);
          expect(b[2] + pad).toBeLessThanOrEqual(w - 10 + 1e-6);
          expect(b[3] + pad).toBeLessThanOrEqual(h - 10 + 1e-6);
        }
        const pdf = new TextDecoder('latin1').decode(posterPdf(d));
        const pt = (mm: number) => Number((mm * (72 / 25.4)).toFixed(3));
        expect(pdf).toContain(`/MediaBox [0 0 ${pt(w)} ${pt(h)}]`);
        expect(posterSvg(d)).toContain(`viewBox="0 0 ${w} ${h}"`);
      }
    }
  });

  it('draws the optimal round trip', () => {
    const d = drawPoster({
      file: de,
      region,
      stops,
      tour,
      title: 'T',
      subtitle: '',
      paper: 'A1',
      orientation: 'portrait',
      language: 'de',
      legend: [],
    });
    // The tour is the only closed stroke in the tour colour with the tour's width.
    const tourItems = d.items.filter(
      (i) => i.stroke && i.stroke.color[0] > 0.7 && i.stroke.color[1] < 0.3 && i.stroke.width > 2,
    );
    expect(tourItems).toHaveLength(1);
    const vertices = tourItems[0]!.path.filter((c) => c[0] === 'M' || c[0] === 'L');
    // A closed polyline through every stop once.
    expect(vertices).toHaveLength(stops.length);
    expect(tourItems[0]!.path.at(-1)![0]).toBe('Z');
    expect(d.unplacedLabels).toBe(0);
  });

  it('draws a group around the members of an alliance', () => {
    const pts: Point[] = [
      [0, 0],
      [10, 0],
      [4, 6],
    ];
    const b = pathBounds(roundedHull(pts, 2))!;
    expect(b[0]).toBeCloseTo(-2, 1);
    expect(b[2]).toBeCloseTo(12, 1);
    expect(b[1]).toBeCloseTo(-2, 1);
    expect(b[3]).toBeCloseTo(8, 1);
    const two = pathBounds(
      roundedHull(
        [
          [0, 0],
          [10, 0],
        ],
        3,
      ),
    )!;
    expect(two.map((v) => Math.round(v))).toEqual([-3, -3, 13, 3]);
  });
});

describe('repository', () => {
  it('holds no logo files (usage rights: logos stay in the git-ignored local/)', () => {
    let files: string[];
    try {
      files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
    } catch {
      return; // not a git checkout
    }
    expect(files.filter((f) => f.startsWith('local/'))).toEqual([]);
    expect(files.filter((f) => /ruhr-innovation-lab|-logo[.-]/i.test(f))).toEqual([]);
  });
});

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
import {
  CORNER_CLEAR,
  NEUTRAL_COLORS,
  drawPoster,
  legendEntries,
  posterPdf,
  posterSizes,
  posterSvg,
  problemRuns,
  roundedHull,
  runsText,
  segmentMeetsBox,
  type PosterInput,
  type PosterTheme,
} from './poster';
import { parseSvgColorLogo } from './logo-color';
import type { Rgb } from './pdf';
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

describe('Ruhr Innovation Lab poster (roadmap 9.9)', () => {
  const all = puzzleCities('exzellenzstrategie-2027');
  const doc = parsePuzzleDoc(
    JSON.parse(
      readFileSync(path.join(ROOT, 'public/puzzles/exzellenzstrategie-2027.tsp.json'), 'utf8'),
    ),
  );
  const ril = doc.map!.places.findIndex((p) => p.name === 'Ruhr Innovation Lab');
  // A plain rectangle stands in for the logo (logos never enter the repository).
  const logo = {
    path: [['M', 0, 0], ['L', 200, 0], ['L', 200, 100], ['L', 0, 100], ['Z']] as const,
    box: [0, 0, 200, 100] as const,
  };
  const variants = (['centroid', 'separate'] as const).map((mode) => {
    const stops = posterStops(all.cities, mode);
    return { mode, stops, tour: null as ReturnType<typeof posterTour> | null };
  });
  beforeAll(() => {
    for (const v of variants)
      v.tour = posterTour(backend, v.stops, stopPoints(v.stops, projection));
  });
  const input = (v: (typeof variants)[number], over: Partial<PosterInput> = {}): PosterInput => ({
    file: de,
    region: 'DE',
    stops: v.stops,
    tour: v.tour!,
    title: 'Vom Ruhr Innovation Lab durch Deutschlands Exzellenz',
    subtitle: 'Alle Standorte der Exzellenzstrategie 2026–2033',
    paper: 'A1',
    orientation: 'portrait',
    language: 'de',
    legend: [
      { symbol: 'none', text: 'Förderung …' },
      { symbol: 'ring', text: 'Exzellenzuniversität' },
    ],
    emphasis: { place: ril, logo: null },
    ...over,
  });

  it('keeps every label off the legs, in both languages, on A1 and A0', () => {
    for (const v of variants)
      for (const language of ['de', 'en'] as const)
        for (const paper of ['A1', 'A0'] as const) {
          const d = drawPoster(input(v, { language, paper }));
          expect(d.unplacedLabels).toBe(0);
          for (const b of d.labelBoxes)
            for (const [a, c] of d.legs) expect(segmentMeetsBox(a, c, b)).toBe(false);
          // Places, the two named cities of the RIL (or its members as stops) and the names
          // of the groups.
          expect(d.labelBoxes).toHaveLength(v.mode === 'centroid' ? 34 - 1 + 2 + 1 : 37 + 2);
        }
  });

  it('keeps every label clearly at its own dot (roadmap 9.11)', () => {
    // Kevin's case: under the TU header the map is smaller, and Würzburg sat up-left of its dot
    // between the labels of the Rhine-Main alliance.
    const header = parseSvgColorLogo('<svg><rect width="600" height="100"/></svg>');
    const tuLike: PosterTheme = {
      colors: NEUTRAL_COLORS,
      header: { logo: header, align: 'left', heightMm: 28, clearSpace: 0.5 },
      footerLeft: null,
      footerRight: null,
      footerHeightMm: 30,
      sender: '',
    };
    const dist = (b: readonly number[], p: Point) =>
      Math.hypot(Math.max(b[0]! - p[0], 0, p[0] - b[2]!), Math.max(b[1]! - p[1], 0, p[1] - b[3]!));
    const gap = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(
        Math.max(a[0]! - b[2]!, b[0]! - a[2]!, 0),
        Math.max(a[1]! - b[3]!, b[1]! - a[3]!, 0),
      );
    for (const v of variants)
      for (const language of ['de', 'en'] as const)
        for (const theme of [null, tuLike]) {
          const d = drawPoster(input(v, { language, theme, qrUrl: 'https://example.org/#p/x' }));
          expect(d.unplacedLabels).toBe(0);
          expect(d.unclearLabels).toBe(0);
          d.labelInfo.forEach((info, i) => {
            if (!info.dot) return;
            const box = d.labelBoxes[i]!;
            const own = dist(box, info.anchor);
            // Nearer its own dot than any other dot.
            for (const other of d.labelInfo)
              if (other.dot && other.anchor !== info.anchor)
                expect(dist(box, other.anchor)).toBeGreaterThan(own);
            // Above, below or at a corner of its dot: other labels keep their distance.
            const [x, y] = info.anchor;
            if (y >= box[1] && y <= box[3]) return;
            const k = x >= box[0] && x <= box[2] ? 1 : CORNER_CLEAR;
            d.labelInfo.forEach((other, j) => {
              if (j === i || (other.group !== null && other.group === info.group && !other.dot))
                return;
              expect(gap(box, d.labelBoxes[j]!)).toBeGreaterThanOrEqual(k * own - 1e-9);
            });
          });
        }
  });

  it('puts the logo in free space near the place', () => {
    for (const v of variants) {
      const d = drawPoster(input(v, { emphasis: { place: ril, logo } }));
      const box = d.logoBox!;
      expect(box).not.toBeNull();
      expect(box[2] - box[0]).toBeCloseTo(100, 0);
      for (const [a, c] of d.legs) expect(segmentMeetsBox(a, c, box)).toBe(false);
      for (const b of d.labelBoxes)
        expect(b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]).toBe(true);
      expect(d.unplacedLabels).toBe(0);
    }
  });

  it('scales A0 as A1 enlarged by √2', () => {
    const a1 = posterSizes(DIN_SIZES.A1[0]);
    const a0 = posterSizes(DIN_SIZES.A0[0]);
    for (const key of Object.keys(a1) as (keyof typeof a1)[])
      expect(a0[key] / a1[key]).toBeCloseTo(Math.SQRT2, 2);
    const d1 = drawPoster(input(variants[0]!));
    const d0 = drawPoster(input(variants[0]!, { paper: 'A0' }));
    expect(d0.mmPerKm / d1.mmPerKm).toBeCloseTo(Math.SQRT2, 1);
  });

  it('states the problem with the number of round trips, in German and English', () => {
    expect(runsText(problemRuns(25, 10, 'de'))).toBe(
      'Kürzeste Rundreise unter 3,1 · 10^23 Möglichkeiten:',
    );
    expect(runsText(problemRuns(37, 10, 'en'))).toBe(
      'Shortest round trip out of 1.9 × 10^41 options:',
    );
    expect(runsText(problemRuns(5, 10, 'de'))).toBe('Kürzeste Rundreise unter 12 Möglichkeiten:');
  });

  it('lists symbol entries before notes in the legend', () => {
    const entries = legendEntries(input(variants[1]!));
    const symbols = entries.map((e) => e.symbol);
    expect(symbols).toEqual(['ring', 'group', null]);
    const centroid = legendEntries(input(variants[0]!, { emphasis: null }));
    expect(centroid.map((e) => e.symbol)).toEqual(['ring', 'centroid', null]);
  });
});

describe('design themes (roadmap 9.10)', () => {
  const { cities, region } = puzzleCities('exzellenzstrategie-2027-brett');
  const stops = posterStops(cities, 'separate');
  let tour: ReturnType<typeof posterTour>;
  beforeAll(() => {
    tour = posterTour(backend, stops, stopPoints(stops, projection));
  });
  // Stand-ins for logos (real logos never enter the repository): a wide one in two colours, and
  // one with a line far thinner than 0.25 mm at poster size.
  const wide = parseSvgColorLogo(
    '<svg><rect width="300" height="50" fill="#84b818"/><rect x="300" width="100" height="50" fill="#1a1a18"/></svg>',
  );
  const thin = parseSvgColorLogo(
    '<svg><rect width="100" height="100" fill="#003560"/><path d="M 0 50 L 1000 50" stroke="#c4022e"/></svg>',
  );
  const green: Rgb = [0x84 / 255, 0xb8 / 255, 0x18 / 255];
  const blue: Rgb = [0, 0x35 / 255, 0x60 / 255];
  const red: Rgb = [0xc4 / 255, 2 / 255, 0x2e / 255];
  const same = (a: Rgb | undefined, b: Rgb) => !!a && a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
  const theme: PosterTheme = {
    colors: { title: blue, length: blue, tour: blue, group: [0.87, 0.91, 0.94] },
    header: { logo: wide, align: 'left', heightMm: 20, clearSpace: 0.5 },
    footerLeft: wide,
    footerRight: thin,
    footerHeightMm: 25,
    sender: 'Absenderzeile',
  };
  const draw = (over: Partial<PosterInput> = {}) =>
    drawPoster({
      file: de,
      region,
      stops,
      tour,
      title: 'Titel',
      subtitle: '',
      paper: 'A1',
      orientation: 'portrait',
      language: 'de',
      legend: [],
      theme,
      ...over,
    });
  const M = posterSizes(DIN_SIZES.A1[0]).margin;
  const [W, H] = DIN_SIZES.A1;

  it('puts the logo at the top left with its clear space, and the title below it', () => {
    const d = draw();
    const logo = d.items.filter((i) => same(i.fill, green)).map((i) => pathBounds(i.path)!);
    // The header logo, 20 mm high on A1 (the first green shape), at the margins.
    expect(logo[0]![0]).toBeCloseTo(M, 6);
    expect(logo[0]![1]).toBeCloseTo(M, 6);
    expect(logo[0]![3]).toBeCloseTo(M + 20, 6);
    // The title is the first text in the title colour; it starts below the clear space.
    const title = pathBounds(d.items.find((i) => same(i.fill, blue))!.path)!;
    expect(title[1]).toBeGreaterThanOrEqual(M + 20 + 10 - 1e-6);
    // The footer logo at the bottom left.
    expect(logo.at(-1)![0]).toBeCloseTo(M, 6);
    expect(logo.at(-1)![3]).toBeCloseTo(H - M, 6);
  });

  it('aligns the logo right when the theme asks', () => {
    const d = draw({ theme: { ...theme, header: { ...theme.header!, align: 'right' } } });
    const first = d.items
      .filter((i) => i.fill)
      .slice(0, 2)
      .map((i) => pathBounds(i.path)!);
    expect(first[1]![2]).toBeCloseTo(W - M, 6);
  });

  it('draws the round trip and the length in the theme colours', () => {
    const d = draw();
    // The tour: the only wide stroke in the tour colour (label halos are white).
    const tourItems = d.items.filter((i) => same(i.stroke?.color, blue) && i.stroke!.width > 2);
    expect(tourItems).toHaveLength(1);
    // Neutral: the red tour of 9.9.
    const neutral = draw({ theme: null });
    const red99 = neutral.items.filter(
      (i) => same(i.stroke?.color, [0.78, 0.13, 0.09]) && i.stroke!.width > 2,
    );
    expect(red99).toHaveLength(1);
  });

  it('keeps logo lines at least 0.25 mm wide, with their caps and joins', () => {
    const d = draw();
    const line = d.items.find((i) => same(i.stroke?.color, red))!;
    expect(line.stroke!.width).toBe(0.25);
    expect(line.stroke!.cap).toBe('butt');
    expect(line.stroke!.join).toBe('miter');
    // The footer logo at the bottom right.
    expect(pathBounds(line.path)![2]).toBeLessThanOrEqual(W - M + 1e-6);
    expect(posterSvg(d)).toContain(
      'stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4"',
    );
  });

  it('stays inside the margins on every paper', () => {
    for (const paper of ['A1', 'A0', 'A4'] as const) {
      const d = draw({ paper });
      const [w, h] = pageSize(paper, 'portrait');
      for (const item of d.items) {
        const b = pathBounds(item.path);
        if (!b) continue;
        // Logos may touch the margin.
        const pad = item.stroke ? item.stroke.width / 2 : 0;
        expect(b[0] - pad).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(b[1] - pad).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(b[2] + pad).toBeLessThanOrEqual(w - 10 + 1e-6);
        expect(b[3] + pad).toBeLessThanOrEqual(h - 10 + 1e-6);
      }
      expect(d.unplacedLabels).toBe(0);
    }
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

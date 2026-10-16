// Exports a puzzle as a poster in a DIN format (roadmap 9.7): one PDF page with the shortest
// round trip (great-circle optimum, checked against the optimum on the flat map), its length
// and the facts; optionally a PNG preview and a short report.
// Usage:
//   npx tsx cli/export-poster.ts --puzzle public/puzzles/<id>.tsp.json [options]
//   npx tsx cli/export-poster.ts --list docs/data/curated/<name>.txt [--region DE] [options]
//   npx tsx cli/export-poster.ts --variants docs/posters/<dir>/variants.json [options]
// Options: [--paper A0|A1|A2|A3|A4] (default A1) [--orientation portrait|landscape]
//   [--members centroid|separate] (a composite place as one stop at its centroid, or each
//   member as a stop of its own) [--without 'A,B'] (leave places out, by name)
//   [--title …] [--subtitle …] [--lang de|en] [--legend file.json] (legend lines, e.g. a
//   board's .board.json) [--logo 'Place name=local/logo.svg'] (repeatable)
//   [--legend-logo local/logo.svg] [--out dir] [--name base] [--suffix -logo] (appended to all
//   file names) [--png 30] (preview, dpi)
// A variants file lists several posters ({ "paper", "orientation", "png", "contactSheet",
// "variants": [{ "name", "puzzle" | "list", "members", "without", "title", "subtitle",
// "legend" }] }); options on the command line (logos, --out, --png) apply to all of them, and
// a contact sheet PNG shows all variants side by side.
// Logos are read from local files and written only into the outputs: write logo versions to
// the git-ignored local/ folder, never into the repository.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { parseSvgLogo, type Logo } from '../src/core/board/logo';
import {
  DIN_PAPERS,
  drawPoster,
  posterPdf,
  posterSvg,
  posterSvgBody,
  type DinPaper,
  type Orientation,
  type PosterDrawing,
} from '../src/core/board/poster';
import {
  possibleTours,
  posterStops,
  posterTour,
  stopPoints,
  type MembersMode,
  type PosterStop,
  type PosterTour,
} from '../src/core/board/poster-tour';
import { svgPathData } from '../src/core/board/shapes';
import { measureText, textPath } from '../src/core/board/text';
import {
  citiesFromColumns,
  type City,
  type CountryFile,
  type LabelLanguage,
} from '../src/core/data';
import { DEFAULT_PARAMS, type PuzzleParams } from '../src/core/params';
import { listCities } from '../src/core/places';
import { boardProjection } from '../src/core/projection';
import { parsePuzzleDoc, type LegendEntry, type Place } from '../src/core/puzzle-file';
import { projectionKind, regionFrame } from '../src/core/region';
import type { MipBackend } from '../src/core/tsp/exact';
import { loadBackend, loadCountry } from './lib/country';
import { readPlaceList } from './lib/place-list';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const all = (name: string) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]!] : []));

interface VariantSpec {
  readonly name?: string;
  readonly puzzle?: string;
  readonly list?: string;
  readonly region?: string;
  readonly members?: MembersMode;
  readonly without?: readonly string[];
  readonly title?: string;
  readonly subtitle?: string;
  readonly lang?: LabelLanguage;
  readonly legend?: readonly LegendEntry[] | string;
  readonly paper?: DinPaper;
  readonly orientation?: Orientation;
}

interface Result {
  readonly name: string;
  readonly title: string;
  readonly subtitle: string;
  readonly stops: readonly PosterStop[];
  readonly tour: PosterTour;
  readonly drawing: PosterDrawing;
  readonly mapKm: number;
}

const paperOf = (v: string): DinPaper => {
  const p = v.toUpperCase() as DinPaper;
  if (!DIN_PAPERS.includes(p)) throw new Error(`unknown paper ${v} (A0 to A4)`);
  return p;
};

function readLogo(file: string): Logo {
  const logo = parseSvgLogo(readFileSync(file, 'utf8'));
  console.error(`logo ${file}: ${logo.path.length} path commands`);
  return logo;
}

/** Legend lines: inline, or the legend of a board extras file (.board.json). */
function legendOf(spec: VariantSpec['legend']): LegendEntry[] | null {
  if (spec === undefined) return null;
  if (typeof spec !== 'string') return [...spec];
  const json = JSON.parse(readFileSync(spec, 'utf8')) as { legend?: LegendEntry[] };
  return json.legend ?? [];
}

interface Source {
  readonly file: CountryFile;
  readonly params: PuzzleParams;
  readonly places: readonly Place[];
  readonly title: string;
  readonly subtitle: string;
  readonly legend: readonly LegendEntry[];
  readonly name: string;
}

function source(spec: VariantSpec): Source {
  if (spec.puzzle) {
    const doc = parsePuzzleDoc(JSON.parse(readFileSync(spec.puzzle, 'utf8')));
    if (!doc.map) throw new Error(`${spec.puzzle}: not a map puzzle`);
    const file = loadCountry(doc.data?.country ?? doc.map.params.region.slice(0, 2));
    return {
      file,
      params: doc.map.params,
      places: doc.map.places,
      title: doc.title,
      subtitle: doc.description,
      legend: doc.map.board?.legend ?? [],
      name: doc.id,
    };
  }
  if (!spec.list) throw new Error('need --puzzle, --list or --variants');
  const region = spec.region ?? 'DE';
  const file = loadCountry(region.slice(0, 2));
  return {
    file,
    params: { ...DEFAULT_PARAMS, region },
    places: readPlaceList(readFileSync(spec.list, 'utf8'), file),
    title: '',
    subtitle: '',
    legend: [],
    name: path.basename(spec.list, '.txt'),
  };
}

function build(
  spec: VariantSpec,
  backend: MipBackend,
  logosByName: ReadonlyMap<string, Logo>,
  legendLogo: Logo | null,
  defaults: { paper: DinPaper; orientation: Orientation },
): Result {
  const src = source(spec);
  const without = new Set(spec.without ?? []);
  for (const name of without)
    if (!src.places.some((p) => p.name === name)) throw new Error(`--without: no place ${name}`);
  const places = src.places.filter((p) => !without.has(p.name));
  const towns = new Map(citiesFromColumns(src.file.cities, src.file.states).map((c) => [c.id, c]));
  const cities: City[] = listCities(places, towns);
  // Members by their short town label (e.g. "Frankfurt" for Frankfurt am Main).
  const byName = new Map([...towns.values()].map((t) => [t.name, t.label]));
  const mode = spec.members ?? 'centroid';
  const stops = posterStops(cities, mode, (name, member) =>
    member ? (byName.get(name) ?? name) : name,
  );
  // The check against the flat map uses the puzzle's own board projection.
  const { params } = src;
  const projection = boardProjection(
    regionFrame(src.file, params.region),
    { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
    projectionKind(src.file),
  );
  const tour = posterTour(backend, stops, stopPoints(stops, projection));
  const logos = new Map<number, Logo>();
  for (const [name, logo] of logosByName) {
    const i = places.findIndex((p) => p.name === name);
    if (i >= 0) logos.set(i, logo);
  }
  const title = spec.title ?? src.title;
  const subtitle = spec.subtitle ?? src.subtitle;
  const drawing = drawPoster({
    file: src.file,
    region: params.region,
    stops,
    tour,
    title,
    subtitle,
    paper: spec.paper ?? defaults.paper,
    orientation: spec.orientation ?? defaults.orientation,
    language: spec.lang ?? params.labelLanguage,
    legend: legendOf(spec.legend) ?? src.legend,
    logos,
    legendLogo,
    blankMap: params.blankBoard,
  });
  // Length of the flat-map optimum measured on the map, km.
  const mapPts = stopPoints(stops, projection);
  let mapMm = 0;
  tour.mapTour.forEach((a, i) => {
    const p = mapPts[a]!;
    const q = mapPts[tour.mapTour[(i + 1) % tour.mapTour.length]!]!;
    mapMm += Math.hypot(p[0] - q[0], p[1] - q[1]);
  });
  return {
    name: spec.name ?? src.name,
    title,
    subtitle,
    stops,
    tour,
    drawing,
    mapKm: mapMm / projection.mmPerKm,
  };
}

const fmt = (v: number, d: number) =>
  v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

function toursText(n: number): string {
  const t = possibleTours(n);
  return t.exact !== null ? fmt(t.exact, 0) : `${t.mantissa.toFixed(1)} · 10^${t.exponent}`;
}

function report(r: Result): string {
  const { tour } = r;
  const lines = [
    `## ${r.name}`,
    '',
    `- ${r.title}${r.subtitle ? ` — ${r.subtitle}` : ''}`,
    `- ${r.stops.length} stops; shortest round trip ${fmt(tour.lengthKm, 1)} km (great circle); ` +
      `second-best ${tour.secondKm === null ? '–' : `+${fmt(tour.secondKm, 1)} km`}; ` +
      `${toursText(r.stops.length)} possible round trips.`,
    tour.mapAgrees
      ? `- The optimum on the flat map (the app's measure) is the same round trip: ${fmt(r.mapKm, 1)} km on the map, ${fmt(tour.mapTourKm, 1)} km on the sphere.`
      : `- WARNING: the optimum on the flat map differs (${fmt(tour.mapTourKm, 1)} km on the sphere, ${fmt(tour.mapTourKm - tour.lengthKm, 1)} km longer); the poster shows the great-circle optimum.`,
    `- Layout: facts ${r.drawing.layout === 'band' ? 'below' : 'beside'} the map, ${fmt(r.drawing.mmPerKm * 100, 1)} mm per 100 km` +
      (r.drawing.unplacedLabels > 0
        ? `, ${r.drawing.unplacedLabels} labels overlap`
        : ', all labels placed') +
      '.',
    `- Order: ${tour.tour.map((i) => r.stops[i]!.name).join(' → ')}`,
    '',
  ];
  return lines.join('\n');
}

/** PNG of an SVG at the given width in pixels. */
function png(svg: string, widthPx: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(widthPx) } }).render().asPng();
}

/** All posters side by side with a caption each. */
function contactSheet(results: readonly Result[]): string {
  const gap = 40;
  const pad = 40;
  const caption = 22;
  const w = Math.max(...results.map((r) => r.drawing.width));
  const h = Math.max(...results.map((r) => r.drawing.height));
  const totalW = results.length * w + (results.length - 1) * gap + 2 * pad;
  const totalH = h + 2 * pad + 3.2 * caption;
  const parts = results.map((r, i) => {
    const x = pad + i * (w + gap);
    const lines = [
      `${r.stops.length} Orte · ${Math.round(r.tour.lengthKm).toLocaleString('de-DE')} km`,
      r.name,
    ];
    const text = lines
      .map((line, k) => {
        const size = k === 0 ? caption : caption * 0.6;
        const tw = measureText(line, size).width;
        const y = pad + h + caption * 1.3 + k * caption * 1.1;
        return `<path d="${svgPathData(textPath(line, x + (w - tw) / 2, y, size), 2)}" fill="#222"/>`;
      })
      .join('\n');
    return `<g transform="translate(${x} ${pad})">${posterSvgBody(r.drawing)}</g>\n${text}`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}mm" height="${totalH}mm" viewBox="0 0 ${totalW} ${totalH}">`,
    `<rect width="${totalW}" height="${totalH}" fill="#e6e3dd"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}

async function main(): Promise<void> {
  const backend = await loadBackend();
  const logosByName = new Map<string, Logo>();
  for (const spec of all('logo')) {
    const [name, file] = spec.split('=');
    if (!name || !file) throw new Error(`--logo ${spec}: expected 'Place name=file.svg'`);
    logosByName.set(name.trim(), readLogo(file.trim()));
  }
  const legendLogo = arg('legend-logo', '') ? readLogo(arg('legend-logo', '')) : null;
  const variantsFile = arg('variants', '');
  const config = variantsFile
    ? (JSON.parse(readFileSync(variantsFile, 'utf8')) as {
        paper?: string;
        orientation?: Orientation;
        png?: number;
        contactSheet?: string;
        variants: VariantSpec[];
      })
    : null;
  const outDir = arg('out', config ? path.dirname(variantsFile) : '.');
  const orientation: Orientation =
    arg('orientation', config?.orientation ?? 'portrait') === 'landscape'
      ? 'landscape'
      : 'portrait';
  const defaults = { paper: paperOf(arg('paper', config?.paper ?? 'A1')), orientation };
  const dpi = Number(arg('png', String(config?.png ?? 0)));
  const suffix = arg('suffix', '');
  const specs: VariantSpec[] = config
    ? config.variants
    : [
        {
          ...(arg('puzzle', '') ? { puzzle: arg('puzzle', '') } : {}),
          ...(arg('list', '') ? { list: arg('list', ''), region: arg('region', 'DE') } : {}),
          members: arg('members', 'centroid') === 'separate' ? 'separate' : 'centroid',
          ...(arg('without', '')
            ? {
                without: arg('without', '')
                  .split(',')
                  .map((s) => s.trim()),
              }
            : {}),
          ...(arg('title', '') ? { title: arg('title', '') } : {}),
          ...(arg('subtitle', '') ? { subtitle: arg('subtitle', '') } : {}),
          ...(arg('lang', '') ? { lang: arg('lang', '') === 'en' ? 'en' : 'de' } : {}),
          ...(arg('legend', '') ? { legend: arg('legend', '') } : {}),
          ...(arg('name', '') ? { name: arg('name', '') } : {}),
        },
      ];
  mkdirSync(outDir, { recursive: true });
  const results: Result[] = [];
  for (const spec of specs) {
    const t0 = performance.now();
    const r = build(spec, backend, logosByName, legendLogo, defaults);
    const base = path.join(outDir, r.name + suffix);
    writeFileSync(`${base}.pdf`, posterPdf(r.drawing));
    const written = [`${base}.pdf`];
    if (dpi > 0) {
      writeFileSync(`${base}.png`, png(posterSvg(r.drawing), (r.drawing.width / 25.4) * dpi));
      written.push(`${base}.png`);
    }
    if (!r.tour.mapAgrees)
      console.error(
        `${r.name}: the optimum on the flat map differs; using the great-circle optimum`,
      );
    if (r.drawing.unplacedLabels > 0)
      console.error(`${r.name}: ${r.drawing.unplacedLabels} labels overlap`);
    console.error(
      `${r.name}: ${r.stops.length} stops, ${fmt(r.tour.lengthKm, 1)} km, second +${r.tour.secondKm === null ? '–' : fmt(r.tour.secondKm, 1)} km, ` +
        `${toursText(r.stops.length)} tours, map optimum ${r.tour.mapAgrees ? 'same' : 'DIFFERS'} ` +
        `(${Math.round(performance.now() - t0)} ms): ${written.join(', ')}`,
    );
    results.push(r);
  }
  const reportFile = config
    ? path.join(outDir, `report${suffix}.md`)
    : path.join(outDir, `${results[0]!.name}${suffix}-report.md`);
  writeFileSync(
    reportFile,
    [
      '# Poster report',
      '',
      `Generated ${new Date().toISOString().slice(0, 10)} by \`cli/export-poster.ts\` (${defaults.paper} ${defaults.orientation}).`,
      '',
      '| poster | places | length | second-best | possible tours | flat-map optimum |',
      '| --- | --- | --- | --- | --- | --- |',
      ...results.map(
        (r) =>
          `| ${r.name} | ${r.stops.length} | ${fmt(r.tour.lengthKm, 1)} km | ${r.tour.secondKm === null ? '–' : `+${fmt(r.tour.secondKm, 1)} km`} | ${toursText(r.stops.length)} | ${r.tour.mapAgrees ? 'same' : 'differs'} |`,
      ),
      '',
      ...results.map(report),
    ].join('\n'),
  );
  console.error(`wrote ${reportFile}`);
  if (config?.contactSheet && results.length > 1) {
    const file = path.join(outDir, config.contactSheet.replace(/\.png$/, `${suffix}.png`));
    writeFileSync(file, png(contactSheet(results), 600 * results.length));
    console.error(`wrote ${file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

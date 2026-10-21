// Exports a puzzle as a poster in a DIN format (roadmap 9.7, 9.9): one PDF page with the
// shortest round trip (great-circle optimum, checked against the optimum on the flat map), the
// problem and the length; optionally a PNG preview, and a short report.
// Usage:
//   npx tsx cli/export-poster.ts --puzzle public/puzzles/<id>.tsp.json [options]
//   npx tsx cli/export-poster.ts --list docs/data/curated/<name>.txt [--region DE] [options]
//   npx tsx cli/export-poster.ts --variants docs/posters/<dir>/variants.json [options]
// Options: [--paper A1] (A0 to A4 or B0 to B2, or a list such as A1,A0,B1)
//   [--orientation portrait|landscape]
//   [--members centroid|separate] (a composite place as one stop at its centroid, or each
//   member as a stop of its own) [--without 'A,B'] (leave places out, by name)
//   [--title …] [--subtitle …] [--lang de|en] (or a list: de,en) [--legend file.json] (legend
//   lines, e.g. a board's .board.json) [--emphasis 'Place name'] (start and finish there, large
//   red name or its logo) [--logo 'Place name=local/logo.svg'] (repeatable; the emphasized
//   place's logo stands large near it, other logos replace labels) [--legend-logo file.svg]
//   [--corner-logo file.svg] (bottom right, e.g. the university's) [--out dir] [--name base]
//   [--qr https://…/tsp-boards/] (a QR code to the game: the base URL plus #p/<puzzle id>)
//   [--suffix -logo] (appended to all file names) [--also-plain] (with logos: also write the
//   versions without them, without the suffix) [--png 30] (previews, dpi)
//   [--theme neutral|tu|rub] (or a list: tu,rub; a design theme from docs/posters/themes/ or a
//   .json file: colours, logos at the top and in the footer, the sender line; each theme but
//   neutral adds -<theme> to the file names) [--logo-dir local] (where the themes' logos are)
// A variants file lists several posters: { "paper", "orientation", "png", "languages",
// "emphasis", "contactSheet", "qr", "names": { "en": { "German name": "English name" } },
// "variants": [{ "name", "puzzle" | "list", "members", "without", "title", "subtitle",
// "legend", "game" }] }, where title, subtitle and legend may be given per language ({ "de": …,
// "en": … }). Every poster is written to <out>/<language>/<name>-<paper>.pdf; options on the
// command line (logos, --out, --png, --paper) apply to all of them; one contact sheet PNG per
// language and paper shows all variants side by side.
// Logos are read from local files and written only into the outputs: write logo versions to
// the git-ignored local/ folder, never into the repository. Logos on the map are drawn in one
// colour; logos at the top, in the footer and in the legend keep their colours.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { parseSvgLogo, type Logo } from '../src/core/board/logo';
import { parseColor, parseSvgColorLogo } from '../src/core/board/logo-color';
import {
  DIN_PAPERS,
  NEUTRAL_COLORS,
  drawPoster,
  posterPdf,
  posterSvg,
  posterSvgBody,
  problemRuns,
  runsText,
  segmentMeetsBox,
  type DinPaper,
  type Orientation,
  type PosterColors,
  type PosterDrawing,
  type PosterTheme,
} from '../src/core/board/poster';
import {
  posterStops,
  posterTour,
  startAtPlace,
  stopPoints,
  type MembersMode,
  type PosterStop,
  type PosterTour,
} from '../src/core/board/poster-tour';
import { svgPathData } from '../src/core/board/shapes';
import { measureText, textPath } from '../src/core/board/text';
import {
  boardLabel,
  citiesFromColumns,
  type City,
  type CountryFile,
  type LabelLanguage,
} from '../src/core/data';
import { DEFAULT_PARAMS, type PuzzleParams } from '../src/core/params';
import { listCities } from '../src/core/places';
import { boardProjection } from '../src/core/projection';
import { shortLink } from '../src/core/permalink';
import {
  localText,
  parsePuzzleDoc,
  type LegendEntry,
  type LocalText,
  type Place,
} from '../src/core/puzzle-file';
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
const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** A text given once or per language. */
type Localized<T> = T | Partial<Record<LabelLanguage, T>>;

interface VariantSpec {
  readonly name?: string;
  readonly puzzle?: string;
  readonly list?: string;
  readonly region?: string;
  readonly members?: MembersMode;
  readonly without?: readonly string[];
  readonly title?: Localized<string>;
  readonly subtitle?: Localized<string>;
  readonly legend?: Localized<readonly LegendEntry[] | string>;
  /** Gallery puzzle of the QR code (default: the puzzle's own id). */
  readonly game?: string;
}

interface Config {
  readonly paper?: string;
  readonly orientation?: Orientation;
  readonly png?: number;
  readonly languages?: readonly LabelLanguage[];
  readonly emphasis?: string;
  readonly contactSheet?: string;
  /** Base URL of the site for the QR codes (the game's short link is appended). */
  readonly qr?: string;
  readonly names?: Partial<Record<LabelLanguage, Record<string, string>>>;
  readonly variants: readonly VariantSpec[];
}

const isLanguageMap = (v: unknown): v is Partial<Record<LabelLanguage, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && ('de' in v || 'en' in v);

function localized<T>(value: Localized<T> | undefined, lang: LabelLanguage): T | undefined {
  if (value === undefined) return undefined;
  if (isLanguageMap(value)) return value[lang];
  return value;
}

const paperOf = (v: string): DinPaper => {
  const p = v.toUpperCase() as DinPaper;
  if (!DIN_PAPERS.includes(p)) throw new Error(`unknown paper ${v} (A0 to A4, B0 to B2)`);
  return p;
};

const logoCache = new Map<string, Logo | null>();

/** A logo from a local file, in one colour (on the map) or in its colours; null if missing. */
function readLogo(file: string, colors = false): Logo | null {
  const key = `${colors ? 'colour' : 'mono'}:${file}`;
  if (logoCache.has(key)) return logoCache.get(key)!;
  let logo: Logo | null = null;
  if (!existsSync(file)) console.error(`logo ${file} is missing: the posters are built without it`);
  else {
    const svg = readFileSync(file, 'utf8');
    logo = colors ? parseSvgColorLogo(svg) : parseSvgLogo(svg);
    console.error(`logo ${file}: ${logo.path.length} path commands`);
  }
  logoCache.set(key, logo);
  return logo;
}

/** A design theme file (docs/posters/themes/<name>.json, roadmap 9.10). */
interface ThemeFile {
  readonly colors?: Partial<Record<keyof PosterColors, string>>;
  readonly header?: {
    readonly logo: Localized<string>;
    readonly align?: 'left' | 'right';
    readonly heightMm?: number;
    readonly clearSpace?: number;
  };
  readonly footer?: {
    readonly left?: Localized<string>;
    readonly right?: Localized<string>;
    readonly heightMm?: number;
  };
  readonly sender?: Localized<string>;
}

interface Theme {
  readonly name: string;
  readonly file: ThemeFile;
}

function loadTheme(spec: string): Theme {
  const file = spec.endsWith('.json') ? spec : path.join('docs/posters/themes', `${spec}.json`);
  if (!existsSync(file)) throw new Error(`--theme ${spec}: no theme file ${file}`);
  return {
    name: path.basename(file, '.json'),
    file: JSON.parse(readFileSync(file, 'utf8')) as ThemeFile,
  };
}

/** The theme in a language, with its logos from `logoDir` (missing logos are left out). */
function posterTheme(theme: Theme, lang: LabelLanguage, logoDir: string): PosterTheme {
  const t = theme.file;
  const color = (key: keyof PosterColors) => {
    const value = t.colors?.[key];
    if (value === undefined) return NEUTRAL_COLORS[key];
    const rgb = parseColor(value);
    if (!rgb) throw new Error(`theme ${theme.name}: colour ${key} ${value} is not a colour`);
    return rgb;
  };
  const logo = (name: Localized<string> | undefined) => {
    const file = localized(name, lang);
    return file ? readLogo(path.join(logoDir, file), true) : null;
  };
  const head = t.header ? logo(t.header.logo) : null;
  return {
    colors: {
      title: color('title'),
      length: color('length'),
      tour: color('tour'),
      group: color('group'),
      groupName: color('groupName'),
    },
    header:
      t.header && head
        ? {
            logo: head,
            align: t.header.align ?? 'left',
            heightMm: t.header.heightMm ?? 20,
            clearSpace: t.header.clearSpace ?? 0.5,
          }
        : null,
    footerLeft: logo(t.footer?.left),
    footerRight: logo(t.footer?.right),
    footerHeightMm: t.footer?.heightMm ?? 25,
    sender: localized(t.sender, lang) ?? '',
  };
}

/** Legend lines: inline, or the legend of a board extras file (.board.json). */
function legendOf(spec: readonly LegendEntry[] | string | undefined): LegendEntry[] | null {
  if (spec === undefined) return null;
  if (typeof spec !== 'string') return [...spec];
  const json = JSON.parse(readFileSync(spec, 'utf8')) as { legend?: LegendEntry[] };
  return json.legend ?? [];
}

interface Source {
  readonly file: CountryFile;
  readonly params: PuzzleParams;
  readonly places: readonly Place[];
  readonly title: LocalText;
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
      subtitle: '',
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

/** A variant's places and round trip (the same for all languages and papers). */
interface Solved {
  readonly name: string;
  readonly spec: VariantSpec;
  readonly src: Source;
  readonly places: readonly Place[];
  readonly cities: readonly City[];
  readonly mode: MembersMode;
  readonly stops: readonly PosterStop[];
  readonly tour: PosterTour;
  readonly mapKm: number;
  readonly emphasis: number | null;
}

function solve(spec: VariantSpec, backend: MipBackend, emphasisName: string): Solved {
  const src = source(spec);
  const without = new Set(spec.without ?? []);
  for (const name of without)
    if (!src.places.some((p) => p.name === name)) throw new Error(`--without: no place ${name}`);
  const places = src.places.filter((p) => !without.has(p.name));
  const towns = new Map(citiesFromColumns(src.file.cities, src.file.states).map((c) => [c.id, c]));
  const cities = listCities(places, towns);
  const mode = spec.members ?? 'centroid';
  const stops = posterStops(cities, mode);
  // The check against the flat map uses the puzzle's own board projection.
  const { params } = src;
  const projection = boardProjection(
    regionFrame(src.file, params.region),
    { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
    projectionKind(src.file),
  );
  const mapPts = stopPoints(stops, projection);
  const tour = posterTour(backend, stops, mapPts);
  let mapMm = 0;
  tour.mapTour.forEach((a, i) => {
    const p = mapPts[a]!;
    const q = mapPts[tour.mapTour[(i + 1) % tour.mapTour.length]!]!;
    mapMm += Math.hypot(p[0] - q[0], p[1] - q[1]);
  });
  const emphasis = emphasisName ? places.findIndex((p) => p.name === emphasisName) : -1;
  if (emphasisName && emphasis < 0)
    console.error(`${spec.name ?? src.name}: no place ${emphasisName} to emphasize`);
  return {
    name: spec.name ?? src.name,
    spec,
    src,
    places,
    cities,
    mode,
    stops,
    tour,
    mapKm: mapMm / projection.mmPerKm,
    emphasis: emphasis >= 0 ? emphasis : null,
  };
}

/** The stops with labels in a language: English exonyms (Munich), names of alliances. */
function localStops(
  v: Solved,
  lang: LabelLanguage,
  names: Readonly<Record<string, string>>,
): PosterStop[] {
  const towns = new Map(
    citiesFromColumns(v.src.file.cities, v.src.file.states).map((c) => [c.name, c]),
  );
  const town = (name: string) => {
    const t = towns.get(name);
    return t ? boardLabel(t, lang) : name;
  };
  const local = v.cities.map((c): City => {
    const label = names[c.name] ?? (c.members ? c.label : boardLabel(c, lang));
    return {
      ...c,
      name: names[c.name] ?? c.name,
      label,
      ...(c.members ? { members: c.members.map((m) => ({ ...m, name: town(m.name) })) } : {}),
    };
  });
  return posterStops(local, v.mode);
}

interface Output {
  readonly solved: Solved;
  readonly lang: LabelLanguage;
  readonly paper: DinPaper;
  readonly drawing: PosterDrawing;
  readonly stops: readonly PosterStop[];
  readonly base: string;
  /** Labels that meet a leg of the tour (should be 0). */
  readonly onLegs: number;
  /** File name suffix (the theme and the logo versions). */
  readonly suffix: string;
}

const fmt = (v: number, d: number) =>
  v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

function report(outputs: readonly Output[], theme: string): string {
  const first = new Map<string, Output>();
  for (const o of outputs) if (!first.has(o.solved.name)) first.set(o.solved.name, o);
  const lines = [
    '# Poster report',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`cli/export-poster.ts\`, theme ${theme}.`,
    '',
    '| poster | places | length | second-best | problem line | flat-map optimum |',
    '| --- | --- | --- | --- | --- | --- |',
    ...[...first.values()].map(({ solved: v }) => {
      const t = v.tour;
      return `| ${v.name} | ${v.stops.length} | ${fmt(t.lengthKm, 1)} km | ${t.secondKm === null ? '–' : `+${fmt(t.secondKm, 1)} km`} | ${runsText(problemRuns(v.stops.length, 1, 'en'))} | ${t.mapAgrees ? 'same' : 'differs'} |`;
    }),
    '',
    '| file | language | paper | layout | labels overlapping | labels on legs | labels unclear | logo |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...outputs.map(
      (o) =>
        `| ${path.basename(o.base)} | ${o.lang} | ${o.paper} | ${o.drawing.layout === 'band' ? 'facts below' : 'facts beside'} | ${o.drawing.unplacedLabels} | ${o.onLegs} | ${o.drawing.unclearLabels} | ${o.drawing.logoBox ? 'yes' : '–'} |`,
    ),
    '',
  ];
  for (const { solved: v, stops } of first.values()) {
    const t = v.tour;
    const order = v.emphasis === null ? t.tour : startAtPlace(v.stops, t.tour, v.emphasis);
    lines.push(
      `## ${v.name}`,
      '',
      t.mapAgrees
        ? `- The optimum on the flat map (the app's measure) is the same round trip: ${fmt(v.mapKm, 1)} km on the map, ${fmt(t.mapTourKm, 1)} km on the sphere.`
        : `- WARNING: the optimum on the flat map differs (${fmt(t.mapTourKm, 1)} km on the sphere, ${fmt(t.mapTourKm - t.lengthKm, 1)} km longer); the poster shows the great-circle optimum.`,
      `- Order: ${order.map((i) => stops[i]!.name).join(' → ')}`,
      '',
    );
  }
  return lines.join('\n');
}

/** PNG of an SVG at the given width in pixels. */
function png(svg: string, widthPx: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(widthPx) } }).render().asPng();
}

/** All posters side by side with a caption each. */
function contactSheet(outputs: readonly Output[]): string {
  const gap = 40;
  const pad = 40;
  const w = Math.max(...outputs.map((o) => o.drawing.width));
  const h = Math.max(...outputs.map((o) => o.drawing.height));
  const caption = 0.037 * w;
  const totalW = outputs.length * w + (outputs.length - 1) * gap + 2 * pad;
  const totalH = h + 2 * pad + 3.2 * caption;
  const locale = outputs[0]?.lang === 'de' ? 'de-DE' : 'en-GB';
  const places = outputs[0]?.lang === 'de' ? 'Orte' : 'places';
  const parts = outputs.map((o, i) => {
    const x = pad + i * (w + gap);
    const lines = [
      `${o.stops.length} ${places} · ${Math.round(o.solved.tour.lengthKm).toLocaleString(locale)} km`,
      path.basename(o.base),
    ];
    const text = lines
      .map((line, k) => {
        const size = k === 0 ? caption : caption * 0.6;
        const tw = measureText(line, size).width;
        const y = pad + h + caption * 1.3 + k * caption * 1.1;
        return `<path d="${svgPathData(textPath(line, x + (w - tw) / 2, y, size), 2)}" fill="#222"/>`;
      })
      .join('\n');
    return `<g transform="translate(${x} ${pad})">${posterSvgBody(o.drawing)}</g>\n${text}`;
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
  const variantsFile = arg('variants', '');
  const config: Config | null = variantsFile
    ? (JSON.parse(readFileSync(variantsFile, 'utf8')) as Config)
    : null;
  const outDir = arg('out', config ? path.dirname(variantsFile) : '.');
  const papers = list(arg('paper', config?.paper ?? 'A1')).map(paperOf);
  const orientation: Orientation =
    arg('orientation', config?.orientation ?? 'portrait') === 'landscape'
      ? 'landscape'
      : 'portrait';
  const dpi = Number(arg('png', String(config?.png ?? 0)));
  const suffix = arg('suffix', '');
  const emphasisName = arg('emphasis', config?.emphasis ?? '');
  const qrBase = arg('qr', config?.qr ?? '');
  const logosByName = new Map<string, Logo>();
  for (const spec of all('logo')) {
    const [name, file] = spec.split('=');
    if (!name || !file) throw new Error(`--logo ${spec}: expected 'Place name=file.svg'`);
    const logo = readLogo(file.trim());
    if (logo) logosByName.set(name.trim(), logo);
  }
  const legendLogo = arg('legend-logo', '') ? readLogo(arg('legend-logo', ''), true) : null;
  const cornerLogo = arg('corner-logo', '') ? readLogo(arg('corner-logo', ''), true) : null;
  const logoDir = arg('logo-dir', 'local');
  const themes = arg('theme', '') ? list(arg('theme', '')).map(loadTheme) : [null];
  const langArg = arg('lang', '');
  const languages: LabelLanguage[] = langArg
    ? list(langArg).map((l) => (l === 'en' ? 'en' : 'de'))
    : [...(config?.languages ?? ['de'])];
  const specs: VariantSpec[] = config
    ? [...config.variants]
    : [
        {
          ...(arg('puzzle', '') ? { puzzle: arg('puzzle', '') } : {}),
          ...(arg('list', '') ? { list: arg('list', ''), region: arg('region', 'DE') } : {}),
          members: arg('members', 'centroid') === 'separate' ? 'separate' : 'centroid',
          ...(arg('without', '') ? { without: list(arg('without', '')) } : {}),
          ...(arg('title', '') ? { title: arg('title', '') } : {}),
          ...(arg('subtitle', '') ? { subtitle: arg('subtitle', '') } : {}),
          ...(arg('legend', '') ? { legend: arg('legend', '') } : {}),
          ...(arg('name', '') ? { name: arg('name', '') } : {}),
        },
      ];
  const multiLanguage = config !== null || languages.length > 1;
  // One edition per theme (each but neutral adds its name to the file names); with logos,
  // --also-plain also writes the neutral versions without them (no suffix).
  const hasLogos =
    logosByName.size > 0 || legendLogo !== null || cornerLogo !== null || themes[0] !== null;
  const flavours = [
    ...themes.map((theme) => ({
      theme,
      suffix: (theme && theme.name !== 'neutral' ? `-${theme.name}` : '') + suffix,
      logos: true,
    })),
    ...(hasLogos && args.includes('--also-plain')
      ? [{ theme: null as Theme | null, suffix: '', logos: false }]
      : []),
  ];
  const outputs: Output[] = [];
  for (const spec of specs) {
    const t0 = performance.now();
    const v = solve(spec, backend, emphasisName);
    for (const lang of languages) {
      const stops = localStops(v, lang, config?.names?.[lang] ?? {});
      const dir = multiLanguage ? path.join(outDir, lang) : outDir;
      mkdirSync(dir, { recursive: true });
      const logos = new Map<number, Logo>();
      for (const [name, logo] of logosByName) {
        const i = v.places.findIndex((p) => p.name === name);
        if (i >= 0 && i !== v.emphasis) logos.set(i, logo);
      }
      const emphasisLogo =
        v.emphasis !== null ? (logosByName.get(v.places[v.emphasis]!.name) ?? null) : null;
      for (const flavour of flavours)
        for (const paper of papers) {
          const withLogos = flavour.logos;
          const drawing = drawPoster({
            file: v.src.file,
            region: v.src.params.region,
            stops,
            tour: v.tour,
            title: localized(spec.title, lang) ?? localText(v.src.title, lang),
            subtitle: localized(spec.subtitle, lang) ?? v.src.subtitle,
            paper,
            orientation,
            language: lang,
            legend: legendOf(localized(spec.legend, lang)) ?? v.src.legend,
            emphasis:
              v.emphasis === null
                ? null
                : { place: v.emphasis, logo: withLogos ? emphasisLogo : null },
            logos: withLogos ? logos : new Map(),
            legendLogo: withLogos ? legendLogo : null,
            cornerLogo: withLogos ? cornerLogo : null,
            theme: withLogos && flavour.theme ? posterTheme(flavour.theme, lang, logoDir) : null,
            qrUrl: qrBase ? shortLink(qrBase, spec.game ?? v.src.name) : null,
            blankMap: v.src.params.blankBoard,
          });
          const base = path.join(dir, `${v.name}-${paper}${flavour.suffix}`);
          writeFileSync(`${base}.pdf`, posterPdf(drawing));
          if (dpi > 0)
            writeFileSync(`${base}.png`, png(posterSvg(drawing), (drawing.width / 25.4) * dpi));
          const onLegs = drawing.labelBoxes.filter((b) =>
            drawing.legs.some(([a, c]) => segmentMeetsBox(a, c, b)),
          ).length;
          outputs.push({
            solved: v,
            lang,
            paper,
            drawing,
            stops,
            base,
            onLegs,
            suffix: flavour.suffix,
          });
          if (drawing.unplacedLabels > 0 || onLegs > 0 || drawing.unclearLabels > 0)
            console.error(
              `${path.basename(base)}: ${drawing.unplacedLabels} labels overlap, ${onLegs} on legs, ` +
                `${drawing.unclearLabels} unclear`,
            );
          if (withLogos && emphasisLogo && !drawing.logoBox)
            console.error(`${path.basename(base)}: no free space for the logo; its name is shown`);
        }
    }
    if (!v.tour.mapAgrees)
      console.error(`${v.name}: the optimum on the flat map differs; using the great-circle one`);
    console.error(
      `${v.name}: ${v.stops.length} stops, ${fmt(v.tour.lengthKm, 1)} km, ` +
        `map optimum ${v.tour.mapAgrees ? 'same' : 'DIFFERS'} (${Math.round(performance.now() - t0)} ms)`,
    );
  }
  for (const flavour of flavours) {
    const mine = outputs.filter((o) => o.suffix === flavour.suffix);
    const reportFile = path.join(
      outDir,
      config ? `report${flavour.suffix}.md` : `${path.basename(mine[0]!.base)}-report.md`,
    );
    writeFileSync(reportFile, report(mine, flavour.theme?.name ?? 'neutral'));
    console.error(`wrote ${reportFile}`);
    if (config?.contactSheet && specs.length > 1) {
      for (const lang of languages)
        for (const paper of papers) {
          const group = mine.filter((o) => o.lang === lang && o.paper === paper);
          const file = path.join(
            outDir,
            lang,
            `${config.contactSheet}-${paper}${flavour.suffix}.png`,
          );
          writeFileSync(file, png(contactSheet(group), 600 * group.length));
          console.error(`wrote ${file}`);
        }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

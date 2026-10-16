// Builds the curated collection in public/puzzles/: puzzle files with exact results and the
// index. Usage:
//   npx tsx cli/collection.ts add --link '<permalink>' --title 'Deutschland' [--description …]
//       [--purpose board|digital] [--id de-40] [--lang de]
//   npx tsx cli/collection.ts search --region DE --n 40 --seed 1 --title … [same options]
//       [--weights 1,0.5,2] [--min-pop 5000] [--iterations 1000] [--board 800x600]
//   npx tsx cli/collection.ts incremental --n 12 --seed 1 --title … [--id …]
//   npx tsx cli/collection.ts list --file places.txt --title … [--purpose auto|board|digital]
//       (a fixed instance from a place list; auto: board if the gap allows it, else digital)
//   npx tsx cli/collection.ts list --file places.txt --pool --n 20 [--seed 1] [--iterations 1000]
//       [--merge 2] (km within which list places merge; 0 for districts)
//       [--pin 'A,B'] (a search over the list as pool: n of its places, the pinned ones included)
//   Board options for list and search: [--board 300x600] [--margin 15] [--label 5] [--min-dist 10]
//       [--nail 2] [--string 1] [--target 5]; for lists also [--board-extras file.json]
//       ({ "start": "<place name>", "legend": [{ "symbol": "ring"|"nail"|"none", "text": … }] }:
//       preferred start nail and a legend box at the bottom of the board, roadmap 9.1).
//       A line "* name" in the list marks a place (a ring around its nail).
//   npx tsx cli/collection.ts index        (rebuilds index.json from the files)

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { HoleMode } from '../src/core/board/drawing';
import { planBoard } from '../src/core/board/plan';
import { boardPlanInput, boardSetup } from '../src/core/board/setup';
import { generateIncremental, stepGapUm } from '../src/core/incremental/generate';
import {
  DEFAULT_INCREMENTAL_UI,
  incrementalParams,
  type IncrementalUiParams,
} from '../src/core/incremental/params';
import { DEFAULT_PARAMS, WORLD_PARAMS, searchParams, type PuzzleParams } from '../src/core/params';
import { decodePermalink } from '../src/core/permalink';
import {
  PUZZLE_SCHEMA,
  collectionEntry,
  parsePuzzleDoc,
  serializePuzzleDoc,
  type BoardExtras,
  type CollectionEntry,
  type CollectionIndex,
  type LegendEntry,
  type Place,
  type PuzzleDoc,
} from '../src/core/puzzle-file';
import { Rng } from '../src/core/rng';
import { iteratedLocalSearch } from '../src/core/tsp/ils';
import { verifyCandidate } from '../src/core/verify';
import { citiesFromColumns } from '../src/core/data';
import { closePairs } from '../src/core/fixed';
import { listCities } from '../src/core/places';
import { boardPool, loadBackend, loadCountry, poolLabels, type BoardPool } from './lib/country';
import { readPlaceList } from './lib/place-list';
import { boardProjection } from '../src/core/projection';
import { boardPoints, citySphere, projectionKind, regionFrame } from '../src/core/region';
import { runSearch } from './lib/run-search';

const DIR = path.resolve(import.meta.dirname, '../public/puzzles');
const args = process.argv.slice(2);
const command = args[0] ?? 'index';
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const version = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
) as { version: string };
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Parameter defaults of a region: the world map has its own (WORLD_PARAMS). */
function defaultsFor(region: string): PuzzleParams {
  const world = loadCountry(region.slice(0, 2)).metric === 'sphere';
  return world ? { ...DEFAULT_PARAMS, ...WORLD_PARAMS } : DEFAULT_PARAMS;
}

function meta(kind: 'map' | 'incremental'): Omit<PuzzleDoc, 'data'> {
  const title = arg('title', '');
  if (!title) throw new Error('--title is required');
  return {
    schema: PUZZLE_SCHEMA,
    id: arg('id', slug(title)),
    kind,
    title,
    description: arg('description', ''),
    purpose: arg('purpose', 'board') === 'digital' ? 'digital' : 'board',
    language: arg('lang', 'de') === 'en' ? ('en' as const) : ('de' as const),
    app: version.version,
    updated: new Date().toISOString().slice(0, 10),
  };
}

/** Board options shared by list and search (overrides of the defaults). */
function boardOptions(defaults: PuzzleParams): Partial<PuzzleParams> {
  const num = (name: string, fallback: number) => Number(arg(name, String(fallback)));
  const [bw, bh] = arg('board', '').split('x').map(Number);
  return {
    ...(bw && bh ? { boardWidthMm: bw, boardHeightMm: bh } : {}),
    marginMm: num('margin', defaults.marginMm),
    labelSizeMm: num('label', defaults.labelSizeMm),
    minDistanceMm: num('min-dist', defaults.minDistanceMm),
    nailDiameterMm: num('nail', defaults.nailDiameterMm),
    stringThicknessMm: num('string', defaults.stringThicknessMm),
    targetGapMm: num('target', defaults.targetGapMm),
  };
}

/** Legend and preferred start nail of a board (--board-extras file.json). */
interface ExtrasInput {
  readonly start: string | null;
  readonly legend: readonly LegendEntry[];
  readonly export?: { readonly holes: HoleMode; readonly edge: boolean };
}

function readExtras(): ExtrasInput | null {
  const file = arg('board-extras', '');
  if (!file) return null;
  const json = JSON.parse(readFileSync(file, 'utf8')) as {
    start?: string;
    legend?: { symbol?: string; text?: string }[];
    export?: { holes?: string; edge?: boolean };
  };
  const holes = json.export?.holes;
  return {
    start: json.start ?? null,
    legend: (json.legend ?? []).map((e) => ({
      symbol: e.symbol === 'ring' || e.symbol === 'nail' ? e.symbol : 'none',
      text: e.text ?? '',
    })),
    ...(holes === 'cut' || holes === 'mark' || holes === 'pit'
      ? { export: { holes, edge: json.export?.edge !== false } }
      : {}),
  };
}

async function mapDoc(
  params: PuzzleParams,
  ids: readonly number[] | null,
  list: { readonly mode: 'fixed' | 'pool'; readonly places: readonly Place[] } | null = null,
  extrasInput: ExtrasInput | null = null,
): Promise<PuzzleDoc> {
  const file = loadCountry(params.region.slice(0, 2));
  let m = meta('map');
  const towns = new Map(citiesFromColumns(file.cities, file.states).map((c) => [c.id, c]));
  const pool = list ? listCities(list.places, towns) : null;
  const selected = ids ?? pool!.map((c) => c.id);
  // The preferred start nail by name, as a pool index for the setup.
  const startPool = extrasInput?.start
    ? (list?.places.findIndex((p) => p.name === extrasInput.start) ?? -1)
    : -1;
  if (extrasInput?.start && startPool < 0)
    throw new Error(`--board-extras: start "${extrasInput.start}" is not in the list`);
  const extras: BoardExtras | null = extrasInput
    ? { legend: extrasInput.legend, startPlace: startPool >= 0 ? startPool : null }
    : null;
  const setup = boardSetup(
    file,
    { ...params, labelLanguage: m.language },
    selected,
    m.title,
    pool,
    { board: extras },
  );
  if (setup.missing.length > 0)
    throw new Error(`cities not in the pool: ${setup.missing.join(',')}`);
  const backend = await loadBackend();
  const heuristic = iteratedLocalSearch(setup.inst, new Rng(1)).tour;
  const v = verifyCandidate(backend, setup.inst, heuristic, 'string-exact', { timeLimitSec: 300 });
  if (!v.string) throw new Error('exact check failed');
  // World files measure on the sphere: digital puzzles without a board plan.
  const sphere = file.metric === 'sphere';
  const plan = sphere
    ? null
    : planBoard(
        boardPlanInput(setup, {
          tour: v.string.optimal,
          second: v.string.second,
          gapUm: v.string.gap,
        }),
        backend,
      );
  const close = closePairs(setup.points, params.minDistanceMm);
  if (sphere) m = { ...m, purpose: 'digital' };
  else if (arg('purpose', 'auto') === 'auto') {
    // Boards need a gap at the target and room for the nails; else a digital puzzle.
    const board =
      v.string.gap >= params.targetGapMm * 1000 &&
      (plan?.measured.gapUm ?? 0) >= params.targetGapMm * 1000 &&
      close.every((c) => c.distanceMm >= 12);
    m = { ...m, purpose: board ? 'board' : 'digital' };
  }
  if (close.length > 0)
    console.error(
      `close pairs: ${close.map((c) => `${setup.cities[c.a]!.name}–${setup.cities[c.b]!.name} ${c.distanceMm.toFixed(1)} mm`).join(', ')}`,
    );
  console.error(
    `${m.title} (${m.purpose}): n = ${selected.length}, string gap ${(v.string.gap / 1000).toFixed(2)} mm (${v.mode}), ` +
      `scale ${plan ? (plan.measured.gapUm / 1000).toFixed(2) : '–'} mm` +
      (plan ? `, start ${setup.cities[plan.scale.slot]!.name}` : '') +
      (plan && plan.warnings.length > 0
        ? `, warnings: ${plan.warnings.map((w) => w.kind).join(', ')}`
        : ''),
  );
  const places = list
    ? setup.cities.map((c) => list.places[pool!.indexOf(c)]!)
    : setup.cities.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon }));
  return {
    ...m,
    data: { country: file.country, version: file.dataVersion },
    map: {
      params: { ...params, n: selected.length, labelLanguage: m.language },
      places,
      ...(list ? { list } : {}),
      constraints: { pinned: [], excluded: [], groups: [] },
      ...(extrasInput
        ? {
            board: {
              ...(extrasInput.export ? { export: extrasInput.export } : {}),
              legend: extrasInput.legend,
              startPlace: extrasInput.start
                ? places.findIndex((p) => p.name === extrasInput.start)
                : null,
            },
          }
        : {}),
      results: {
        tour: v.string.optimal,
        lengthMm: v.string.optimalLength / 1000,
        gapMm: Number.isFinite(v.string.gap) ? v.string.gap / 1000 : null,
        model: 'string',
        scaleGapMm: plan ? plan.measured.gapUm / 1000 : null,
        startPlace: plan ? plan.scale.slot : null,
      },
    },
  };
}

function write(doc: PuzzleDoc): void {
  mkdirSync(DIR, { recursive: true });
  const file = `${doc.id}.tsp.json`;
  writeFileSync(path.join(DIR, file), serializePuzzleDoc(doc));
  console.error(`wrote public/puzzles/${file}`);
}

/** The Excellence puzzles first (roadmap 9.1), in this order; then by theme. */
const FIRST = [
  'exzellenzstrategie-2027-brett',
  'exzellenzstrategie-2027',
  'exzellenzuniversitaeten-2027-brett',
  'exzellenzuniversitaeten-2027',
  'exzellenzcluster-2026-verbuende',
  'exzellenzcluster-2026',
];

/** Gallery order (roadmap 9.5): Excellence, Germany, cities, Europe, world, step by step. */
function theme(e: CollectionEntry): number {
  const first = FIRST.indexOf(e.id);
  if (first >= 0) return first;
  if (e.kind === 'incremental') return 50;
  if (e.region.startsWith('WO')) return 40;
  if (e.region.startsWith('EU')) return 30;
  if (/^DE-(BE|HH|HB)$/.test(e.region)) return 20;
  return 10;
}

function rebuildIndex(): void {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.tsp.json'))
    .sort();
  const puzzles = files
    .map((f) =>
      collectionEntry(parsePuzzleDoc(JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))), f),
    )
    .sort((a, b) => theme(a) - theme(b) || a.title.localeCompare(b.title, 'de'));
  const index: CollectionIndex = { schema: PUZZLE_SCHEMA, puzzles };
  writeFileSync(path.join(DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.error(`index: ${puzzles.length} puzzles`);
}

if (command === 'add') {
  const link = decodePermalink(arg('link', ''));
  if (!link?.selected) throw new Error('--link needs a permalink with selected cities');
  write(await mapDoc(link.params, link.selected));
  rebuildIndex();
} else if (command === 'list') {
  // A fixed instance from a place list file (town names or CSV rows, see src/core/places.ts).
  const text = readFileSync(arg('file', ''), 'utf8');
  const file = loadCountry(arg('region', 'DE').slice(0, 2));
  const places = readPlaceList(text, file, Number(arg('merge', '2')));
  const defaults = defaultsFor(arg('region', 'DE'));
  const params: PuzzleParams = {
    ...defaults,
    region: arg('region', 'DE'),
    ...boardOptions(defaults),
  };
  if (args.includes('--pool')) {
    const searchP: PuzzleParams = {
      ...params,
      n: Number(arg('n', '20')),
      seed: Number(arg('seed', '1')),
      iterations: Number(arg('iterations', '1000')),
    };
    const cities = listCities(
      places,
      new Map(citiesFromColumns(file.cities, file.states).map((c) => [c.id, c])),
    );
    const projection = boardProjection(
      regionFrame(file, params.region),
      { widthMm: params.boardWidthMm, heightMm: params.boardHeightMm, marginMm: params.marginMm },
      projectionKind(file),
    );
    const pool: BoardPool = {
      projection,
      cities,
      points: boardPoints(cities, projection),
      sphere: citySphere(file, cities, projection),
    };
    // --pin 'Lübeck,Stralsund': list places the puzzle must contain.
    const pinNames = arg('pin', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const pinnedIds = pinNames.map((name) => {
      const city = cities.find((c) => c.name === name);
      if (!city) throw new Error(`--pin: ${name} is not in the list`);
      return city.id;
    });
    const { search } = runSearch({
      params: searchParams(searchP),
      pool,
      backend: await loadBackend(),
      pinnedIds,
      labels: poolLabels(pool, params.labelSizeMm, params.nailDiameterMm, params.labelLanguage),
    });
    const best = search.best;
    if (!best) throw new Error('no feasible candidate found');
    write(
      await mapDoc(
        searchP,
        best.members.map((c) => cities[c]!.id),
        { mode: 'pool', places },
      ),
    );
  } else write(await mapDoc(params, null, { mode: 'fixed', places }, readExtras()));
  rebuildIndex();
} else if (command === 'search') {
  const defaults = defaultsFor(arg('region', 'DE'));
  const world = loadCountry(arg('region', 'DE').slice(0, 2)).metric === 'sphere';
  const params: PuzzleParams = {
    ...defaults,
    ...boardOptions(defaults),
    region: arg('region', 'DE'),
    n: Number(arg('n', '40')),
    seed: Number(arg('seed', '1')),
    iterations: Number(arg('iterations', '1000')),
    minDistanceMm: Number(arg('min-dist', String(defaults.minDistanceMm))),
    targetGapMm: Number(arg('target', String(defaults.targetGapMm))),
    ...(() => {
      const [bw, bh] = arg('board', '').split('x').map(Number);
      return bw && bh ? { boardWidthMm: bw, boardHeightMm: bh } : {};
    })(),
    minPopulation: Number(arg('min-pop', String(defaults.minPopulation))),
    // --weights gap,difficulty,recognizability (e.g. 1,0.5,2 for well-known cities).
    ...(() => {
      const [g, d, r] = arg('weights', '').split(',').map(Number);
      return g !== undefined && Number.isFinite(g) && Number.isFinite(d) && Number.isFinite(r)
        ? { weightGap: g, weightDifficulty: d!, weightRecognizability: r! }
        : {};
    })(),
  };
  const country = loadCountry(params.region.slice(0, 2));
  const pool = boardPool(country, params.region, params.minPopulation, {
    widthMm: params.boardWidthMm,
    heightMm: params.boardHeightMm,
    marginMm: params.marginMm,
  });
  const { search } = runSearch({
    params: searchParams(
      params,
      world || arg('purpose', 'board') === 'digital' ? 'digital' : 'board',
    ),
    pool,
    backend: await loadBackend(),
    labels: poolLabels(pool, params.labelSizeMm, params.nailDiameterMm, params.labelLanguage),
  });
  const best = search.best;
  if (!best) throw new Error('no feasible candidate found');
  write(
    await mapDoc(
      params,
      best.members.map((c) => pool.cities[c]!.id),
    ),
  );
  rebuildIndex();
} else if (command === 'incremental') {
  const ui: IncrementalUiParams = {
    ...DEFAULT_INCREMENTAL_UI,
    n: Number(arg('n', '10')),
    seed: Number(arg('seed', '1')),
  };
  const result = generateIncremental(incrementalParams(ui), await loadBackend());
  if (!result.puzzle) throw new Error(`no sequence found (reached ${result.reached})`);
  const { puzzle } = result;
  const m = meta('incremental');
  write({
    ...m,
    data: null,
    incremental: {
      params: { ...ui, labelLanguage: m.language },
      points: puzzle.points,
      results: {
        steps: puzzle.steps.map((s) => ({
          k: s.k,
          tour: s.tour,
          stringMm: s.stringUm / 1000,
          gapMm: Number.isFinite(s.stringGapUm) ? s.stringGapUm / 1000 : null,
          trackGapMm: Number.isFinite(s.otherUm) ? stepGapUm(s) / 1000 : null,
        })),
      },
    },
  });
  rebuildIndex();
} else {
  rebuildIndex();
}

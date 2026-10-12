// Builds the curated collection in public/puzzles/: puzzle files with exact results and the
// index. Usage:
//   npx tsx cli/collection.ts add --link '<permalink>' --title 'Deutschland' [--description …]
//       [--purpose board|digital] [--id de-40] [--lang de]
//   npx tsx cli/collection.ts search --region DE --n 40 --seed 1 --title … [same options]
//   npx tsx cli/collection.ts incremental --n 12 --seed 1 --title … [--id …]
//   npx tsx cli/collection.ts index        (rebuilds index.json from the files)

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { planBoard } from '../src/core/board/plan';
import { boardPlanInput, boardSetup } from '../src/core/board/setup';
import { generateIncremental, stepGapUm } from '../src/core/incremental/generate';
import {
  DEFAULT_INCREMENTAL_UI,
  incrementalParams,
  type IncrementalUiParams,
} from '../src/core/incremental/params';
import { DEFAULT_PARAMS, searchParams, type PuzzleParams } from '../src/core/params';
import { decodePermalink } from '../src/core/permalink';
import {
  PUZZLE_SCHEMA,
  collectionEntry,
  parsePuzzleDoc,
  serializePuzzleDoc,
  type CollectionIndex,
  type PuzzleDoc,
} from '../src/core/puzzle-file';
import { Rng } from '../src/core/rng';
import { iteratedLocalSearch } from '../src/core/tsp/ils';
import { verifyCandidate } from '../src/core/verify';
import { boardPool, loadBackend, loadCountry, poolLabels } from './lib/country';
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

async function mapDoc(params: PuzzleParams, ids: readonly number[]): Promise<PuzzleDoc> {
  const file = loadCountry(params.region.slice(0, 2));
  const m = meta('map');
  const setup = boardSetup(file, { ...params, labelLanguage: m.language }, ids, m.title);
  if (setup.missing.length > 0)
    throw new Error(`cities not in the pool: ${setup.missing.join(',')}`);
  const backend = await loadBackend();
  const heuristic = iteratedLocalSearch(setup.inst, new Rng(1)).tour;
  const v = verifyCandidate(backend, setup.inst, heuristic, 'string-exact', { timeLimitSec: 300 });
  if (!v.string) throw new Error('exact check failed');
  const plan = planBoard(
    boardPlanInput(setup, { tour: v.string.optimal, second: v.string.second, gapUm: v.string.gap }),
    backend,
  );
  console.error(
    `${m.title}: n = ${ids.length}, string gap ${(v.string.gap / 1000).toFixed(2)} mm (${v.mode}), ` +
      `scale ${plan ? (plan.measured.gapUm / 1000).toFixed(2) : '–'} mm`,
  );
  return {
    ...m,
    data: { country: file.country, version: file.dataVersion },
    map: {
      params: { ...params, n: ids.length, labelLanguage: m.language },
      places: setup.cities.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lon: c.lon })),
      constraints: { pinned: [], excluded: [], groups: [] },
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

function rebuildIndex(): void {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.tsp.json'))
    .sort();
  const puzzles = files.map((f) =>
    collectionEntry(parsePuzzleDoc(JSON.parse(readFileSync(path.join(DIR, f), 'utf8'))), f),
  );
  const index: CollectionIndex = { schema: PUZZLE_SCHEMA, puzzles };
  writeFileSync(path.join(DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.error(`index: ${puzzles.length} puzzles`);
}

if (command === 'add') {
  const link = decodePermalink(arg('link', ''));
  if (!link?.selected) throw new Error('--link needs a permalink with selected cities');
  write(await mapDoc(link.params, link.selected));
  rebuildIndex();
} else if (command === 'search') {
  const params: PuzzleParams = {
    ...DEFAULT_PARAMS,
    region: arg('region', 'DE'),
    n: Number(arg('n', '40')),
    seed: Number(arg('seed', '1')),
    iterations: Number(arg('iterations', '1000')),
    minDistanceMm: Number(arg('min-dist', String(DEFAULT_PARAMS.minDistanceMm))),
    targetGapMm: Number(arg('target', String(DEFAULT_PARAMS.targetGapMm))),
  };
  const country = loadCountry(params.region.slice(0, 2));
  const pool = boardPool(country, params.region, params.minPopulation, {
    widthMm: params.boardWidthMm,
    heightMm: params.boardHeightMm,
    marginMm: params.marginMm,
  });
  const { search } = runSearch({
    params: searchParams(params),
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

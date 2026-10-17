// Searches the cities of the world board (roadmap 9.15): world cities on a flat Equal Earth
// board of 600 × 300 mm, string on nails, the leg Sydney → Los Angeles across the Pacific
// given. The string runs from Los Angeles (start nail, tied) through all other cities to Sydney
// (end nail with the scale): a shortest open path with fixed end points. The search chooses the
// cities (recognisability, label space, string gap); the best candidates are checked exactly,
// on the board (string) and on the globe (great circle, with the same given leg), and both
// orders are reported.
// Usage: npx tsx cli/world-board.ts [--n 40] [--seeds 1,2] [--iterations 1500] [--min-dist 10]
//   [--label 4] [--nail 2] [--string 1] [--target 5] [--weights 1,0.5,1] [--top 6]
//   [--pool-top 250] (only the best-known cities, by Wikipedia editions) [--out file.json] (the
//   candidates with ids, names, tours and gaps)
//   [--pin 'London,Kairo'] (cities every candidate has, roadmap 9.17; also from outside the
//   pool's top) [--exclude 'Krasnodar,Tirana'] (cities left out of the pool)

import { writeFileSync } from 'node:fs';
import { citiesFromColumns, prominence, type City } from '../src/core/data';
import { Instance } from '../src/core/instance';
import { DEFAULT_SEARCH, type Evaluation, type SearchParams } from '../src/core/search/search';
import { optimalAndSecond } from '../src/core/tsp/exact';
import { openPath, sameTour } from '../src/core/tsp/tour';
import { boardPool, loadBackend, loadCountry, poolLabels, type BoardPool } from './lib/country';
import { runSearch } from './lib/run-search';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const num = (name: string, fallback: number) => Number(arg(name, String(fallback)));

const BOARD = { widthMm: 600, heightMm: 300, marginMm: 12 };
const START = 'Los Angeles';
const END = 'Sydney';

export interface WorldCandidate {
  readonly n: number;
  readonly seed: number;
  readonly ids: number[];
  readonly names: string[];
  /** The string optimum on the board as an open path from Los Angeles to Sydney (names). */
  readonly boardPath: string[];
  /** The great-circle optimum with the same given leg (names). */
  readonly globePath: string[];
  readonly sameOrder: boolean;
  readonly stringGapMm: number;
  /** Great-circle gap between the globe's optimum and its runner-up, km. */
  readonly globeGapKm: number;
  readonly recognizability: number;
  readonly quality: number;
}

async function main(): Promise<void> {
  const backend = await loadBackend();
  const wo = loadCountry('WO');
  const world = boardPool(wo, 'WO', 0, BOARD);
  // Only the best-known cities (Wikipedia editions); on the board the string lies on the flat
  // map: no great circles in the search.
  const top = num('pool-top', 250);
  const list = (name: string) =>
    arg(name, '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  const pins = list('pin');
  const excluded = new Set(list('exclude'));
  const ranked = world.cities
    .map((c, i) => ({ i, fame: prominence(c) }))
    .sort((a, b) => b.fame - a.fame || a.i - b.i)
    .map((x) => x.i);
  const keep = [
    ...new Set([
      ...ranked.slice(0, top),
      // Pinned cities (by name, the best-known of a name) also from below the top.
      ...pins.map((name) => {
        const i = ranked.find((k) => world.cities[k]!.name === name);
        if (i === undefined) throw new Error(`--pin: ${name} is not in the world data`);
        return i;
      }),
    ]),
  ]
    .filter((i) => !excluded.has(world.cities[i]!.name))
    .sort((a, b) => a - b);
  const pool: BoardPool = {
    projection: world.projection,
    cities: keep.map((i) => world.cities[i]!),
    points: keep.map((i) => world.points[i]!),
    sphere: null,
  };
  const nail = num('nail', 2);
  const rEffMm = nail / 2 + num('string', 1) / 2;
  const labels = poolLabels(pool, num('label', 4), nail, 'de');
  const id = (name: string) => {
    const c = pool.cities.find((x) => x.name === name);
    if (!c) throw new Error(`${name} is not in the world pool`);
    return c.id;
  };
  const fixedIds = [id(START), id(END)] as const;
  const [wg, wd, wr] = arg('weights', '1,0.5,1').split(',').map(Number);
  const towns = new Map(citiesFromColumns(wo.cities, wo.states).map((c) => [c.id, c]));
  const out: WorldCandidate[] = [];
  for (const n of arg('n', '40').split(',').map(Number))
    for (const seed of arg('seeds', '1').split(',').map(Number)) {
      const params: SearchParams = {
        ...DEFAULT_SEARCH,
        n,
        seed,
        minDistanceMm: num('min-dist', 10),
        targetGapMm: num('target', 5),
        rEffMm,
        iterations: num('iterations', 1500),
        weights: { ...DEFAULT_SEARCH.weights, gap: wg!, difficulty: wd!, recognizability: wr! },
      };
      const { search, elapsedMs } = runSearch({
        params,
        pool,
        backend,
        pinnedIds: [...fixedIds, ...pins.map(id)],
        fixedIds,
        labels,
      });
      console.error(
        `n ${n}, seed ${seed}: ${search.archive.length} feasible candidates in ${Math.round(elapsedMs / 1000)} s`,
      );
      for (const e of search.archive.slice(0, num('top', 6))) {
        const c = check(e, pool, rEffMm, fixedIds, towns, backend);
        if (!c) continue;
        out.push({ ...c, n, seed });
        console.error(
          `  gap ${c.stringGapMm.toFixed(2)} mm, globe ${c.sameOrder ? 'same order' : 'OTHER order'} (gap ${c.globeGapKm.toFixed(0)} km), recognizability ${c.recognizability.toFixed(3)}`,
        );
      }
    }
  out.sort((a, b) => Number(b.sameOrder) - Number(a.sameOrder) || b.quality - a.quality);
  const file = arg('out', '');
  if (file) writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    [
      '| n | seed | string gap (mm) | globe | globe gap (km) | recognizability | cities |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...out.map(
        (c) =>
          `| ${c.n} | ${c.seed} | ${c.stringGapMm.toFixed(2)} | ${c.sameOrder ? 'same order' : 'other order'} | ${c.globeGapKm.toFixed(0)} | ${c.recognizability.toFixed(3)} | ${c.boardPath.join(' → ')} |`,
      ),
    ].join('\n'),
  );
}

/** Exact checks of a candidate: the string optimum on the board and the globe's order. */
function check(
  e: Evaluation,
  pool: BoardPool,
  rEffMm: number,
  fixedIds: readonly [number, number],
  towns: ReadonlyMap<number, City>,
  backend: Awaited<ReturnType<typeof loadBackend>>,
): Omit<WorldCandidate, 'n' | 'seed'> | null {
  const members = [...e.members];
  const cities = members.map((i) => pool.cities[i]!);
  const slot = (cityId: number) => cities.findIndex((c) => c.id === cityId);
  const fixed = [slot(fixedIds[0]), slot(fixedIds[1])] as const;
  const points = members.map((i) => pool.points[i]!);
  const board = new Instance(points, rEffMm, null, fixed);
  const start = e.tour.map((c) => members.indexOf(c));
  const exact = optimalAndSecond(
    backend,
    board,
    'string',
    { optimal: start },
    { timeLimitSec: 120 },
  );
  if (exact.optimal.status !== 'optimal' || exact.second?.status !== 'optimal') return null;
  const lonLat = cities.map((c) => [towns.get(c.id)!.lon, towns.get(c.id)!.lat] as const);
  const globe = new Instance(points, 0, { lonLat, mmPerKm: pool.projection.mmPerKm }, fixed);
  const g = optimalAndSecond(backend, globe, 'euclidean', {}, { timeLimitSec: 120 });
  if (g.optimal.status !== 'optimal' || g.second?.status !== 'optimal') return null;
  const names = (tour: readonly number[]) => openPath(board, tour)!.map((s) => cities[s]!.name);
  return {
    ids: cities.map((c) => c.id),
    names: cities.map((c) => c.name),
    boardPath: names(exact.optimal.tour!),
    globePath: names(g.optimal.tour!),
    sameOrder: sameTour(exact.optimal.tour!, g.optimal.tour!, board.n),
    stringGapMm: (exact.second.cost - exact.optimal.cost) / 1000,
    globeGapKm: (g.second.cost - g.optimal.cost) / 1000 / pool.projection.mmPerKm,
    recognizability: e.recognizability,
    quality: e.quality,
  };
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

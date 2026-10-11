// Runs the puzzle search in Node and prints the result as JSON (progress goes to stderr).
// Usage: npx tsx cli/search.ts [--region DE] [--n 40] [--seed 1] [--iterations 2000]
//   [--target 5] [--min-dist 25] [--min-pop 5000] [--r-eff 1.5] [--weights 1,0.5,0.5]
//   [--pin id,id] [--verify 3] [--no-level2] [--labels 8] [--nail 2] [--out file.json]
// --labels: font size in mm of the board labels that must fit (default 0: no label constraint).

import { writeFileSync } from 'node:fs';
import { DEFAULT_SEARCH, type SearchParams } from '../src/core/search/search';
import { boardPool, loadBackend, loadCountry, poolLabels } from './lib/country';
import { runSearch, summarize, verify } from './lib/run-search';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const region = arg('region', 'DE');
const [wGap, wDiff, wRec] = arg('weights', '1,0.5,0.5').split(',').map(Number) as [
  number,
  number,
  number,
];
const params: SearchParams = {
  ...DEFAULT_SEARCH,
  n: Number(arg('n', String(DEFAULT_SEARCH.n))),
  seed: Number(arg('seed', '1')),
  iterations: Number(arg('iterations', String(DEFAULT_SEARCH.iterations))),
  targetGapMm: Number(arg('target', String(DEFAULT_SEARCH.targetGapMm))),
  minDistanceMm: Number(arg('min-dist', String(DEFAULT_SEARCH.minDistanceMm))),
  rEffMm: Number(arg('r-eff', String(DEFAULT_SEARCH.rEffMm))),
  weights: { gap: wGap, difficulty: wDiff, recognizability: wRec },
};
const minPop = Number(arg('min-pop', '5000'));
const verifyCount = Number(arg('verify', '0'));
const pinnedIds = arg('pin', '').split(',').filter(Boolean).map(Number);
const labelSize = Number(arg('labels', '0'));
const nailDiameter = Number(arg('nail', '2'));

const file = loadCountry(region.slice(0, 2));
const pool = boardPool(file, region, minPop);
const backend = args.includes('--no-level2') && verifyCount === 0 ? undefined : await loadBackend();

const { search, elapsedMs } = runSearch({
  params,
  pool,
  backend: args.includes('--no-level2') ? undefined : backend,
  pinnedIds,
  labels: labelSize > 0 ? poolLabels(pool, labelSize, nailDiameter) : undefined,
  progressEvery: 100,
  onProgress: (s, ms) => {
    const best = s.best;
    process.stderr.write(
      `it ${s.iteration} T ${s.temperature.toFixed(4)} cur gap ${(s.current.gapUm / 1000).toFixed(2)} mm` +
        ` best ${best ? `${(best.gapUm / 1000).toFixed(2)} mm q ${best.quality.toFixed(3)}` : '-'}` +
        ` unplaced ${s.current.unplacedLabels}` +
        ` | evals ${s.stats.evaluations} hits ${s.stats.cacheHits} L2 ${s.stats.level2} acc ${s.stats.accepted}` +
        ` | ${(ms / 1000).toFixed(1)} s\n`,
    );
  },
});

const archive = search.archive.map((e) => summarize(e, pool.cities));
const verification = backend
  ? search.archive.slice(0, verifyCount).map((e) => verify(backend, e, pool, params.rEffMm, 120))
  : [];
const result = {
  region,
  minPopulation: minPop,
  params,
  mmPerKm: Math.round(pool.projection.mmPerKm * 1e4) / 1e4,
  stats: search.stats,
  best: search.best ? summarize(search.best, pool.cities) : null,
  archive,
  verification,
};
process.stderr.write(`done in ${(elapsedMs / 1000).toFixed(1)} s\n`);
const json = JSON.stringify(result, null, 2) + '\n';
const out = arg('out', '');
if (out) writeFileSync(out, json);
else process.stdout.write(json);

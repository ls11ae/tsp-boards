// Measurement: achievable gaps in string length for Germany with n = 30, 40, 50.
//   max-gap: target 3 mm, gap term saturating at 40 mm, weights (1, 0, 0): how large can the
//            gap get?
//   default: target 5 mm, default weights: what do balanced puzzles look like?
// The top archive candidates of each run are verified with the exact string model.
// Usage: npx tsx cli/gap-survey.ts [--sizes 30,40,50] [--seeds 3] [--iterations 1500]
//   [--verify 3] [--out docs/experiments/gap-survey.md]

import { writeFileSync } from 'node:fs';
import { DEFAULT_SEARCH, type SearchParams } from '../src/core/search/search';
import { boardPool, loadBackend, loadCountry } from './lib/country';
import { runSearch, summarize, verify, type VerificationSummary } from './lib/run-search';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const sizes = arg('sizes', '30,40,50').split(',').map(Number);
const seeds = Number(arg('seeds', '3'));
const iterations = Number(arg('iterations', '1500'));
const verifyCount = Number(arg('verify', '3'));
const out = arg('out', '');

const backend = await loadBackend();
const pool = boardPool(loadCountry('de'), 'DE', 5000);

const modes: Record<string, Partial<SearchParams>> = {
  'max-gap': {
    targetGapMm: 3,
    gapSaturationMm: 40,
    weights: { gap: 1, difficulty: 0, recognizability: 0, interior: 0, nonNearest: 0 },
  },
  default: { targetGapMm: 5, gapSaturationMm: null },
};

interface Row {
  mode: string;
  n: number;
  seed: number;
  seconds: number;
  level2: number;
  archive: number;
  bestBoundMm: number | null;
  verified: (VerificationSummary & {
    boundMm: number;
    difficulty: number;
    recognizability: number;
  })[];
}
const rows: Row[] = [];
const lines: string[] = [];
const log = (line: string) => {
  console.log(line);
  lines.push(line);
};

for (const [mode, overrides] of Object.entries(modes)) {
  for (const n of sizes) {
    for (let seed = 1; seed <= seeds; seed++) {
      const params: SearchParams = { ...DEFAULT_SEARCH, ...overrides, n, seed, iterations };
      const { search, elapsedMs } = runSearch({ params, pool, backend });
      const top = search.archive.slice(0, verifyCount);
      const verified = top.map((e) => ({
        ...verify(backend, e, pool, params.rEffMm, 300),
        boundMm: e.gapUm / 1000,
        difficulty: e.difficulty.score,
        recognizability: e.recognizability,
      }));
      const row: Row = {
        mode,
        n,
        seed,
        seconds: Math.round(elapsedMs / 1000),
        level2: search.stats.level2,
        archive: search.archive.length,
        bestBoundMm: search.archive[0] ? search.archive[0].gapUm / 1000 : null,
        verified,
      };
      rows.push(row);
      const v = verified
        .map(
          (x) =>
            `${x.boundMm.toFixed(2)}→${x.stringGapMm?.toFixed(2) ?? '?'} mm (${x.mode === 'string-exact' ? 'exact' : 'local'}, ${(x.ms / 1000).toFixed(0)} s, D ${x.difficulty.toFixed(2)}, R ${x.recognizability.toFixed(2)})`,
        )
        .join('; ');
      log(
        `${mode.padEnd(8)} n=${n} seed ${seed}: ${row.seconds} s, L2 ${row.level2}, archive ${row.archive} | ${v}`,
      );
      if (mode === 'default' && search.best) {
        log(`         best: ${summarize(search.best, pool.cities).names.join(', ')}`);
      }
    }
  }
}

log('');
log(
  '| mode | n | runs | max verified gap (mm) | median of run maxima (mm) | bound overestimates |',
);
log('|---|---|---|---|---|---|');
for (const mode of Object.keys(modes)) {
  for (const n of sizes) {
    const runs = rows.filter((r) => r.mode === mode && r.n === n);
    const maxima = runs
      .map((r) => Math.max(...r.verified.map((v) => v.stringGapMm ?? 0), 0))
      .sort((a, b) => a - b);
    const all = runs.flatMap((r) => r.verified);
    const over = all.filter(
      (v) => v.stringGapMm !== null && v.stringGapMm < v.boundMm - 0.001,
    ).length;
    log(
      `| ${mode} | ${n} | ${runs.length} | ${Math.max(...maxima).toFixed(2)} | ${maxima[Math.floor(maxima.length / 2)]?.toFixed(2)} | ${over}/${all.length} |`,
    );
  }
}
if (out) writeFileSync(out, lines.join('\n') + '\n');

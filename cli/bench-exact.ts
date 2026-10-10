// Benchmark: heuristics, gap scan and both exact models (Euclidean DFJ, string/turn-cost model)
// on random and German instances.
// Usage: npx tsx cli/bench-exact.ts [--sizes 20,30,40] [--trials 3] [--string-max 40]

import { Instance } from '../src/core/instance';
import { Rng } from '../src/core/rng';
import { randomPoints } from '../src/core/test-utils';
import { optimalAndSecond, type ExactModelKind } from '../src/core/tsp/exact';
import { iteratedLocalSearch } from '../src/core/tsp/ils';
import { alternativeTour, scanSecondBest } from '../src/core/tsp/second-best';
import { boardPool, loadBackend, loadCountry, ms, randomSubset } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const sizes = arg('sizes', '20,30,40,50').split(',').map(Number);
const trials = Number(arg('trials', '3'));
const stringMax = Number(arg('string-max', '40'));
const rEffMm = Number(arg('r-eff', '1.5'));
const timeLimitSec = Number(arg('time-limit', '120'));

const backend = await loadBackend();
const germany = boardPool(loadCountry('de'), 'DE', 5000);

interface Row {
  label: string;
  ils: number;
  scan: number;
  scanDb: number;
  gapScan: number;
  euclid: string;
  str: string;
}
const rows: Row[] = [];

function exact(inst: Instance, kind: ExactModelKind, tour: number[], second: number[] | undefined) {
  const t0 = performance.now();
  const result = optimalAndSecond(backend, inst, kind, { optimal: tour, second }, { timeLimitSec });
  const total = ms(t0);
  const gap =
    result.second?.status === 'optimal' ? (result.second.cost - result.optimal.cost) / 1000 : NaN;
  return `${total} ms (${result.optimal.runs}+${result.second?.runs ?? 0} runs, ${result.optimal.status}/${result.second?.status ?? '-'}, gap ${gap.toFixed(2)} mm)`;
}

for (const n of sizes) {
  for (let trial = 0; trial < trials; trial++) {
    for (const source of ['uniform', 'germany'] as const) {
      const points =
        source === 'uniform'
          ? randomPoints(n, 1000 * n + trial)
          : randomSubset(germany, n, 25, 1000 * n + trial).map((i) => germany.points[i]!);
      const inst = new Instance(points, rEffMm);
      const euclid = inst.euclidean();

      let t0 = performance.now();
      const ils = iteratedLocalSearch(inst, new Rng(trial));
      const ilsMs = ms(t0);
      t0 = performance.now();
      const scan = scanSecondBest(inst, ils.tour);
      const scanMs = ms(t0);
      t0 = performance.now();
      const scanDb = scanSecondBest(inst, scan.tour, { doubleBridge: true });
      const scanDbMs = ms(t0);

      const eIls = iteratedLocalSearch(euclid, new Rng(trial));
      const eScan = scanSecondBest(euclid, eIls.tour, { doubleBridge: true });
      const eSecond = eScan.best ? alternativeTour(eScan.tour, eScan.best) : undefined;
      const euclidResult = exact(euclid, 'euclidean', eScan.tour, eSecond);

      const second = scanDb.best ? alternativeTour(scanDb.tour, scanDb.best) : undefined;
      const stringResult = n <= stringMax ? exact(inst, 'string', scanDb.tour, second) : 'skipped';
      rows.push({
        label: `n=${n} ${source} #${trial}`,
        ils: ilsMs,
        scan: scanMs,
        scanDb: scanDbMs,
        gapScan: scanDb.gap / 1000,
        euclid: euclidResult,
        str: stringResult,
      });
      const r = rows.at(-1)!;
      console.log(
        `${r.label.padEnd(20)} ILS ${r.ils} ms | scan ${r.scan} ms, +DB ${r.scanDb} ms, gapEst ${r.gapScan.toFixed(2)} mm | euclid ${r.euclid} | string ${r.str}`,
      );
    }
  }
}

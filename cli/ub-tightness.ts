// Experiment: how tight is the local gap bound (gapEst) compared with the exact gap?
//   Part 1 (Euclidean, r_eff = 0): many instances, exact DFJ reference.
//   Part 2 (string, r_eff > 0): fewer instances, exact turn-cost model as reference; also tests
//   the combined bound min(gapEst, S(Euclidean optimum), S(Euclidean runner-up)) − S*.
// Usage: npx tsx cli/ub-tightness.ts [--sizes 30,40,50] [--euclid 200] [--string 20]

import { Instance } from '../src/core/instance';
import { Rng } from '../src/core/rng';
import { randomPoints } from '../src/core/test-utils';
import { optimalAndSecond } from '../src/core/tsp/exact';
import { iteratedLocalSearch } from '../src/core/tsp/ils';
import { alternativeTour, scanSecondBest, type MoveKind } from '../src/core/tsp/second-best';
import { edgeDifference, sameTour, stringLength } from '../src/core/tsp/tour';
import { boardPool, loadBackend, loadCountry, randomSubset } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const sizes = arg('sizes', '30,40,50').split(',').map(Number);
const euclidCount = Number(arg('euclid', '200'));
const stringCount = Number(arg('string', '20'));
const stringMax = Number(arg('string-max', '40'));
const rEffMm = Number(arg('r-eff', '1.5'));
const targetsMm = [1, 2, 3, 5];

const backend = await loadBackend();
const germany = boardPool(loadCountry('de'), 'DE', 5000);

function points(source: 'uniform' | 'germany', n: number, seed: number) {
  return source === 'uniform'
    ? randomPoints(n, seed)
    : randomSubset(germany, n, 25, seed).map((i) => germany.points[i]!);
}

interface Sample {
  readonly est: number;
  readonly exact: number;
  readonly combined?: number;
  /** Combined with the Euclidean optimum only (no runner-up solve). */
  readonly combinedOpt?: number;
  readonly kind: MoveKind | null;
  readonly edgesChanged: number;
  readonly heuristicOptimal: boolean;
}

function summarize(
  label: string,
  samples: readonly Sample[],
  key: 'est' | 'combined' | 'combinedOpt' = 'est',
) {
  const valid = samples.filter((s) => s[key] !== undefined);
  const tight = valid.filter((s) => s[key] === s.exact).length;
  const kinds = new Map<string, number>();
  for (const s of valid)
    if (s[key] === s.exact && s.kind) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const hist = new Map<number, number>();
  for (const s of valid) hist.set(s.edgesChanged, (hist.get(s.edgesChanged) ?? 0) + 1);
  const falseAccept = targetsMm.map((t) => {
    const accepted = valid.filter((s) => s[key]! >= t * 1000);
    const wrong = accepted.filter((s) => s.exact < t * 1000).length;
    return `${t} mm: ${wrong}/${accepted.length}`;
  });
  const heuristicMisses = valid.filter((s) => !s.heuristicOptimal).length;
  console.log(
    `${label}: ${valid.length} instances, tight ${((100 * tight) / valid.length).toFixed(1)} %, ` +
      `heuristic not optimal ${heuristicMisses}, false accepts [${falseAccept.join(', ')}]`,
  );
  console.log(`   tight by move: ${[...kinds].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(
    `   edges changed in exact 2nd best: ${[...hist]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')}`,
  );
}

for (const n of sizes) {
  for (const source of ['uniform', 'germany'] as const) {
    const samples: Sample[] = [];
    for (let i = 0; i < euclidCount; i++) {
      const inst = new Instance(points(source, n, 7919 * n + i), 0);
      const ils = iteratedLocalSearch(inst, new Rng(i));
      const scan = scanSecondBest(inst, ils.tour, { doubleBridge: true });
      const exact = optimalAndSecond(backend, inst, 'euclidean', {
        optimal: scan.tour,
        second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined,
      });
      if (exact.second?.status !== 'optimal') continue;
      samples.push({
        est: scan.gap,
        exact: exact.second.cost - exact.optimal.cost,
        kind: scan.best?.kind ?? null,
        edgesChanged: edgeDifference(exact.optimal.tour!, exact.second.tour!, n),
        heuristicOptimal: scan.length === exact.optimal.cost,
      });
    }
    summarize(`euclid n=${n} ${source}`, samples);
  }
}

for (const n of sizes.filter((s) => s <= stringMax)) {
  for (const source of ['uniform', 'germany'] as const) {
    const samples: Sample[] = [];
    for (let i = 0; i < stringCount; i++) {
      const inst = new Instance(points(source, n, 104729 * n + i), rEffMm);
      const ils = iteratedLocalSearch(inst, new Rng(i));
      const scan = scanSecondBest(inst, ils.tour, { doubleBridge: true });
      const exact = optimalAndSecond(backend, inst, 'string', {
        optimal: scan.tour,
        second: scan.best ? alternativeTour(scan.tour, scan.best) : undefined,
      });
      if (exact.second?.status !== 'optimal') continue;
      const opt = exact.optimal.cost;
      const eInst = inst.euclidean();
      const eExact = optimalAndSecond(backend, eInst, 'euclidean', { optimal: scan.tour });
      let combined = scan.gap;
      let combinedOpt = scan.gap;
      for (const t of [eExact.optimal.tour, eExact.second?.tour]) {
        if (t && !sameTour(t, exact.optimal.tour!, n))
          combined = Math.min(combined, stringLength(inst, t) - opt);
      }
      const eOpt = eExact.optimal.tour;
      if (eOpt && !sameTour(eOpt, exact.optimal.tour!, n)) {
        combinedOpt = Math.min(combinedOpt, stringLength(inst, eOpt) - opt);
      }
      samples.push({
        est: scan.gap,
        exact: exact.second.cost - opt,
        combined,
        combinedOpt,
        kind: scan.best?.kind ?? null,
        edgesChanged: edgeDifference(exact.optimal.tour!, exact.second.tour!, n),
        heuristicOptimal: scan.length === opt,
      });
    }
    summarize(`string n=${n} ${source} (local bound)`, samples);
    summarize(`string n=${n} ${source} (combined with Euclidean exact)`, samples, 'combined');
    summarize(
      `string n=${n} ${source} (combined with Euclidean optimum only)`,
      samples,
      'combinedOpt',
    );
  }
}

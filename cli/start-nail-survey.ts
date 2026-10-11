// Measurement: how much of the string gap survives the start nail and the scale?
// For the top archive candidates of search runs (Germany), the exact string optimum and gap are
// computed, then the board is planned: start nail with the best bound, exact measured gap.
// Usage: npx tsx cli/start-nail-survey.ts [--n 40] [--seeds 3] [--iterations 1000] [--top 3]
//   [--target 5] [--out file.md]

import { writeFileSync } from 'node:fs';
import { DEFAULT_LABELS } from '../src/core/board/labels';
import { measureText } from '../src/core/board/text';
import { planBoard, scaleCandidates } from '../src/core/board/plan';
import { turnAt } from '../src/core/board/measure';
import { boardLabel } from '../src/core/data';
import { Instance } from '../src/core/instance';
import { DEFAULT_SEARCH } from '../src/core/search/search';
import { verifyCandidate } from '../src/core/verify';
import { boardPool, loadBackend, loadCountry, ms, poolLabels } from './lib/country';
import { runSearch } from './lib/run-search';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const n = Number(arg('n', '40'));
const seeds = Number(arg('seeds', '3'));
const iterations = Number(arg('iterations', '1000'));
const top = Number(arg('top', '3'));
const target = Number(arg('target', '5'));
const rEffMm = 1.5;

const backend = await loadBackend();
const pool = boardPool(loadCountry('de'), 'DE', 5000);
const labels = poolLabels(pool, 8, 2);
const lines: string[] = [
  `n = ${n}, target ${target} mm, r_eff ${rEffMm} mm, ${iterations} iterations, top ${top} per seed.`,
  '',
  '| seed | # | string gap | bound (best nail) | measured gap | θ at start | start nails fitting | plan time |',
  '| - | - | - | - | - | - | - | - |',
];
for (let seed = 1; seed <= seeds; seed++) {
  const params = { ...DEFAULT_SEARCH, n, seed, iterations, targetGapMm: target, rEffMm };
  const { search } = runSearch({ params, pool, backend, labels });
  for (const [rank, e] of search.archive.slice(0, top).entries()) {
    const points = e.members.map((c) => pool.points[c]!);
    const inst = new Instance(points, rEffMm);
    const slot = new Map(e.members.map((c, s) => [c, s]));
    const v = verifyCandidate(
      backend,
      inst,
      e.tour.map((c) => slot.get(c)!),
      'string-exact',
      { timeLimitSec: 120 },
    );
    if (!v.string || v.mode !== 'string-exact') continue;
    const input = {
      inst,
      tour: v.string.optimal,
      second: v.string.second,
      stringGapUm: v.string.gap,
      targetGapUm: target * 1000,
      width: 600,
      height: 800,
      nailDiameterMm: 2,
      labels: {
        metrics: e.members.map((c) => measureText(boardLabel(pool.cities[c]!, 'de'), 8)),
        options: { ...DEFAULT_LABELS, nailClearanceMm: 3.5 },
      },
      titleSize: [150, 30] as const,
      footerSize: [250, 4] as const,
    };
    const t0 = performance.now();
    const plan = planBoard(input, backend);
    const fitting = scaleCandidates(input).length;
    const mm = (um: number) => (um / 1000).toFixed(2);
    lines.push(
      `| ${seed} | ${rank + 1} | ${mm(v.string.gap)} mm | ${plan ? mm(plan.measured.boundUm) : '–'} mm | ` +
        `${plan ? `${mm(plan.measured.gapUm)} mm (${plan.measured.kind})` : '–'} | ` +
        `${plan ? turnAt(points, v.string.optimal, plan.scale.slot).toFixed(2) : '–'} rad | ${fitting} | ${ms(t0)} ms |`,
    );
    process.stderr.write(lines.at(-1)! + '\n');
  }
}
const text = lines.join('\n') + '\n';
const out = arg('out', '');
if (out) writeFileSync(out, text);
else process.stdout.write(text);

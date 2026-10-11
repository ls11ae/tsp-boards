// Measurement: which sizes and gaps can the incremental generator reach?
// Usage: npx tsx cli/incremental-survey.ts [--seeds 3] [--board 400x400] [--out file.md]

import { writeFileSync } from 'node:fs';
import {
  DEFAULT_INCREMENTAL,
  generateIncremental,
  stepGapUm,
} from '../src/core/incremental/generate';
import { loadBackend, ms } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const seeds = Number(arg('seeds', '3'));
const [w, h] = arg('board', '400x400').split('x').map(Number) as [number, number];
const backend = await loadBackend();
const lines = [
  `Board ${w} × ${h} mm, margin ${DEFAULT_INCREMENTAL.marginMm} mm, min. distance ${DEFAULT_INCREMENTAL.minDistanceMm} mm, mark spacing ${DEFAULT_INCREMENTAL.spacingMm} mm, budget ${DEFAULT_INCREMENTAL.maxChecks} exact checks, ${seeds} seeds per row.`,
  '',
  '| N | target gap | found | median time | median checks | smallest gap at the track (median) |',
  '| - | - | - | - | - | - |',
];
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.floor((s.length - 1) / 2)]!;
};
for (const n of [8, 12, 16]) {
  for (const gap of [5, 10, 15]) {
    const times: number[] = [];
    const checks: number[] = [];
    const gaps: number[] = [];
    let found = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const t0 = performance.now();
      const r = generateIncremental(
        { ...DEFAULT_INCREMENTAL, n, targetGapMm: gap, seed, widthMm: w, heightMm: h },
        backend,
      );
      times.push(ms(t0));
      checks.push(r.checks);
      if (r.puzzle) {
        found++;
        gaps.push(Math.min(...r.puzzle.steps.slice(1).map((s) => stepGapUm(s))) / 1000);
      }
    }
    lines.push(
      `| ${n} | ${gap} mm | ${found}/${seeds} | ${(median(times) / 1000).toFixed(1)} s | ${median(checks)} | ${gaps.length ? `${median(gaps).toFixed(1)} mm` : '–'} |`,
    );
    process.stderr.write(lines.at(-1)! + '\n');
  }
}
const text = lines.join('\n') + '\n';
const out = arg('out', '');
if (out) writeFileSync(out, text);
else process.stdout.write(text);

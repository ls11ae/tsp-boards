// Generates an incremental puzzle and prints its points and per-instance figures as JSON.
// Usage: npx tsx cli/incremental.ts [--n 10] [--seed 1] [--board 400x400] [--gap 5]
//   [--spacing 10] [--min-dist 30] [--out file.json]

import { writeFileSync } from 'node:fs';
import {
  DEFAULT_INCREMENTAL,
  generateIncremental,
  stepGapUm,
  trackMarks,
  type IncrementalParams,
} from '../src/core/incremental/generate';
import { loadBackend, ms } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const [w, h] = arg('board', '400x400').split('x').map(Number) as [number, number];
const params: IncrementalParams = {
  ...DEFAULT_INCREMENTAL,
  n: Number(arg('n', String(DEFAULT_INCREMENTAL.n))),
  seed: Number(arg('seed', '1')),
  widthMm: w,
  heightMm: h,
  targetGapMm: Number(arg('gap', String(DEFAULT_INCREMENTAL.targetGapMm))),
  spacingMm: Number(arg('spacing', String(DEFAULT_INCREMENTAL.spacingMm))),
  minDistanceMm: Number(arg('min-dist', String(DEFAULT_INCREMENTAL.minDistanceMm))),
};

const backend = await loadBackend();
const t0 = performance.now();
const result = generateIncremental(params, backend);
const elapsed = ms(t0);
const round = (x: number) => Math.round(x * 100) / 100;
const puzzle = result.puzzle;
const out = {
  params,
  found: puzzle !== null,
  reached: result.reached,
  checks: result.checks,
  ms: elapsed,
  points: puzzle?.points.map(([x, y]) => [round(x), round(y)]) ?? null,
  steps:
    puzzle?.steps.map((s) => ({
      k: s.k,
      tour: s.tour.map((v) => v + 1),
      stringMm: round(s.stringUm / 1000),
      stringGapMm: s.stringGapUm === Infinity ? null : round(s.stringGapUm / 1000),
      measuredGapMm: s.otherUm === Infinity ? null : round(stepGapUm(s) / 1000),
    })) ?? null,
  marks: puzzle
    ? trackMarks(puzzle.steps, puzzle.track).map((m) => ({ k: m.k, s: round(m.s) }))
    : null,
  trackEnd: puzzle ? round(puzzle.track.end) : null,
};
process.stderr.write(
  `${puzzle ? 'found' : `not found (reached ${result.reached})`} after ${result.checks} exact checks, ${elapsed} ms\n`,
);
const json = JSON.stringify(out, null, 2) + '\n';
const file = arg('out', '');
if (file) writeFileSync(file, json);
else process.stdout.write(json);

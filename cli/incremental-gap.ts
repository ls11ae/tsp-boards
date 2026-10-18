// Searches the incremental test board with the largest smallest gap at the track (roadmap 9.20):
// many seeds for 12, 11 and 10 nails, each with target gaps from high to low, keeping the
// first board found per seed (its smallest gap at the track may exceed the target). The thesis'
// conditions stay as for the board (mark spacing, the change rule from 5 nails, clearance from
// earlier tours); board 300 × 300 mm, nails 2.0 mm and string 1 mm (r_eff 1.5 mm).
// Usage: npx tsx cli/incremental-gap.ts [--n 12,11,10] [--seeds 1-40] [--targets 14,12,10,8,6.5]
//   [--max-checks 1000] [--out file.json]

import { writeFileSync } from 'node:fs';
import {
  DEFAULT_INCREMENTAL,
  generateIncremental,
  stepGapUm,
  type IncrementalParams,
} from '../src/core/incremental/generate';
import { loadBackend, ms } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const [from, to] = arg('seeds', '1-40').split('-').map(Number) as [number, number];
const targets = arg('targets', '14,12,10,8,6.5').split(',').map(Number);
const BOARD: Partial<IncrementalParams> = {
  widthMm: 300,
  heightMm: 300,
  marginMm: 35,
  minDistanceMm: 25,
  rEffMm: 1.5,
  maxChecks: Number(arg('max-checks', '1000')),
};

export interface GapBoard {
  readonly n: number;
  readonly seed: number;
  readonly target: number;
  /** Smallest gap at the track and smallest string gap over the instances, mm. */
  readonly trackGapMm: number;
  readonly stringGapMm: number;
  readonly checks: number;
  readonly ms: number;
}

const backend = await loadBackend();
const found: GapBoard[] = [];
for (const n of arg('n', '12,11,10').split(',').map(Number)) {
  for (let seed = from; seed <= to; seed++) {
    for (const target of targets) {
      const t0 = performance.now();
      const r = generateIncremental(
        { ...DEFAULT_INCREMENTAL, ...BOARD, n, seed, targetGapMm: target },
        backend,
      );
      if (!r.puzzle) continue;
      const steps = r.puzzle.steps.slice(1);
      const board: GapBoard = {
        n,
        seed,
        target,
        trackGapMm: Math.min(...steps.map((s) => stepGapUm(s))) / 1000,
        stringGapMm: Math.min(...steps.map((s) => s.stringGapUm)) / 1000,
        checks: r.checks,
        ms: ms(t0),
      };
      found.push(board);
      process.stderr.write(
        `n ${n}, seed ${seed}: target ${target} mm, smallest gap at the track ${board.trackGapMm.toFixed(2)} mm (string ${board.stringGapMm.toFixed(2)} mm), ${board.checks} checks, ${(board.ms / 1000).toFixed(1)} s\n`,
      );
      break;
    }
  }
}
found.sort((a, b) => b.trackGapMm - a.trackGapMm);
const file = arg('out', '');
if (file) writeFileSync(file, `${JSON.stringify(found, null, 2)}\n`);
for (const n of [...new Set(found.map((b) => b.n))].sort((a, b) => b - a)) {
  console.log(`\n${n} nails: ${found.filter((b) => b.n === n).length} boards`);
  for (const b of found.filter((x) => x.n === n).slice(0, 8))
    console.log(
      `  seed ${b.seed}: ${b.trackGapMm.toFixed(2)} mm at the track, ${b.stringGapMm.toFixed(2)} mm string (target ${b.target})`,
    );
}

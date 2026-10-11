// Measurement: how often do board labels fit for random city subsets of Germany?
// Usage: npx tsx cli/label-survey.ts [--samples 200] [--board 600x800x30] [--scale 1]
// --scale multiplies the minimum distances (e.g. 0.67 for a 400 × 533 mm board).

import { labelCandidates, placeLabels, SEARCH_NODE_LIMIT } from '../src/core/board/labels';
import { boardPool, loadCountry, poolLabels, randomSubset } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const samples = Number(arg('samples', '200'));
const [widthMm, heightMm, marginMm] = arg('board', '600x800x30').split('x').map(Number) as [
  number,
  number,
  number,
];
const scale = Number(arg('scale', '1'));
const pool = boardPool(loadCountry('de'), 'DE', 5000, { widthMm, heightMm, marginMm });

console.log(
  `Board ${widthMm} × ${heightMm} mm, margin ${marginMm} mm, ${samples} random subsets per row.`,
);
console.log('');

console.log('| n | min. distance | label size | complete | median unplaced | max nodes |');
console.log('| - | - | - | - | - | - |');
for (const [n, minDist] of [
  [40, 25],
  [50, 22],
  [60, 20],
] as const) {
  for (const size of [8, 10, 12, 14]) {
    const labels = poolLabels(pool, size, 2);
    let complete = 0;
    let maxNodes = 0;
    const unplaced: number[] = [];
    for (let seed = 1; seed <= samples; seed++) {
      const members = randomSubset(pool, n, minDist * scale, seed);
      const result = placeLabels({
        points: members.map((c) => pool.points[c]!),
        candidates: members.map((c) =>
          labelCandidates(pool.points[c]!, labels.metrics[c]!, labels.options),
        ),
        width: labels.width,
        height: labels.height,
        options: labels.options,
        nodeLimit: SEARCH_NODE_LIMIT,
      });
      if (result.complete) complete++;
      maxNodes = Math.max(maxNodes, result.nodes);
      unplaced.push(result.unplaced);
    }
    unplaced.sort((a, b) => a - b);
    console.log(
      `| ${n} | ${Math.round(minDist * scale)} mm | ${size} mm | ${Math.round((100 * complete) / samples)} % | ${unplaced[samples >> 1]} | ${maxNodes} |`,
    );
  }
}

// Board variants of a fixed puzzle (roadmap 7.5): which removals or combinations of two places
// raise the string gap above the board target, checked exactly for the best estimates.
// Usage: npx tsx cli/variants.ts public/puzzles/<id>.tsp.json [--top 6] [--target 5]

import { readFileSync } from 'node:fs';
import { boardSetup } from '../src/core/board/setup';
import { citiesFromColumns } from '../src/core/data';
import { changeSuggestions, closePairs } from '../src/core/fixed';
import { rEffMm } from '../src/core/params';
import { listCities } from '../src/core/places';
import { parsePuzzleDoc } from '../src/core/puzzle-file';
import { loadBackend, loadCountry } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const doc = parsePuzzleDoc(JSON.parse(readFileSync(args[0] ?? '', 'utf8')));
const map = doc.map;
if (!map) throw new Error('not a map puzzle');
const file = loadCountry(doc.data?.country ?? map.params.region.slice(0, 2));
const towns = new Map(citiesFromColumns(file.cities, file.states).map((c) => [c.id, c]));
const pool = listCities(map.places, towns);
const setup = boardSetup(
  file,
  map.params,
  pool.map((c) => c.id),
  doc.title,
  pool,
);
const target = Number(arg('target', String(map.params.targetGapMm))) * 1000;
const close = closePairs(setup.points, map.params.minDistanceMm);
console.log(`${doc.title}: ${setup.points.length} places, ${close.length} pairs below the minimum`);
const suggestions = changeSuggestions(
  setup.points,
  rEffMm(map.params),
  'string',
  await loadBackend(),
  {
    minDistanceMm: map.params.minDistanceMm,
    top: Number(arg('top', '6')),
  },
);
const name = (i: number) => setup.cities[i]!.name;
for (const s of suggestions) {
  const what = s.kind === 'remove' ? `without ${name(s.point)}` : `${name(s.a)} + ${name(s.b)}`;
  const fits = s.gapUm >= target && s.closePairs === 0 ? ' BOARD' : '';
  console.log(
    `  ${what}: gap ${(s.gapUm / 1000).toFixed(2)} mm${s.exact ? '' : ' (estimate)'}, ` +
      `${s.closePairs} close pairs left${fits}`,
  );
}

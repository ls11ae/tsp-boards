// Exports a puzzle (from a permalink) as laser SVG, print template and solution sheet.
// Usage: npx tsx cli/export-board.ts --link '<permalink or #hash>' [--out dir] [--paper A4|A3]
//   [--holes cut|mark] [--stroke 0.1]
// The link must contain the selected cities (`sel`); the exact string optimum and the measured
// gap at the scale are computed here (HiGHS in Node).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { measuredLength } from '../src/core/board/measure';
import { planBoard } from '../src/core/board/plan';
import { solutionPdf, templatePdf, type Paper } from '../src/core/board/print';
import { boardPlanInput, boardSetup, drawPuzzleBoard } from '../src/core/board/setup';
import { boardSvg } from '../src/core/board/svg';
import { decodePermalink } from '../src/core/permalink';
import { Rng } from '../src/core/rng';
import { iteratedLocalSearch } from '../src/core/tsp/ils';
import { euclideanLength, stringLength } from '../src/core/tsp/tour';
import { verifyCandidate } from '../src/core/verify';
import { loadBackend, loadCountry, ms } from './lib/country';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const linkArg = arg('link', '');
const hash = linkArg.includes('#') ? linkArg.slice(linkArg.indexOf('#')) : linkArg;
const link = decodePermalink(hash);
if (!link?.selected) {
  console.error('Need --link with a permalink that contains selected cities (sel=…).');
  process.exit(1);
}
const outDir = arg('out', '.');
const paper = (arg('paper', 'A4') === 'A3' ? 'A3' : 'A4') satisfies Paper;
const holes = arg('holes', 'cut') === 'mark' ? 'mark' : 'cut';
const strokeMm = Number(arg('stroke', '0.1'));

const t0 = performance.now();
const file = loadCountry(link.params.region.slice(0, 2));
if (link.data && link.data.version !== file.dataVersion) {
  console.error(
    `warning: link has data version ${link.data.version}, local data is ${file.dataVersion}`,
  );
}
const setup = boardSetup(file, link.params, link.selected);
if (setup.missing.length > 0)
  console.error(`warning: cities not found: ${setup.missing.join(',')}`);
const backend = await loadBackend();
const heuristic = iteratedLocalSearch(setup.inst, new Rng(1)).tour;
const v = verifyCandidate(backend, setup.inst, heuristic, 'string-exact', { timeLimitSec: 300 });
if (!v.string) {
  console.error(`exact check failed (${v.status})`);
  process.exit(1);
}
console.error(
  `verified (${v.mode}) in ${ms(t0)} ms: string gap ${(v.string.gap / 1000).toFixed(2)} mm`,
);
const plan = planBoard(
  boardPlanInput(setup, { tour: v.string.optimal, second: v.string.second, gapUm: v.string.gap }),
  backend,
);
if (!plan) {
  console.error('no start nail has room for the scale');
  process.exit(1);
}
const start = setup.cities[plan.scale.slot]!;
console.error(
  `start nail ${start.name}, measured gap ${(plan.measured.gapUm / 1000).toFixed(2)} mm (${plan.measured.kind})` +
    (plan.warnings.length > 0 ? `, warnings: ${plan.warnings.map((w) => w.kind).join(', ')}` : ''),
);

mkdirSync(outDir, { recursive: true });
const base = path.join(
  outDir,
  `tsp-board-${link.params.region.toLowerCase()}-${setup.cities.length}-s${link.params.seed}`,
);
const region = setup.title[0]?.text ?? link.params.region;
writeFileSync(
  `${base}.svg`,
  boardSvg(drawPuzzleBoard(setup, plan, { holes }), {
    strokeMm,
    title: `${region} – TSP Boards`,
    description: setup.texts.attribution,
  }),
);
const marked = drawPuzzleBoard(setup, plan, { holes: 'mark' });
writeFileSync(
  `${base}-template-${paper}.pdf`,
  templatePdf({
    drawing: marked,
    texts: setup.texts,
    region,
    nailDiameterMm: link.params.nailDiameterMm,
    paper,
  }),
);
const optimal = v.string.optimal;
const first = optimal.indexOf(plan.scale.slot);
const tour = optimal.map((_, i) => optimal[(first + i) % optimal.length]!);
const locale = link.params.labelLanguage === 'de' ? 'de-DE' : 'en-GB';
writeFileSync(
  `${base}-solution.pdf`,
  solutionPdf({
    drawing: marked,
    texts: setup.texts,
    region,
    plan,
    points: setup.points,
    tour,
    names: setup.cities.map((c) => (link.params.labelLanguage === 'en' ? c.nameEn : c.name)),
    stringLengthUm: stringLength(setup.inst, tour),
    centreLengthUm: euclideanLength(setup.inst, tour),
    measuredLengthUm: measuredLength(setup.inst, tour, plan.scale.slot, plan.scale.direction),
    stringGapUm: v.string.gap,
    link: linkArg,
    formatNumber: (value, decimals) =>
      value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
  }),
);
console.error(`wrote ${base}.svg, -template-${paper}.pdf, -solution.pdf in ${ms(t0)} ms`);

// Exports a board as laser SVG, print template and solution sheet, with a short report
// (gaps, start nail, robustness over r_eff).
// Usage:
//   npx tsx cli/export-board.ts --link '<permalink or #hash>' [options]
//   npx tsx cli/export-board.ts --puzzle public/puzzles/<id>.tsp.json [options]
// Options: [--out dir] [--name base] [--paper A4|A3] [--stroke 0.1]
//   [--nail 2] [--string 1] (measured nail diameter and string thickness, mm)
//   [--logo 'Place name=local/logo.svg'] (a logo instead of that place's label; repeatable)
//   [--legend-logo local/logo.svg] (a large logo in the legend box)
//   [--bed 600x305] (also write the SVG rotated by 90° if the board fits the laser bed only so,
//   and a strip of test holes)
//   [--hole 1.7] (diameter of the cut nail holes, mm; default the nail diameter: smaller holes
//   give a press fit)
//   [--holes cut|mark|pit] (cut through, crosses for drilling, or engraved drill pits; default
//   from the puzzle file's board, else cut) [--edge | --no-edge] (cut the board outline)
//   [--radii 1,1.25,1.5,1.75,2] (r_eff values of the robustness check, mm)
// A link must contain the selected cities (`sel`); a puzzle file brings its places (also
// composite ones), marked places, legend and preferred start nail. The exact string optimum,
// the measured gap at the scale and the robustness are computed here (HiGHS in Node).
// Logos are read from local files and never written anywhere but the outputs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { calibrationTour, measuredLength } from '../src/core/board/measure';
import { parseSvgLogo, type Logo } from '../src/core/board/logo';
import { planBoard } from '../src/core/board/plan';
import { mapTemplateText, solutionPdf, templatePdf, type Paper } from '../src/core/board/print';
import {
  boardPlanInput,
  boardSetup,
  drawPuzzleBoard,
  type SetupExtras,
} from '../src/core/board/setup';
import { boardSvg } from '../src/core/board/svg';
import { rotateDrawing, type BoardDrawing, type HoleMode } from '../src/core/board/drawing';
import { circlePath, rectPath, type PathCommand } from '../src/core/board/shapes';
import { textPath } from '../src/core/board/text';
import { citiesFromColumns, listName } from '../src/core/data';
import { rEffMm, type PuzzleParams } from '../src/core/params';
import { decodePermalink } from '../src/core/permalink';
import { listCities } from '../src/core/places';
import { parsePuzzleDoc } from '../src/core/puzzle-file';
import { checkRobustness } from '../src/core/robustness';
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
const all = (name: string) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]!] : []));

const outDir = arg('out', '.');
const paper = (arg('paper', 'A4') === 'A3' ? 'A3' : 'A4') satisfies Paper;
const holesArg = arg('holes', '');
const strokeMm = Number(arg('stroke', '0.1'));
const t0 = performance.now();

// --- the puzzle -------------------------------------------------------------------------------

interface Source {
  readonly params: PuzzleParams;
  readonly ids: readonly number[];
  readonly title: string;
  readonly pool: ReturnType<typeof listCities> | null;
  readonly extras: SetupExtras;
  readonly link: string;
  readonly name: string;
  readonly country: string;
}

function readLogo(file: string): Logo {
  const logo = parseSvgLogo(readFileSync(file, 'utf8'));
  console.error(`logo ${file}: ${logo.path.length} path commands`);
  return logo;
}

function fromPuzzle(file: string): Source {
  const doc = parsePuzzleDoc(JSON.parse(readFileSync(file, 'utf8')));
  if (!doc.map) throw new Error(`${file}: not a map puzzle`);
  const map = doc.map;
  const country = doc.data?.country ?? map.params.region.slice(0, 2);
  const data = loadCountry(country);
  const towns = new Map(citiesFromColumns(data.cities, data.states).map((c) => [c.id, c]));
  // A list puzzle brings its places (composites, points, marks); else the region's towns.
  const pool = map.list ? listCities(map.places, towns) : null;
  const ids = pool ? pool.map((c) => c.id) : map.places.flatMap((p) => (p.id ? [p.id] : []));
  const logos = new Map<number, Logo>();
  for (const spec of all('logo')) {
    const [name, logoFile] = spec.split('=');
    const index = map.places.findIndex((p) => p.name === name?.trim());
    if (index < 0 || !logoFile) throw new Error(`--logo ${spec}: no place of that name`);
    logos.set(index, readLogo(logoFile.trim()));
  }
  const legendLogo = arg('legend-logo', '') ? readLogo(arg('legend-logo', '')) : null;
  return {
    params: map.params,
    ids,
    title: doc.title,
    pool,
    extras: { board: map.board ?? null, logos, legendLogo },
    link: '',
    name: doc.id,
    country,
  };
}

function fromLink(linkArg: string): Source {
  const hash = linkArg.includes('#') ? linkArg.slice(linkArg.indexOf('#')) : linkArg;
  const link = decodePermalink(hash);
  if (!link?.selected) {
    console.error('Need --puzzle, or --link with a permalink that contains selected cities.');
    process.exit(1);
  }
  const country = link.params.region.slice(0, 2);
  const data = loadCountry(country);
  if (link.data && link.data.version !== data.dataVersion) {
    console.error(
      `warning: link has data version ${link.data.version}, local data is ${data.dataVersion}`,
    );
  }
  return {
    params: link.params,
    ids: link.selected,
    title: link.title ?? '',
    pool: null,
    extras: {},
    link: linkArg,
    name: `tsp-board-${link.params.region.toLowerCase()}-${link.selected.length}-s${link.params.seed}`,
    country,
  };
}

const source = arg('puzzle', '') ? fromPuzzle(arg('puzzle', '')) : fromLink(arg('link', ''));
// Measured nails and string replace the planned ones.
const params: PuzzleParams = {
  ...source.params,
  nailDiameterMm: Number(arg('nail', String(source.params.nailDiameterMm))),
  stringThicknessMm: Number(arg('string', String(source.params.stringThicknessMm))),
};
const file = loadCountry(source.country);
const setup = boardSetup(file, params, source.ids, source.title, source.pool, source.extras);
if (setup.missing.length > 0)
  console.error(`warning: cities not found: ${setup.missing.join(',')}`);
for (const [slot, logo] of setup.labelLogos.entries())
  if (logo) console.error(`logo instead of the label of ${setup.cities[slot]!.name}`);
if ((source.extras.logos?.size ?? 0) > setup.labelLogos.filter(Boolean).length)
  console.error('warning: a logo did not fit at 20 mm or more; that place keeps its text label');

// --- exact check and plan ---------------------------------------------------------------------

const backend = await loadBackend();
const heuristic = iteratedLocalSearch(setup.inst, new Rng(1)).tour;
const v = verifyCandidate(backend, setup.inst, heuristic, 'string-exact', { timeLimitSec: 300 });
if (!v.string) {
  console.error(`exact check failed (${v.status})`);
  process.exit(1);
}
const mm = (um: number) => (um / 1000).toFixed(2);
console.error(`verified (${v.mode}) in ${ms(t0)} ms: string gap ${mm(v.string.gap)} mm`);
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
  `start nail ${start.name}, measured gap ${mm(plan.measured.gapUm)} mm (${plan.measured.kind})` +
    (plan.warnings.length > 0 ? `, warnings: ${plan.warnings.map((w) => w.kind).join(', ')}` : ''),
);

// --- robustness over r_eff --------------------------------------------------------------------

const radii = arg('radii', '1,1.25,1.5,1.75,2').split(',').map(Number);
const rows = radii.map((r) => {
  const row = checkRobustness(
    backend,
    setup.points,
    r,
    v.string!.optimal,
    { slot: plan.scale.slot, direction: plan.scale.direction },
    { timeLimitSec: 300 },
  );
  console.error(
    `r_eff ${r.toFixed(2)} mm: ${row.sameOptimum ? 'same optimum' : 'OTHER OPTIMUM'}, gap ${mm(row.gapUm)} mm` +
      (row.scale
        ? `, at the scale ${row.scale.sameOptimum ? '' : 'OTHER OPTIMUM, '}${mm(row.scale.gapUm)} mm`
        : ''),
  );
  return row;
});

/**
 * A strip of test holes from 0.6 mm below the nail diameter up to it (0.1 mm steps), each with
 * its diameter engraved: cut it first and find the press fit for the nails.
 */
function holeTest(nailMm: number): BoardDrawing {
  const sizes = Array.from({ length: 7 }, (_, i) => Math.round((nailMm - 0.6 + 0.1 * i) * 10) / 10);
  const width = 12 * sizes.length + 8;
  const height = 26;
  const holesPath: PathCommand[] = [];
  const labels: PathCommand[] = [];
  sizes.forEach((d, i) => {
    const x = 10 + 12 * i;
    holesPath.push(...circlePath(x, 9, d / 2));
    labels.push(...textPath(d.toFixed(1), x, 21, 3.5, { anchor: 'middle' }));
  });
  return {
    width,
    height,
    items: [
      { layer: 'engrave', path: labels, fill: true },
      { layer: 'cut', path: holesPath, fill: false },
      { layer: 'cut', path: rectPath(0, 0, width, height, 2), fill: false },
    ],
  };
}

// --- files ------------------------------------------------------------------------------------

mkdirSync(outDir, { recursive: true });
const base = path.join(outDir, arg('name', source.name));
const title = setup.title[0]?.text ?? params.region;
// Hole mode and board outline: options, else the board's defaults (puzzle file), else cut both.
const defaults = source.extras.board?.export;
const holes: HoleMode =
  holesArg === 'cut' || holesArg === 'mark' || holesArg === 'pit'
    ? holesArg
    : (defaults?.holes ?? 'cut');
const edge = args.includes('--edge')
  ? true
  : args.includes('--no-edge')
    ? false
    : (defaults?.edge ?? true);
const holeMm = Number(arg('hole', String(params.nailDiameterMm)));
const drawing = drawPuzzleBoard(setup, plan, { holes, holeDiameterMm: holeMm, edge });
const svgOptions = {
  strokeMm,
  title: `${title} – TSP Boards`,
  description: setup.texts.attribution,
};
writeFileSync(`${base}.svg`, boardSvg(drawing, svgOptions));
const outputs = [`${base}.svg`];
const [bedW, bedH] = arg('bed', '').split('x').map(Number);
if (bedW && bedH) {
  const fits = drawing.width <= bedW && drawing.height <= bedH;
  const fitsRotated = drawing.height <= bedW && drawing.width <= bedH;
  if (!fits && fitsRotated) {
    writeFileSync(`${base}-bed.svg`, boardSvg(rotateDrawing(drawing), svgOptions));
    outputs.push(`${base}-bed.svg`);
  } else if (!fits) console.error(`warning: the board does not fit the bed ${bedW} × ${bedH} mm`);
  // Test holes only for holes cut by the laser (drilled boards need none).
  if (holes === 'cut') {
    writeFileSync(`${base}-hole-test.svg`, boardSvg(holeTest(params.nailDiameterMm), svgOptions));
    outputs.push(`${base}-hole-test.svg`);
  }
}
const marked = drawPuzzleBoard(setup, plan, { holes: 'mark' });
writeFileSync(
  `${base}-template-${paper}.pdf`,
  templatePdf({
    drawing: marked,
    ...mapTemplateText(setup.texts, title, params.nailDiameterMm),
    paper,
  }),
);
outputs.push(`${base}-template-${paper}.pdf`);
// The solution runs from the start nail in the direction that needs more string (calibration).
const tour = calibrationTour(setup.inst, v.string.optimal, plan.scale.slot, plan.scale.direction);
const locale = params.labelLanguage === 'de' ? 'de-DE' : 'en-GB';
const measuredUm = measuredLength(setup.inst, tour, plan.scale.slot, plan.scale.direction);
writeFileSync(
  `${base}-solution.pdf`,
  solutionPdf({
    drawing: marked,
    texts: setup.texts,
    region: title,
    plan,
    points: setup.points,
    tour,
    names: setup.cities.map((c) => listName(c, params.labelLanguage)),
    stringLengthUm: stringLength(setup.inst, tour),
    centreLengthUm: euclideanLength(setup.inst, tour),
    measuredLengthUm: measuredUm,
    stringGapUm: v.string.gap,
    link: source.link,
    formatNumber: (value, decimals) =>
      value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
  }),
);
outputs.push(`${base}-solution.pdf`);

// Report: the figures a builder needs, as Markdown.
const de = (x: number, d = 2) => x.toFixed(d);
const report = [
  `# ${title}: board report`,
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`cli/export-board.ts\`.`,
  '',
  `- Board ${params.boardWidthMm} × ${params.boardHeightMm} mm, ${setup.cities.length} places, nails ${params.nailDiameterMm} mm, string ${params.stringThicknessMm} mm (r_eff ${de(rEffMm(params))} mm), labels ${params.labelSizeMm} mm, nail holes ${holes === 'cut' ? `cut at ${holeMm} mm` : holes === 'pit' ? 'engraved as pits for drilling' : 'marked with crosses'}, board outline ${edge ? 'cut' : 'not cut'}.`,
  `- String gap (optimum to runner-up): ${mm(v.string.gap)} mm (${v.mode}).`,
  `- Start nail: ${start.name}; gap at the scale ${mm(plan.measured.gapUm)} mm (${plan.measured.kind}).`,
  `- String from the loop around the tour and the start nail: ${de(measuredUm / 1000, 0)} mm, plus ${plan.scale.targetMm} mm along the scale to the target mark (closed string length of the tour ${de(stringLength(setup.inst, tour) / 1000, 0)} mm).`,
  ...(plan.warnings.length > 0
    ? [`- Plan warnings: ${plan.warnings.map((w) => w.kind).join(', ')}.`]
    : []),
  '',
  '## Robustness over r_eff (exact)',
  '',
  '| r_eff (mm) | optimum | string gap (mm) | at the scale |',
  '| --- | --- | --- | --- |',
  ...rows.map(
    (r) =>
      `| ${de(r.rEffMm)} | ${r.sameOptimum ? 'same' : '**other**'} | ${mm(r.gapUm)} | ${
        r.scale ? `${r.scale.sameOptimum ? 'same' : '**other**'}, ${mm(r.scale.gapUm)} mm` : '–'
      } |`,
  ),
  '',
  '## Tour from the start nail (calibration direction)',
  '',
  tour.map((s) => listName(setup.cities[s]!, params.labelLanguage)).join(' → '),
  '',
  ...(v.string.second
    ? [
        '## Runner-up (for checking the scale: it ends about the gap before 0)',
        '',
        calibrationTour(setup.inst, v.string.second, plan.scale.slot, plan.scale.direction)
          .map((s) => listName(setup.cities[s]!, params.labelLanguage))
          .join(' → '),
        '',
      ]
    : []),
  '## Files',
  '',
  ...outputs.map((f) => `- \`${path.basename(f)}\``),
  '',
].join('\n');
writeFileSync(`${base}-report.md`, report);
console.error(`wrote ${[...outputs, `${base}-report.md`].join(', ')} in ${ms(t0)} ms`);

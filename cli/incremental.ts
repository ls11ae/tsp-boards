// Generates an incremental puzzle and prints its points and per-instance figures as JSON.
// Usage: npx tsx cli/incremental.ts [--n 10] [--seed 1] [--board 400x400] [--margin 45]
//   [--gap 5] [--spacing 10] [--min-dist 30] [--nail 2] [--string 1] (mm: r_eff is half the
//   nail plus half the string) [--out file.json] [--export dir] [--name base] [--lang de|en]
//   [--holes cut|mark|pit] [--no-edge] (drill pits and no outline cut for boards cut to size)
//   [--radii 1,1.25,1.5,1.75,2] (r_eff values of the robustness check, mm; with --export)
// --export writes the laser SVG, the print template (A4), the solution sheet and a report
// with the figures per instance and the robustness over r_eff.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { templatePdf } from '../src/core/board/print';
import type { HoleMode } from '../src/core/board/drawing';
import { boardSvg } from '../src/core/board/svg';
import { drawIncremental } from '../src/core/incremental/drawing';
import { incrementalSolutionPdf, incrementalTemplateText } from '../src/core/incremental/print';
import { INCREMENTAL_TEXTS } from '../src/core/incremental/texts';
import { sameTour } from '../src/core/tsp/tour';
import {
  DEFAULT_INCREMENTAL,
  checkSequence,
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
const nailMm = Number(arg('nail', '2'));
const stringMm = Number(arg('string', '1'));
const params: IncrementalParams = {
  ...DEFAULT_INCREMENTAL,
  marginMm: Number(arg('margin', String(DEFAULT_INCREMENTAL.marginMm))),
  rEffMm: nailMm / 2 + stringMm / 2,
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

const dir = arg('export', '');
if (dir && puzzle) {
  const lang = arg('lang', 'de') === 'en' ? 'en' : 'de';
  const texts = INCREMENTAL_TEXTS[lang];
  const holesArg = arg('holes', 'cut');
  const holes: HoleMode = holesArg === 'pit' || holesArg === 'mark' ? holesArg : 'cut';
  const options = {
    nailDiameterMm: nailMm,
    labelSizeMm: 8,
    holes,
    edge: !args.includes('--no-edge'),
    cornerRadiusMm: 5,
    line: texts.boardLine(params.n),
  };
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, arg('name', `tsp-incremental-${params.n}-s${params.seed}`));
  writeFileSync(
    `${base}.svg`,
    boardSvg(drawIncremental(puzzle, options).drawing, {
      strokeMm: 0.1,
      title: texts.templateTitle,
    }),
  );
  const marked = drawIncremental(puzzle, { ...options, holes: 'mark' }).drawing;
  writeFileSync(
    `${base}-template-A4.pdf`,
    templatePdf({ drawing: marked, ...incrementalTemplateText(texts, nailMm), paper: 'A4' }),
  );
  writeFileSync(
    `${base}-solution.pdf`,
    incrementalSolutionPdf({
      puzzle,
      drawing: marked,
      texts,
      link: '',
      formatNumber: (v, d) =>
        v.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        }),
    }),
  );
  // Robustness: the same optima and enough gap for other nails and strings (r_eff)?
  const radii = arg('radii', '1,1.25,1.5,1.75,2').split(',').map(Number);
  const rows = radii.map((r) => {
    const check = checkSequence({ ...params, rEffMm: r }, puzzle.points, backend);
    const steps = check.puzzle?.steps ?? [];
    const same = steps.every((s, i) => sameTour(s.tour, puzzle.steps[i]!.tour, s.k));
    const gaps = steps.filter((s) => s.k > 3).map((s) => stepGapUm(s) / 1000);
    // How far the optimum's string end moves from its mark (the marks are for the planned
    // r_eff). The string is calibrated on the full tour (forward) at mark n, which absorbs the
    // change there; the other ends move by the difference.
    const last = steps.length - 1;
    const calibration = last >= 0 ? steps[last]!.forwardUm - puzzle.steps[last]!.forwardUm : 0;
    const shift = Math.max(
      ...steps.map((s, i) => {
        const p = puzzle.steps[i]!;
        return (
          Math.max(
            Math.abs(s.forwardUm - p.forwardUm - calibration),
            Math.abs(s.backwardUm - p.backwardUm - calibration),
          ) / 1000
        );
      }),
    );
    return { r, same, minGap: Math.min(...gaps), shift, violations: check.violations };
  });
  const fmt = (v: number) => v.toFixed(2);
  const report = [
    `# Incremental board ${path.basename(base)}`,
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`cli/incremental.ts\`: ${params.n} nails, seed ${params.seed}, board ${params.widthMm} × ${params.heightMm} mm (margin ${params.marginMm}), nails ${nailMm} mm, string ${stringMm} mm (r_eff ${fmt(params.rEffMm)} mm), minimum distance ${params.minDistanceMm} mm, target gap ${params.targetGapMm} mm, mark spacing ${params.spacingMm} mm, holes: ${holes}${options.edge ? '' : ', no outline cut'}.`,
    '',
    '| nails | optimum (from nail 1) | string (mm) | string gap (mm) | gap at the track (mm) |',
    '| --- | --- | --- | --- | --- |',
    ...out.steps!.map(
      (s) =>
        `| 1–${s.k} | ${s.tour.join(' → ')} | ${fmt(s.stringMm)} | ${s.stringGapMm === null ? '–' : fmt(s.stringGapMm)} | ${s.measuredGapMm === null ? '–' : fmt(s.measuredGapMm)} |`,
    ),
    '',
    '## Robustness over r_eff (exact)',
    '',
    '| r_eff (mm) | optima | smallest gap at the track (mm) | largest shift of a string end from its mark after calibration (mm) | violated |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| ${fmt(r.r)} | ${r.same ? 'same' : 'DIFFERENT'} | ${fmt(r.minGap)} | ${fmt(r.shift)} | ${r.violations.map((v) => `k=${v.k}: ${v.violations.join(', ')}`).join('; ') || '–'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(`${base}-report.md`, report);
  for (const r of rows)
    process.stderr.write(
      `r_eff ${fmt(r.r)} mm: optima ${r.same ? 'same' : 'DIFFERENT'}, gap ≥ ${fmt(r.minGap)} mm, end shift ≤ ${fmt(r.shift)} mm\n`,
    );
  process.stderr.write(`wrote ${base}.svg, -template-A4.pdf, -solution.pdf, -report.md\n`);
}

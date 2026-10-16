// Board downloads (roadmap 7.6: loaded on demand): laser SVG, print template, solution sheet
// and classroom worksheet, drawn on the main thread from the shared core pipeline.

import type { BoardPlan } from '../core/board/plan';
import { mapTemplateText, solutionPdf, templatePdf } from '../core/board/print';
import { drawPuzzleBoard, type BoardSetup } from '../core/board/setup';
import { boardSvg } from '../core/board/svg';
import { worksheetPdf } from '../core/board/worksheet';
import { listName } from '../core/data';
import { calibrationTour, measuredLength } from '../core/board/measure';
import { encodePermalink } from '../core/permalink';
import { euclideanLength, stringLength } from '../core/tsp/tour';
import type { BoardModel } from './board';
import { puzzleSetup } from './plans';
import type { PuzzleView } from './puzzle';
import { useStore } from './store';

/** Short stable name part for files: FNV-1a of the city ids. */
function fileId(setup: BoardSetup): string {
  let h = 0x811c9dc5;
  for (const c of setup.cities) {
    for (const ch of String(c.id)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // Separator between ids; >>> 0 keeps the hash unsigned (a minus sign in file names).
    h = (h ^ 44) >>> 0;
  }
  return `${setup.file.country.toLowerCase()}-${setup.params.region.toLowerCase()}-${setup.cities.length}-${h.toString(16).padStart(8, '0').slice(0, 6)}`;
}

function save(data: BlobPart, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function regionName(setup: BoardSetup): string {
  return setup.title[0]?.text ?? setup.params.region;
}

/** Sheets are in the board language, numbers too. */
function boardNumberFormat(setup: BoardSetup): (value: number, decimals: number) => string {
  const locale = setup.params.labelLanguage === 'de' ? 'de-DE' : 'en-GB';
  return (value, decimals) =>
    value.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
}

/** Classroom worksheet (task page and solution page) of the shown, verified puzzle. */
export function downloadWorksheet(board: BoardModel, puzzle: PuzzleView): void {
  const v = puzzle.verification;
  const e = v?.status === 'done' ? v.verification.euclidean : null;
  const setup = puzzleSetup(board, puzzle);
  if (!e || !setup) return;
  const { exportOptions, doc } = useStore.getState();
  const pdf = worksheetPdf({
    setup,
    paper: exportOptions.paper,
    title: doc.title,
    tour: e.optimal,
    lengthUm: e.optimalLength,
    gapUm: e.gap,
    names: setup.cities.map((c) => listName(c, setup.params.labelLanguage)),
    formatNumber: boardNumberFormat(setup),
  });
  save(pdf, 'application/pdf', `tsp-worksheet-${fileId(setup)}-${exportOptions.paper}.pdf`);
}

export type ExportKind = 'svg' | 'template' | 'solution';

export function downloadBoard(
  kind: ExportKind,
  board: BoardModel,
  puzzle: PuzzleView,
  plan: BoardPlan,
): void {
  const setup = puzzleSetup(board, puzzle);
  if (!setup) return;
  const { exportOptions, params, country, pinned, excluded, groups } = useStore.getState();
  const name = fileId(setup);
  if (kind === 'svg') {
    const drawing = drawPuzzleBoard(setup, plan, {
      holes: exportOptions.holes,
      edge: exportOptions.edge,
    });
    const svg = boardSvg(drawing, {
      strokeMm: exportOptions.strokeMm,
      title: `${regionName(setup)} – TSP Boards`,
      description: setup.texts.attribution,
    });
    save(svg, 'image/svg+xml', `tsp-board-${name}.svg`);
    return;
  }
  const drawing = drawPuzzleBoard(setup, plan, { holes: 'mark' });
  if (kind === 'template') {
    const pdf = templatePdf({
      drawing,
      ...mapTemplateText(setup.texts, regionName(setup), params.nailDiameterMm),
      paper: exportOptions.paper,
    });
    save(pdf, 'application/pdf', `tsp-board-${name}-template-${exportOptions.paper}.pdf`);
    return;
  }
  const v = puzzle.verification;
  if (v?.status !== 'done' || !v.verification.string || !country) return;
  // From the start nail in the direction that needs more string (the calibration).
  const tour = calibrationTour(
    setup.inst,
    v.verification.string.optimal,
    plan.scale.slot,
    plan.scale.direction,
  );
  const hash = encodePermalink(
    params,
    { country: country.country, version: country.dataVersion },
    setup.cities.map((c) => c.id),
    { pinned, excluded, groups },
    __APP_VERSION__,
  );
  const pdf = solutionPdf({
    drawing,
    texts: setup.texts,
    region: regionName(setup),
    plan,
    points: setup.points,
    tour,
    names: setup.cities.map((c) => listName(c, setup.params.labelLanguage)),
    stringLengthUm: stringLength(setup.inst, tour),
    centreLengthUm: euclideanLength(setup.inst, tour),
    measuredLengthUm: measuredLength(setup.inst, tour, plan.scale.slot, plan.scale.direction),
    stringGapUm: v.verification.string.gap,
    link: `${window.location.origin}${window.location.pathname}${hash}`,
    formatNumber: boardNumberFormat(setup),
  });
  save(pdf, 'application/pdf', `tsp-board-${name}-solution.pdf`);
}

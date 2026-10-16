// Board downloads (roadmap 7.6: loaded on demand): laser SVG, print template, solution sheet,
// classroom worksheet and poster, drawn on the main thread from the shared core pipeline.

import type { BoardPlan } from '../core/board/plan';
import type { Logo } from '../core/board/logo';
import { drawPoster, posterPdf } from '../core/board/poster';
import { posterStops, stopPoints, type PosterTour } from '../core/board/poster-tour';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import type { LegendEntry } from '../core/puzzle-file';
import { mapTemplateText, solutionPdf, templatePdf } from '../core/board/print';
import { drawPuzzleBoard, type BoardSetup } from '../core/board/setup';
import { boardSvg } from '../core/board/svg';
import { worksheetPdf } from '../core/board/worksheet';
import { boardLabel, listName } from '../core/data';
import { calibrationTour, measuredLength } from '../core/board/measure';
import { encodePermalink } from '../core/permalink';
import { euclideanLength, stringLength } from '../core/tsp/tour';
import { townsById, type BoardModel } from './board';
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

/** The poster's round trip from a worker of its own (HiGHS loads there). */
function posterTourInWorker(request: Omit<ExactWorkerRequest & { type: 'poster' }, 'jobId'>) {
  const w = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), { type: 'module' });
  return new Promise<PosterTour>((resolve, reject) => {
    w.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
      const m = event.data;
      if (m.type === 'poster') resolve(m.tour);
      else if (m.type === 'error') reject(new Error(m.message));
      else return;
      w.terminate();
    };
    w.onerror = (event) => {
      reject(new Error(event.message));
      w.terminate();
    };
    w.postMessage({ ...request, jobId: 1 } satisfies ExactWorkerRequest);
  });
}

/** Texts and emphasis of a poster, edited in the export panel (roadmap 9.9). */
export interface PosterTexts {
  readonly title: string;
  readonly subtitle: string;
  readonly legend: readonly LegendEntry[];
  /** City id of the emphasized place (start and finish, large name or its logo), or null. */
  readonly emphasis: number | null;
}

/**
 * Poster of the shown puzzle (roadmap 9.7, 9.9): the great-circle optimum through its places,
 * the problem and the length, on the chosen DIN paper, in the app's language. Returns the
 * round trip for the panel's note.
 */
export async function downloadPoster(
  board: BoardModel,
  puzzle: PuzzleView,
  texts: PosterTexts,
): Promise<PosterTour> {
  const setup = puzzleSetup(board, puzzle);
  const { exportOptions, logos, country, lang } = useStore.getState();
  if (!setup || !country) throw new Error('no puzzle');
  // Labels in the app's language (English exonyms such as Munich where the data has them).
  const towns = townsById(country);
  const byName = new Map([...towns.values()].map((t) => [t.name, t]));
  const local = setup.cities.map((c) => ({
    ...c,
    label: c.members ? c.label : boardLabel(c, lang),
  }));
  const stops = posterStops(local, exportOptions.posterMembers, (name, member) => {
    const town = member ? byName.get(name) : undefined;
    return town ? boardLabel(town, lang) : name;
  });
  const tour = await posterTourInWorker({
    type: 'poster',
    stops,
    points: stopPoints(stops, setup.projection),
  });
  // Logos by place (slot) of the puzzle; they stay in this browser session. The emphasized
  // place's logo stands large near it, the others replace labels.
  const emphasis = setup.cities.findIndex((c) => c.id === texts.emphasis);
  const placeLogos = new Map<number, Logo>();
  for (const l of logos) {
    const slot = setup.cities.findIndex((c) => c.id === l.city);
    if (slot >= 0 && slot !== emphasis) placeLogos.set(slot, l.logo);
  }
  const drawing = drawPoster({
    file: country,
    region: setup.params.region,
    stops,
    tour,
    title: texts.title || regionName(setup),
    subtitle: texts.subtitle,
    paper: exportOptions.posterPaper,
    orientation: exportOptions.posterOrientation,
    language: lang,
    legend: texts.legend,
    emphasis:
      emphasis >= 0
        ? {
            place: emphasis,
            logo: logos.find((l) => l.city === texts.emphasis)?.logo ?? null,
          }
        : null,
    logos: placeLogos,
    legendLogo: logos.find((l) => l.city === null)?.logo ?? null,
    blankMap: setup.params.blankBoard,
  });
  save(
    posterPdf(drawing),
    'application/pdf',
    `tsp-poster-${fileId(setup)}-${exportOptions.posterPaper}.pdf`,
  );
  return tour;
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

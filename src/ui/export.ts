// Board export in the app: plans run in their own exact worker (so verifications continue),
// drawings and files are made on the main thread from the shared core pipeline.

import { planData, type BoardPlan } from '../core/board/plan';
import { mapTemplateText, solutionPdf, templatePdf } from '../core/board/print';
import { boardPlanInput, boardSetup, drawPuzzleBoard, type BoardSetup } from '../core/board/setup';
import { boardSvg } from '../core/board/svg';
import type { Layer } from '../core/board/drawing';
import { svgPathData } from '../core/board/shapes';
import { measuredLength } from '../core/board/measure';
import { rEffMm, type PuzzleParams } from '../core/params';
import { encodePermalink } from '../core/permalink';
import { euclideanLength, stringLength } from '../core/tsp/tour';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import type { BoardModel } from './board';
import type { PuzzleView } from './puzzle';
import { useStore, type BoardPlanState } from './store';

const PLAN_TIME_LIMIT_SEC = 120;

/** The plan depends on the puzzle and on the board, label and gap parameters. */
export function planKey(puzzleKey: string, p: PuzzleParams): string {
  return [
    puzzleKey,
    useStore.getState().doc.title,
    p.region,
    p.boardWidthMm,
    p.boardHeightMm,
    p.marginMm,
    p.minPopulation,
    p.nailDiameterMm,
    p.stringThicknessMm,
    p.targetGapMm,
    p.labelSizeMm,
    p.labelLanguage,
  ].join('|');
}

let worker: Worker | null = null;
let running: { jobId: number; key: string } | null = null;
let jobCounter = 0;

function setPlan(key: string, state: BoardPlanState): void {
  useStore.setState((s) => ({ boardPlans: { ...s.boardPlans, [key]: state } }));
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
    const message = event.data;
    if (!running) return;
    if (message.type === 'planned' && message.jobId === running.jobId) {
      setPlan(message.key, { status: 'done', plan: message.plan, ms: message.ms });
      running = null;
    } else if (message.type === 'error' && message.jobId === running.jobId) {
      setPlan(running.key, { status: 'error', message: message.message });
      running = null;
    }
  };
  w.onerror = (event) => {
    if (running) setPlan(running.key, { status: 'error', message: event.message });
    running = null;
    worker?.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

/** Setup of the shown puzzle (slot order = ascending pool index, as in verification). */
export function puzzleSetup(board: BoardModel, puzzle: PuzzleView): BoardSetup | null {
  const { country, params } = useStore.getState();
  if (!country) return null;
  return boardSetup(
    country,
    params,
    puzzle.members.map((c) => board.pool[c]!.id),
    useStore.getState().doc.title,
  );
}

/** Starts planning the board for the shown, exactly verified puzzle. */
export function prepareBoard(board: BoardModel, puzzle: PuzzleView): void {
  const v = puzzle.verification;
  if (v?.status !== 'done' || !v.verification.string) return;
  const { params } = useStore.getState();
  const setup = puzzleSetup(board, puzzle);
  if (!setup) return;
  const key = planKey(puzzle.key, params);
  const string = v.verification.string;
  const input = boardPlanInput(setup, {
    tour: string.optimal,
    second: string.second,
    gapUm: string.gap,
  });
  if (running) {
    // One plan at a time: a new request replaces the running one.
    worker?.terminate();
    worker = null;
    useStore.setState((s) => {
      const boardPlans = { ...s.boardPlans };
      delete boardPlans[running!.key];
      return { boardPlans };
    });
  }
  const jobId = ++jobCounter;
  running = { jobId, key };
  setPlan(key, { status: 'running' });
  const request: ExactWorkerRequest = {
    type: 'plan',
    jobId,
    key,
    data: planData(input, rEffMm(params)),
    timeLimitSec: PLAN_TIME_LIMIT_SEC,
  };
  getWorker().postMessage(request);
}

export interface PreviewPaths {
  readonly score: string;
  readonly outline: string;
  readonly cut: string;
  readonly engrave: string;
}

const previewCache = new WeakMap<BoardPlan, { holes: string; paths: PreviewPaths }>();

/** SVG path data of the planned board per layer (memoised per plan and hole style). */
export function previewPaths(
  board: BoardModel,
  puzzle: PuzzleView,
  plan: BoardPlan,
  holes: 'cut' | 'mark',
): PreviewPaths | null {
  const cached = previewCache.get(plan);
  if (cached?.holes === holes) return cached.paths;
  const setup = puzzleSetup(board, puzzle);
  if (!setup) return null;
  const drawing = drawPuzzleBoard(setup, plan, { holes });
  const layer = (name: Layer, fill: boolean) =>
    svgPathData(
      drawing.items.filter((i) => i.layer === name && i.fill === fill).flatMap((i) => [...i.path]),
      2,
    );
  const paths = {
    score: layer('score', false),
    outline: layer('outline', false),
    cut: layer('cut', false),
    engrave: layer('engrave', true),
  };
  previewCache.set(plan, { holes, paths });
  return paths;
}

/** Short stable name part for files: FNV-1a of the city ids. */
function fileId(setup: BoardSetup): string {
  let h = 0x811c9dc5;
  for (const c of setup.cities) {
    for (const ch of String(c.id)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 44;
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

export type ExportKind = 'svg' | 'template' | 'solution';

export function downloadBoard(
  kind: ExportKind,
  board: BoardModel,
  puzzle: PuzzleView,
  plan: BoardPlan,
): void {
  const setup = puzzleSetup(board, puzzle);
  if (!setup) return;
  const { exportOptions, params, country, pinned, excluded } = useStore.getState();
  const name = fileId(setup);
  if (kind === 'svg') {
    const drawing = drawPuzzleBoard(setup, plan, { holes: exportOptions.holes });
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
  const optimal = v.verification.string.optimal;
  const start = optimal.indexOf(plan.scale.slot);
  const tour = optimal.map((_, i) => optimal[(start + i) % optimal.length]!);
  const hash = encodePermalink(
    params,
    { country: country.country, version: country.dataVersion },
    setup.cities.map((c) => c.id),
    { pinned, excluded },
    __APP_VERSION__,
  );
  // Sheets are in the board language, numbers too.
  const locale = setup.params.labelLanguage === 'de' ? 'de-DE' : 'en-GB';
  const pdf = solutionPdf({
    drawing,
    texts: setup.texts,
    region: regionName(setup),
    plan,
    points: setup.points,
    tour,
    names: setup.cities.map((c) => (setup.params.labelLanguage === 'en' ? c.nameEn : c.name)),
    stringLengthUm: stringLength(setup.inst, tour),
    centreLengthUm: euclideanLength(setup.inst, tour),
    measuredLengthUm: measuredLength(setup.inst, tour, plan.scale.slot, plan.scale.direction),
    stringGapUm: v.verification.string.gap,
    link: `${window.location.origin}${window.location.pathname}${hash}`,
    formatNumber: (value, decimals) =>
      value.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
  });
  save(pdf, 'application/pdf', `tsp-board-${name}-solution.pdf`);
}

// Board plans in the app (start nail, scale, labels; computed in their own exact worker, so
// verifications continue) and the board preview of the designer. The downloads (SVG, PDF) are
// in export.ts, loaded when needed.

import { planData, type BoardPlan } from '../core/board/plan';
import { boardPlanInput, boardSetup, drawPuzzleBoard, type BoardSetup } from '../core/board/setup';
import type { HoleMode, Layer } from '../core/board/drawing';
import { localText } from '../core/puzzle-file';
import { svgPathData } from '../core/board/shapes';
import { rEffMm, type PuzzleParams } from '../core/params';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import type { BoardModel } from './board';
import type { PuzzleView } from './puzzle';
import { useStore, type BoardPlanState } from './store';

const PLAN_TIME_LIMIT_SEC = 120;

/** The plan depends on the puzzle and on the board, label and gap parameters. */
export function planKey(puzzleKey: string, p: PuzzleParams): string {
  return [
    puzzleKey,
    localText(useStore.getState().doc.title, p.labelLanguage),
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
    // Legend, start nail, an open path and logos change the layout.
    JSON.stringify(useStore.getState().doc.board ?? null),
    JSON.stringify(useStore.getState().doc.path ?? null),
    p.flatMap,
    useStore
      .getState()
      .logos.map((l) => `${l.city}:${l.fileName}`)
      .join(','),
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
  const { country, params, doc, logos } = useStore.getState();
  if (!country) return null;
  const start = doc.board?.startCity;
  const ends = doc.path ? [board.index.get(doc.path.start), board.index.get(doc.path.end)] : [];
  const labelLogos = new Map(
    logos.flatMap((l) => {
      const index = l.city === null ? undefined : board.index.get(l.city);
      return index === undefined ? [] : [[index, l.logo] as const];
    }),
  );
  return boardSetup(
    country,
    params,
    puzzle.members.map((c) => board.pool[c]!.id),
    localText(doc.title, params.labelLanguage),
    useStore.getState().list ? board.pool : null,
    {
      board: doc.board
        ? {
            legend: doc.board.legend,
            startPlace:
              start === null || start === undefined ? null : (board.index.get(start) ?? null),
          }
        : null,
      logos: labelLogos,
      legendLogo: logos.find((l) => l.city === null)?.logo ?? null,
      path:
        ends[0] !== undefined && ends[1] !== undefined ? { start: ends[0], end: ends[1] } : null,
    },
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

const previewCache = new WeakMap<BoardPlan, { key: string; paths: PreviewPaths }>();

/** SVG path data of the planned board per layer (memoised per plan and hole style). */
export function previewPaths(
  board: BoardModel,
  puzzle: PuzzleView,
  plan: BoardPlan,
  holes: HoleMode,
  edge: boolean,
): PreviewPaths | null {
  const key = `${holes}|${edge}`;
  const cached = previewCache.get(plan);
  if (cached?.key === key) return cached.paths;
  const setup = puzzleSetup(board, puzzle);
  if (!setup) return null;
  const drawing = drawPuzzleBoard(setup, plan, { holes, edge });
  const layer = (name: Layer, fill: boolean) =>
    svgPathData(
      drawing.items.filter((i) => i.layer === name && i.fill === fill).flatMap((i) => [...i.path]),
      2,
    );
  const paths = {
    score: layer('score', false),
    outline: layer('outline', false),
    cut: layer('cut', false) + layer('edge', false),
    engrave: layer('engrave', true) + layer('pit', true),
  };
  previewCache.set(plan, { key, paths });
  return paths;
}

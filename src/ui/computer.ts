// "So rechnet der Computer" in the app (roadmap 9.18): the comparison of the visitor's round trip
// with the simple strategies and the optimum, the tours on the map on demand, and the animation of
// how the computer finds and proves the optimum. Nothing opens by itself: a button after a
// finished game opens the view. The exact solver's rounds run in a worker as soon as the puzzle's
// optimum is known and are kept per puzzle (memory and local storage), so the animation starts at
// once, also on a slow booth laptop.

import {
  computerSteps,
  strategyTours,
  type ComputerStep,
  type Strategy,
  type StrategyTours,
} from '../core/computer';
import type { Instance } from '../core/instance';
import { effectiveREffMm } from '../core/params';
import type { Edge } from '../core/teaching';
import { openPath } from '../core/tsp/tour';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import { boardInstance, getBoard, slotSphere, type BoardModel } from './board';
import type { PuzzleView } from './puzzle';
import { useStore } from './store';
import { create } from 'zustand';

/** What the map shows of the comparison: a strategy's tour, the optimum or the visitor's. */
export type ComputerTour = Strategy | 'optimum' | 'player';

export interface ComputerState {
  /** The puzzle and game the view belongs to (closed when they change). */
  readonly key: string;
  readonly playId: string | null;
  readonly view: 'compare' | 'animation';
  readonly shown: ComputerTour | null;
  /** The animation's step (the last one stays). */
  readonly step: number;
}

/** The instance and the strategies' tours of a puzzle as played (memoised per puzzle). */
export interface ComputerModel {
  readonly key: string;
  readonly inst: Instance;
  readonly tours: StrategyTours;
}

let cached: ComputerModel | null = null;

/** The key of what the comparison depends on: the puzzle, its measure and its given leg. */
function modelKey(puzzle: PuzzleView): string {
  const { params, doc } = useStore.getState();
  return [
    puzzle.key,
    effectiveREffMm(params, doc.purpose),
    params.flatMap,
    JSON.stringify(doc.path ?? null),
  ].join('|');
}

export function computerModel(board: BoardModel, puzzle: PuzzleView): ComputerModel {
  const key = modelKey(puzzle);
  if (cached?.key === key) return cached;
  const { params, doc } = useStore.getState();
  const inst = boardInstance(board, puzzle.members, effectiveREffMm(params, doc.purpose));
  cached = { key, inst, tours: strategyTours(inst) };
  return cached;
}

// --- the exact solver's rounds, computed once per puzzle ---------------------------------------

const ROUNDS_KEY = 'tsp-boards.rounds.v1';
/** Puzzles kept in local storage (the booth plays a few puzzles all day). */
const ROUNDS_KEPT = 40;

type RoundsEntry = 'running' | 'error' | readonly (readonly Edge[])[];

interface RoundsState {
  readonly byKey: Readonly<Record<string, RoundsEntry>>;
}

export const useRounds = create<RoundsState>()(() => ({ byKey: readStoredRounds() }));

function readStoredRounds(): Record<string, RoundsEntry> {
  try {
    const raw = JSON.parse(localStorage.getItem(ROUNDS_KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, RoundsEntry>) : {};
  } catch {
    return {};
  }
}

function storeRounds(byKey: Readonly<Record<string, RoundsEntry>>): void {
  const done = Object.entries(byKey).filter(([, v]) => Array.isArray(v));
  try {
    localStorage.setItem(ROUNDS_KEY, JSON.stringify(Object.fromEntries(done.slice(-ROUNDS_KEPT))));
  } catch {
    // Not kept: computed again on the next visit.
  }
}

function setRounds(key: string, entry: RoundsEntry): void {
  const byKey = { ...useRounds.getState().byKey, [key]: entry };
  useRounds.setState({ byKey });
  if (Array.isArray(entry)) storeRounds(byKey);
}

/**
 * Starts the exact solver's rounds of the puzzle in a worker of its own, unless they are known
 * or running (called once the puzzle's optimum is known, so the verification goes first).
 */
export function prepareRounds(board: BoardModel, puzzle: PuzzleView): void {
  const model = computerModel(board, puzzle);
  const known = useRounds.getState().byKey[model.key];
  if (known === 'running' || Array.isArray(known)) return;
  setRounds(model.key, 'running');
  const w = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
    const m = event.data;
    if (m.type === 'rounds') setRounds(model.key, m.rounds);
    else if (m.type === 'error') setRounds(model.key, 'error');
    else return;
    w.terminate();
  };
  w.onerror = () => {
    setRounds(model.key, 'error');
    w.terminate();
  };
  const { inst } = model;
  w.postMessage({
    type: 'rounds',
    jobId: 1,
    points: inst.pointsMm(),
    sphere: slotSphere(board, puzzle.members),
    fixedEdge: inst.fixedEdge,
    rEffMm: inst.rEffUm / 1000,
  } satisfies ExactWorkerRequest);
}

/** The animation's steps once the rounds are known; null while they are computed. */
export function animationSteps(
  model: ComputerModel,
  rounds: RoundsEntry | undefined,
): ComputerStep[] | null {
  return Array.isArray(rounds) && rounds.length > 0
    ? computerSteps(model.inst, model.tours, rounds)
    : null;
}

// --- opening and closing ------------------------------------------------------------------------

export function openComputer(puzzle: PuzzleView): void {
  const { playId } = useStore.getState();
  useStore.setState({
    computer: { key: puzzle.key, playId, view: 'compare', shown: null, step: 0 },
    flight: null,
  });
}

export function closeComputer(): void {
  if (useStore.getState().computer) useStore.setState({ computer: null });
}

export function showComputerTour(shown: ComputerTour | null): void {
  const { computer } = useStore.getState();
  if (computer) useStore.setState({ computer: { ...computer, view: 'compare', shown } });
}

export function startAnimation(): void {
  const { computer } = useStore.getState();
  if (computer)
    useStore.setState({ computer: { ...computer, view: 'animation', shown: null, step: 0 } });
}

export function setAnimationStep(step: number): void {
  const { computer } = useStore.getState();
  if (computer?.view === 'animation') useStore.setState({ computer: { ...computer, step } });
}

// The view belongs to one game: it closes when the game, the puzzle, the page or the kiosk's
// screen changes (in the kiosk also on the inactivity reset, which starts a new game).
useStore.subscribe((s, prev) => {
  if (!s.computer) return;
  if (
    s.playId !== s.computer.playId ||
    s.mode !== 'play' ||
    s.page !== 'app' ||
    s.kiosk !== prev.kiosk ||
    (s.play.startedAt === null && prev.play.startedAt !== null)
  )
    useStore.setState({ computer: null });
});

/** The current board and model, for components outside the play panel. */
export function currentModel(puzzle: PuzzleView): ComputerModel | null {
  const { country, params } = useStore.getState();
  return country ? computerModel(getBoard(country, params), puzzle) : null;
}

/** What the map draws of the computer view: a tour, or the animation's step (pool indices). */
export interface ComputerDrawing {
  readonly route: { readonly cities: readonly number[]; readonly closed: boolean } | null;
  readonly edges: readonly (readonly [number, number])[];
  readonly highlight: readonly (readonly [number, number])[];
  readonly nodes: readonly number[];
}

export function computerDrawing(
  board: BoardModel,
  puzzle: PuzzleView,
  computer: ComputerState,
  best: { readonly path: readonly number[] } | null,
): ComputerDrawing | null {
  const model = computerModel(board, puzzle);
  const pool = (s: number) => puzzle.members[s]!;
  const fixed = model.inst.fixedEdge;
  // The given leg of an open path is drawn dashed anyway.
  const keep = ([a, b]: readonly [number, number]) =>
    !fixed || !((a === fixed[0] && b === fixed[1]) || (a === fixed[1] && b === fixed[0]));
  const edges = (list: readonly (readonly [number, number])[]) =>
    list.filter(keep).map(([a, b]) => [pool(a), pool(b)] as const);
  if (computer.view === 'animation') {
    const steps = animationSteps(model, useRounds.getState().byKey[model.key]);
    const step = steps?.[Math.min(computer.step, steps.length - 1)];
    return step
      ? {
          route: null,
          // The proven optimum in the colour of the shortest round trip.
          edges: step.phase === 'proven' ? [] : edges(step.edges),
          highlight: edges(step.phase === 'proven' ? step.edges : step.highlight),
          nodes: step.nodes.map(pool),
        }
      : null;
  }
  const v = puzzle.verification;
  const slots =
    computer.shown === 'player'
      ? (best?.path ?? null)
      : computer.shown === 'optimum'
        ? v?.status === 'done' && v.verification.string
          ? v.verification.string.optimal
          : null
        : computer.shown === 'nearest-neighbor'
          ? model.tours.nearestNeighbor
          : computer.shown === 'insertion'
            ? model.tours.insertion
            : computer.shown === 'two-opt'
              ? model.tours.twoOpt
              : null;
  if (!slots) return null;
  // An open path from its start to its end, without the given leg (roadmap 9.15).
  const route = fixed ? openPath(model.inst, slots) : null;
  return {
    route: { cities: (route ?? slots).map(pool), closed: route === null },
    edges: [],
    highlight: [],
    nodes: [],
  };
}

/** A tap on the map during the animation skips to its end (and plays no nail). */
export function skipAnimation(): boolean {
  const { computer } = useStore.getState();
  if (computer?.view !== 'animation') return false;
  const key = cached?.key;
  const steps = cached
    ? animationSteps(cached, key ? useRounds.getState().byKey[key] : undefined)
    : null;
  if (steps) setAnimationStep(steps.length - 1);
  return true;
}

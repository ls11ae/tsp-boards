// Teaching mode (Phase 6): a strategy step by step on the puzzle on display. The simple
// strategies are computed here; the exact solver's rounds in a worker.

import { Instance } from '../core/instance';
import {
  greedyEdgeFrames,
  insertionFrames,
  nearestNeighborFrames,
  subtourFrames,
  twoOptFrames,
  type TeachingFrame,
  type TeachingKind,
} from '../core/teaching';
import { nearestNeighbor } from '../core/tsp/construct';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import type { BoardModel } from './board';
import type { PuzzleView } from './puzzle';
import { useStore } from './store';

export interface TeachingState {
  /** Key of the puzzle the frames belong to. */
  readonly key: string;
  readonly kind: TeachingKind;
  /** Start place (slot) of nearest neighbour and of the 2-opt start tour. */
  readonly start: number;
  /** null while the exact solver runs. */
  readonly frames: readonly TeachingFrame[] | null;
  readonly index: number;
  readonly playing: boolean;
  readonly error: string | null;
}

let worker: Worker | null = null;
let job = 0;

function set(update: Partial<TeachingState>): void {
  const { teaching } = useStore.getState();
  if (teaching) useStore.setState({ teaching: { ...teaching, ...update } });
}

/** Starts showing `kind` on the puzzle on display (from the first frame, playing). */
export function startTeaching(
  board: BoardModel,
  puzzle: PuzzleView,
  kind: TeachingKind,
  start: number,
): void {
  const inst = new Instance(
    puzzle.members.map((c) => board.points[c]!),
    0,
  );
  worker?.terminate();
  worker = null;
  const base = { key: puzzle.key, kind, start, index: 0, playing: true, error: null };
  if (kind !== 'subtours') {
    const frames =
      kind === 'nearest-neighbor'
        ? nearestNeighborFrames(inst, start)
        : kind === 'insertion'
          ? insertionFrames(inst)
          : kind === 'greedy-edge'
            ? greedyEdgeFrames(inst)
            : twoOptFrames(inst, nearestNeighbor(inst, start));
    useStore.setState({ teaching: { ...base, frames } });
    return;
  }
  useStore.setState({ teaching: { ...base, frames: null } });
  const w = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = w;
  const id = ++job;
  w.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
    const m = event.data;
    if (m.type === 'rounds' && m.jobId === id) set({ frames: subtourFrames(inst, m.rounds) });
    else if (m.type === 'error' && m.jobId === id) set({ error: m.message, playing: false });
    else return;
    w.terminate();
    if (worker === w) worker = null;
  };
  w.onerror = (event) => set({ error: event.message, playing: false });
  w.postMessage({
    type: 'rounds',
    jobId: id,
    points: inst.pointsMm(),
  } satisfies ExactWorkerRequest);
}

/** Moves by `delta` frames (stops playing). */
export function stepTeaching(delta: number): void {
  const { teaching } = useStore.getState();
  if (!teaching?.frames) return;
  const index = Math.max(0, Math.min(teaching.frames.length - 1, teaching.index + delta));
  set({ index, playing: false });
}

/** Advances while playing; stops at the last frame. */
export function advanceTeaching(): void {
  const { teaching } = useStore.getState();
  if (!teaching?.frames || !teaching.playing) return;
  const last = teaching.frames.length - 1;
  set({ index: Math.min(last, teaching.index + 1), playing: teaching.index + 1 < last });
}

export function setTeachingPlaying(playing: boolean): void {
  const { teaching } = useStore.getState();
  if (!teaching?.frames) return;
  // Playing from the end starts over.
  const restart = playing && teaching.index >= teaching.frames.length - 1;
  set({ playing, ...(restart ? { index: 0 } : {}) });
}

export function stopTeaching(): void {
  worker?.terminate();
  worker = null;
  useStore.setState({ teaching: null });
}

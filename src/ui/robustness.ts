// Robustness check of a planned board (Phase 6): the exact optimum, gap and measured gap at
// the scale for r_eff half a millimetre below and above the planned value. Runs in its own
// exact worker; rows arrive one by one.

import type { BoardPlan } from '../core/board/plan';
import { rEffMm } from '../core/params';
import { robustnessRadii, type RobustnessRow } from '../core/robustness';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import type { BoardModel } from './board';
import { planKey } from './plans';
import type { PuzzleView } from './puzzle';
import { useStore } from './store';

export interface RobustnessState {
  /** Plan key (puzzle and board parameters) the rows belong to. */
  readonly key: string;
  readonly rows: readonly RobustnessRow[];
  readonly running: boolean;
  readonly error: string | null;
}

const TIME_LIMIT_SEC = 120;

let worker: Worker | null = null;
let job = 0;

function update(key: string, change: Partial<RobustnessState>): void {
  const { robustness } = useStore.getState();
  if (robustness?.key === key) useStore.setState({ robustness: { ...robustness, ...change } });
}

export function checkBoardRobustness(board: BoardModel, puzzle: PuzzleView, plan: BoardPlan): void {
  const v = puzzle.verification;
  if (v?.status !== 'done' || !v.verification.string) return;
  const { params } = useStore.getState();
  const key = planKey(puzzle.key, params);
  worker?.terminate();
  const w = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = w;
  const id = ++job;
  useStore.setState({ robustness: { key, rows: [], running: true, error: null } });
  const finish = (change: Partial<RobustnessState>) => {
    update(key, { ...change, running: false });
    w.terminate();
    if (worker === w) worker = null;
  };
  w.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
    const m = event.data;
    if (m.type === 'robustness-row' && m.jobId === id) {
      const rows = useStore.getState().robustness?.rows ?? [];
      update(key, { rows: [...rows, m.row] });
    } else if (m.type === 'robustness-done' && m.jobId === id) finish({});
    else if (m.type === 'error' && m.jobId === id) finish({ error: m.message });
  };
  w.onerror = (event) => finish({ error: event.message });
  w.postMessage({
    type: 'robustness',
    jobId: id,
    points: puzzle.members.map((c) => board.points[c]!),
    radii: robustnessRadii(rEffMm(params)),
    reference: v.verification.string.optimal,
    scale: { slot: plan.scale.slot, direction: plan.scale.direction },
    timeLimitSec: TIME_LIMIT_SEC,
  } satisfies ExactWorkerRequest);
}

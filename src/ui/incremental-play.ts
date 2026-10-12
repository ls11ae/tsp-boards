// Play mode of the incremental puzzle: instance by instance on one board. The player builds the
// round trip through nails 1..k; once it is the shortest, the next nail joins (k + 1), until
// all nails are done. Games and highscores are kept per puzzle like map puzzles.

import { encodeIncrementalLink } from '../core/incremental/params';
import { Instance } from '../core/instance';
import { clickNail, judge, undo } from '../core/play';
import { puzzleHash } from '../core/play';
import { NEW_GAME, useStore, type PlayUi } from './store';
import { recordGameScore, startPlaying, updateGame } from './play';

export const FIRST_STAGE = 3;

/** Play id of the open incremental puzzle: the document id, or a hash of its points. */
export function incrementalPlayId(): string | null {
  const { inc, doc } = useStore.getState();
  if (!inc.puzzle) return null;
  if (doc.id) return doc.id;
  const coords = inc.puzzle.points.map(
    ([x, y]) => Math.round(x * 10) * 100_000 + Math.round(y * 10),
  );
  return `i-${puzzleHash(coords)}`;
}

export function startIncrementalPlay(): void {
  const id = incrementalPlayId();
  if (!id) return;
  startPlaying(id);
  const { play } = useStore.getState();
  if (play.stage === null) useStore.setState({ play: { ...play, stage: FIRST_STAGE } });
}

/** The stage being played (k), at least 3. */
export function currentStage(play: PlayUi): number {
  return play.stage ?? FIRST_STAGE;
}

let cache: { key: string; inst: Instance } | null = null;

function stageInstance(k: number): Instance | null {
  const { inc } = useStore.getState();
  const puzzle = inc.puzzle;
  if (!puzzle) return null;
  const key = `${puzzle.points.length}|${k}|${puzzle.params.rEffMm}|${puzzle.points[0]!.join(',')}`;
  if (cache?.key === key) return cache.inst;
  const inst = new Instance(puzzle.points.slice(0, k), puzzle.params.rEffMm);
  cache = { key, inst };
  return inst;
}

export function incrementalClick(slot: number): void {
  const { play } = useStore.getState();
  const k = currentStage(play);
  if (slot >= k || play.solvedMs !== null) return;
  updateGame((p) => ({
    ...p,
    state: clickNail(p.state, slot, k),
    startedAt: p.startedAt ?? Date.now(),
  }));
  judgeStage();
}

export function incrementalUndo(): void {
  updateGame((p) => ({ ...p, state: undo(p.state) }));
}

export function incrementalRestartStage(): void {
  updateGame((p) => ({ ...p, state: NEW_GAME.state, judged: null }));
}

export function incrementalNewGame(): void {
  updateGame(() => ({ ...NEW_GAME, stage: FIRST_STAGE }));
}

/** Shows the optimum of the current stage (counts as help in the highscores). */
export function incrementalReveal(): void {
  updateGame((p) => ({ ...p, revealed: true, judged: `revealed:${currentStage(p)}` }));
}

/** The optimum of the current stage is on display. */
export function stageRevealed(play: PlayUi): boolean {
  return play.judged === `revealed:${currentStage(play)}`;
}

/** Moves on after a revealed stage: the shown optimum counts as the round trip. */
export function incrementalSkip(): void {
  const { inc, play } = useStore.getState();
  const k = currentStage(play);
  const step = inc.puzzle?.steps.find((s) => s.k === k);
  if (!step) return;
  advance(k, play.startedAt === null ? 0 : Date.now() - play.startedAt);
}

function advance(k: number, ms: number): void {
  const { inc } = useStore.getState();
  const n = inc.puzzle?.points.length ?? 0;
  if (k >= n) {
    updateGame((p) => ({ ...p, solvedMs: ms, best: { excess: 0, path: [...p.state.path] } }));
    recordGameScore('string');
  } else {
    updateGame((p) => ({ ...p, stage: k + 1, state: NEW_GAME.state, judged: null }));
  }
}

/** Judges a closed round trip of the current stage against its exact optimum. */
export function judgeStage(): void {
  const { inc, play } = useStore.getState();
  const k = currentStage(play);
  const step = inc.puzzle?.steps.find((s) => s.k === k);
  if (!play.state.closed || !step) return;
  const key = `${k}:${play.state.path.join(',')}`;
  if (play.judged === key) return;
  const inst = stageInstance(k);
  if (!inst) return;
  const result = judge(inst, play.state.path, { tour: step.tour, lengthUm: step.stringUm });
  const ms = play.startedAt === null ? 0 : Date.now() - play.startedAt;
  updateGame((p) => ({
    ...p,
    judged: key,
    attempts: [...p.attempts, { ms, excessUm: result.optimal ? 0 : result.excessUm }],
  }));
  if (result.optimal) advance(k, ms);
}

/** Link that opens the incremental puzzle in play mode. */
export function incrementalPlayLink(): string | null {
  const { inc, doc } = useStore.getState();
  if (!inc.puzzle) return null;
  const hash = encodeIncrementalLink(
    { ...inc.params, n: inc.puzzle.points.length },
    inc.puzzle.points,
    __APP_VERSION__,
    doc.title,
    true,
  );
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

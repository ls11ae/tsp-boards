// The figures of a game in play (places visited, length so far, result) for the phone's status
// bar (roadmap 9.10).

import { useMemo } from 'react';
import { effectiveREffMm } from '../core/params';
import { pathLength } from '../core/play';
import { stringLength } from '../core/tsp/tour';
import { boardInstance, type BoardModel } from './board';
import type { PuzzleView } from './puzzle';
import { useStore } from './store';

export interface PlayFigures {
  readonly n: number;
  readonly visited: number;
  /** Length of the trip so far (string or Euclidean in board µm). */
  readonly lengthUm: number;
  readonly digital: boolean;
  /** The last closed round trip was judged: its excess over the optimum (µm), else null. */
  readonly excessUm: number | null;
  /** The optimum's length (µm), once known. */
  readonly optimumUm: number | null;
}

export function usePlayFigures(board: BoardModel, puzzle: PuzzleView | null): PlayFigures | null {
  const play = useStore((s) => s.play);
  const params = useStore((s) => s.params);
  const purpose = useStore((s) => s.doc.purpose);
  const members = puzzle?.members;
  const rEff = effectiveREffMm(params, purpose);
  const inst = useMemo(
    () => (members ? boardInstance(board, members, rEff) : null),
    [board, members, rEff],
  );
  if (!puzzle || !inst) return null;
  const path = play.state.path;
  const pathKey = path.join(',');
  const last = play.attempts.at(-1);
  const judged = play.state.closed && play.judged === pathKey && last !== undefined;
  const v = puzzle.verification;
  const optimum = v?.status === 'done' ? v.verification.string : null;
  return {
    n: puzzle.members.length,
    visited: path.length,
    lengthUm: play.state.closed ? stringLength(inst, path) : pathLength(inst, path),
    digital: purpose === 'digital',
    excessUm: judged ? last.excessUm : null,
    optimumUm: optimum?.optimalLength ?? null,
  };
}

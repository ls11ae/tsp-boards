// The comparison tour drawn over the board (roadmap 5.5): the runner-up of the exact check or
// the tour of a simple strategy, with the edges in which it differs from the optimum.

import { useMemo } from 'react';
import { edgeDifference, heuristicTour } from '../core/overlays';
import { effectiveREffMm } from '../core/params';
import { openPath, stringLength } from '../core/tsp/tour';
import { boardInstance, type BoardModel } from './board';
import type { PuzzleView } from './puzzle';
import { useStore, type OverlayChoice } from './store';

export interface OverlayView {
  readonly kind: Exclude<OverlayChoice, 'none'>;
  /** Pool indices; with given end points (roadmap 9.15) the open path from start to end. */
  readonly tour: readonly number[];
  /** False for an open path (its given leg is drawn on its own). */
  readonly closed: boolean;
  /** Edges (pool indices) of the overlay that the optimum does not use, and vice versa. */
  readonly added: readonly (readonly [number, number])[];
  readonly removed: readonly (readonly [number, number])[];
  /** Length of the overlay minus the optimum (string length; Euclidean for digital), µm. */
  readonly excessUm: number;
  readonly optimumUm: number;
}

/** The overlay chosen in the store for the puzzle on display, or null (none or not known yet). */
export function useOverlay(
  board: BoardModel | null,
  puzzle: PuzzleView | null,
): OverlayView | null {
  const kind = useStore((s) => s.overlay);
  const params = useStore((s) => s.params);
  const purpose = useStore((s) => s.doc.purpose);
  const rEff = effectiveREffMm(params, purpose);
  const v = puzzle?.verification;
  const exact = v?.status === 'done' ? v.verification.string : null;
  const flat = v?.status === 'done' ? (v.verification.flat ?? null) : null;
  const members = puzzle?.members;
  const tour = puzzle?.tour;
  return useMemo(() => {
    if (kind === 'none' || !board || !members || !tour) return null;
    const inst = boardInstance(board, members, rEff);
    const slotOf = new Map(members.map((c, s) => [c, s]));
    const optimum = exact ? exact.optimal : tour.map((c) => slotOf.get(c)!);
    let other: readonly number[];
    if (kind === 'second') {
      if (!exact?.second) return null;
      other = exact.second;
    } else if (kind === 'flat-map') {
      if (!flat) return null;
      other = flat.tour;
    } else other = heuristicTour(inst, kind);
    const optimumUm = stringLength(inst, optimum);
    const d = edgeDifference(optimum, other, inst.n);
    const pool = ([a, b]: readonly [number, number]) => [members[a]!, members[b]!] as const;
    const open = inst.fixedEdge ? openPath(inst, other) : null;
    return {
      kind,
      tour: (open ?? other).map((s) => members[s]!),
      closed: open === null,
      added: d.added.map(pool),
      removed: d.removed.map(pool),
      excessUm: stringLength(inst, other) - optimumUm,
      optimumUm,
    };
  }, [kind, board, members, tour, exact, flat, rEff]);
}

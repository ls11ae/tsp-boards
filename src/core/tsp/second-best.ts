// Cheap upper bound on the gap to the second-best tour: the best tour different from the given
// one among all its local modifications. Scanned exhaustively (no neighbour lists):
//   - all 2-opt moves,
//   - all pure 3-opt reconnections (segment moves of any length in both orientations, and
//     reversing two adjacent segments in place),
//   - optionally all double-bridge moves (non-sequential 4-opt, O(n⁴)).
// A move that reproduces the same edge set is skipped; genuine ties (another tour with the same
// string length) give gap 0. The result is an upper bound on the true gap only if the tour is
// optimal; a move with negative delta disproves optimality, is applied, and the scan restarts.
//
// Pruning: new turn costs are ≥ 0, so ΔS ≥ ΔL − Σ(old turn costs at the move's endpoints). Moves
// whose bound is not below the best gap so far are skipped without computing turn changes.

import type { Instance } from '../instance';
import { TourState, applyMove, isIdentityMove, moveDelta, type KOptMove } from './kopt';
import { stringLength, type Tour } from './tour';

export type MoveKind =
  | '2-opt'
  | 'segment-move'
  | 'segment-move-reversed'
  | 'reversed-segment-move'
  | 'two-reversals'
  | 'double-bridge';

export interface Alternative {
  /** ΔS of the alternative tour in µm (≥ 0). */
  readonly delta: number;
  readonly kind: MoveKind;
  readonly move: KOptMove;
}

export interface GapScanOptions {
  readonly doubleBridge: boolean;
  /**
   * Only alternatives with ΔS below this are of interest (µm): the scan then reports
   * min(gap, cap). Large gaps weaken the pruning, so a cap keeps the scan fast when the caller
   * only needs to know whether the gap reaches a threshold.
   */
  readonly cap?: number;
}

export interface GapScanResult {
  /** The (possibly improved) tour; a local optimum for all scanned move types. */
  readonly tour: number[];
  /** Its string length in µm. */
  readonly length: number;
  /** Number of improving moves applied before the final scan. */
  readonly improvements: number;
  /** Smallest ΔS over all non-identical alternatives, at most the cap (Infinity if none). */
  readonly gap: number;
  readonly best: Alternative | null;
}

interface ScanState {
  best: number;
  bestAlt: Alternative | null;
  improving: KOptMove | null;
}

function copyMove(move: KOptMove): KOptMove {
  return { k: move.k, rem: Int32Array.from(move.rem), add: Int32Array.from(move.add) };
}

function scanOnce(inst: Instance, state: TourState, options: GapScanOptions): ScanState {
  const n = state.n;
  const t = state.order;
  const at = (i: number) => t[i % n]!;
  const oldTurn = new Int32Array(n);
  for (let v = 0; v < n; v++) oldTurn[v] = inst.turn(state.prev(v), v, state.next(v));
  const d = (u: number, v: number) => inst.dist(u, v);
  const s: ScanState = { best: options.cap ?? Infinity, bestAlt: null, improving: null };

  const rem = new Int32Array(8);
  const add = new Int32Array(8);
  const move2: KOptMove = { k: 2, rem, add };
  const move3: KOptMove = { k: 3, rem, add };
  const move4: KOptMove = { k: 4, rem, add };

  /** Evaluates the move in rem/add; returns true to stop scanning (improvement found). */
  const consider = (move: KOptMove, lengthDelta: number, oldTurns: number, kind: MoveKind) => {
    if (lengthDelta - oldTurns >= s.best) return false;
    const delta = moveDelta(inst, state, move);
    if (delta >= s.best) return false;
    if (isIdentityMove(move)) return false;
    if (delta < 0) {
      s.improving = copyMove(move);
      return true;
    }
    s.best = delta;
    s.bestAlt = { delta, kind, move: copyMove(move) };
    return false;
  };

  // 2-opt: remove (a,b), (c,e); add (a,c), (b,e).
  for (let i = 0; i < n - 2; i++) {
    const a = t[i]!;
    const b = t[i + 1]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = t[j]!;
      const e = at(j + 1);
      rem.set([a, b, c, e]);
      add.set([a, c, b, e]);
      const dl = d(a, c) + d(b, e) - d(a, b) - d(c, e);
      if (consider(move2, dl, oldTurn[a]! + oldTurn[b]! + oldTurn[c]! + oldTurn[e]!, '2-opt'))
        return s;
    }
  }

  // 3-opt: remove (a,b1), (b2,c1), (c2,e) with B = b1..b2, C = c1..c2.
  for (let i = 0; i < n - 2; i++) {
    const a = t[i]!;
    const b1 = t[i + 1]!;
    for (let j = i + 1; j < n - 1; j++) {
      const b2 = t[j]!;
      const c1 = t[j + 1]!;
      for (let k = j + 1; k < n; k++) {
        const c2 = t[k]!;
        const e = at(k + 1);
        const removed = d(a, b1) + d(b2, c1) + d(c2, e);
        const turns =
          oldTurn[a]! + oldTurn[b1]! + oldTurn[b2]! + oldTurn[c1]! + oldTurn[c2]! + oldTurn[e]!;
        rem.set([a, b1, b2, c1, c2, e]);
        // A C B
        add.set([a, c1, c2, b1, b2, e]);
        if (consider(move3, d(a, c1) + d(c2, b1) + d(b2, e) - removed, turns, 'segment-move'))
          return s;
        // A C B'
        add.set([a, c1, c2, b2, b1, e]);
        if (
          consider(move3, d(a, c1) + d(c2, b2) + d(b1, e) - removed, turns, 'segment-move-reversed')
        )
          return s;
        // A C' B
        add.set([a, c2, c1, b1, b2, e]);
        if (
          consider(move3, d(a, c2) + d(c1, b1) + d(b2, e) - removed, turns, 'reversed-segment-move')
        )
          return s;
        // A B' C'
        add.set([a, b2, b1, c2, c1, e]);
        if (consider(move3, d(a, b2) + d(b1, c2) + d(c1, e) - removed, turns, 'two-reversals'))
          return s;
      }
    }
  }

  if (!options.doubleBridge) return s;
  // Double bridge: R S1 S2 S3 -> R S3 S2 S1 with S1 = p1..p2, S2 = q1..q2, S3 = r1..r2.
  for (let i = 0; i < n - 3; i++) {
    const a = t[i]!;
    const p1 = t[i + 1]!;
    for (let j = i + 1; j < n - 2; j++) {
      const p2 = t[j]!;
      const q1 = t[j + 1]!;
      for (let k = j + 1; k < n - 1; k++) {
        const q2 = t[k]!;
        const r1 = t[k + 1]!;
        const partial = d(a, p1) + d(p2, q1) + d(q2, r1);
        const partialAdd = d(a, r1) + d(q2, p1);
        const partialTurns =
          oldTurn[a]! + oldTurn[p1]! + oldTurn[p2]! + oldTurn[q1]! + oldTurn[q2]! + oldTurn[r1]!;
        for (let l = k + 1; l < n; l++) {
          const r2 = t[l]!;
          const e = at(l + 1);
          const dl = partialAdd + d(r2, q1) + d(p2, e) - partial - d(r2, e);
          if (dl - partialTurns - oldTurn[r2]! - oldTurn[e]! >= s.best) continue;
          rem.set([a, p1, p2, q1, q2, r1, r2, e]);
          add.set([a, r1, r2, q1, q2, p1, p2, e]);
          if (consider(move4, dl, partialTurns + oldTurn[r2]! + oldTurn[e]!, 'double-bridge'))
            return s;
        }
      }
    }
  }
  return s;
}

/** Scans all local alternatives of `tour` (improving it first if a move is better). */
export function scanSecondBest(
  inst: Instance,
  tour: Tour,
  options: GapScanOptions = { doubleBridge: false },
): GapScanResult {
  const state = new TourState(tour);
  let improvements = 0;
  for (;;) {
    const s = scanOnce(inst, state, options);
    if (s.improving) {
      applyMove(state, s.improving);
      improvements++;
      continue;
    }
    const result = state.tour();
    return {
      tour: result,
      length: stringLength(inst, result),
      improvements,
      gap: s.best,
      best: s.bestAlt,
    };
  }
}

/** The alternative tour described by a scan result. */
export function alternativeTour(tour: Tour, alternative: Alternative): number[] {
  const state = new TourState(tour);
  applyMove(state, alternative.move);
  return state.tour();
}

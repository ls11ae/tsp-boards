// Messages between the UI thread and the workers. Plain data only (structured clone).

import type { Point } from '../core/geometry';
import type { FixedEdge, Sphere } from '../core/instance';
import type {
  Evaluation,
  SearchParams,
  SearchPool,
  SearchStats,
  TracePoint,
} from '../core/search/search';
import type { BoardPlan, PlanData } from '../core/board/plan';
import type { RatedChange } from '../core/fixed';
import type { PosterStop, PosterTour } from '../core/board/poster-tour';
import type { RobustnessRow, ScalePosition } from '../core/robustness';
import type {
  IncrementalParams,
  IncrementalPuzzle,
  SequenceCheck,
} from '../core/incremental/generate';
import type { Verification, VerificationMode } from '../core/verify';

// --- search worker ---------------------------------------------------------------------------

export type SearchRequest =
  | {
      readonly type: 'start';
      readonly runId: number;
      readonly pool: SearchPool;
      readonly params: SearchParams;
    }
  | { readonly type: 'stop'; readonly runId: number };

export interface SearchProgress {
  readonly runId: number;
  readonly iteration: number;
  readonly iterations: number;
  readonly temperature: number;
  readonly stats: SearchStats;
  readonly current: Evaluation;
  readonly best: Evaluation | null;
  readonly archive: readonly Evaluation[];
  /** Trace points since the previous progress message. */
  readonly trace: readonly TracePoint[];
}

export type SearchResponse =
  | ({ readonly type: 'progress' } & SearchProgress)
  | ({ readonly type: 'done' } & SearchProgress)
  | { readonly type: 'error'; readonly runId: number; readonly message: string };

// --- exact worker ----------------------------------------------------------------------------

export interface VerifyJob {
  readonly jobId: number;
  /** Evaluation key of the candidate. */
  readonly key: string;
  /** Board points (mm) in slot order. */
  readonly points: readonly Point[];
  /** Great-circle distances (world puzzles); omitted or null: the board's plane. */
  readonly sphere?: Sphere | null;
  /** The given leg of an open path (slots, roadmap 9.15); omitted or null: a round trip. */
  readonly fixedEdge?: FixedEdge | null;
  /** Best known tour over slots. */
  readonly tour: readonly number[];
  readonly rEffMm: number;
  readonly timeLimitSec: number;
  /** 'euclid-exact-string-local' for digital puzzles (r_eff 0: the Euclidean check suffices). */
  readonly mode: VerificationMode;
}

export interface PlanJob {
  readonly jobId: number;
  readonly key: string;
  readonly data: PlanData;
  readonly timeLimitSec: number;
}

export interface ChangesJob {
  readonly jobId: number;
  readonly points: readonly Point[];
  readonly rEffMm: number;
  readonly model: 'string' | 'euclidean';
  readonly minDistanceMm: number;
  readonly top: number;
  /** Points that are neither left out nor combined. */
  readonly keep: readonly number[];
}

/** The poster's round trip (roadmap 9.7): great-circle optimum, checked on the map. */
export interface PosterJob {
  readonly jobId: number;
  readonly stops: readonly PosterStop[];
  /** Map points of the stops (the puzzle's board), for the check. */
  readonly points: readonly Point[];
}

export interface RoundsJob {
  readonly jobId: number;
  /** Board points (mm) in slot order. */
  readonly points: readonly Point[];
  readonly sphere?: Sphere | null;
  readonly fixedEdge?: FixedEdge | null;
  /** r_eff for the string model (a board, roadmap 9.18); omitted or 0: Euclidean. */
  readonly rEffMm?: number;
}

export interface RobustnessJob {
  readonly jobId: number;
  readonly points: readonly Point[];
  readonly radii: readonly number[];
  /** The board's optimal tour (slots). */
  readonly reference: readonly number[];
  readonly fixedEdge?: FixedEdge | null;
  readonly scale: ScalePosition | null;
  readonly timeLimitSec: number;
}

export type ExactWorkerRequest =
  | { readonly type: 'selftest' }
  | ({ readonly type: 'robustness' } & RobustnessJob)
  | ({ readonly type: 'rounds' } & RoundsJob)
  | ({ readonly type: 'verify' } & VerifyJob)
  | ({ readonly type: 'plan' } & PlanJob)
  | ({ readonly type: 'changes' } & ChangesJob)
  | ({ readonly type: 'poster' } & PosterJob);

export type ExactWorkerResponse =
  | {
      readonly type: 'selftest-result';
      readonly ok: boolean;
      readonly status: string;
      readonly objective: number;
      readonly highsVersion: string;
      readonly loadMs: number;
      readonly solveMs: number;
    }
  | {
      readonly type: 'verified';
      readonly jobId: number;
      readonly key: string;
      readonly verification: Verification;
      readonly ms: number;
    }
  | {
      readonly type: 'planned';
      readonly jobId: number;
      readonly key: string;
      /** null: no start nail has room for the scale. */
      readonly plan: BoardPlan | null;
      readonly ms: number;
    }
  | {
      readonly type: 'changes';
      readonly jobId: number;
      readonly suggestions: readonly RatedChange[];
    }
  | { readonly type: 'poster'; readonly jobId: number; readonly tour: PosterTour }
  | { readonly type: 'robustness-row'; readonly jobId: number; readonly row: RobustnessRow }
  | { readonly type: 'robustness-done'; readonly jobId: number }
  | {
      readonly type: 'rounds';
      readonly jobId: number;
      /** Edges (slot pairs) of each subtour elimination round of the Euclidean solver. */
      readonly rounds: readonly (readonly (readonly [number, number])[])[];
    }
  | { readonly type: 'error'; readonly jobId?: number; readonly message: string };

// --- incremental worker ------------------------------------------------------------------------

export type IncrementalRequest =
  | { readonly type: 'generate'; readonly id: number; readonly params: IncrementalParams }
  | {
      readonly type: 'check';
      readonly id: number;
      readonly params: IncrementalParams;
      readonly points: readonly Point[];
    };

export type IncrementalResponse =
  | {
      readonly type: 'generated';
      readonly id: number;
      readonly puzzle: IncrementalPuzzle | null;
      readonly reached: number;
      readonly checks: number;
      readonly ms: number;
    }
  | {
      readonly type: 'checked';
      readonly id: number;
      readonly result: SequenceCheck;
      readonly ms: number;
    }
  | { readonly type: 'error'; readonly id: number; readonly message: string };

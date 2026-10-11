// Messages between the UI thread and the workers. Plain data only (structured clone).

import type { Point } from '../core/geometry';
import type {
  Evaluation,
  SearchParams,
  SearchPool,
  SearchStats,
  TracePoint,
} from '../core/search/search';
import type { BoardPlan, PlanData } from '../core/board/plan';
import type { Verification } from '../core/verify';

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
  /** Best known tour over slots. */
  readonly tour: readonly number[];
  readonly rEffMm: number;
  readonly timeLimitSec: number;
}

export interface PlanJob {
  readonly jobId: number;
  readonly key: string;
  readonly data: PlanData;
  readonly timeLimitSec: number;
}

export type ExactWorkerRequest =
  | { readonly type: 'selftest' }
  | ({ readonly type: 'verify' } & VerifyJob)
  | ({ readonly type: 'plan' } & PlanJob);

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
  | { readonly type: 'error'; readonly jobId?: number; readonly message: string };

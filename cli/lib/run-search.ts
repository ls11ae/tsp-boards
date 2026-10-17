// Shared runner for the CLI search and the gap survey.

import { prominence, type City } from '../../src/core/data';
import { Instance } from '../../src/core/instance';
import {
  Search,
  type Evaluation,
  type PoolLabels,
  type SearchParams,
} from '../../src/core/search/search';
import type { PoolGroups } from '../../src/core/search/groups';
import type { MipBackend } from '../../src/core/tsp/exact';
import { verifyCandidate, type Verification } from '../../src/core/verify';
import type { BoardPool } from './country';

export interface RunOptions {
  readonly params: SearchParams;
  readonly pool: BoardPool;
  readonly backend: MipBackend | undefined;
  readonly pinnedIds?: readonly number[];
  /** A given edge between two pinned cities (ids): an open path from the first to the second. */
  readonly fixedIds?: readonly [number, number];
  readonly labels?: PoolLabels;
  readonly groups?: PoolGroups;
  readonly onProgress?: (search: Search, elapsedMs: number) => void;
  readonly progressEvery?: number;
}

export function runSearch(options: RunOptions): { search: Search; elapsedMs: number } {
  const { pool, params } = options;
  const index = new Map(pool.cities.map((c, i) => [c.id, i]));
  const pinned = (options.pinnedIds ?? []).map((id) => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`pinned city ${id} is not in the pool`);
    return i;
  });
  const fixed = options.fixedIds?.map((id) => {
    const i = index.get(id);
    if (i === undefined || !pinned.includes(i)) throw new Error(`fixed city ${id} is not pinned`);
    return i;
  });
  const t0 = performance.now();
  const search = new Search(
    {
      points: pool.points,
      ...(fixed ? { fixedEdge: [fixed[0]!, fixed[1]!] as const } : {}),
      ...(pool.sphere ? { sphere: pool.sphere } : {}),
      prominence: pool.cities.map(prominence),
      pinned,
      labels: options.labels,
      ...(options.groups ? { groups: options.groups } : {}),
    },
    params,
    options.backend,
  );
  const every = options.progressEvery ?? 100;
  while (!search.done) {
    search.step(every);
    options.onProgress?.(search, performance.now() - t0);
  }
  return { search, elapsedMs: performance.now() - t0 };
}

export interface CandidateSummary {
  readonly ids: number[];
  readonly names: string[];
  readonly gapMm: number;
  readonly gapEstMm: number;
  readonly euclideanGapMm: number | null;
  readonly stringLengthMm: number;
  readonly difficulty: number;
  readonly recognizability: number;
  readonly quality: number;
}

export function summarize(e: Evaluation, cities: readonly City[]): CandidateSummary {
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    ids: e.members.map((i) => cities[i]!.id),
    names: e.tour.map((i) => cities[i]!.name),
    gapMm: round(e.gapUm / 1000),
    gapEstMm: round(e.gapEstUm / 1000),
    euclideanGapMm: e.euclideanGapUm === null ? null : round(e.euclideanGapUm / 1000),
    stringLengthMm: round(e.lengthUm / 1000),
    difficulty: round(e.difficulty.score),
    recognizability: round(e.recognizability),
    quality: round(e.quality),
  };
}

export interface VerificationSummary {
  readonly mode: Verification['mode'];
  readonly status: Verification['status'];
  readonly stringGapMm: number | null;
  readonly euclideanGapMm: number | null;
  readonly heuristicOptimal: boolean;
  readonly optimaDiffer: boolean;
  readonly ms: number;
}

export function verify(
  backend: MipBackend,
  e: Evaluation,
  pool: BoardPool,
  rEffMm: number,
  timeLimitSec: number,
  /** A given edge between two pool cities (indices), as in the search. */
  fixedEdge: readonly [number, number] | null = null,
): VerificationSummary {
  const t0 = performance.now();
  const inst = new Instance(
    e.members.map((i) => pool.points[i]!),
    rEffMm,
    pool.sphere
      ? { lonLat: e.members.map((i) => pool.sphere!.lonLat[i]!), mmPerKm: pool.sphere.mmPerKm }
      : null,
    fixedEdge ? [e.members.indexOf(fixedEdge[0]), e.members.indexOf(fixedEdge[1])] : null,
  );
  const slot = new Map(e.members.map((c, s) => [c, s]));
  const tour = e.tour.map((c) => slot.get(c)!);
  const v = verifyCandidate(backend, inst, tour, 'string-exact', { timeLimitSec });
  const round = (x: number) => Math.round(x) / 1000;
  return {
    mode: v.mode,
    status: v.status,
    stringGapMm: v.string ? round(v.string.gap) : null,
    euclideanGapMm: v.euclidean ? round(v.euclidean.gap) : null,
    heuristicOptimal: v.heuristicOptimal,
    optimaDiffer: v.optimaDiffer,
    ms: Math.round(performance.now() - t0),
  };
}

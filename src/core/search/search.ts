// Search over city subsets (simulated annealing) for puzzles with a large gap in string length
// between the optimal and the second-best tour, high difficulty and well-known cities.
//
// Determinism: the trajectory depends only on the pool, the parameters and the seed (within
// one JS engine). Exact solves used inside the search (level 2) are synchronous and
// deterministic; asynchronous verification elsewhere may only annotate results.
//
// Evaluation of a subset:
//   level 1: warm-started local search + ILS kicks on the string length, then the local gap
//            scan (gapEst, an upper bound on the gap if the tour is optimal);
//   level 2 (only if gapEst ≥ target and a MIP backend is given): exact Euclidean optimum and
//            runner-up; their string lengths can reveal a better tour or a closer non-local
//            alternative, so gap = min(gapEst, S(those tours) − S*), plus the double-bridge scan.
// Labels (if the pool has label metrics): every city name must fit next to its nail
// (board/labels.ts); labels that do not fit count as infeasible, like a gap below the target.

import {
  SEARCH_NODE_LIMIT,
  labelCandidates,
  placeLabels,
  type LabelCandidate,
  type LabelOptions,
} from '../board/labels';
import type { TextMetrics } from '../board/text';
import { difficulty, type Difficulty } from '../difficulty';
import type { Point } from '../geometry';
import { Instance } from '../instance';
import { recognizability, tourMetrics } from '../metrics';
import { Rng, hashSeed } from '../rng';
import { cheapestInsertion } from '../tsp/construct';
import { optimalAndSecond, type MipBackend } from '../tsp/exact';
import { iteratedLocalSearch } from '../tsp/ils';
import { neighborLists } from '../tsp/local-search';
import { alternativeTour, scanSecondBest, type GapScanResult } from '../tsp/second-best';
import { sameTour, stringLength } from '../tsp/tour';
import { ConflictGraph, Selection, sampleWeighted } from './conflicts';

export interface SearchWeights {
  readonly gap: number;
  readonly difficulty: number;
  readonly recognizability: number;
  /** Thesis metric C (share of points inside the convex hull); 0 by default. */
  readonly interior: number;
  /** Thesis metric D (tour edges outside the nearest-neighbour graph); 0 by default. */
  readonly nonNearest: number;
}

export interface SearchParams {
  readonly n: number;
  readonly minDistanceMm: number;
  /** Hard requirement on the gap in string length (feasibility). */
  readonly targetGapMm: number;
  /** Gap at which the gap term of the objective saturates; null: 1.2 × target. */
  readonly gapSaturationMm: number | null;
  readonly rEffMm: number;
  readonly iterations: number;
  readonly seed: number;
  readonly weights: SearchWeights;
  /** Proposal probability ∝ population^beta. */
  readonly beta: number;
  /** ILS kicks per evaluation (after the warm start). */
  readonly kicks: number;
  readonly archiveSize: number;
  readonly startTemperature: number;
  readonly endTemperature: number;
}

export const DEFAULT_SEARCH: SearchParams = {
  n: 40,
  minDistanceMm: 25,
  targetGapMm: 5,
  gapSaturationMm: null,
  rEffMm: 1.5,
  iterations: 2000,
  seed: 1,
  weights: { gap: 1, difficulty: 0.5, recognizability: 0.5, interior: 0, nonNearest: 0 },
  beta: 0.5,
  kicks: 20,
  archiveSize: 30,
  startTemperature: 0.05,
  endTemperature: 0.001,
};

/** The gap target is overshot by this factor in the objective (the bound may overestimate). */
const GAP_HEADROOM = 1.2;
/** Penalty weight for a gap below the target, growing linearly over the run. */
const PENALTY_START = 0.5;
const PENALTY_END = 4;
/** Archive entries with a Jaccard similarity at or above this are the same family. */
const SIMILARITY = 0.8;

export interface SearchPool {
  /** Board coordinates in mm. */
  readonly points: readonly Point[];
  readonly population: readonly number[];
  /** Pool indices that must be selected. */
  readonly pinned: readonly number[];
  /** Pool indices that must not be selected. */
  readonly excluded?: readonly number[];
  /** Board labels that must fit (omit for no label constraint). */
  readonly labels?: PoolLabels;
}

export interface PoolLabels {
  /** Ink metrics of each pool city's label. */
  readonly metrics: readonly TextMetrics[];
  readonly options: LabelOptions;
  /** Board size in mm. */
  readonly width: number;
  readonly height: number;
}

export interface Feasibility {
  /** Cities placed greedily (pinned first, then by population) at the minimum distance. */
  readonly selection: number[];
  /** Pinned cities closer than the minimum distance to each other (pool indices). */
  readonly conflictingPins: [number, number][];
}

/**
 * Greedy start selection; also answers whether n cities fit at the minimum distance (if fewer
 * than n are placed, the region is too small or the distance too large for n cities).
 */
export function greedySelection(
  pool: SearchPool,
  n: number,
  minDistanceMm: number,
  graph: ConflictGraph = new ConflictGraph(pool.points, minDistanceMm),
): Feasibility {
  const excluded = new Set(pool.excluded ?? []);
  const selection = new Selection(graph, pool.points.length);
  const conflictingPins: [number, number][] = [];
  for (const p of pool.pinned) {
    if (selection.selected[p]) continue;
    for (const q of selection.members) if (graph.near[p]!.includes(q)) conflictingPins.push([q, p]);
    if (selection.eligible(p)) selection.add(p);
  }
  const byPopulation = pool.population
    .map((_, i) => i)
    .sort((a, b) => pool.population[b]! - pool.population[a]! || a - b);
  for (const c of byPopulation) {
    if (selection.members.length >= n) break;
    if (!excluded.has(c) && selection.eligible(c)) selection.add(c);
  }
  return { selection: [...selection.members], conflictingPins };
}

export interface Evaluation {
  readonly key: string;
  /** Selected pool indices, ascending. */
  readonly members: readonly number[];
  /** Best known tour as pool indices. */
  readonly tour: readonly number[];
  /** String length S of that tour in µm. */
  readonly lengthUm: number;
  /** Local gap bound in µm. */
  readonly gapEstUm: number;
  /** Gap used by the search in µm: gapEst, refined at level 2; at most the cap. */
  readonly gapUm: number;
  /** The gap reached the cap (saturation of the objective): it is at least gapUm. */
  readonly gapCapped: boolean;
  readonly level: 1 | 2;
  /** Exact Euclidean gap in µm (level 2 only). */
  readonly euclideanGapUm: number | null;
  /** Pool indices touched by the alternative tour that sets the gap. */
  readonly alternativeCities: readonly number[];
  readonly difficulty: Difficulty;
  readonly recognizability: number;
  /** Thesis metrics C and D of the best known tour. */
  readonly interiorFraction: number;
  readonly nonNearestEdges: number;
  /** Labels without a place (0 without a label constraint). */
  readonly unplacedLabels: number;
  /** Gap ≥ target and all labels placed. */
  readonly feasible: boolean;
  /** Objective without the time-dependent penalty (used for the archive and the best). */
  readonly quality: number;
}

export interface TracePoint {
  readonly iteration: number;
  readonly temperature: number;
  readonly score: number;
  readonly gapMm: number;
  readonly bestQuality: number | null;
}

export interface SearchStats {
  evaluations: number;
  cacheHits: number;
  level2: number;
  accepted: number;
  rejectedProposals: number;
}

interface State {
  readonly inst: Instance;
  /** Pool index held by each instance slot. */
  readonly slots: readonly number[];
  readonly selection: Selection;
  readonly evaluation: Evaluation;
}

function jaccard(a: readonly number[], b: readonly number[]): number {
  let i = 0;
  let j = 0;
  let common = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      common++;
      i++;
      j++;
    } else if (a[i]! < b[j]!) i++;
    else j++;
  }
  return common / (a.length + b.length - common);
}

export class Search {
  readonly params: SearchParams;
  readonly stats: SearchStats = {
    evaluations: 0,
    cacheHits: 0,
    level2: 0,
    accepted: 0,
    rejectedProposals: 0,
  };
  private readonly pool: SearchPool;
  private readonly backend: MipBackend | undefined;
  private readonly graph: ConflictGraph;
  private readonly weights: Float64Array;
  private readonly pinned: Set<number>;
  /** Label candidates per pool city (computed on first use), or null without labels. */
  private readonly labelCandidates: (LabelCandidate[] | undefined)[] | null;
  private readonly cache = new Map<string, Evaluation>();
  private readonly moveRng: Rng;
  private readonly acceptRng: Rng;
  private readonly popMin: number;
  private readonly popMax: number;
  private readonly targetUm: number;
  private readonly saturationUm: number;
  /** Gaps are only resolved up to this value (µm); larger gaps are reported as the cap. */
  private readonly capUm: number;
  private state: State;
  private bestEvaluation: Evaluation | null = null;
  private archiveList: Evaluation[] = [];
  private readonly traceList: TracePoint[] = [];
  private iter = 0;

  constructor(pool: SearchPool, params: SearchParams, backend?: MipBackend) {
    this.pool = pool;
    this.params = params;
    this.backend = backend;
    this.targetUm = params.targetGapMm * 1000;
    this.saturationUm = (params.gapSaturationMm ?? GAP_HEADROOM * params.targetGapMm) * 1000;
    this.capUm = Math.max(this.saturationUm, GAP_HEADROOM * this.targetUm);
    this.graph = new ConflictGraph(pool.points, params.minDistanceMm);
    // Excluded cities get weight 0, so they are never proposed.
    const excluded = new Set(pool.excluded ?? []);
    this.weights = Float64Array.from(pool.population, (p, i) =>
      excluded.has(i) ? 0 : Math.pow(Math.max(p, 1), params.beta),
    );
    this.pinned = new Set(pool.pinned);
    this.labelCandidates = pool.labels
      ? new Array<LabelCandidate[] | undefined>(pool.points.length)
      : null;
    this.popMin = Math.min(...pool.population);
    this.popMax = Math.max(...pool.population);
    const rng = new Rng(params.seed);
    this.moveRng = rng.fork('moves');
    this.acceptRng = rng.fork('accept');
    this.state = this.initialState();
    this.record(this.state.evaluation);
  }

  get iteration(): number {
    return this.iter;
  }

  get done(): boolean {
    return this.iter >= this.params.iterations;
  }

  get current(): Evaluation {
    return this.state.evaluation;
  }

  /** Best feasible evaluation by quality (null until one is found). */
  get best(): Evaluation | null {
    return this.bestEvaluation;
  }

  /** Diverse feasible evaluations, best first. */
  get archive(): readonly Evaluation[] {
    return this.archiveList;
  }

  get trace(): readonly TracePoint[] {
    return this.traceList;
  }

  get temperature(): number {
    const { startTemperature: t0, endTemperature: t1, iterations } = this.params;
    return t0 * Math.pow(t1 / t0, Math.min(1, this.iter / iterations));
  }

  private get penalty(): number {
    return (
      PENALTY_START +
      (PENALTY_END - PENALTY_START) * Math.min(1, this.iter / this.params.iterations)
    );
  }

  /** Objective at the current point of the run. */
  score(e: Evaluation): number {
    const shortfall = Math.max(0, 1 - e.gapUm / (GAP_HEADROOM * this.targetUm));
    const labels = Math.min(1, e.unplacedLabels / 2);
    return e.quality - this.penalty * (shortfall + labels);
  }

  step(count: number): void {
    for (let i = 0; i < count && !this.done; i++) this.iterate();
  }

  // --- initial state -------------------------------------------------------------------------

  private initialState(): State {
    const { n } = this.params;
    const { selection: chosen, conflictingPins } = greedySelection(
      this.pool,
      n,
      this.params.minDistanceMm,
      this.graph,
    );
    if (conflictingPins.length > 0) throw new Error('pinned cities violate the minimum distance');
    if (chosen.length < n) {
      throw new Error(
        `only ${chosen.length} cities fit at minimum distance ${this.params.minDistanceMm} mm (need ${n})`,
      );
    }
    const selection = new Selection(this.graph, this.pool.points.length);
    for (const c of chosen) selection.add(c);
    const slots = [...selection.members];
    const inst = new Instance(
      slots.map((c) => this.pool.points[c]!),
      this.params.rEffMm,
    );
    let evaluation = this.evaluate(inst, slots, null);
    if (this.needsRefinement(evaluation)) evaluation = this.refine(inst, slots, evaluation);
    return { inst, slots, selection, evaluation };
  }

  // --- proposals -----------------------------------------------------------------------------

  private removable(): number[] {
    return this.state.selection.members.filter((c) => !this.pinned.has(c));
  }

  /** Replace `out` by a population-weighted eligible city. */
  private swapOut(out: number): { removed: number[]; added: number[] } | null {
    const sel = this.state.selection;
    sel.remove(out);
    const inc = sampleWeighted(this.weights, (i) => i !== out && sel.eligible(i), this.moveRng);
    sel.add(out);
    return inc < 0 ? null : { removed: [out], added: [inc] };
  }

  /** Insert a city, eject all selected cities it conflicts with, refill. */
  private ejection(): { removed: number[]; added: number[] } | null {
    const sel = this.state.selection;
    const inc = sampleWeighted(this.weights, (i) => !sel.selected[i], this.moveRng);
    if (inc < 0) return null;
    const conflicting = sel.members.filter((m) => this.graph.near[inc]!.includes(m));
    if (conflicting.some((m) => this.pinned.has(m))) return null;
    if (conflicting.length === 0) {
      const options = this.removable();
      if (options.length === 0) return null;
      return { removed: [this.moveRng.pick(options)], added: [inc] };
    }
    for (const m of conflicting) sel.remove(m);
    sel.add(inc);
    const added = [inc];
    for (let k = 1; k < conflicting.length; k++) {
      const fill = sampleWeighted(
        this.weights,
        (i) => sel.eligible(i) && !conflicting.includes(i),
        this.moveRng,
      );
      if (fill < 0) break;
      sel.add(fill);
      added.push(fill);
    }
    for (const a of added) sel.remove(a);
    for (const m of conflicting) sel.add(m);
    if (added.length < conflicting.length) return null;
    return { removed: conflicting, added };
  }

  private propose(): { removed: number[]; added: number[] } | null {
    const r = this.moveRng.float();
    const current = this.state.evaluation;
    if (r < 0.3 && current.gapUm < this.saturationUm) {
      const options = current.alternativeCities.filter((c) => !this.pinned.has(c));
      if (options.length > 0) return this.swapOut(this.moveRng.pick(options));
    }
    if (r < 0.65) {
      const options = this.removable();
      return options.length > 0 ? this.swapOut(this.moveRng.pick(options)) : null;
    }
    return this.ejection();
  }

  // --- evaluation ----------------------------------------------------------------------------

  private keyOf(members: readonly number[]): string {
    return [...members].sort((a, b) => a - b).join(',');
  }

  /**
   * Level 1 evaluation of the selection held by `inst`/`slots`. `warm` is a tour over slots of
   * a related selection plus the slots whose city changed.
   */
  private evaluate(
    inst: Instance,
    slots: readonly number[],
    warm: { tour: number[]; changed: number[] } | null,
  ): Evaluation {
    this.stats.evaluations++;
    const key = this.keyOf(slots);
    const rng = new Rng(hashSeed(this.params.seed, key));
    let start: number[] | undefined;
    if (warm) {
      start = warm.tour.filter((s) => !warm.changed.includes(s));
      for (const s of warm.changed) start = cheapestInsertion(inst, start, s);
    }
    const kicks = warm ? this.params.kicks : 4 * this.params.kicks;
    const ils = iteratedLocalSearch(
      inst,
      rng,
      { kicks, neighbors: 10 },
      start,
      neighborLists(inst, 10),
    );
    const scan = scanSecondBest(inst, ils.tour, { doubleBridge: false, cap: this.capUm });
    const alternative = scan.best ? alternativeTour(scan.tour, scan.best) : null;
    return this.finish(inst, slots, scan, scan.gap, scan.gap, alternative, 1, null);
  }

  /** Level 2 is due for a level 1 evaluation whose local gap bound reaches the target. */
  private needsRefinement(e: Evaluation): boolean {
    return (
      this.backend !== undefined &&
      e.level === 1 &&
      e.gapEstUm >= this.targetUm &&
      e.unplacedLabels === 0
    );
  }

  /** Number of labels that do not fit for the given cities (0 without labels). */
  private unplacedLabels(members: readonly number[]): number {
    const labels = this.pool.labels;
    const cache = this.labelCandidates;
    if (!labels || !cache) return 0;
    const candidates = members.map(
      (c) =>
        (cache[c] ??= labelCandidates(this.pool.points[c]!, labels.metrics[c]!, labels.options)),
    );
    return placeLabels({
      points: members.map((c) => this.pool.points[c]!),
      candidates,
      width: labels.width,
      height: labels.height,
      options: labels.options,
      nodeLimit: SEARCH_NODE_LIMIT,
    }).unplaced;
  }

  /**
   * Whether a candidate could enter the archive (by its level 1 quality, an upper bound on the
   * refined one). Only such candidates get the costly level 2; the walk itself may use level 1
   * values, but the archive and the best only hold refined candidates.
   */
  private couldArchive(e: Evaluation): boolean {
    const list = this.archiveList;
    if (list.length < this.params.archiveSize) return true;
    return e.quality > list[list.length - 1]!.quality;
  }

  /**
   * Level 2: the exact Euclidean optimum and runner-up are further candidates for the string
   * optimum and for the closest alternative; the scan is repeated with double bridges.
   */
  private refine(inst: Instance, slots: readonly number[], e: Evaluation): Evaluation {
    this.stats.level2++;
    const slotTour = e.tour.map((c) => slots.indexOf(c));
    const eInst = inst.euclidean();
    const eScan = scanSecondBest(eInst, slotTour, { doubleBridge: true, cap: this.capUm });
    const exact = optimalAndSecond(this.backend!, eInst, 'euclidean', {
      optimal: eScan.tour,
      second: eScan.best ? alternativeTour(eScan.tour, eScan.best) : undefined,
    });
    const known = [exact.optimal.tour, exact.second?.tour].filter((t): t is number[] => !!t);
    const euclideanGap =
      exact.optimal.tour && exact.second?.tour ? exact.second.cost - exact.optimal.cost : null;
    let best = slotTour;
    for (const t of known) if (stringLength(inst, t) < stringLength(inst, best)) best = t;
    const scan = scanSecondBest(inst, best, { doubleBridge: true, cap: this.capUm });
    let gap = scan.gap;
    let alternative = scan.best ? alternativeTour(scan.tour, scan.best) : null;
    for (const t of [slotTour, ...known]) {
      if (sameTour(t, scan.tour, inst.n)) continue;
      const g = stringLength(inst, t) - scan.length;
      if (g < gap) {
        gap = g;
        alternative = t;
      }
    }
    return this.finish(inst, slots, scan, e.gapEstUm, gap, alternative, 2, euclideanGap, e);
  }

  private finish(
    inst: Instance,
    slots: readonly number[],
    scan: GapScanResult,
    gapEst: number,
    gap: number,
    alternative: number[] | null,
    level: 1 | 2,
    euclideanGap: number | null,
    previous?: Evaluation,
  ): Evaluation {
    const key = this.keyOf(slots);
    const members = [...slots].sort((a, b) => a - b);
    const unplacedLabels = previous ? previous.unplacedLabels : this.unplacedLabels(members);
    const d = difficulty(inst, scan.length);
    const r = recognizability(
      members.map((c) => this.pool.population[c]!),
      this.popMin,
      this.popMax,
    );
    const { weights } = this.params;
    const gapTerm = Math.min(1, gap / this.saturationUm);
    const m = tourMetrics(inst, scan.tour);
    const evaluation: Evaluation = {
      key,
      members,
      tour: scan.tour.map((s) => slots[s]!),
      lengthUm: scan.length,
      gapEstUm: gapEst,
      gapUm: gap,
      gapCapped: gap >= this.capUm,
      level,
      euclideanGapUm: euclideanGap,
      alternativeCities: alternative ? this.changedCities(scan.tour, alternative, slots) : [],
      difficulty: d,
      recognizability: r,
      interiorFraction: m.interiorFraction,
      nonNearestEdges: m.nonNearestEdges,
      unplacedLabels,
      feasible:
        gap >= this.targetUm && unplacedLabels === 0 && (this.backend === undefined || level === 2),
      quality:
        weights.gap * gapTerm +
        weights.difficulty * d.score +
        weights.recognizability * r +
        weights.interior * m.interiorFraction +
        weights.nonNearest * m.nonNearestEdges,
    };
    this.cache.set(key, evaluation);
    return evaluation;
  }

  /** Pool indices at the endpoints of edges in which the two tours differ. */
  private changedCities(
    tour: readonly number[],
    other: readonly number[],
    slots: readonly number[],
  ): number[] {
    const n = tour.length;
    const edges = new Set<number>();
    for (let i = 0; i < n; i++) {
      const a = tour[i]!;
      const b = tour[(i + 1) % n]!;
      edges.add(a < b ? a * n + b : b * n + a);
    }
    const cities = new Set<number>();
    for (let i = 0; i < n; i++) {
      const a = other[i]!;
      const b = other[(i + 1) % n]!;
      if (!edges.has(a < b ? a * n + b : b * n + a)) {
        cities.add(slots[a]!);
        cities.add(slots[b]!);
      }
    }
    return [...cities].sort((x, y) => x - y);
  }

  // --- main loop -----------------------------------------------------------------------------

  private iterate(): void {
    this.iter++;
    const proposal = this.propose();
    if (!proposal) {
      this.stats.rejectedProposals++;
      this.sampleTrace();
      return;
    }
    const cur = this.state;
    const slots = [...cur.slots];
    const changed: number[] = [];
    proposal.removed.forEach((city, i) => {
      const slot = slots.indexOf(city);
      slots[slot] = proposal.added[i]!;
      changed.push(slot);
    });
    // One uniform draw per iteration: accept iff score(candidate) ≥ threshold. Level 2 can only
    // lower the gap, so a candidate rejected at level 1 needs no exact solve.
    const threshold =
      this.score(cur.evaluation) + this.temperature * Math.log(this.acceptRng.float());
    let inst: Instance | null = null;
    const instance = () => {
      if (!inst) {
        inst = cur.inst.clone();
        for (const s of changed) inst.movePoint(s, ...this.pool.points[slots[s]!]!);
      }
      return inst;
    };
    let candidate = this.cache.get(this.keyOf(slots));
    if (candidate) {
      this.stats.cacheHits++;
    } else {
      const slotTour = cur.evaluation.tour.map((c) => cur.slots.indexOf(c));
      candidate = this.evaluate(instance(), slots, { tour: slotTour, changed });
    }
    if (
      this.score(candidate) >= threshold &&
      this.needsRefinement(candidate) &&
      this.couldArchive(candidate)
    ) {
      candidate = this.refine(instance(), slots, candidate);
    }
    if (this.score(candidate) >= threshold) {
      this.stats.accepted++;
      const selection = cur.selection.clone();
      for (const c of proposal.removed) selection.remove(c);
      for (const c of proposal.added) selection.add(c);
      this.state = { inst: instance(), slots, selection, evaluation: candidate };
      this.record(candidate);
    }
    this.sampleTrace();
  }

  private record(e: Evaluation): void {
    if (!e.feasible) return;
    if (!this.bestEvaluation || e.quality > this.bestEvaluation.quality) this.bestEvaluation = e;
    if (this.archiveList.some((a) => a.key === e.key)) return;
    const similar = this.archiveList.findIndex((a) => jaccard(a.members, e.members) >= SIMILARITY);
    if (similar >= 0) {
      if (this.archiveList[similar]!.quality >= e.quality) return;
      this.archiveList.splice(similar, 1);
    }
    this.archiveList.push(e);
    this.archiveList.sort((a, b) => b.quality - a.quality || (a.key < b.key ? -1 : 1));
    if (this.archiveList.length > this.params.archiveSize)
      this.archiveList.length = this.params.archiveSize;
  }

  private sampleTrace(): void {
    const every = Math.max(1, Math.floor(this.params.iterations / 500));
    if (this.iter % every !== 0 && !this.done) return;
    this.traceList.push({
      iteration: this.iter,
      temperature: this.temperature,
      score: this.score(this.state.evaluation),
      gapMm: this.state.evaluation.gapUm / 1000,
      bestQuality: this.bestEvaluation?.quality ?? null,
    });
  }
}

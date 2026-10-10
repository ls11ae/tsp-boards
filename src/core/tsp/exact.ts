// Exact TSP via MIP (HiGHS Model API) with iterative subtour elimination.
//
// Two models on the same integer µm costs:
//   - 'euclidean': DFJ with binary edge variables x_e, degree 2, SECs added on demand;
//     minimises L.
//   - 'string': additionally one continuous variable y_{j,{i,k}} per middle node j and pair of
//     neighbours {i,k}, with Σ_{i<k} y_{j,ik} = 1 and Σ_k y_{j,ik} = x_{ij}; minimises
//     S = L + Σ turn costs. For integral x the y are forced to be integral, so only x branch.
// The second-best tour is found by adding the no-good cut Σ_{e∈OPT} x_e ≤ n − 2 (two different
// tours share at most n − 2 edges) and keeping all SECs collected so far.

import type { Instance } from '../instance';
import { euclideanLength, stringLength, tourFromEdges, type Tour } from './tour';

/** Structural subset of the highs Model API used here (see npm package `highs`). */
export interface MipModel {
  passModel(model: {
    readonly numCols: number;
    readonly numRows: number;
    readonly colCost: Float64Array;
    readonly colLower: Float64Array;
    readonly colUpper: Float64Array;
    readonly rowLower: Float64Array;
    readonly rowUpper: Float64Array;
    readonly matrix: {
      readonly format: 'csr';
      readonly numRows: number;
      readonly numCols: number;
      readonly starts: Int32Array;
      readonly indices: Int32Array;
      readonly values: Float64Array;
    };
    readonly integrality: Int32Array;
  }): unknown;
  addRow(
    lower: number,
    upper: number,
    entries: { readonly indices: Int32Array; readonly values: Float64Array },
  ): unknown;
  readonly options: { set(values: Readonly<Record<string, boolean | number | string>>): unknown };
  run(): { readonly modelStatus: number };
  getSolution(): { readonly colValue: Float64Array };
  setSolution(solution: { readonly colValue: Float64Array }): unknown;
  getObjectiveValue(): number;
}

/** Creates a model, runs `operation` on it, and frees it (e.g. highs' `withModel`). */
export interface MipBackend {
  withModel<R>(operation: (model: MipModel) => R): R;
}

const STATUS_OPTIMAL = 7;
const STATUS_INFEASIBLE = 8;
const STATUS_TIME_LIMIT = 13;

export type ExactModelKind = 'euclidean' | 'string';
export type ExactStatus = 'optimal' | 'infeasible' | 'time-limit';

export interface ExactTour {
  readonly status: ExactStatus;
  /** The optimal tour; null unless status is 'optimal'. */
  readonly tour: number[] | null;
  /** Cost in µm under the model (L or S), recomputed from the tour. */
  readonly cost: number;
  /** MIP runs (subtour elimination rounds) used. */
  readonly runs: number;
}

export interface ExactOptions {
  /** Time limit per MIP run in seconds. */
  readonly timeLimitSec: number;
}

export const DEFAULT_EXACT: ExactOptions = { timeLimitSec: 60 };

function edgeIndex(i: number, j: number, n: number): number {
  if (i > j) [i, j] = [j, i];
  return (i * (2 * n - i - 1)) / 2 + (j - i - 1);
}

function components(n: number, edges: readonly (readonly [number, number])[]): number[][] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u]!.push(v);
    adj[v]!.push(u);
  }
  const seen = new Uint8Array(n);
  const result: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const v = stack.pop()!;
      comp.push(v);
      for (const w of adj[v]!) {
        if (!seen[w]) {
          seen[w] = 1;
          stack.push(w);
        }
      }
    }
    result.push(comp);
  }
  return result;
}

/** A persistent MIP for one instance; cuts accumulate across solves. */
export class ExactTsp {
  readonly kind: ExactModelKind;
  private readonly inst: Instance;
  private readonly model: MipModel;
  private readonly options: ExactOptions;
  private readonly m: number;
  private readonly numCols: number;
  /** Pairs per middle node in the string model: C(n-1, 2). */
  private readonly pairs: number;
  cuts = 0;

  constructor(model: MipModel, inst: Instance, kind: ExactModelKind, options = DEFAULT_EXACT) {
    this.model = model;
    this.inst = inst;
    this.kind = kind;
    this.options = options;
    const n = inst.n;
    if (n < 4) throw new Error('exact TSP needs n ≥ 4');
    this.m = (n * (n - 1)) / 2;
    this.pairs = ((n - 1) * (n - 2)) / 2;
    this.numCols = kind === 'euclidean' ? this.m : this.m + n * this.pairs;
    this.build();
  }

  /** Column of y_{j,{i,k}} in the string model. */
  private yIndex(j: number, i: number, k: number): number {
    const n = this.inst.n;
    let p = i < j ? i : i - 1;
    let q = k < j ? k : k - 1;
    if (p > q) [p, q] = [q, p];
    return this.m + j * this.pairs + edgeIndex(p, q, n - 1);
  }

  private build(): void {
    const { inst, numCols, kind } = this;
    const n = inst.n;
    const colCost = new Float64Array(numCols);
    const colLower = new Float64Array(numCols);
    const colUpper = new Float64Array(numCols).fill(1);
    const integrality = new Int32Array(numCols);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const e = edgeIndex(i, j, n);
        colCost[e] = inst.dist(i, j);
        integrality[e] = 1;
      }
    }
    const starts = [0];
    const indices: number[] = [];
    const values: number[] = [];
    const rowLower: number[] = [];
    const rowUpper: number[] = [];
    const endRow = (rhs: number) => {
      starts.push(indices.length);
      rowLower.push(rhs);
      rowUpper.push(rhs);
    };
    // Degree rows.
    for (let v = 0; v < n; v++) {
      for (let w = 0; w < n; w++) {
        if (w === v) continue;
        indices.push(edgeIndex(v, w, n));
        values.push(1);
      }
      endRow(2);
    }
    if (kind === 'string') {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          if (i === j) continue;
          for (let k = i + 1; k < n; k++) {
            if (k !== j) colCost[this.yIndex(j, i, k)] = inst.turn(i, j, k);
          }
        }
      }
      // One neighbour pair per node.
      for (let j = 0; j < n; j++) {
        const first = this.m + j * this.pairs;
        for (let p = 0; p < this.pairs; p++) {
          indices.push(first + p);
          values.push(1);
        }
        endRow(1);
      }
      // Linking: Σ_k y_{j,{i,k}} = x_{ij}.
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          if (i === j) continue;
          for (let k = 0; k < n; k++) {
            if (k === i || k === j) continue;
            indices.push(this.yIndex(j, i, k));
            values.push(1);
          }
          indices.push(edgeIndex(i, j, n));
          values.push(-1);
          endRow(0);
        }
      }
    }
    this.model.passModel({
      numCols,
      numRows: rowLower.length,
      colCost,
      colLower,
      colUpper,
      rowLower: Float64Array.from(rowLower),
      rowUpper: Float64Array.from(rowUpper),
      matrix: {
        format: 'csr',
        numRows: rowLower.length,
        numCols,
        starts: Int32Array.from(starts),
        indices: Int32Array.from(indices),
        values: Float64Array.from(values),
      },
      integrality,
    });
    this.model.options.set({
      output_flag: false,
      mip_rel_gap: 0,
      mip_abs_gap: 0.5,
    });
  }

  private columnsOf(tour: Tour): Float64Array {
    const n = this.inst.n;
    const values = new Float64Array(this.numCols);
    for (let i = 0; i < n; i++) {
      const prev = tour[(i + n - 1) % n]!;
      const v = tour[i]!;
      const next = tour[(i + 1) % n]!;
      values[edgeIndex(v, next, n)] = 1;
      if (this.kind === 'string') values[this.yIndex(v, prev, next)] = 1;
    }
    return values;
  }

  private addSec(component: readonly number[]): void {
    const n = this.inst.n;
    const idx: number[] = [];
    for (let a = 0; a < component.length; a++) {
      for (let b = a + 1; b < component.length; b++)
        idx.push(edgeIndex(component[a]!, component[b]!, n));
    }
    this.model.addRow(-Infinity, component.length - 1, {
      indices: Int32Array.from(idx),
      values: new Float64Array(idx.length).fill(1),
    });
    this.cuts++;
  }

  /** Forbids `tour` (and only it) in later solves. */
  exclude(tour: Tour): void {
    const n = this.inst.n;
    const idx = tour.map((v, i) => edgeIndex(v, tour[(i + 1) % n]!, n));
    this.model.addRow(-Infinity, n - 2, {
      indices: Int32Array.from(idx),
      values: new Float64Array(n).fill(1),
    });
  }

  /** Optimal tour subject to all exclusions; `start` must be feasible (a MIP start). */
  solve(start?: Tour): ExactTour {
    const n = this.inst.n;
    let runs = 0;
    for (;;) {
      if (start) this.model.setSolution({ colValue: this.columnsOf(start) });
      this.model.options.set({ time_limit: this.options.timeLimitSec });
      const status = this.model.run().modelStatus;
      runs++;
      if (status === STATUS_INFEASIBLE)
        return { status: 'infeasible', tour: null, cost: Infinity, runs };
      if (status === STATUS_TIME_LIMIT)
        return { status: 'time-limit', tour: null, cost: Infinity, runs };
      if (status !== STATUS_OPTIMAL) throw new Error(`HiGHS model status ${status}`);
      const x = this.model.getSolution().colValue;
      const edges: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) if (x[edgeIndex(i, j, n)]! > 0.5) edges.push([i, j]);
      }
      const comps = components(n, edges);
      if (comps.length === 1) {
        const tour = tourFromEdges(n, edges);
        if (!tour) throw new Error('MIP solution is not a tour');
        const cost =
          this.kind === 'string' ? stringLength(this.inst, tour) : euclideanLength(this.inst, tour);
        const objective = this.model.getObjectiveValue();
        if (Math.abs(objective - cost) > 1) {
          throw new Error(`MIP objective ${objective} differs from recomputed cost ${cost}`);
        }
        return { status: 'optimal', tour, cost, runs };
      }
      // Subtours: one SEC per component except the largest (equivalent by the degree rows).
      comps.sort((a, b) => a.length - b.length);
      for (const comp of comps.slice(0, -1)) this.addSec(comp);
    }
  }
}

export interface OptimalAndSecond {
  readonly optimal: ExactTour;
  /** Best tour different from the optimal one (null if the optimum was not found). */
  readonly second: ExactTour | null;
}

/** Optimal and second-best tour under one model. Starts must be feasible tours. */
export function optimalAndSecond(
  backend: MipBackend,
  inst: Instance,
  kind: ExactModelKind,
  starts: { readonly optimal?: Tour; readonly second?: Tour } = {},
  options: ExactOptions = DEFAULT_EXACT,
): OptimalAndSecond {
  return backend.withModel((model) => {
    const tsp = new ExactTsp(model, inst, kind, options);
    const optimal = tsp.solve(starts.optimal);
    if (optimal.status !== 'optimal') return { optimal, second: null };
    tsp.exclude(optimal.tour!);
    const second = tsp.solve(starts.second);
    return { optimal, second };
  });
}

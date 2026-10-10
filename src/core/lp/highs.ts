// Minimal structural view of the HiGHS one-shot API (npm package `highs`).
// The core never loads the WebAssembly module itself: workers and the CLI load it and pass it in.

export type LpOptions = Readonly<Record<string, boolean | number | string>>;

export interface LpColumnResult {
  readonly Index: number;
  /** Missing when the model is infeasible. */
  readonly Primal?: number;
}

export interface LpSolveResult {
  /** HiGHS model status, e.g. 'Optimal', 'Infeasible', 'Time limit reached'. */
  readonly Status: string;
  readonly ObjectiveValue: number;
  readonly Columns: Readonly<Record<string, LpColumnResult>>;
}

export interface HighsLike {
  /** Solves a model given in CPLEX LP format. Blocks the calling thread. */
  solve(problem: string, options?: LpOptions): LpSolveResult;
}

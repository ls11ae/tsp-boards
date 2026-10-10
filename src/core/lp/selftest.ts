import type { HighsLike } from './highs';

// Tiny binary knapsack with known optimum 23 (items a and b). Used to check that a solver
// instance loads and solves MIPs, in the browser worker and in Node.
const SELFTEST_LP = `Maximize
 obj: 10 a + 13 b + 7 c + 8 d
Subject To
 cap: 3 a + 4 b + 2 c + 3 d <= 7
Binary
 a b c d
End
`;
const SELFTEST_OPTIMUM = 23;

export interface LpSelfTestResult {
  readonly ok: boolean;
  readonly status: string;
  readonly objective: number;
}

export function runLpSelfTest(highs: HighsLike): LpSelfTestResult {
  const solution = highs.solve(SELFTEST_LP, { output_flag: false, mip_rel_gap: 0 });
  const objective = solution.ObjectiveValue;
  return {
    ok: solution.Status === 'Optimal' && Math.abs(objective - SELFTEST_OPTIMUM) < 1e-9,
    status: solution.Status,
    objective,
  };
}

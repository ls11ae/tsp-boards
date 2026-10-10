// Exhaustive enumeration of all (n-1)!/2 tours, for tests (n ≤ 10).

import type { Instance } from '../instance';
import { stringLength } from './tour';

export interface RankedTour {
  readonly tour: number[];
  readonly length: number;
}

/** All tours sorted by string length (ties by canonical order), each cycle once. */
export function allTours(inst: Instance): RankedTour[] {
  const n = inst.n;
  if (n > 10) throw new Error('brute force is limited to n ≤ 10');
  const result: RankedTour[] = [];
  const tour = [0];
  const used = new Uint8Array(n);
  used[0] = 1;
  const extend = () => {
    if (tour.length === n) {
      if (n < 3 || tour[1]! < tour[n - 1]!)
        result.push({ tour: [...tour], length: stringLength(inst, tour) });
      return;
    }
    for (let v = 1; v < n; v++) {
      if (used[v]) continue;
      used[v] = 1;
      tour.push(v);
      extend();
      tour.pop();
      used[v] = 0;
    }
  };
  extend();
  result.sort((a, b) => a.length - b.length);
  return result;
}

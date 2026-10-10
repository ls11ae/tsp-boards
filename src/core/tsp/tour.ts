// Tours are arrays of node indices (a cyclic order). Costs are exact integers in µm.

import type { Instance } from '../instance';

export type Tour = readonly number[];

export function isTour(tour: Tour, n: number): boolean {
  if (tour.length !== n) return false;
  const seen = new Uint8Array(n);
  for (const v of tour) {
    if (!Number.isInteger(v) || v < 0 || v >= n || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}

/** Euclidean length L in µm. */
export function euclideanLength(inst: Instance, tour: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < tour.length; i++) sum += inst.dist(tour[i]!, tour[(i + 1) % tour.length]!);
  return sum;
}

/** Sum of turn costs r_eff · Σ|θ| in µm. */
export function turnCost(inst: Instance, tour: ArrayLike<number>): number {
  const n = tour.length;
  let sum = 0;
  for (let i = 0; i < n; i++)
    sum += inst.turn(tour[(i + n - 1) % n]!, tour[i]!, tour[(i + 1) % n]!);
  return sum;
}

/** String length S = L + r_eff · Σ|θ| in µm (equals L when r_eff = 0). */
export function stringLength(inst: Instance, tour: ArrayLike<number>): number {
  return euclideanLength(inst, tour) + turnCost(inst, tour);
}

/** Key of the undirected edge {i, j} for n nodes. */
export function edgeKey(i: number, j: number, n: number): number {
  return i < j ? i * n + j : j * n + i;
}

export function edgeKeys(tour: Tour, n: number): Set<number> {
  const keys = new Set<number>();
  for (let i = 0; i < tour.length; i++)
    keys.add(edgeKey(tour[i]!, tour[(i + 1) % tour.length]!, n));
  return keys;
}

/** Same cycle (same edge set), regardless of start and direction. */
export function sameTour(a: Tour, b: Tour, n: number): boolean {
  if (a.length !== b.length) return false;
  const keys = edgeKeys(a, n);
  for (let i = 0; i < b.length; i++)
    if (!keys.has(edgeKey(b[i]!, b[(i + 1) % b.length]!, n))) return false;
  return true;
}

/** Canonical form: starts at node 0, second node smaller than the last. */
export function canonicalTour(tour: Tour): number[] {
  const n = tour.length;
  const start = tour.indexOf(0);
  const forward = Array.from({ length: n }, (_, i) => tour[(start + i) % n]!);
  if (n > 2 && forward[1]! > forward[n - 1]!) return [0, ...forward.slice(1).reverse()];
  return forward;
}

/** Number of edges of `b` that are not in `a`. */
export function edgeDifference(a: Tour, b: Tour, n: number): number {
  const keys = edgeKeys(a, n);
  let diff = 0;
  for (let i = 0; i < b.length; i++)
    if (!keys.has(edgeKey(b[i]!, b[(i + 1) % b.length]!, n))) diff++;
  return diff;
}

/** Builds a tour from an undirected edge list that forms one Hamiltonian cycle. */
export function tourFromEdges(
  n: number,
  edges: readonly (readonly [number, number])[],
): number[] | null {
  const adj = new Int32Array(2 * n).fill(-1);
  for (const [u, v] of edges) {
    for (const [a, b] of [
      [u, v],
      [v, u],
    ] as const) {
      if (adj[2 * a] === -1) adj[2 * a] = b;
      else if (adj[2 * a + 1] === -1) adj[2 * a + 1] = b;
      else return null;
    }
  }
  const tour = [0];
  let prev = -1;
  let cur = 0;
  for (let step = 1; step < n; step++) {
    const next = adj[2 * cur] !== prev ? adj[2 * cur]! : adj[2 * cur + 1]!;
    if (next < 0 || next === 0) return null;
    tour.push(next);
    prev = cur;
    cur = next;
  }
  return isTour(tour, n) && (adj[2 * cur] === 0 || adj[2 * cur + 1] === 0) ? tour : null;
}

// Construction heuristics. The "simple strategies" (nearest neighbour, greedy edge, hull
// insertion) decide by Euclidean distance, as a person would; they serve as difficulty probes
// and as start tours. Insertion into an existing tour (warm start) uses the string cost.

import { convexHull, type Point } from '../geometry';
import type { Instance } from '../instance';
import type { Rng } from '../rng';
import type { Tour } from './tour';

function points(inst: Instance): Point[] {
  return Array.from({ length: inst.n }, (_, i) => [inst.x[i]!, inst.y[i]!] as const);
}

/** Nearest neighbour from `start` (ties: smaller index). */
export function nearestNeighbor(inst: Instance, start: number): number[] {
  const n = inst.n;
  const used = new Uint8Array(n);
  const tour = [start];
  used[start] = 1;
  let cur = start;
  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d = inst.dist(cur, j);
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    tour.push(best);
    used[best] = 1;
    cur = best;
  }
  return tour;
}

/** Greedy edge matching: shortest edges first, keeping degrees ≤ 2 and no premature cycle. */
export function greedyEdge(inst: Instance): number[] {
  const n = inst.n;
  if (n < 3) return Array.from({ length: n }, (_, i) => i);
  const edges: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push(i * n + j);
  edges.sort((a, b) => inst.d[a]! - inst.d[b]! || a - b);
  const degree = new Uint8Array(n);
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => {
    while (parent[v] !== v) {
      parent[v] = parent[parent[v]!]!;
      v = parent[v]!;
    }
    return v;
  };
  const adj: number[][] = Array.from({ length: n }, () => []);
  let count = 0;
  for (const e of edges) {
    const i = Math.floor(e / n);
    const j = e % n;
    if (degree[i]! >= 2 || degree[j]! >= 2) continue;
    const ri = find(i);
    const rj = find(j);
    if (ri === rj) continue;
    parent[ri] = rj;
    degree[i]!++;
    degree[j]!++;
    adj[i]!.push(j);
    adj[j]!.push(i);
    if (++count === n - 1) break;
  }
  // The edges form a Hamiltonian path; walk it from one end.
  let start = 0;
  while (degree[start] !== 1) start++;
  const tour = [start];
  let prev = -1;
  let cur = start;
  while (tour.length < n) {
    const next = adj[cur]![0] !== prev ? adj[cur]![0]! : adj[cur]![1]!;
    tour.push(next);
    prev = cur;
    cur = next;
  }
  return tour;
}

/**
 * Start of the insertion heuristic: the convex hull; on the sphere, which has no convex hull,
 * the two places farthest apart.
 */
export function insertionStart(inst: Instance): number[] {
  if (!inst.sphere) return convexHull(points(inst));
  let best: number[] = [0, 1];
  let far = -1;
  for (let i = 0; i < inst.n; i++) {
    for (let j = i + 1; j < inst.n; j++) {
      if (inst.dist(i, j) > far) {
        far = inst.dist(i, j);
        best = [i, j];
      }
    }
  }
  return best;
}

/** Convex hull (sphere: farthest pair) first, then repeatedly the cheapest insertion. */
export function hullInsertion(inst: Instance): number[] {
  const n = inst.n;
  const tour = insertionStart(inst);
  if (tour.length === n) return tour;
  const inTour = new Uint8Array(n);
  for (const v of tour) inTour[v] = 1;
  while (tour.length < n) {
    let bestCost = Infinity;
    let bestNode = -1;
    let bestPos = -1;
    for (let v = 0; v < n; v++) {
      if (inTour[v]) continue;
      for (let p = 0; p < tour.length; p++) {
        const a = tour[p]!;
        const b = tour[(p + 1) % tour.length]!;
        const cost = inst.dist(a, v) + inst.dist(v, b) - inst.dist(a, b);
        if (cost < bestCost) {
          bestCost = cost;
          bestNode = v;
          bestPos = p + 1;
        }
      }
    }
    tour.splice(bestPos, 0, bestNode);
    inTour[bestNode] = 1;
  }
  return tour;
}

/** Inserts `node` (not in `tour`) where the string length grows least. */
export function cheapestInsertion(inst: Instance, tour: Tour, node: number): number[] {
  const m = tour.length;
  if (m < 2) return [...tour, node];
  let bestCost = Infinity;
  let bestPos = 0;
  for (let p = 0; p < m; p++) {
    const z = tour[(p + m - 1) % m]!;
    const a = tour[p]!;
    const b = tour[(p + 1) % m]!;
    const c = tour[(p + 2) % m]!;
    const cost =
      inst.dist(a, node) +
      inst.dist(node, b) -
      inst.dist(a, b) +
      inst.turn(a, node, b) +
      inst.turn(z, a, node) -
      inst.turn(z, a, b) +
      inst.turn(node, b, c) -
      inst.turn(a, b, c);
    if (cost < bestCost) {
      bestCost = cost;
      bestPos = p + 1;
    }
  }
  const result = [...tour];
  result.splice(bestPos, 0, node);
  return result;
}

export function randomTour(n: number, rng: Rng): number[] {
  return rng.shuffle(Array.from({ length: n }, (_, i) => i));
}

// Teaching mode (Phase 6): the simple strategies step by step, as frames to animate on the
// board. Strategies decide by Euclidean distance between nail centres, as a person would;
// lengths in the notes are Euclidean too. The exact solver's subtour elimination rounds come
// from `subtourRounds` (they need the MIP backend, so the app runs them in a worker).

import { insertionStart } from './tsp/construct';
import type { Instance } from './instance';
import { ExactTsp, type MipBackend } from './tsp/exact';
import type { Tour } from './tsp/tour';

export type TeachingKind =
  'nearest-neighbor' | 'insertion' | 'greedy-edge' | 'two-opt' | 'subtours';
export const TEACHING_KINDS: readonly TeachingKind[] = [
  'nearest-neighbor',
  'insertion',
  'greedy-edge',
  'two-opt',
  'subtours',
];

export type Edge = readonly [number, number];

/** What a frame shows, for the caption (slots refer to the puzzle's places). */
export type TeachingNote =
  | { readonly kind: 'nn-start'; readonly a: number }
  | { readonly kind: 'nn-step'; readonly a: number; readonly b: number }
  | { readonly kind: 'nn-close'; readonly a: number; readonly b: number }
  | { readonly kind: 'hull'; readonly count: number }
  | { readonly kind: 'pair'; readonly a: number; readonly b: number }
  | { readonly kind: 'insert'; readonly a: number; readonly v: number; readonly b: number }
  | { readonly kind: 'greedy'; readonly a: number; readonly b: number }
  | { readonly kind: 'greedy-close'; readonly a: number; readonly b: number }
  | { readonly kind: 'two-opt-start' }
  | { readonly kind: 'two-opt-remove'; readonly gainUm: number }
  | { readonly kind: 'two-opt-add'; readonly gainUm: number }
  | { readonly kind: 'two-opt-done' }
  | { readonly kind: 'round'; readonly round: number; readonly subtours: number }
  | { readonly kind: 'optimal'; readonly rounds: number };

export interface TeachingFrame {
  /** Edges drawn (slot pairs). */
  readonly edges: readonly Edge[];
  /** Edges emphasised (just added, or about to be exchanged). */
  readonly highlight: readonly Edge[];
  /** Places emphasised (the current place, the place inserted). */
  readonly nodes: readonly number[];
  readonly note: TeachingNote;
  /** Euclidean length of the drawn edges, µm. */
  readonly lengthUm: number;
}

function tourEdges(tour: readonly number[], closed = true): Edge[] {
  const edges: Edge[] = [];
  const m = closed ? tour.length : tour.length - 1;
  for (let i = 0; i < m; i++) edges.push([tour[i]!, tour[(i + 1) % tour.length]!]);
  return edges;
}

function frame(
  inst: Instance,
  edges: readonly Edge[],
  note: TeachingNote,
  highlight: readonly Edge[] = [],
  nodes: readonly number[] = [],
): TeachingFrame {
  const lengthUm = edges.reduce((s, [a, b]) => s + inst.dist(a, b), 0);
  return { edges: [...edges], highlight, nodes, note, lengthUm };
}

/** Nearest neighbour from `start`: always on to the closest place not yet visited. */
export function nearestNeighborFrames(inst: Instance, start: number): TeachingFrame[] {
  const n = inst.n;
  const used = new Uint8Array(n);
  const path = [start];
  used[start] = 1;
  const frames = [frame(inst, [], { kind: 'nn-start', a: start }, [], [start])];
  let cur = start;
  for (let step = 1; step < n; step++) {
    let best = -1;
    for (let j = 0; j < n; j++)
      if (!used[j] && (best < 0 || inst.dist(cur, j) < inst.dist(cur, best))) best = j;
    path.push(best);
    used[best] = 1;
    const edge: Edge = [cur, best];
    frames.push(
      frame(inst, tourEdges(path, false), { kind: 'nn-step', a: cur, b: best }, [edge], [best]),
    );
    cur = best;
  }
  frames.push(
    frame(inst, tourEdges(path), { kind: 'nn-close', a: cur, b: start }, [[cur, start]], [start]),
  );
  return frames;
}

/**
 * Convex hull first (on the sphere: the two places farthest apart), then always the place
 * that lengthens the round trip least.
 */
export function insertionFrames(inst: Instance): TeachingFrame[] {
  const n = inst.n;
  const tour = insertionStart(inst);
  const inTour = new Uint8Array(n);
  for (const v of tour) inTour[v] = 1;
  const note: TeachingNote = inst.sphere
    ? { kind: 'pair', a: tour[0]!, b: tour[1]! }
    : { kind: 'hull', count: tour.length };
  const frames = [frame(inst, tourEdges(tour), note, tourEdges(tour), [])];
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
    const a = tour[bestPos - 1]!;
    const b = tour[bestPos % tour.length]!;
    tour.splice(bestPos, 0, bestNode);
    inTour[bestNode] = 1;
    frames.push(
      frame(
        inst,
        tourEdges(tour),
        { kind: 'insert', a, v: bestNode, b },
        [
          [a, bestNode],
          [bestNode, b],
        ],
        [bestNode],
      ),
    );
  }
  return frames;
}

/** Shortest edges first, skipping edges that would give a place three edges or close a cycle early. */
export function greedyEdgeFrames(inst: Instance): TeachingFrame[] {
  const n = inst.n;
  const pairs: Edge[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  pairs.sort(([a, b], [c, d]) => inst.dist(a, b) - inst.dist(c, d) || a - c || b - d);
  const degree = new Uint8Array(n);
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => {
    while (parent[v] !== v) v = parent[v] = parent[parent[v]!]!;
    return v;
  };
  const chosen: Edge[] = [];
  const frames: TeachingFrame[] = [];
  for (const [i, j] of pairs) {
    if (chosen.length === n - 1) break;
    if (degree[i]! >= 2 || degree[j]! >= 2 || find(i) === find(j)) continue;
    parent[find(i)] = find(j);
    degree[i]!++;
    degree[j]!++;
    chosen.push([i, j]);
    frames.push(frame(inst, chosen, { kind: 'greedy', a: i, b: j }, [[i, j]], []));
  }
  const ends = degree.reduce<number[]>((list, d, v) => (d === 1 ? [...list, v] : list), []);
  const [a = 0, b = 0] = ends;
  chosen.push([a, b]);
  frames.push(frame(inst, chosen, { kind: 'greedy-close', a, b }, [[a, b]], []));
  return frames;
}

/**
 * 2-opt from a start tour: repeatedly the exchange of two edges that shortens the round trip
 * most, until none does (a local optimum). Two frames per exchange: the two edges that go, then
 * the two that replace them.
 */
export function twoOptFrames(inst: Instance, start: Tour): TeachingFrame[] {
  const n = inst.n;
  const tour = [...start];
  const frames = [frame(inst, tourEdges(tour), { kind: 'two-opt-start' })];
  for (let moves = 0; moves < 10 * n; moves++) {
    let best = 0;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = tour[i]!;
        const b = tour[i + 1]!;
        const c = tour[j]!;
        const d = tour[(j + 1) % n]!;
        const gain = inst.dist(a, b) + inst.dist(c, d) - inst.dist(a, c) - inst.dist(b, d);
        if (gain > best + 1e-6) {
          best = gain;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0) break;
    const a = tour[bi]!;
    const b = tour[bi + 1]!;
    const c = tour[bj]!;
    const d = tour[(bj + 1) % n]!;
    frames.push(
      frame(inst, tourEdges(tour), { kind: 'two-opt-remove', gainUm: best }, [
        [a, b],
        [c, d],
      ]),
    );
    tour.splice(bi + 1, bj - bi, ...tour.slice(bi + 1, bj + 1).reverse());
    frames.push(
      frame(inst, tourEdges(tour), { kind: 'two-opt-add', gainUm: best }, [
        [a, c],
        [b, d],
      ]),
    );
  }
  frames.push(frame(inst, tourEdges(tour), { kind: 'two-opt-done' }));
  return frames;
}

/**
 * Edges of each round of the exact solver until the solution is one round trip: Euclidean for an
 * instance without nail radius (the teaching mode, digital puzzles), the string model otherwise
 * (a board's optimum as judged, roadmap 9.18).
 */
export function subtourRounds(backend: MipBackend, inst: Instance): Edge[][] {
  const rounds: Edge[][] = [];
  backend.withModel((model) => {
    const tsp =
      inst.rEffUm > 0
        ? new ExactTsp(model, inst, 'string', { timeLimitSec: 120 })
        : new ExactTsp(model, inst.euclidean(), 'euclidean', { timeLimitSec: 60 });
    tsp.solve(undefined, (edges) => rounds.push(edges.map(([a, b]) => [a, b] as const)));
  });
  return rounds;
}

/** Frames of the exact solver's rounds: subtours, a cut against each, again, until one tour. */
export function subtourFrames(
  inst: Instance,
  rounds: readonly (readonly Edge[])[],
): TeachingFrame[] {
  return rounds.map((edges, r) => {
    const subtours = countCycles(inst.n, edges);
    const last = r === rounds.length - 1 && subtours === 1;
    return frame(
      inst,
      edges,
      last ? { kind: 'optimal', rounds: rounds.length } : { kind: 'round', round: r + 1, subtours },
    );
  });
}

function countCycles(n: number, edges: readonly Edge[]): number {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => {
    while (parent[v] !== v) v = parent[v] = parent[parent[v]!]!;
    return v;
  };
  let count = n;
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      count--;
    }
  }
  return count;
}

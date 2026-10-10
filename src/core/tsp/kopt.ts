// Generic k-opt moves on a tour with string costs.
//
// A move removes k tour edges and adds k edges such that the result is again a Hamiltonian
// cycle. Its cost change is ΔL plus, for every endpoint v, the change of the turn cost at v,
// which depends only on v's unordered pair of neighbours. This makes the delta independent of
// orientation and of adjacency special cases.

import type { Instance } from '../instance';
import type { Tour } from './tour';

/** Mutable tour with O(1) neighbour and position lookup. */
export class TourState {
  readonly n: number;
  readonly order: Int32Array;
  readonly pos: Int32Array;

  constructor(tour: Tour) {
    this.n = tour.length;
    this.order = Int32Array.from(tour);
    this.pos = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) this.pos[tour[i]!] = i;
  }

  next(v: number): number {
    const p = this.pos[v]! + 1;
    return this.order[p === this.n ? 0 : p]!;
  }

  prev(v: number): number {
    const p = this.pos[v]!;
    return this.order[p === 0 ? this.n - 1 : p - 1]!;
  }

  /** Node at position i (mod n). */
  at(i: number): number {
    return this.order[((i % this.n) + this.n) % this.n]!;
  }

  tour(): number[] {
    return Array.from(this.order);
  }

  /** Replaces the order (e.g. after a move was applied elsewhere). */
  set(tour: Tour): void {
    for (let i = 0; i < this.n; i++) {
      this.order[i] = tour[i]!;
      this.pos[tour[i]!] = i;
    }
  }
}

/** A k-opt move: removed edges rem[2i], rem[2i+1] and added edges add[2i], add[2i+1]. */
export interface KOptMove {
  readonly k: number;
  readonly rem: ArrayLike<number>;
  readonly add: ArrayLike<number>;
}

const MAX_NODES = 16;
const nodes = new Int32Array(MAX_NODES);
const slotA = new Int32Array(MAX_NODES);
const slotB = new Int32Array(MAX_NODES);

let touched = 0;

function touch(state: TourState, v: number): number {
  for (let i = 0; i < touched; i++) if (nodes[i] === v) return i;
  nodes[touched] = v;
  slotA[touched] = state.prev(v);
  slotB[touched] = state.next(v);
  return touched++;
}

/**
 * Collects the endpoints of a move with their neighbour pairs after the move in the scratch
 * arrays nodes/slotA/slotB; returns their number. Hot path: no allocations.
 */
function rewire(state: TourState, move: KOptMove): number {
  touched = 0;
  const { k, rem, add } = move;
  for (let e = 0; e < 2 * k; e++) {
    const v = rem[e]!;
    const w = rem[e ^ 1]!;
    const i = touch(state, v);
    if (slotA[i] === w) slotA[i] = -1;
    else if (slotB[i] === w) slotB[i] = -1;
    else throw new Error(`k-opt: ${v}-${w} is not a tour edge`);
  }
  for (let e = 0; e < 2 * k; e++) {
    const v = add[e]!;
    const w = add[e ^ 1]!;
    const i = touch(state, v);
    if (slotA[i] === -1) slotA[i] = w;
    else if (slotB[i] === -1) slotB[i] = w;
    else throw new Error(`k-opt: node ${v} would get degree 3`);
  }
  return touched;
}

/**
 * Lower bound on ΔS without computing turn changes: new turn costs are ≥ 0, so
 * ΔS ≥ ΔL − Σ (current turn cost at each endpoint). `turnAt[v]` is the current turn cost at v.
 */
export function deltaLowerBound(inst: Instance, move: KOptMove, turnAt: Int32Array): number {
  let bound = lengthDelta(inst, move);
  if (inst.rEffUm === 0) return bound;
  for (let e = 0; e < 2 * move.k; e++) bound -= turnAt[move.rem[e]!]!;
  return bound;
}

/** Euclidean part ΔL of a move. */
export function lengthDelta(inst: Instance, move: KOptMove): number {
  let delta = 0;
  for (let e = 0; e < move.k; e++) {
    delta += inst.dist(move.add[2 * e]!, move.add[2 * e + 1]!);
    delta -= inst.dist(move.rem[2 * e]!, move.rem[2 * e + 1]!);
  }
  return delta;
}

/** Exact change of the string length S caused by the move. */
export function moveDelta(inst: Instance, state: TourState, move: KOptMove): number {
  let delta = lengthDelta(inst, move);
  if (inst.rEffUm === 0) return delta;
  const m = rewire(state, move);
  for (let i = 0; i < m; i++) {
    const v = nodes[i]!;
    delta += inst.turn(slotA[i]!, v, slotB[i]!) - inst.turn(state.prev(v), v, state.next(v));
  }
  return delta;
}

/** True if the move removes and adds the same edge set (it would reproduce the tour). */
export function isIdentityMove(move: KOptMove): boolean {
  const removed: number[] = [];
  const added: number[] = [];
  for (let e = 0; e < move.k; e++) {
    const [a, b] = [move.rem[2 * e]!, move.rem[2 * e + 1]!];
    const [c, d] = [move.add[2 * e]!, move.add[2 * e + 1]!];
    removed.push(a < b ? a * 65536 + b : b * 65536 + a);
    added.push(c < d ? c * 65536 + d : d * 65536 + c);
  }
  removed.sort((x, y) => x - y);
  added.sort((x, y) => x - y);
  return removed.every((r, i) => r === added[i]);
}

/** Applies the move and rebuilds the order by walking the new cycle. */
export function applyMove(state: TourState, move: KOptMove): void {
  const n = state.n;
  const left = new Int32Array(n);
  const right = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    left[v] = state.prev(v);
    right[v] = state.next(v);
  }
  const m = rewire(state, move);
  for (let i = 0; i < m; i++) {
    left[nodes[i]!] = slotA[i]!;
    right[nodes[i]!] = slotB[i]!;
  }
  const seen = new Uint8Array(n);
  const start = state.order[0]!;
  let prev = -1;
  let cur = start;
  for (let i = 0; i < n; i++) {
    if (seen[cur]) throw new Error('k-opt: move does not yield a Hamiltonian cycle');
    seen[cur] = 1;
    state.order[i] = cur;
    state.pos[cur] = i;
    const next = left[cur] !== prev ? left[cur]! : right[cur]!;
    prev = cur;
    cur = next;
  }
  if (cur !== start) throw new Error('k-opt: move does not yield a Hamiltonian cycle');
}

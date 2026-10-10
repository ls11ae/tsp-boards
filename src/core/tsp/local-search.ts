// Local search on the string length S: 2-opt and Or-opt (segments of 1–3 nodes, both
// orientations) restricted to neighbour lists, first improvement with a work queue.
// Turn costs make the classic gain criterion invalid, so every neighbour candidate is checked,
// but cheaply: a candidate is evaluated exactly only if its lower bound ΔL − Σ(current turn
// costs at its endpoints) is negative.

import type { Instance } from '../instance';
import { TourState, applyMove, deltaLowerBound, moveDelta, type KOptMove } from './kopt';
import type { Tour } from './tour';

/** The k nearest neighbours of every node, by distance (ties: smaller index). */
export function neighborLists(inst: Instance, k: number): Int32Array[] {
  const n = inst.n;
  const lists: Int32Array[] = [];
  for (let i = 0; i < n; i++) {
    const others = Array.from({ length: n }, (_, j) => j).filter((j) => j !== i);
    others.sort((a, b) => inst.dist(i, a) - inst.dist(i, b) || a - b);
    lists.push(Int32Array.from(others.slice(0, k)));
  }
  return lists;
}

const rem = new Int32Array(6);
const add = new Int32Array(6);
const move2: KOptMove = { k: 2, rem, add };
const move3: KOptMove = { k: 3, rem, add };

class Search {
  readonly turnAt: Int32Array;
  private readonly queue: Int32Array;
  private readonly queued: Uint8Array;
  private head = 0;
  private size = 0;

  constructor(
    readonly inst: Instance,
    readonly s: TourState,
    readonly lists: Int32Array[],
  ) {
    const n = inst.n;
    this.turnAt = new Int32Array(n);
    this.queue = new Int32Array(n);
    this.queued = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      this.turnAt[v] = inst.turn(s.prev(v), v, s.next(v));
      this.push(s.order[v]!);
    }
  }

  push(v: number): void {
    if (this.queued[v]) return;
    this.queued[v] = 1;
    this.queue[(this.head + this.size) % this.queue.length] = v;
    this.size++;
  }

  pop(): number {
    const v = this.queue[this.head]!;
    this.head = (this.head + 1) % this.queue.length;
    this.size--;
    this.queued[v] = 0;
    return v;
  }

  get empty(): boolean {
    return this.size === 0;
  }

  /** Applies the move in rem/add if it improves S; re-queues and updates its endpoints. */
  tryMove(move: KOptMove): boolean {
    if (deltaLowerBound(this.inst, move, this.turnAt) >= 0) return false;
    if (moveDelta(this.inst, this.s, move) >= 0) return false;
    applyMove(this.s, move);
    const { inst, s } = this;
    for (let e = 0; e < 2 * move.k; e++) {
      const v = move.rem[e]!;
      this.turnAt[v] = inst.turn(s.prev(v), v, s.next(v));
      this.push(v);
    }
    return true;
  }

  /** 2-opt moves adding an edge (a, c) for c near a. */
  improve2opt(a: number): boolean {
    const { s } = this;
    for (let dir = 0; dir < 2; dir++) {
      const b = dir === 0 ? s.next(a) : s.prev(a);
      for (const c of this.lists[a]!) {
        if (c === b) continue;
        const d = dir === 0 ? s.next(c) : s.prev(c);
        if (d === a) continue;
        rem[0] = a;
        rem[1] = b;
        rem[2] = c;
        rem[3] = d;
        add[0] = a;
        add[1] = c;
        add[2] = b;
        add[3] = d;
        if (this.tryMove(move2)) return true;
      }
    }
    return false;
  }

  /** Moves the segment of `len` nodes starting at `first` next to a node near its ends. */
  improveOrOpt(first: number, len: number): boolean {
    const { s } = this;
    const n = s.n;
    if (n < len + 3) return false;
    let last = first;
    for (let i = 1; i < len; i++) last = s.next(last);
    const before = s.prev(first);
    const after = s.next(last);
    const start = s.pos[first]!;
    for (let endIndex = 0; endIndex < (len === 1 ? 1 : 2); endIndex++) {
      const end = endIndex === 0 ? first : last;
      for (const c of this.lists[end]!) {
        if ((s.pos[c]! - start + n) % n < len) continue;
        for (let side = 0; side < 2; side++) {
          const p = side === 0 ? c : s.prev(c);
          const q = side === 0 ? s.next(c) : c;
          if ((s.pos[p]! - start + n) % n < len || (s.pos[q]! - start + n) % n < len) continue;
          if (p === before && q === after) continue;
          for (let flip = 0; flip < (len === 1 ? 1 : 2); flip++) {
            rem[0] = before;
            rem[1] = first;
            rem[2] = last;
            rem[3] = after;
            rem[4] = p;
            rem[5] = q;
            add[0] = before;
            add[1] = after;
            add[2] = p;
            add[3] = flip === 0 ? first : last;
            add[4] = flip === 0 ? last : first;
            add[5] = q;
            if (this.tryMove(move3)) return true;
          }
        }
      }
    }
    return false;
  }

  run(): void {
    while (!this.empty) {
      const a = this.pop();
      let improved = this.improve2opt(a);
      for (let len = 1; !improved && len <= 3; len++) {
        improved = this.improveOrOpt(a, len) || this.improveOrOpt(this.s.prev(a), len);
      }
      if (improved) this.push(a);
    }
  }
}

/** Improves the tour in place until no 2-opt/Or-opt move in the neighbour lists improves S. */
export function localSearch(inst: Instance, state: TourState, lists: Int32Array[]): void {
  if (inst.n < 5) return;
  new Search(inst, state, lists).run();
}

/** Convenience wrapper: returns an improved copy of `tour`. */
export function improveTour(inst: Instance, tour: Tour, lists: Int32Array[]): number[] {
  const state = new TourState(tour);
  localSearch(inst, state, lists);
  return state.tour();
}

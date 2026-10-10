// Minimum-distance conflicts between pool cities, and weighted sampling of eligible cities.

import { distance, type Point } from '../geometry';
import type { Rng } from '../rng';

export class ConflictGraph {
  /** For each pool city, the pool cities closer than the minimum distance. */
  readonly near: Int32Array[];

  constructor(points: readonly Point[], minDistMm: number) {
    const n = points.length;
    const cell = Math.max(minDistMm, 1e-9);
    const grid = new Map<string, number[]>();
    const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    points.forEach(([x, y], i) => {
      const k = key(x, y);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(i);
    });
    this.near = Array.from({ length: n }, () => new Int32Array(0));
    for (let i = 0; i < n; i++) {
      const [x, y] = points[i]!;
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const found: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (j !== i && distance(points[i]!, points[j]!) < minDistMm) found.push(j);
          }
        }
      }
      found.sort((a, b) => a - b);
      this.near[i] = Int32Array.from(found);
    }
  }
}

/** Selection state over the pool with conflict counts for O(1) eligibility checks. */
export class Selection {
  readonly selected: Uint8Array;
  /** Number of selected cities in conflict with each pool city. */
  readonly conflicts: Int32Array;
  readonly members: number[] = [];

  constructor(
    readonly graph: ConflictGraph,
    size: number,
  ) {
    this.selected = new Uint8Array(size);
    this.conflicts = new Int32Array(size);
  }

  add(c: number): void {
    if (this.selected[c]) throw new Error(`city ${c} already selected`);
    this.selected[c] = 1;
    this.members.push(c);
    for (const j of this.graph.near[c]!) this.conflicts[j]!++;
  }

  remove(c: number): void {
    if (!this.selected[c]) throw new Error(`city ${c} not selected`);
    this.selected[c] = 0;
    this.members.splice(this.members.indexOf(c), 1);
    for (const j of this.graph.near[c]!) this.conflicts[j]!--;
  }

  eligible(c: number): boolean {
    return !this.selected[c] && this.conflicts[c] === 0;
  }

  clone(): Selection {
    const copy = new Selection(this.graph, this.selected.length);
    copy.selected.set(this.selected);
    copy.conflicts.set(this.conflicts);
    copy.members.push(...this.members);
    return copy;
  }
}

/** Samples an index with probability proportional to weights[i] among indices where ok(i). */
export function sampleWeighted(
  weights: Float64Array,
  ok: (i: number) => boolean,
  rng: Rng,
): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (ok(i)) total += weights[i]!;
  if (total <= 0) return -1;
  let r = rng.float() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    if (!ok(i)) continue;
    last = i;
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return last;
}

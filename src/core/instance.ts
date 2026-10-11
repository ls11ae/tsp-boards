// A TSP instance on the board with integer costs in µm.
//
// The string wraps around the nails, so its length is S = L + r_eff · Σ|θ| (L Euclidean length
// between nail centres, θ turning angle at each nail, r_eff = nail radius + half the string
// thickness). Distances and per-triple turn costs are rounded to whole µm once, so all tour
// costs are exact integers: comparisons, deltas and ties are exact, and the MIP objective is
// integral.

import { turningAngle, type Point } from './geometry';

/** Board units are mm; costs are integers in µm. */
export const UM_PER_MM = 1000;

export class Instance {
  readonly n: number;
  /** Coordinates in µm (rounded). */
  readonly x: Int32Array;
  readonly y: Int32Array;
  /** n × n distances in µm. */
  readonly d: Int32Array;
  /** n × n × n turn costs in µm; t[(j * n + i) * n + k] for the turn at j between i and k. */
  readonly t: Int32Array;
  /** r_eff in µm; 0 means the string length equals the Euclidean length. */
  readonly rEffUm: number;

  /**
   * @param pointsMm board coordinates in mm
   * @param rEffMm nail radius + half string thickness in mm (0 for Euclidean costs)
   */
  constructor(pointsMm: readonly Point[], rEffMm: number) {
    const n = pointsMm.length;
    this.n = n;
    this.rEffUm = Math.round(rEffMm * UM_PER_MM);
    this.x = new Int32Array(n);
    this.y = new Int32Array(n);
    this.d = new Int32Array(n * n);
    this.t = new Int32Array(n * n * n);
    for (let i = 0; i < n; i++)
      this.setPointUm(i, pointsMm[i]![0] * UM_PER_MM, pointsMm[i]![1] * UM_PER_MM);
    for (let i = 0; i < n; i++) this.updateCosts(i);
  }

  /** Same points with zero turn costs (the Euclidean instance). */
  euclidean(): Instance {
    return new Instance(this.pointsMm(), 0);
  }

  /** Independent copy (cheaper than rebuilding: no trigonometry). */
  clone(): Instance {
    const copy = Object.create(Instance.prototype) as Instance;
    return Object.assign(copy, {
      n: this.n,
      rEffUm: this.rEffUm,
      x: this.x.slice(),
      y: this.y.slice(),
      d: this.d.slice(),
      t: this.t.slice(),
    });
  }

  /**
   * Copy in which the turn cost at node j for the neighbour pair {i, k} is cost(i, k) (µm,
   * rounded; must be symmetric). Models a node where the string does not simply turn, such as
   * the start nail (board/measure.ts).
   */
  withTurnCosts(j: number, cost: (i: number, k: number) => number): Instance {
    const copy = this.clone();
    const n = this.n;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        if (i !== j && k !== j && i !== k) copy.t[(j * n + i) * n + k] = Math.round(cost(i, k));
      }
    }
    return copy;
  }

  pointsMm(): Point[] {
    return Array.from(
      { length: this.n },
      (_, i) => [this.x[i]! / UM_PER_MM, this.y[i]! / UM_PER_MM] as const,
    );
  }

  dist(i: number, j: number): number {
    return this.d[i * this.n + j]!;
  }

  /** Turn cost at j between neighbours i and k (symmetric in i and k). */
  turn(i: number, j: number, k: number): number {
    return this.t[(j * this.n + i) * this.n + k]!;
  }

  /** Moves point `index` and updates all costs involving it in O(n²). */
  movePoint(index: number, xMm: number, yMm: number): void {
    this.setPointUm(index, xMm * UM_PER_MM, yMm * UM_PER_MM);
    this.updateCosts(index);
  }

  private setPointUm(i: number, xUm: number, yUm: number): void {
    this.x[i] = Math.round(xUm);
    this.y[i] = Math.round(yUm);
  }

  private updateCosts(p: number): void {
    const { n, x, y, d, t } = this;
    for (let j = 0; j < n; j++) {
      const dx = x[p]! - x[j]!;
      const dy = y[p]! - y[j]!;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      d[p * n + j] = dist;
      d[j * n + p] = dist;
    }
    if (this.rEffUm === 0) return;
    const pt = (i: number): Point => [x[i]!, y[i]!];
    const set = (i: number, j: number, k: number) => {
      const cost = Math.round(this.rEffUm * turningAngle(pt(i), pt(j), pt(k)));
      t[(j * n + i) * n + k] = cost;
      t[(j * n + k) * n + i] = cost;
    };
    for (let i = 0; i < n; i++) {
      for (let k = i; k < n; k++) set(i, p, k);
      if (i === p) continue;
      for (let k = 0; k < n; k++) set(p, i, k);
    }
  }
}

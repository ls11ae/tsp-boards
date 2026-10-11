// Device-independent vector paths in board millimetres (y down), shared by the SVG and PDF
// writers. Only absolute moves, lines and cubic Béziers, which both formats support directly.

import type { Point } from '../geometry';

export type PathCommand =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export type Path = readonly PathCommand[];

/** Affine map [a, b, c, d, e, f]: (x, y) -> (a·x + c·y + e, b·x + d·y + f), as in SVG and PDF. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function translate(dx: number, dy: number): Matrix {
  return [1, 0, 0, 1, dx, dy];
}

/** Composition: first `inner`, then `outer`. */
export function compose(outer: Matrix, inner: Matrix): Matrix {
  const [a, b, c, d, e, f] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

/** Rotation by `angle` radians (clockwise on screen, since y points down) about (cx, cy). */
export function rotate(angle: number, cx = 0, cy = 0): Matrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function transformPath(path: Path, m: Matrix): PathCommand[] {
  return path.map((cmd): PathCommand => {
    switch (cmd[0]) {
      case 'M':
      case 'L':
        return [cmd[0], ...apply(m, cmd[1], cmd[2])];
      case 'C':
        return [
          'C',
          ...apply(m, cmd[1], cmd[2]),
          ...apply(m, cmd[3], cmd[4]),
          ...apply(m, cmd[5], cmd[6]),
        ];
      case 'Z':
        return cmd;
    }
  });
}

/** Circle as four cubic arcs (relative radial error 2.7e-4). */
export function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = 0.5522847498 * r;
  return [
    ['M', cx + r, cy],
    ['C', cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    ['C', cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    ['C', cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    ['C', cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    ['Z'],
  ];
}

/** Axis-parallel rectangle, optionally with rounded corners. */
export function rectPath(x: number, y: number, w: number, h: number, radius = 0): PathCommand[] {
  const r = Math.min(radius, w / 2, h / 2);
  if (r <= 0) {
    return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
  }
  const k = (1 - 0.5522847498) * r;
  return [
    ['M', x + r, y],
    ['L', x + w - r, y],
    ['C', x + w - k, y, x + w, y + k, x + w, y + r],
    ['L', x + w, y + h - r],
    ['C', x + w, y + h - k, x + w - k, y + h, x + w - r, y + h],
    ['L', x + r, y + h],
    ['C', x + k, y + h, x, y + h - k, x, y + h - r],
    ['L', x, y + r],
    ['C', x, y + k, x + k, y, x + r, y],
    ['Z'],
  ];
}

export function polylinePath(points: readonly Point[], closed = false): PathCommand[] {
  const path: PathCommand[] = points.map(([x, y], i) => [i === 0 ? 'M' : 'L', x, y]);
  if (closed && points.length > 2) path.push(['Z']);
  return path;
}

export function polygonPath(points: readonly Point[]): PathCommand[] {
  return polylinePath(points, true);
}

/** Bounding box [x0, y0, x1, y1] of all points incl. control points; null for an empty path. */
export function pathBounds(path: Path): [number, number, number, number] | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const cmd of path) {
    for (let i = 1; i + 1 < cmd.length; i += 2) {
      const x = cmd[i] as number;
      const y = cmd[i + 1] as number;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

/** SVG path data with the given number of decimals. */
export function svgPathData(path: Path, digits = 3): string {
  const f = (v: number) => {
    const s = v.toFixed(digits);
    // Trim trailing zeros: 12.500 -> 12.5, 3.000 -> 3, -0.000 -> 0.
    const t = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    return t === '-0' ? '0' : t;
  };
  let out = '';
  for (const cmd of path) {
    out += cmd[0];
    if (cmd[0] !== 'Z')
      out += cmd
        .slice(1)
        .map((v) => f(v as number))
        .join(' ');
  }
  return out;
}

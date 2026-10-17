// Logos engraved on a board (roadmap 9.1), e.g. a partner's logo next to its nail and in the
// legend. Read from an SVG file as filled vector paths: <path>, <polygon>, <rect>, <circle> and
// <ellipse> with the transforms of their groups (potrace and Inkscape output). Text, images,
// strokes and unfilled shapes are ignored; the logo is engraved as one filled area.
//
// Logos are never stored in puzzle files or the repository (usage rights): they come from a
// local file for each export.

import {
  IDENTITY,
  compose,
  pathBounds,
  transformPath,
  type Matrix,
  type Path,
  type PathCommand,
} from './shapes';

export interface Logo {
  /** Filled outline in the logo's own units (y down). */
  readonly path: Path;
  /** Bounding box [x0, y0, x1, y1] of the outline. */
  readonly box: readonly [number, number, number, number];
}

/** Height of the logo at the given width. */
export function logoHeight(logo: Logo, width: number): number {
  const [x0, y0, x1, y1] = logo.box;
  return (width * (y1 - y0)) / Math.max(1e-9, x1 - x0);
}

/** The logo scaled to `width`, its bounding box's top-left corner at (x, y). */
export function placeLogo(logo: Logo, x: number, y: number, width: number): PathCommand[] {
  const [x0, y0, x1] = logo.box;
  const s = width / Math.max(1e-9, x1 - x0);
  return transformPath(logo.path, [s, 0, 0, s, x - s * x0, y - s * y0]);
}

/** The logo fitted into the box [x0, y0, x1, y1] (aspect kept, centred). */
export function fitLogo(logo: Logo, box: readonly [number, number, number, number]): PathCommand[] {
  const [bx0, by0, bx1, by1] = box;
  const [x0, y0, x1, y1] = logo.box;
  const s = Math.min((bx1 - bx0) / (x1 - x0), (by1 - by0) / (y1 - y0));
  const w = s * (x1 - x0);
  const h = s * (y1 - y0);
  return placeLogo(logo, bx0 + (bx1 - bx0 - w) / 2, by0 + (by1 - by0 - h) / 2, w);
}

// --- SVG parsing ------------------------------------------------------------------------------

/** An SVG start, end or empty tag: closing slash, name, attributes, self-closing slash. */
export const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(ATTR)) out[m[1]!] = m[2] ?? m[3] ?? '';
  return out;
}

export const numbers = (text: string): number[] =>
  (text.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

/** SVG transform attribute as one matrix (applied right to left, as in SVG). */
export function parseTransform(text: string): Matrix {
  let m: Matrix = IDENTITY;
  for (const [, name, args] of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = numbers(args!);
    let t: Matrix = IDENTITY;
    if (name === 'matrix' && a.length === 6) t = a as unknown as Matrix;
    else if (name === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (name === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (name === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      const [c, s] = [Math.cos(r), Math.sin(r)];
      t = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    } else if (name === 'skewX') t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === 'skewY') t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = compose(m, t);
  }
  return m;
}

/** Elliptical arc as cubic Béziers (SVG implementation notes, F.6). */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathCommand[] {
  if (rxIn === 0 || ryIn === 0) return [['L', x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * yp) / ry;
  const cyp = (-coef * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const deriv = (t: number): [number, number] => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const out: PathCommand[] = [];
  for (let i = 0; i < segments; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [ax, ay] = point(a);
    const [bx, by] = i === segments - 1 ? [x2, y2] : point(b);
    const [dax, day] = deriv(a);
    const [dbx, dby] = deriv(b);
    out.push(['C', ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return out;
}

/** SVG path data as absolute moves, lines and cubic Béziers. */
export function parsePathData(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let [x, y, sx, sy] = [0, 0, 0, 0];
  // Last control point (for S and T) and the command that set it.
  let [cx, cy] = [0, 0];
  let last = '';
  const num = () => Number(tokens[i++]);
  const hasNumber = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (C) {
      case 'M': {
        x = ox + num();
        y = oy + num();
        [sx, sy] = [x, y];
        out.push(['M', x, y]);
        // Further pairs are line-tos.
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        x = ox + num();
        y = oy + num();
        out.push(['L', x, y]);
        break;
      case 'H':
        x = (rel ? x : 0) + num();
        out.push(['L', x, y]);
        break;
      case 'V':
        y = (rel ? y : 0) + num();
        out.push(['L', x, y]);
        break;
      case 'C': {
        const [x1, y1, x2, y2] = [ox + num(), oy + num(), ox + num(), oy + num()];
        x = ox + num();
        y = oy + num();
        out.push(['C', x1, y1, x2, y2, x, y]);
        [cx, cy] = [x2, y2];
        break;
      }
      case 'S': {
        const reflect = last === 'C' || last === 'S';
        const [x1, y1] = reflect ? [2 * x - cx, 2 * y - cy] : [x, y];
        const [x2, y2] = [ox + num(), oy + num()];
        x = ox + num();
        y = oy + num();
        out.push(['C', x1, y1, x2, y2, x, y]);
        [cx, cy] = [x2, y2];
        break;
      }
      case 'Q':
      case 'T': {
        let qx: number;
        let qy: number;
        if (C === 'Q') [qx, qy] = [ox + num(), oy + num()];
        else [qx, qy] = last === 'Q' || last === 'T' ? [2 * x - cx, 2 * y - cy] : [x, y];
        const [x0, y0] = [x, y];
        x = ox + num();
        y = oy + num();
        out.push([
          'C',
          x0 + (2 / 3) * (qx - x0),
          y0 + (2 / 3) * (qy - y0),
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          x,
          y,
        ]);
        [cx, cy] = [qx, qy];
        break;
      }
      case 'A': {
        const [rx, ry, phi, large, sweep] = [num(), num(), num(), num(), num()];
        const [x0, y0] = [x, y];
        x = ox + num();
        y = oy + num();
        out.push(...arcToCubics(x0, y0, rx, ry, phi, large !== 0, sweep !== 0, x, y));
        break;
      }
      case 'Z':
        out.push(['Z']);
        [x, y] = [sx, sy];
        break;
      default:
        throw new Error(`SVG path: unknown command ${cmd}`);
    }
    last = C;
    if (C === 'Z' && hasNumber()) cmd = '';
    if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('SVG path: malformed numbers');
  }
  return out;
}

/** Outline of a basic shape element (polygons and polylines closed), or [] for other elements. */
export function shapePath(name: string, a: Record<string, string>): PathCommand[] {
  const n = (key: string) => Number(a[key] ?? 0);
  switch (name) {
    case 'path':
      return parsePathData(a.d ?? '');
    case 'polygon':
    case 'polyline': {
      const p = numbers(a.points ?? '');
      const out: PathCommand[] = [];
      for (let i = 0; i + 1 < p.length; i += 2) out.push([i === 0 ? 'M' : 'L', p[i]!, p[i + 1]!]);
      if (out.length > 2) out.push(['Z']);
      return out;
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
      return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n('cx'), n('cy')];
      const rx = name === 'circle' ? n('r') : n('rx');
      const ry = name === 'circle' ? n('r') : n('ry');
      const k = 0.5522847498;
      return [
        ['M', cx + rx, cy],
        ['C', cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry],
        ['C', cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
        ['C', cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry],
        ['C', cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy],
        ['Z'],
      ];
    }
    default:
      return [];
  }
}

/** Fill of an element from its attribute or style (inherited from the groups). */
function fillOf(a: Record<string, string>, inherited: string): string {
  const style = /(?:^|;)\s*fill\s*:\s*([^;]+)/.exec(a.style ?? '');
  return (style?.[1] ?? a.fill ?? inherited).trim();
}

/** The filled shapes of an SVG document as one logo; throws if there are none. */
export function parseSvgLogo(svg: string): Logo {
  const path: PathCommand[] = [];
  // Open groups: their transform and fill; elements in <defs>, <clipPath> etc. are skipped.
  const stack: { name: string; matrix: Matrix; fill: string }[] = [
    { name: '', matrix: IDENTITY, fill: '#000' },
  ];
  const skip = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'title']);
  let skipping = 0;
  // Comments may hold markup that is no shape.
  for (const m of svg.replace(/<!--[\s\S]*?-->/g, '').matchAll(TAG)) {
    const [, close, name, attrText, selfClose] = m;
    const top = stack[stack.length - 1]!;
    if (close) {
      if (skip.has(name!)) skipping = Math.max(0, skipping - 1);
      if (stack.length > 1 && stack[stack.length - 1]!.name === name) stack.pop();
      continue;
    }
    if (skip.has(name!)) {
      if (!selfClose) skipping++;
      continue;
    }
    if (skipping > 0) continue;
    const a = attributes(attrText ?? '');
    const matrix = a.transform ? compose(top.matrix, parseTransform(a.transform)) : top.matrix;
    const fill = fillOf(a, top.fill);
    if (name === 'g' || name === 'svg') {
      if (!selfClose) stack.push({ name: name, matrix, fill });
      continue;
    }
    // White shapes are knock-outs on screen; on wood only the dark parts are engraved.
    if (/^(none|transparent|white|#fff|#ffffff)$/i.test(fill)) continue;
    path.push(...transformPath(shapePath(name!, a), matrix));
  }
  const box = pathBounds(path);
  if (!box || box[2] <= box[0] || box[3] <= box[1]) throw new Error('SVG logo: no filled shapes');
  return { path, box };
}

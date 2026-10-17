// Logos in their own colours, for posters (roadmap 9.10): filled shapes with their fill rule,
// stroked lines with width, caps, joins and miter limit, presentation attributes, inline styles,
// simple CSS rules (`.class` and element selectors) and `<use>` references (e.g. glyphs in
// `<defs>`), with the transforms of their groups. Gradients are drawn in their first colour,
// opacity is mixed with the white paper. Text and images are ignored. Boards stay one colour
// (logo.ts).
//
// Logos are never stored in puzzle files or the repository (usage rights): they come from a
// local file for each export.

import { TAG, attributes, numbers, parseTransform, shapePath, type Logo } from './logo';
import type { Rgb } from './pdf';
import {
  IDENTITY,
  compose,
  pathBounds,
  transformPath,
  translate,
  type Matrix,
  type PathCommand,
} from './shapes';

export interface LogoStroke {
  readonly color: Rgb;
  /** Line width in the logo's units (after the transforms). */
  readonly width: number;
  readonly cap: 'butt' | 'round' | 'square';
  readonly join: 'miter' | 'round' | 'bevel';
  readonly miterLimit: number;
}

/** One shape of a logo in drawing order: filled, stroked, or both (fill first). */
export interface LogoPart {
  readonly path: readonly PathCommand[];
  readonly fill: Rgb | null;
  readonly evenOdd: boolean;
  readonly stroke: LogoStroke | null;
}

/**
 * A logo in its colours. `path` holds its dark filled shapes, as one-colour logos have it
 * (logo.ts); `box` encloses everything drawn, strokes included.
 */
export interface ColorLogo extends Logo {
  readonly parts: readonly LogoPart[];
}

export const isColorLogo = (logo: Logo): logo is ColorLogo =>
  Array.isArray((logo as Partial<ColorLogo>).parts);

// --- colours ------------------------------------------------------------------------------------

const NAMED: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  red: [1, 0, 0],
  green: [0, 128 / 255, 0],
  blue: [0, 0, 1],
  gray: [128 / 255, 128 / 255, 128 / 255],
  grey: [128 / 255, 128 / 255, 128 / 255],
};

/** A CSS colour (#rgb, #rrggbb, rgb() with numbers or percentages, a few names), or null. */
export function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (hex) {
    const full =
      hex.length === 3 || hex.length === 4
        ? [...hex.slice(0, 3)].map((c) => c + c).join('')
        : hex.slice(0, 6);
    if (full.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as unknown as Rgb;
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(v)?.[1];
  if (rgb) {
    const parts = rgb
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length < 3) return null;
    return parts.map((p) =>
      Math.min(1, Math.max(0, p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / 255)),
    ) as unknown as Rgb;
  }
  return NAMED[v] ?? null;
}

// --- the document tree --------------------------------------------------------------------------

interface Node {
  readonly name: string;
  readonly attrs: Record<string, string>;
  readonly children: Node[];
}

function parseTree(svg: string): Node {
  const root: Node = { name: '', attrs: {}, children: [] };
  const stack = [root];
  for (const m of svg.matchAll(TAG)) {
    const [, close, name, attrText, selfClose] = m;
    if (close) {
      const i = stack.findLastIndex((n) => n.name === name);
      if (i > 0) stack.length = i;
      continue;
    }
    const node: Node = { name: name!, attrs: attributes(attrText ?? ''), children: [] };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

/** Declarations "a: b; c: d" as a record. */
function declarations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

interface Rule {
  readonly selector: string;
  readonly decls: Record<string, string>;
}

/** Rules of the `<style>` elements; only `.class` and element selectors apply. */
function cssRules(svg: string): Rule[] {
  const rules: Rule[] = [];
  for (const [, body] of svg.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = body!.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, decls] of css.matchAll(/([^{}]+)\{([^}]*)\}/g))
      for (const selector of selectors!.split(','))
        rules.push({ selector: selector.trim(), decls: declarations(decls!) });
  }
  return rules;
}

// --- styles -------------------------------------------------------------------------------------

/** Inherited properties and their initial values. */
const INHERITED = {
  fill: 'black',
  'fill-rule': 'nonzero',
  'fill-opacity': '1',
  stroke: 'none',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'stroke-opacity': '1',
  color: 'black',
};
type Style = Record<keyof typeof INHERITED, string>;
const OWN = ['display', 'visibility', 'opacity'];
const STYLED = [...Object.keys(INHERITED), ...OWN];

/** Elements whose content is never drawn directly (a `<use>` may draw from `<defs>`). */
const SKIP = new Set([
  'defs',
  'clipPath',
  'mask',
  'symbol',
  'pattern',
  'marker',
  'title',
  'desc',
  'metadata',
  'style',
  'linearGradient',
  'radialGradient',
  'text',
  'image',
  'foreignObject',
]);

/** The logo in its colours; throws if nothing is drawn. */
export function parseSvgColorLogo(svg: string): ColorLogo {
  const source = svg.replace(/<!--[\s\S]*?-->/g, '');
  const root = parseTree(source);
  const rules = cssRules(source);
  const ids = new Map<string, Node>();
  const index = (n: Node) => {
    if (n.attrs.id) ids.set(n.attrs.id, n);
    n.children.forEach(index);
  };
  index(root);

  const declared = (n: Node): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const key of STYLED) if (n.attrs[key] !== undefined) out[key] = n.attrs[key];
    const classes = (n.attrs.class ?? '').split(/\s+/).filter(Boolean);
    for (const r of rules)
      if (r.selector === n.name || classes.some((c) => r.selector === `.${c}`))
        Object.assign(out, r.decls);
    Object.assign(out, declarations(n.attrs.style ?? ''));
    return out;
  };

  // Paint: a colour, a gradient's first stop, or none; opacity mixed with white paper.
  const paint = (value: string, color: string, opacity: string): Rgb | null => {
    let v = value.trim();
    if (v === 'none' || v === 'transparent') return null;
    if (v.toLowerCase() === 'currentcolor') v = color;
    const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(v)?.[1];
    if (url) {
      const stop = ids.get(url)?.children.find((c) => c.name === 'stop');
      if (!stop) return null;
      v = declarations(stop.attrs.style ?? '')['stop-color'] ?? stop.attrs['stop-color'] ?? '';
    }
    const rgb = parseColor(v);
    if (!rgb) return null;
    const a = Math.min(1, Math.max(0, Number(opacity) || 0));
    return a >= 1 ? rgb : (rgb.map((c) => 1 - a * (1 - c)) as unknown as Rgb);
  };

  const parts: LogoPart[] = [];
  const walk = (n: Node, matrix: Matrix, inherited: Style, depth: number, used: boolean) => {
    if (depth > 32 || n.name.includes(':') || (!used && SKIP.has(n.name))) return;
    const own = declared(n);
    if (own.display === 'none' || Number(own.opacity ?? '1') === 0) return;
    const style = { ...inherited };
    for (const key of Object.keys(INHERITED) as (keyof Style)[])
      if (own[key] !== undefined && own[key] !== 'inherit') style[key] = own[key];
    let m = n.attrs.transform ? compose(matrix, parseTransform(n.attrs.transform)) : matrix;

    if (n.name === 'use') {
      const ref = (n.attrs.href ?? n.attrs['xlink:href'] ?? '').replace(/^#/, '');
      const target = ids.get(ref);
      if (!target) return;
      m = compose(m, translate(Number(n.attrs.x ?? 0), Number(n.attrs.y ?? 0)));
      if (target.name === 'symbol')
        for (const child of target.children) walk(child, m, style, depth + 1, false);
      else walk(target, m, style, depth + 1, true);
      return;
    }
    if (
      n.name === '' ||
      n.name === 'svg' ||
      n.name === 'g' ||
      n.name === 'a' ||
      n.name === 'switch'
    ) {
      for (const child of n.children) walk(child, m, style, depth + 1, false);
      return;
    }
    if (own.visibility === 'hidden') return;
    let raw: PathCommand[];
    if (n.name === 'line') {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(
        (k) => numbers(n.attrs[k] ?? '0')[0] ?? 0,
      );
      raw = [
        ['M', x1!, y1!],
        ['L', x2!, y2!],
      ];
    } else raw = shapePath(n.name, n.attrs);
    if (raw.length === 0) return;
    const path = transformPath(raw, m);
    const fill = n.name === 'line' ? null : paint(style.fill, style.color, style['fill-opacity']);
    const strokeColor = paint(style.stroke, style.color, style['stroke-opacity']);
    const width =
      (numbers(style['stroke-width'])[0] ?? 1) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const stroke: LogoStroke | null =
      strokeColor && width > 0
        ? {
            color: strokeColor,
            width,
            cap:
              (['butt', 'round', 'square'] as const).find((c) => c === style['stroke-linecap']) ??
              'butt',
            join:
              (['miter', 'round', 'bevel'] as const).find((j) => j === style['stroke-linejoin']) ??
              'miter',
            miterLimit: Number(style['stroke-miterlimit']) || 4,
          }
        : null;
    if (!fill && !stroke) return;
    // A stroked polyline stays open (shapePath closes it for filling).
    const strokePath = n.name === 'polyline' && path.at(-1)?.[0] === 'Z' ? path.slice(0, -1) : path;
    if (fill) parts.push({ path, fill, evenOdd: style['fill-rule'] === 'evenodd', stroke: null });
    if (stroke) parts.push({ path: strokePath, fill: null, evenOdd: false, stroke });
  };
  walk(root, IDENTITY, { ...INHERITED }, 0, false);

  let box: [number, number, number, number] | null = null;
  for (const part of parts) {
    const b = pathBounds(part.path);
    if (!b) continue;
    const e = part.stroke ? part.stroke.width / 2 : 0;
    box = box
      ? [
          Math.min(box[0], b[0] - e),
          Math.min(box[1], b[1] - e),
          Math.max(box[2], b[2] + e),
          Math.max(box[3], b[3] + e),
        ]
      : [b[0] - e, b[1] - e, b[2] + e, b[3] + e];
  }
  if (!box || box[2] <= box[0] || box[3] <= box[1]) throw new Error('SVG logo: nothing to draw');
  const dark = parts.filter((p) => p.fill && p.fill.some((c) => c < 0.98)).flatMap((p) => p.path);
  return { path: dark, box, parts };
}

// Text on the board: measured with the embedded font metrics and converted to outlines (laser
// software and PDF need no font then). Sizes are the em size in mm; y points down, the text
// baseline is at y.

import { FONT_DATA } from './font-data';
import { compose, rotate, translate, transformPath, type Matrix, type PathCommand } from './shapes';

const FALLBACK = '?';

interface Glyph {
  readonly advance: number;
  /** Ink box in em units, y down: [x0, top, x1, bottom] with top < 0 above the baseline. */
  readonly box: readonly [number, number, number, number];
  /** Outline in em units, y down, quadratics converted to cubics. */
  readonly outline: readonly PathCommand[];
}

const cache = new Map<string, Glyph>();

function parseOutline(data: string, unitsPerEm: number): PathCommand[] {
  const s = 1 / unitsPerEm;
  const out: PathCommand[] = [];
  let x = 0;
  let y = 0;
  for (const match of data.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const v = match[2]!.trim() === '' ? [] : match[2]!.trim().split(/\s+/).map(Number);
    switch (match[1]) {
      case 'M':
      case 'L':
        x = v[0]! * s;
        y = -v[1]! * s;
        out.push([match[1], x, y]);
        break;
      case 'Q': {
        const qx = v[0]! * s;
        const qy = -v[1]! * s;
        const ex = v[2]! * s;
        const ey = -v[3]! * s;
        out.push([
          'C',
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          ex + (2 / 3) * (qx - ex),
          ey + (2 / 3) * (qy - ey),
          ex,
          ey,
        ]);
        x = ex;
        y = ey;
        break;
      }
      case 'C':
        x = v[4]! * s;
        y = -v[5]! * s;
        out.push(['C', v[0]! * s, -v[1]! * s, v[2]! * s, -v[3]! * s, x, y]);
        break;
      case 'Z':
        out.push(['Z']);
        break;
    }
  }
  return out;
}

function glyph(ch: string): Glyph {
  let g = cache.get(ch);
  if (g) return g;
  const raw =
    FONT_DATA.glyphs[ch] ??
    // Letters with diacritics the font lacks: fall back to the base letter.
    FONT_DATA.glyphs[ch.normalize('NFD')[0] ?? ''] ??
    FONT_DATA.glyphs[FALLBACK]!;
  const u = FONT_DATA.unitsPerEm;
  const [advance, x0, y0, x1, y1, outline] = raw;
  g = {
    advance: advance / u,
    box: [x0 / u, -y1 / u, x1 / u, -y0 / u],
    outline: parseOutline(outline, u),
  };
  cache.set(ch, g);
  return g;
}

/** Font metrics in em units (multiply by the size in mm). */
export const FONT_METRICS = {
  name: FONT_DATA.name,
  ascender: FONT_DATA.ascender / FONT_DATA.unitsPerEm,
  descender: -FONT_DATA.descender / FONT_DATA.unitsPerEm,
  capHeight: FONT_DATA.capHeight / FONT_DATA.unitsPerEm,
  xHeight: FONT_DATA.xHeight / FONT_DATA.unitsPerEm,
} as const;

export interface TextMetrics {
  /** Advance width in mm. */
  readonly width: number;
  /** Ink box relative to the start of the baseline, mm, y down: top < 0 < bottom (usually). */
  readonly inkLeft: number;
  readonly inkTop: number;
  readonly inkRight: number;
  readonly inkBottom: number;
}

export function measureText(text: string, sizeMm: number): TextMetrics {
  let x = 0;
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ch of text) {
    const g = glyph(ch);
    if (g.outline.length > 0) {
      left = Math.min(left, x + g.box[0]);
      top = Math.min(top, g.box[1]);
      right = Math.max(right, x + g.box[2]);
      bottom = Math.max(bottom, g.box[3]);
    }
    x += g.advance;
  }
  if (left === Infinity) [left, top, right, bottom] = [0, 0, 0, 0];
  return {
    width: x * sizeMm,
    inkLeft: left * sizeMm,
    inkTop: top * sizeMm,
    inkRight: right * sizeMm,
    inkBottom: bottom * sizeMm,
  };
}

export type TextAnchor = 'start' | 'middle' | 'end';

export interface TextOptions {
  readonly anchor?: TextAnchor;
  /** Rotation in radians about the anchor point (clockwise on the board). */
  readonly angle?: number;
}

/** Outline of `text` with the baseline anchored at (x, y). */
export function textPath(
  text: string,
  x: number,
  y: number,
  sizeMm: number,
  options: TextOptions = {},
): PathCommand[] {
  const width = measureText(text, 1).width;
  const shift = options.anchor === 'middle' ? -width / 2 : options.anchor === 'end' ? -width : 0;
  let m: Matrix = compose(translate(x, y), [sizeMm, 0, 0, sizeMm, shift * sizeMm, 0]);
  if (options.angle) m = compose(rotate(options.angle, x, y), m);
  const out: PathCommand[] = [];
  let pen = 0;
  for (const ch of text) {
    const g = glyph(ch);
    if (g.outline.length > 0) out.push(...transformPath(g.outline, compose(m, translate(pen, 0))));
    pen += g.advance;
  }
  return out;
}

/** Splits text into lines no wider than `maxWidthMm` (breaks at spaces only). */
export function wrapText(text: string, sizeMm: number, maxWidthMm: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureText(candidate, sizeMm).width > maxWidthMm) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

import { describe, expect, it } from 'vitest';
import { PdfCanvas } from './pdf';
import type { PathCommand } from './shapes';

const square: PathCommand[] = [['M', 0, 0], ['L', 1, 0], ['L', 1, 1], ['Z']];

describe('PDF canvas', () => {
  it('strokes with round ends and corners unless a style says otherwise', () => {
    expect(new PdfCanvas().stroke(square, [0, 0, 0], 0.5).content()).toContain('0.5 w 1 J 1 j');
    const styled = new PdfCanvas()
      .stroke(square, [0, 0, 0], 0.25, undefined, { cap: 'butt', join: 'miter', miterLimit: 4 })
      .content();
    expect(styled).toContain('0.25 w 0 J 0 j 4 M');
    expect(
      new PdfCanvas()
        .stroke(square, [0, 0, 0], 1, undefined, { cap: 'square', join: 'bevel' })
        .content(),
    ).toContain('1 w 2 J 2 j');
  });

  it('fills by the nonzero rule or the even-odd rule', () => {
    expect(new PdfCanvas().fill(square, [1, 0, 0]).content().split('\n').at(-1)).toBe('f');
    expect(new PdfCanvas().fill(square, [1, 0, 0], true).content().split('\n').at(-1)).toBe('f*');
  });
});

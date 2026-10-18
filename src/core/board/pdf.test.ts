import { describe, expect, it } from 'vitest';
import { PdfCanvas, PdfDocument } from './pdf';
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

  it('writes invisible text in WinAnsi, upright in the y-down page', () => {
    const c = new PdfCanvas().invisibleText('Tür „1“ (a\\b) – 2 × 3 € −', 10, 20, 3.5);
    expect(c.hasText).toBe(true);
    expect(c.content()).toBe(
      'BT /T1 3.5 Tf 3 Tr 1 0 0 -1 10 20 Tm ' +
        '(T\\374r \\2041\\223 \\(a\\\\b\\) \\226 2 \\327 3 \\200 -) Tj ET',
    );
    expect(new PdfCanvas().invisibleText('  ', 0, 0, 3).hasText).toBe(false);
  });
});

describe('PDF document', () => {
  it('references the text font only from pages with text', () => {
    const doc = new PdfDocument('Test');
    doc.addPage(10, 10, (c) => c.fill(square, [0, 0, 0]));
    doc.addPage(10, 10, (c) => c.invisibleText('Hallo', 1, 5, 3));
    const pdf = new TextDecoder('latin1').decode(doc.toBytes());
    const pages = pdf.match(/\/Type \/Page .*/g)!;
    expect(pages[0]).toContain('/Resources << >>');
    expect(pages[1]).toMatch(/\/Resources << \/Font << \/T1 \d+ 0 R >> >>/);
    const widths = /\/FirstChar 32 \/LastChar 255 \/Widths \[([\d ]+)\]/.exec(pdf);
    expect(widths![1]!.split(' ')).toHaveLength(224);
  });
});

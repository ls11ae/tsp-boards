import { describe, expect, it } from 'vitest';
import { circlePath, compose, apply, pathBounds, rotate, svgPathData, translate } from './shapes';
import { FONT_METRICS, measureText, textPath, wrapText } from './text';

describe('paths', () => {
  it('composes and rotates matrices', () => {
    const m = compose(translate(10, 0), rotate(Math.PI / 2));
    const [x, y] = apply(m, 1, 0);
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(1);
    const [rx, ry] = apply(rotate(Math.PI, 5, 5), 6, 5);
    expect(rx).toBeCloseTo(4);
    expect(ry).toBeCloseTo(5);
  });

  it('bounds a circle', () => {
    expect(pathBounds(circlePath(10, 20, 3))).toEqual([7, 17, 13, 23]);
  });

  it('writes compact SVG path data', () => {
    expect(svgPathData([['M', 1.5, 2], ['L', -0.0001, 3.25], ['Z']])).toBe('M1.5 2L0 3.25Z');
  });
});

describe('text', () => {
  it('measures text proportionally to the size', () => {
    const a = measureText('Dortmund', 10);
    const b = measureText('Dortmund', 5);
    expect(a.width).toBeCloseTo(2 * b.width);
    expect(a.width).toBeGreaterThan(30);
    expect(a.width).toBeLessThan(50);
    // Ascender of 'd' above the cap height, no descender.
    expect(measureText('HEN', 10).inkTop).toBeCloseTo(-FONT_METRICS.capHeight * 10, 1);
    expect(a.inkTop).toBeLessThan(-FONT_METRICS.capHeight * 10);
    expect(a.inkBottom).toBeLessThan(0.5);
    expect(measureText('Jena', 10).inkBottom).toBeGreaterThan(0.5);
  });

  it('measures umlauts and unknown characters', () => {
    expect(measureText('Lübeck', 10).width).toBeGreaterThan(measureText('Lbeck', 10).width);
    expect(measureText('Ś', 10).width).toBeCloseTo(measureText('S', 10).width);
    expect(measureText('Ł', 10).width).toBeCloseTo(measureText('?', 10).width);
    expect(measureText('', 10).width).toBe(0);
  });

  it('places outlines at the anchor', () => {
    const m = measureText('Bonn', 8);
    const start = pathBounds(textPath('Bonn', 100, 50, 8))!;
    expect(start[0]).toBeCloseTo(100 + m.inkLeft, 1);
    expect(start[3]).toBeCloseTo(50 + m.inkBottom, 1);
    const end = pathBounds(textPath('Bonn', 100, 50, 8, { anchor: 'end' }))!;
    expect(end[2]).toBeCloseTo(100 - m.width + m.inkRight, 1);
    const middle = pathBounds(textPath('Bonn', 100, 50, 8, { anchor: 'middle' }))!;
    expect((middle[0] + middle[2]) / 2).toBeCloseTo(
      100 + (m.inkLeft + m.inkRight - m.width) / 2,
      1,
    );
    const vertical = pathBounds(textPath('Bonn', 100, 50, 8, { angle: Math.PI / 2 }))!;
    expect(vertical[1]).toBeCloseTo(50 + m.inkLeft, 1);
    expect(vertical[3]).toBeCloseTo(50 + m.inkRight, 1);
  });

  it('wraps text at spaces', () => {
    const lines = wrapText('eins zwei drei vier fünf', 5, measureText('eins zwei', 5).width + 0.1);
    expect(lines).toEqual(['eins zwei', 'drei vier', 'fünf']);
    expect(wrapText('a\nb', 5, 100)).toEqual(['a', 'b']);
  });
});

import { describe, expect, it } from 'vitest';
import { isColorLogo, parseColor, parseSvgColorLogo } from './logo-color';
import { parseSvgLogo } from './logo';
import { pathBounds } from './shapes';

// Hand-made logos (real logos never enter the repository).
const SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 50">
  <!-- a comment with <path d="M 0 0 L 999 999"/> is no shape -->
  <style><![CDATA[ .blue { fill: #003560 } path.x, .green { stroke: rgb(58%, 76%, 12%) } ]]></style>
  <defs>
    <g id="glyph"><path d="M 0 0 L 4 0 L 4 -6 L 0 -6 Z"/></g>
    <linearGradient id="grad"><stop offset="0" stop-color="#ff0000"/></linearGradient>
  </defs>
  <rect x="0" y="0" width="20" height="10" class="blue"/>
  <rect x="2" y="2" width="4" height="4" fill="#fff"/>
  <path d="M 30 0 L 40 0 L 40 10 L 30 10 Z M 32 2 L 38 2 L 38 8 L 32 8 Z" style="fill:#84b818;fill-rule:evenodd"/>
  <g fill="#003560" transform="translate(50 20)">
    <use xlink:href="#glyph" x="1" y="10"/>
    <use href="#glyph" x="6" y="10"/>
  </g>
  <g transform="scale(2)">
    <polyline points="5 15 10 20 15 15" fill="none" stroke="#c4022e" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="bevel"/>
  </g>
  <line x1="60" y1="40" x2="90" y2="40" class="green" stroke-width="2"/>
  <circle cx="80" cy="5" r="3" fill="url(#grad)"/>
  <rect x="90" y="0" width="5" height="5" fill="#000" fill-opacity="0.5"/>
  <rect x="0" y="45" width="5" height="5" fill="#000" display="none"/>
  <sodipodi:namedview pagecolor="#ffffff"><rect width="999" height="999"/></sodipodi:namedview>
</svg>`;

describe('colour logos (roadmap 9.10)', () => {
  const logo = parseSvgColorLogo(SVG);
  const fills = logo.parts.filter((p) => p.fill);
  const strokes = logo.parts.filter((p) => p.stroke);

  it('parses CSS colours', () => {
    expect(parseColor('#003560')).toEqual([0, 0x35 / 255, 0x60 / 255]);
    expect(parseColor('#fff')).toEqual([1, 1, 1]);
    expect(parseColor('rgb(100%, 50%, 0%)')).toEqual([1, 0.5, 0]);
    expect(parseColor('rgb(255 0 0)')).toEqual([1, 0, 0]);
    expect(parseColor('white')).toEqual([1, 1, 1]);
    expect(parseColor('url(#x)')).toBeNull();
  });

  it('keeps fills with their colours and rules, in drawing order', () => {
    const colors = fills.map((p) => p.fill!.map((c) => Math.round(c * 255)).join(','));
    expect(colors).toEqual([
      '0,53,96', // class rule
      '255,255,255', // a white knock-out stays (drawn on white paper)
      '132,184,24', // inline style, even-odd
      '0,53,96', // two glyphs by <use>
      '0,53,96',
      '255,0,0', // the gradient's first stop
      '128,128,128', // half-transparent black on white
    ]);
    expect(fills.map((p) => p.evenOdd)).toEqual([false, false, true, false, false, false, false]);
  });

  it('places <use> references at x, y with the transforms of their groups', () => {
    const [a, b] = fills.slice(3, 5).map((p) => pathBounds(p.path)!);
    expect(a).toEqual([51, 24, 55, 30]);
    expect(b).toEqual([56, 24, 60, 30]);
  });

  it('keeps strokes with width, caps and joins; polylines stay open', () => {
    expect(strokes).toHaveLength(2);
    const [poly, line] = strokes.map((p) => p.stroke!);
    expect(poly).toEqual({
      color: [0xc4 / 255, 2 / 255, 0x2e / 255],
      width: 1, // 0.5 scaled by 2
      cap: 'round',
      join: 'bevel',
      miterLimit: 4,
    });
    expect(strokes[0]!.path.some((c) => c[0] === 'Z')).toBe(false);
    expect(line!.color.map((c) => Math.round(c * 100))).toEqual([58, 76, 12]);
    expect(line!.cap).toBe('butt');
    expect(line!.join).toBe('miter');
  });

  it('skips comments, hidden shapes and editor metadata; the box holds the strokes', () => {
    expect(logo.box[0]).toBe(0);
    expect(logo.box[1]).toBe(0);
    // The line ends at x = 90 (the rect beyond it reaches 95), its width adds 1 below y = 40.
    expect(logo.box[2]).toBe(95);
    expect(logo.box[3]).toBe(41);
    expect(isColorLogo(logo)).toBe(true);
    expect(isColorLogo(parseSvgLogo(SVG))).toBe(false);
  });

  it('keeps the dark fills as the one-colour outline', () => {
    // Without the white knock-out: 6 dark fills (the grey rect counts as dark).
    const subpaths = logo.path.filter((c) => c[0] === 'M').length;
    expect(subpaths).toBe(1 + 2 + 1 + 1 + 1 + 1);
  });

  it('throws when nothing is drawn', () => {
    expect(() =>
      parseSvgColorLogo('<svg><rect width="5" height="5" fill="none"/></svg>'),
    ).toThrow();
  });
});

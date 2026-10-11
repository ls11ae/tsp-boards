import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCountryFile } from '../data';
import type { Point } from '../geometry';
import { boardProjection } from '../projection';
import { regionOutline } from '../region';
import { boardMapLines, subtractHoles } from './map-lines';

const file = parseCountryFile(
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '../../../public/data/countries/de.json'),
      'utf8',
    ),
  ),
);

describe('holes in line work', () => {
  const box: Point[] = [
    [10, -5],
    [20, -5],
    [20, 5],
    [10, 5],
  ];

  it('cuts a line crossing a box', () => {
    const out = subtractHoles(
      [
        [
          [0, 0],
          [30, 0],
        ],
      ],
      [box],
    );
    expect(out).toEqual([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [20, 0],
        [30, 0],
      ],
    ]);
  });

  it('keeps lines outside, removes lines inside, handles both orientations', () => {
    const outside: Point[][] = [
      [
        [0, 10],
        [30, 10],
      ],
    ];
    expect(subtractHoles(outside, [box])).toEqual(outside);
    expect(
      subtractHoles(
        [
          [
            [12, 0],
            [18, 0],
          ],
        ],
        [box],
      ),
    ).toEqual([]);
    const reversed = [...box].reverse();
    expect(
      subtractHoles(
        [
          [
            [0, 0],
            [15, 0],
            [15, 20],
          ],
        ],
        [reversed],
      ),
    ).toEqual([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [15, 5],
        [15, 20],
      ],
    ]);
  });

  it('merges overlapping holes', () => {
    const second = box.map(([x, y]) => [x + 5, y] as const);
    expect(
      subtractHoles(
        [
          [
            [0, 0],
            [40, 0],
          ],
        ],
        [box, second],
      ),
    ).toEqual([
      [
        [0, 0],
        [10, 0],
      ],
      [
        [25, 0],
        [40, 0],
      ],
    ]);
  });
});

describe('board map lines', () => {
  const board = { widthMm: 600, heightMm: 800, marginMm: 30 };
  const clip = [2, 2, 598, 798] as const;

  const segments = (lines: Point[][]) =>
    lines.flatMap((l) =>
      l.slice(1).map((q, i) => {
        const p = l[i]!;
        const a = `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
        const b = `${q[0].toFixed(2)},${q[1].toFixed(2)}`;
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      }),
    );

  for (const region of ['DE', 'DE-NW']) {
    it(`draws each border once, inside the board (${region})`, () => {
      const projection = boardProjection(regionOutline(file, region), board);
      const lines = boardMapLines(file, region, projection, clip);
      expect(lines.strong.length).toBeGreaterThan(0);
      expect(lines.thin.length).toBeGreaterThan(0);
      const all = [...lines.strong, ...lines.thin];
      for (const line of all) {
        for (const [x, y] of line) {
          expect(x).toBeGreaterThanOrEqual(clip[0] - 1e-6);
          expect(y).toBeGreaterThanOrEqual(clip[1] - 1e-6);
          expect(x).toBeLessThanOrEqual(clip[2] + 1e-6);
          expect(y).toBeLessThanOrEqual(clip[3] + 1e-6);
        }
      }
      // Zero-length pieces (from resampling) are not engraved twice.
      const keys = segments(all).filter((k) => k.split('|')[0] !== k.split('|')[1]);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
});

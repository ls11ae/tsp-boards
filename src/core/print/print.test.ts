import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import type { Point } from '../geometry';
import { CARD, RULER_URL, TSP_URL, cardOrigins, cardPages, type MiniMap } from './cards';
import { layoutDocument, type Block, type PageItem } from './document';
import { polygonArea, voronoiCells } from './voronoi';

/**
 * The QR codes on pages, read back: the drawn modules (filled rectangles) rasterised at
 * 8 pixels per mm with their quiet zone, then decoded.
 */
function decodeQrCodes(items: readonly PageItem[]): { url: string; decoded: string | null }[] {
  return items
    .filter((i) => i.qr !== undefined)
    .map((item) => {
      const xs = item.path.flatMap((c) => (c[0] === 'M' || c[0] === 'L' ? [c[1]] : []));
      const ys = item.path.flatMap((c) => (c[0] === 'M' || c[0] === 'L' ? [c[2]] : []));
      const pad = 3;
      const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
      const px = 8;
      const size = Math.ceil((Math.max(...xs) + pad - x0) * px);
      const data = new Uint8ClampedArray(size * size * 4).fill(255);
      // Each run of dark modules is a rectangle: M, L, L, L, Z.
      for (let k = 0; k + 3 < item.path.length; k++) {
        const c = item.path[k]!;
        if (c[0] !== 'M') continue;
        const corners = item.path.slice(k, k + 4) as readonly (readonly [
          'M' | 'L',
          number,
          number,
        ])[];
        const rx = corners.map((p) => p[1]);
        const ry = corners.map((p) => p[2]);
        for (
          let y = Math.round((Math.min(...ry) - y0) * px);
          y < Math.round((Math.max(...ry) - y0) * px);
          y++
        )
          for (
            let x = Math.round((Math.min(...rx) - x0) * px);
            x < Math.round((Math.max(...rx) - x0) * px);
            x++
          ) {
            const i = (y * size + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
      }
      return { url: item.qr!, decoded: jsQR(data, size, size)?.data ?? null };
    });
}

const MAP: MiniMap = {
  width: 100,
  height: 120,
  lines: [
    [
      [10, 10],
      [90, 10],
      [90, 110],
      [10, 110],
      [10, 10],
    ],
  ],
  points: [
    [20, 20],
    [80, 30],
    [60, 100],
    [25, 90],
  ],
  tour: [0, 1, 2, 3],
  caption: 'Testkarte',
};

describe('take-away cards (roadmap 9.19)', () => {
  it('carry QR codes that decode to both games', () => {
    const [front, back] = cardPages({ map: MAP, logos: [] });
    const codes = [...decodeQrCodes(front!.items), ...decodeQrCodes(back!.items)];
    expect(codes).toHaveLength(8);
    for (const c of codes) expect(c.decoded).toBe(c.url);
    expect(new Set(codes.map((c) => c.url))).toEqual(new Set([TSP_URL, RULER_URL]));
  });

  it('put four cards on a sheet, the back mirrored for printing on both sides', () => {
    const front = cardOrigins(false);
    const back = cardOrigins(true);
    expect(front).toHaveLength(4);
    // Card k of the back lies behind card k of the front when the sheet turns on its long edge.
    front.forEach(([x, y], k) => {
      expect(back[k]![1]).toBe(y);
      expect(back[k]![0] + CARD[0]).toBeCloseTo(210 - x, 9);
    });
  });
});

describe('Voronoi regions', () => {
  it('cover the field, each site inside its own region', () => {
    const sites: Point[] = [
      [9, 9],
      [27, 6],
      [50, 11],
      [16, 29],
      [38, 24],
    ];
    const cells = voronoiCells(sites, [0, 0, 64, 40]);
    const total = cells.reduce((s, c) => s + polygonArea(c), 0);
    expect(total).toBeCloseTo(64 * 40, 6);
    cells.forEach((cell, i) => {
      const [x, y] = sites[i]!;
      // Inside a convex polygon: on the same side of every edge.
      const sides = cell.map((p, k) => {
        const q = cell[(k + 1) % cell.length]!;
        return Math.sign((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]));
      });
      expect(new Set(sides.filter((s) => s !== 0)).size).toBe(1);
    });
  });
});

describe('printed guides', () => {
  it('flow over pages with page numbers and decodable QR codes', () => {
    const blocks: Block[] = [
      { kind: 'title', text: 'Test', subtitle: 'Untertitel' },
      ...Array.from({ length: 60 }, (_, i): Block => ({
        kind: 'p',
        text: `Absatz ${i} mit etwas Text.`,
      })),
      { kind: 'checks', items: ['eins', 'zwei'] },
      { kind: 'qr', url: TSP_URL, caption: 'TSP Boards' },
    ];
    const pages = layoutDocument({ title: 'T', header: 'H', footer: 'F', blocks });
    expect(pages.length).toBeGreaterThan(1);
    const codes = pages.flatMap((p) => decodeQrCodes(p.items));
    expect(codes).toEqual([{ url: TSP_URL, decoded: TSP_URL }]);
  });
});

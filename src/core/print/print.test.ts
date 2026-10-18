import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzlibSync } from 'fflate';
import type { Point } from '../geometry';
import { QR_QUIET, qrMatrix } from '../board/qr';
import { measureText } from '../board/text';
import { CARD, EVENT, RULER_URL, TSP_URL, cardOrigins, cardPages, type MiniMap } from './cards';
import { documentPdf, layoutDocument, wrapLines, type Block, type PageItem } from './document';
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
};

/** Top edge of a QR code's modules and its bottom edge with the quiet zone (mm). */
function qrBox(item: PageItem): { top: number; bottom: number } {
  const ys = item.path.flatMap((c) => (c[0] === 'M' || c[0] === 'L' ? [c[2]] : []));
  const [top, end] = [Math.min(...ys), Math.max(...ys)];
  const cell = (end - top) / qrMatrix(item.qr!).length;
  return { top, bottom: end + QR_QUIET * cell };
}

describe('take-away cards (roadmap 9.19)', () => {
  it('carry QR codes that decode to both games', () => {
    const [front, back] = cardPages({ map: MAP, logos: [] });
    const codes = [...decodeQrCodes(front!.items), ...decodeQrCodes(back!.items)];
    expect(codes).toHaveLength(8);
    for (const c of codes) expect(c.decoded).toBe(c.url);
    expect(new Set(codes.map((c) => c.url))).toEqual(new Set([TSP_URL, RULER_URL]));
  });

  it('align each address with the top of its QR code and name the open day below both', () => {
    const pages = cardPages({ map: MAP, logos: [] });
    for (const page of pages) {
      const codes = page.items.filter((i) => i.qr !== undefined);
      const addresses = page.items.filter((i) => i.text?.value.startsWith('ls11ae.github.io/'));
      const events = page.items.filter((i) => i.text?.value === EVENT);
      expect(codes).toHaveLength(4);
      expect(addresses).toHaveLength(4);
      expect(events).toHaveLength(4);
      codes.forEach((code, k) => {
        const { top, bottom } = qrBox(code);
        const address = addresses[k]!.text!;
        const ink = measureText(address.value, address.size);
        expect(address.y + ink.inkTop).toBeCloseTo(top, 6);
        const event = events[k]!.text!;
        const eventInk = measureText(event.value, event.size);
        // Below the code's quiet zone, inside the card, above the names at the bottom.
        expect(event.y + eventInk.inkTop).toBeGreaterThan(bottom);
        expect(eventInk.inkRight).toBeLessThan(CARD[0] - 10 + 1e-9);
        const names = page.items.filter(
          (i) => i.text?.value.startsWith('TU Dortmund ·') && Math.abs(i.text.x - event.x) < 1e-9,
        );
        const below = names.filter((i) => i.text!.y > event.y && i.text!.y < event.y + 15);
        expect(below.length).toBeGreaterThan(0);
      });
    }
    // The lines removed in 9.21 stay away.
    const all = pages.flatMap((p) => p.items.map((i) => i.text?.value ?? ''));
    for (const gone of ['Im Browser', 'Mehr Spiele', 'Wem gehört'])
      expect(all.some((t) => t.includes(gone))).toBe(false);
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
  it('keep their text selectable: commands and addresses as text in the PDF', () => {
    const command = 'chrome --kiosk "https://ls11ae.github.io/tsp-boards/#kiosk?table=1"';
    const { pdf, pages } = documentPdf({
      title: 'T',
      header: 'Kopf',
      footer: 'Fuß',
      blocks: [
        { kind: 'p', text: 'Größe: 300 × 600 mm' },
        { kind: 'code', text: command },
      ],
    });
    const texts = pages[0]!.items.flatMap((i) => (i.text ? [i.text.value] : []));
    expect(texts).toEqual(expect.arrayContaining([command, 'Größe: 300 × 600 mm', 'Kopf', 'Fuß']));
    // The content stream (Flate) holds the command as a string shown in render mode 3.
    // One character per byte (TextDecoder's latin1 is windows-1252).
    const raw = Array.from(pdf, (b) => String.fromCharCode(b)).join('');
    const streams = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) =>
      strFromU8(unzlibSync(Uint8Array.from(m[1]!, (ch) => ch.charCodeAt(0))), true),
    );
    const content = streams.find((c) => c.includes(' Tj '))!;
    expect(content).toContain(`3 Tr`);
    expect(content).toContain(`(${command}) Tj`);
    expect(content).toContain('(Gr\\366\\337e: 300 \\327 600 mm) Tj');
  });

  it('break file names and addresses wider than a line after a hyphen or slash', () => {
    const name = 'exzellenzstrategie-2027-logo-bed.svg';
    const lines = wrapLines(name, 3.1, measureText(name, 3.1).width * 0.7);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(name);
    expect(lines[0]!.endsWith('-')).toBe(true);
  });

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

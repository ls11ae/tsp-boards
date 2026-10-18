// Take-away cards for the booth (roadmap 9.19): A7 cards, four on an A4 sheet with cut marks,
// printed on both sides. The front invites to TSP Boards (a mini map with a shortest round trip
// from one of the puzzles), the back to Ruler of the Plane (castles with their Voronoi regions);
// both with a QR code and the address, and the logos (TU Dortmund, the faculty, Chair 11) or,
// without logo files, their names. German only.

import type { Point } from '../geometry';
import type { Logo } from '../board/logo';
import type { Rgb } from '../board/pdf';
import { PdfDocument } from '../board/pdf';
import { circlePath, polygonPath, polylinePath, rectPath, type PathCommand } from '../board/shapes';
import { textPath, wrapText } from '../board/text';
import { A4, INK, MUTED, drawItems, logoItems, qrItem, type Page, type PageItem } from './document';
import { voronoiCells } from './voronoi';

export const CARD: readonly [number, number] = [74, 105];
const GUTTER = 10;
const MARK = 4;
const MARK_GAP = 1.5;

export const TSP_URL = 'https://ls11ae.github.io/tsp-boards/';
export const RULER_URL = 'https://ls11ae.github.io/ruler-of-the-plane/';

/** A mini map: lines (outline), places and a round trip in its own mm. */
export interface MiniMap {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly (readonly Point[])[];
  readonly points: readonly Point[];
  /** The shortest round trip (indices into points). */
  readonly tour: readonly number[];
  /** What the map shows, e.g. "Deutschland: 40 Städte". */
  readonly caption: string;
}

export interface CardsInput {
  readonly map: MiniMap;
  /** TU Dortmund, the faculty, Chair 11 (missing ones are left out; none: their names). */
  readonly logos: readonly (Logo | null)[];
}

const TOUR: Rgb = [0.72, 0.18, 0.12];
const SENDER = 'TU Dortmund · Fakultät für Informatik · Lehrstuhl 11 Algorithm Engineering';

/** Card origins on the sheet (2 × 2, centred); the back mirrors the columns (long-edge flip). */
export function cardOrigins(back: boolean): Point[] {
  const [W, H] = A4;
  const [w, h] = CARD;
  const x0 = (W - 2 * w - GUTTER) / 2;
  const y0 = (H - 2 * h - GUTTER) / 2;
  const out: Point[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 2; c++) {
      const col = back ? 1 - c : c;
      out.push([x0 + col * (w + GUTTER), y0 + r * (h + GUTTER)]);
    }
  return out;
}

/** Cut marks at the corners of every card, outside the card. */
function cutMarks(origins: readonly Point[]): PageItem {
  const [w, h] = CARD;
  const path: PathCommand[] = [];
  for (const [x, y] of origins) {
    for (const [cx, cy, dx, dy] of [
      [x, y, -1, -1],
      [x + w, y, 1, -1],
      [x, y + h, -1, 1],
      [x + w, y + h, 1, 1],
    ] as const) {
      path.push(['M', cx + dx * MARK_GAP, cy], ['L', cx + dx * (MARK_GAP + MARK), cy]);
      path.push(['M', cx, cy + dy * MARK_GAP], ['L', cx, cy + dy * (MARK_GAP + MARK)]);
    }
  }
  return { path, stroke: { color: [0, 0, 0], width: 0.15 } };
}

const text = (value: string, x: number, y: number, size: number, color: Rgb = INK): PageItem => ({
  path: textPath(value, x, y, size),
  fill: color,
});

function lines(value: string, x: number, y: number, size: number, width: number, color: Rgb = INK) {
  return wrapText(value, size, width).map((line, i) =>
    text(line, x, y + i * 1.3 * size, size, color),
  );
}

/** The logos in a row at the bottom of a card, or the names without logo files. */
function footer(x: number, y: number, logos: readonly (Logo | null)[]): PageItem[] {
  const [w, h] = CARD;
  const present = logos.filter((l): l is Logo => l !== null);
  const top = y + h - 14;
  if (present.length === 0) return lines(SENDER, x + 5, top + 7, 2.3, w - 10, MUTED);
  const slot = (w - 10) / present.length;
  return present.flatMap((logo, i) =>
    logoItems(logo, [x + 5 + i * slot + 1, top + 2, x + 5 + (i + 1) * slot - 1, top + 11]),
  );
}

/** The front: TSP Boards with the mini map. */
export function frontCard(x: number, y: number, input: CardsInput): PageItem[] {
  const [w] = CARD;
  const items: PageItem[] = [];
  items.push(text('TSP Boards', x + 5, y + 11, 7));
  items.push(...lines('Finde die kürzeste Rundreise!', x + 5, y + 17, 3.6, w - 10));
  // The mini map, fitted into its box.
  const m = input.map;
  const box: [number, number, number, number] = [x + 5, y + 21, x + w - 5, y + 62];
  const k = Math.min((box[2] - box[0]) / m.width, (box[3] - box[1]) / m.height);
  const ox = box[0] + (box[2] - box[0] - k * m.width) / 2;
  const oy = box[1] + (box[3] - box[1] - k * m.height) / 2;
  const at = (p: Point): Point => [ox + k * p[0], oy + k * p[1]];
  for (const line of m.lines)
    items.push({ path: polylinePath(line.map(at)), stroke: { color: MUTED, width: 0.2 } });
  items.push({
    path: polylinePath(
      m.tour.map((i) => at(m.points[i]!)),
      true,
    ),
    stroke: { color: TOUR, width: 0.45 },
  });
  for (const p of m.points) {
    const [px, py] = at(p);
    items.push({ path: circlePath(px, py, 0.7), fill: [1, 1, 1] });
    items.push({ path: circlePath(px, py, 0.7), stroke: { color: INK, width: 0.2 } });
  }
  items.push(...lines(m.caption, x + 5, y + 65.5, 2.3, w - 10, MUTED));
  // QR code and address.
  items.push(qrItem(TSP_URL, x + 3, y + 67, 24));
  items.push(...lines('Im Browser spielen – auch auf dem Handy:', x + 28, y + 74, 2.8, w - 32));
  items.push(...lines('ls11ae.github.io/tsp-boards', x + 28, y + 84, 2.8, w - 32, TOUR));
  items.push(...footer(x, y, input.logos));
  return items;
}

/** A small castle (a keep with battlements) standing at (x, y). */
function castle(x: number, y: number, s: number): PathCommand[] {
  const w = 2.4 * s;
  const h = 2.2 * s;
  const left = x - w / 2;
  const top = y - h;
  const tooth = w / 5;
  const pts: Point[] = [
    [left, y],
    [left, top],
    [left + tooth, top],
    [left + tooth, top + 0.5 * s],
    [left + 2 * tooth, top + 0.5 * s],
    [left + 2 * tooth, top],
    [left + 3 * tooth, top],
    [left + 3 * tooth, top + 0.5 * s],
    [left + 4 * tooth, top + 0.5 * s],
    [left + 4 * tooth, top],
    [left + w, top],
    [left + w, y],
  ];
  return polygonPath(pts);
}

/** Castles of Ruler of the Plane (in a 64 × 40 mm field, mm). */
const CASTLES: readonly Point[] = [
  [9, 9],
  [27, 6],
  [50, 11],
  [16, 29],
  [38, 24],
  [57, 33],
  [31, 36],
];
const REGIONS: readonly Rgb[] = [
  [0.86, 0.91, 0.97],
  [0.97, 0.89, 0.83],
  [0.88, 0.95, 0.86],
  [0.98, 0.94, 0.8],
  [0.92, 0.88, 0.96],
  [0.85, 0.94, 0.94],
  [0.96, 0.87, 0.9],
];

/** The back: Ruler of the Plane with castles and their regions. */
export function backCard(x: number, y: number, input: CardsInput): PageItem[] {
  const [w] = CARD;
  const items: PageItem[] = [];
  items.push(text('Ruler of the Plane', x + 5, y + 11, 6.2));
  items.push(...lines('Spiele zur algorithmischen Geometrie', x + 5, y + 17, 3.4, w - 10));
  const field: [number, number, number, number] = [0, 0, 64, 40];
  const at = (p: Point): Point => [x + 5 + p[0], y + 22 + p[1]];
  voronoiCells(CASTLES, field).forEach((cell, i) => {
    const path = polygonPath(cell.map(at));
    items.push({ path, fill: REGIONS[i % REGIONS.length]! });
    items.push({ path, stroke: { color: MUTED, width: 0.25 } });
  });
  for (const c of CASTLES) {
    const [cx, cy] = at(c);
    items.push({ path: castle(cx, cy + 1.2, 1.1), fill: INK });
  }
  items.push({ path: rectPath(x + 5, y + 22, 64, 40), stroke: { color: INK, width: 0.25 } });
  items.push(
    ...lines(
      'Wem gehört welches Land? Jede Burg herrscht über die Punkte, die ihr am nächsten sind.',
      x + 5,
      y + 65.5,
      2.3,
      w - 10,
      MUTED,
    ),
  );
  items.push(qrItem(RULER_URL, x + 3, y + 70, 24));
  items.push(...lines('Mehr Spiele vom Lehrstuhl:', x + 28, y + 77, 2.8, w - 32));
  items.push(...lines('ls11ae.github.io/ruler-of-the-plane', x + 28, y + 85, 2.6, w - 32, TOUR));
  items.push(...footer(x, y, input.logos));
  return items;
}

/** The two pages: four fronts, then four backs (mirrored for printing on both sides). */
export function cardPages(input: CardsInput): Page[] {
  const fronts = cardOrigins(false);
  const backs = cardOrigins(true);
  const note = (value: string): PageItem => text(value, 10, A4[1] - 8, 2.4, MUTED);
  return [
    {
      items: [
        cutMarks(fronts),
        ...fronts.flatMap(([x, y]) => frontCard(x, y, input)),
        note(
          'Beidseitig drucken (an der langen Kante wenden), 100 %, dann an den Marken schneiden.',
        ),
      ],
    },
    { items: [cutMarks(backs), ...backs.flatMap(([x, y]) => backCard(x, y, input))] },
  ];
}

export function cardsPdf(input: CardsInput): {
  readonly pdf: Uint8Array<ArrayBuffer>;
  readonly pages: Page[];
} {
  const pages = cardPages(input);
  const pdf = new PdfDocument('TSP Boards und Ruler of the Plane – Karten');
  for (const p of pages) pdf.addPage(A4[0], A4[1], (c) => drawItems(c, p.items));
  return { pdf: pdf.toBytes(), pages };
}

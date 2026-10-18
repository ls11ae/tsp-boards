// Printed guides (roadmap 9.19): a small layout engine for A4 documents made of blocks
// (headings, paragraphs, numbered steps, bullets, check boxes, tables, notes, command lines,
// figures, QR codes) that flow over pages. Text is set with the board font as outlines (no
// embedded fonts), as for the solution sheets, with invisible text over it so it can be selected
// and copied; the font has no arrows or check marks, so check boxes are drawn. Logos are drawn in
// their colours (logos come only from local files).

import { isColorLogo } from '../board/logo-color';
import type { Logo } from '../board/logo';
import { PdfCanvas, PdfDocument, type Rgb } from '../board/pdf';
import { qrMatrix, qrPath } from '../board/qr';
import { rectPath, transformPath, type Matrix, type PathCommand } from '../board/shapes';
import { FONT_METRICS, measureText, textPath, wrapText } from '../board/text';

export const A4: readonly [number, number] = [210, 297];

export const INK: Rgb = [0.1, 0.1, 0.1];
export const MUTED: Rgb = [0.42, 0.42, 0.4];
export const RULE: Rgb = [0.78, 0.77, 0.74];
export const SHADE: Rgb = [0.94, 0.93, 0.9];
export const ACCENT: Rgb = [0.71, 0.28, 0.17];

/** A figure drawn into its box (mm, y down). */
export type Draw = (c: PdfCanvas, x: number, y: number, width: number, height: number) => void;

export type Block =
  | { readonly kind: 'title'; readonly text: string; readonly subtitle?: string }
  | { readonly kind: 'h1' | 'h2'; readonly text: string }
  | { readonly kind: 'p'; readonly text: string }
  /** A framed hint. */
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'steps'; readonly items: readonly string[]; readonly start?: number }
  | { readonly kind: 'bullets'; readonly items: readonly string[] }
  /** Items with an empty box to tick by hand. */
  | { readonly kind: 'checks'; readonly items: readonly string[] }
  | {
      readonly kind: 'table';
      readonly rows: readonly (readonly string[])[];
      /** Column widths as fractions of the text width. */
      readonly widths: readonly number[];
      /** The first row is a header (shaded). */
      readonly header?: boolean;
      /** Lines between the columns and around the table, rows at least this high: to fill in. */
      readonly fillIn?: number;
    }
  /** A command or an address to type, in a shaded box. */
  | { readonly kind: 'code'; readonly text: string }
  | {
      readonly kind: 'figure';
      readonly height: number;
      readonly draw: Draw;
      readonly caption?: string;
    }
  | { readonly kind: 'qr'; readonly url: string; readonly caption: string }
  | { readonly kind: 'page' };

export interface PrintDocument {
  readonly title: string;
  /** Logos at the top of every page (left, right); without them a text line. */
  readonly logos?: { readonly left?: Logo | null; readonly right?: Logo | null };
  readonly header: string;
  readonly footer: string;
  readonly blocks: readonly Block[];
}

const MARGIN_X = 20;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 16;
const HEADER = 14;
const FOOTER = 8;
const BODY = 3.7;
const SMALL = 3.1;
const CODE_MIN = 2.7;
const LINE = 1.32;
const H1 = 6.2;
const H2 = 4.7;
const TITLE = 9;

/** A drawing on a page: filled or stroked paths (mm, y down). */
export interface PageItem {
  readonly path: readonly PathCommand[];
  readonly fill?: Rgb;
  readonly stroke?: { readonly color: Rgb; readonly width: number; readonly dash?: number[] };
  /** A QR code and its text (the tests decode it). */
  readonly qr?: string;
  /** Drawn by a figure's own function. */
  readonly draw?: (c: PdfCanvas) => void;
  /** The text the outlines show, laid over them as invisible text (baseline at x, y). */
  readonly text?: PageText;
}

export interface PageText {
  readonly value: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** Text as outlines with the same text over it, selectable; baseline at (x, y). */
export function textItem(
  value: string,
  x: number,
  y: number,
  size: number,
  color: Rgb = INK,
  anchor: 'start' | 'end' = 'start',
): PageItem {
  const start = anchor === 'end' ? x - measureText(value, size).width : x;
  return { path: textPath(value, start, y, size), fill: color, text: { value, x: start, y, size } };
}

const BREAK_AFTER = /[-/\\_.]/;

/**
 * Wrapped lines: at spaces, and a word wider than the line (a file name, an address) after a
 * hyphen, slash, underscore or dot, else anywhere.
 */
export function wrapLines(value: string, size: number, maxWidth: number): string[] {
  return wrapText(value, size, maxWidth).flatMap((line) => {
    const out: string[] = [];
    let rest = line;
    while (measureText(rest, size).width > maxWidth && rest.length > 1) {
      const chars = [...rest];
      let fit = 1;
      while (
        fit < chars.length &&
        measureText(chars.slice(0, fit + 1).join(''), size).width <= maxWidth
      )
        fit++;
      let cut = fit;
      while (cut > 1 && !BREAK_AFTER.test(chars[cut - 1]!)) cut--;
      if (cut <= 1) cut = fit;
      out.push(chars.slice(0, cut).join(''));
      rest = chars.slice(cut).join('');
    }
    out.push(rest);
    return out;
  });
}

export interface Page {
  readonly items: PageItem[];
}

/** A logo fitted into the box (aspect kept, centred): in its colours, or in ink. */
export function logoItems(logo: Logo, box: readonly [number, number, number, number]): PageItem[] {
  const [x0, y0, x1, y1] = logo.box;
  const k = Math.min((box[2] - box[0]) / (x1 - x0), (box[3] - box[1]) / (y1 - y0));
  const m: Matrix = [
    k,
    0,
    0,
    k,
    box[0] + (box[2] - box[0] - k * (x1 - x0)) / 2 - k * x0,
    box[1] + (box[3] - box[1] - k * (y1 - y0)) / 2 - k * y0,
  ];
  if (!isColorLogo(logo)) return [{ path: transformPath(logo.path, m), fill: INK }];
  const out: PageItem[] = [];
  for (const part of logo.parts) {
    const path = transformPath(part.path, m);
    if (part.fill) out.push({ path, fill: part.fill });
    if (part.stroke)
      out.push({
        path,
        stroke: { color: part.stroke.color, width: Math.max(0.2, part.stroke.width * k) },
      });
  }
  return out;
}

/** A QR code with its quiet zone, `size` mm wide, at (x, y). */
export function qrItem(url: string, x: number, y: number, size: number): PageItem {
  return { path: qrPath(qrMatrix(url), x, y, size), fill: [0, 0, 0], qr: url };
}

/** The blocks laid out on A4 pages. */
export function layoutDocument(doc: PrintDocument): Page[] {
  const [W, H] = A4;
  const width = W - 2 * MARGIN_X;
  const top = MARGIN_TOP + HEADER;
  const bottom = H - MARGIN_BOTTOM - FOOTER;
  const pages: Page[] = [];
  let page: Page = { items: [] };
  let y = top;
  const newPage = () => {
    pages.push(page);
    page = { items: [] };
    y = top;
  };
  const room = (h: number) => {
    if (y + h > bottom && y > top) newPage();
  };
  const text = (value: string, x: number, baseline: number, size: number, color = INK) =>
    page.items.push(textItem(value, x, baseline, size, color));
  /** Wrapped lines at (x, y), returns the height. */
  const lines = (value: string, x: number, w: number, size: number, color = INK): number => {
    const list = wrapLines(value, size, w);
    let h = 0;
    for (const line of list) {
      room(LINE * size);
      text(line, x, y + FONT_METRICS.ascender * size, size, color);
      y += LINE * size;
      h += LINE * size;
    }
    return h;
  };
  const height = (value: string, w: number, size: number) =>
    wrapLines(value, size, w).length * LINE * size;

  doc.blocks.forEach((block, i) => {
    const next = doc.blocks[i + 1];
    switch (block.kind) {
      case 'page':
        if (y > top) newPage();
        break;
      case 'title':
        room(TITLE * 3);
        text(block.text, MARGIN_X, y + FONT_METRICS.ascender * TITLE, TITLE);
        y += LINE * TITLE;
        if (block.subtitle) {
          y += 1;
          lines(block.subtitle, MARGIN_X, width, H2, MUTED);
        }
        y += 4;
        break;
      case 'h1':
      case 'h2': {
        const size = block.kind === 'h1' ? H1 : H2;
        // Keep a heading with the start of what follows.
        const keep = LINE * size + (next && next.kind !== 'page' ? 18 : 0);
        if (y + keep > bottom) newPage();
        y += block.kind === 'h1' ? 3 : 2;
        text(
          block.text,
          MARGIN_X,
          y + FONT_METRICS.ascender * size,
          size,
          block.kind === 'h1' ? ACCENT : INK,
        );
        y += LINE * size + 1.2;
        break;
      }
      case 'p':
        // A paragraph that introduces what follows (ending in a colon) stays with its start.
        if (block.text.endsWith(':') && next && next.kind !== 'page')
          room(height(block.text, width, BODY) + 3 * LINE * BODY);
        lines(block.text, MARGIN_X, width, BODY);
        y += 0.5 * BODY;
        break;
      case 'note': {
        const pad = 3;
        const h = height(block.text, width - 2 * pad, BODY) + 2 * pad;
        room(h);
        page.items.push({ path: rectPath(MARGIN_X, y, width, h, 1.5), fill: SHADE });
        page.items.push({ path: rectPath(MARGIN_X, y, 1.2, h), fill: ACCENT });
        y += pad;
        lines(block.text, MARGIN_X + pad + 1, width - 2 * pad - 1, BODY);
        y += pad + 0.6 * BODY;
        break;
      }
      case 'steps':
      case 'bullets':
      case 'checks': {
        const indent = block.kind === 'bullets' ? 5 : 8;
        block.items.forEach((item, k) => {
          room(Math.min(height(item, width - indent, BODY), 3 * LINE * BODY));
          const baseline = y + FONT_METRICS.ascender * BODY;
          if (block.kind === 'steps')
            text(`${(block.start ?? 1) + k}.`, MARGIN_X, baseline, BODY, ACCENT);
          else if (block.kind === 'bullets') text('•', MARGIN_X + 0.8, baseline, BODY);
          else
            page.items.push({
              path: rectPath(
                MARGIN_X + 0.5,
                baseline - FONT_METRICS.capHeight * BODY - 0.4,
                3.6,
                3.6,
                0.4,
              ),
              stroke: { color: INK, width: 0.3 },
            });
          lines(item, MARGIN_X + indent, width - indent, BODY);
          y += 0.35 * BODY;
        });
        y += 0.4 * BODY;
        break;
      }
      case 'code': {
        const pad = 2.2;
        // On one line where it fits at a slightly smaller size, so it copies as one command.
        const fit = (SMALL * (width - 2 * pad)) / measureText(block.text, SMALL).width;
        const size = Math.min(SMALL, Math.max(CODE_MIN, fit));
        const h = height(block.text, width - 2 * pad, size) + 2 * pad;
        room(h);
        page.items.push({ path: rectPath(MARGIN_X, y, width, h, 1), fill: SHADE });
        y += pad;
        lines(block.text, MARGIN_X + pad, width - 2 * pad, size);
        y += pad + 0.6 * BODY;
        break;
      }
      case 'table': {
        const pad = 1.4;
        const cols = block.widths.map((f) => f * width);
        block.rows.forEach((row, r) => {
          const h = Math.max(
            Math.max(...row.map((cell, c) => height(cell, cols[c]! - 2 * pad, SMALL))) + 2 * pad,
            block.fillIn && !(block.header && r === 0) ? block.fillIn : 0,
          );
          room(h);
          if (block.header && r === 0)
            page.items.push({ path: rectPath(MARGIN_X, y, width, h), fill: SHADE });
          let x = MARGIN_X;
          const rowTop = y;
          row.forEach((cell, c) => {
            y = rowTop + pad;
            for (const line of wrapLines(cell, SMALL, cols[c]! - 2 * pad)) {
              text(line, x + pad, y + FONT_METRICS.ascender * SMALL, SMALL);
              y += LINE * SMALL;
            }
            x += cols[c]!;
          });
          y = rowTop + h;
          const rules: PathCommand[] = [
            ['M', MARGIN_X, y],
            ['L', MARGIN_X + width, y],
          ];
          if (block.fillIn) {
            // The top of the first row on a page, and the column lines.
            if (r === 0 || rowTop === top)
              rules.push(['M', MARGIN_X, rowTop], ['L', MARGIN_X + width, rowTop]);
            let cx = MARGIN_X;
            for (const w of [0, ...cols]) {
              cx += w;
              rules.push(['M', cx, rowTop], ['L', cx, y]);
            }
          }
          page.items.push({
            path: rules,
            stroke: { color: block.fillIn ? MUTED : RULE, width: 0.25 },
          });
        });
        y += 0.8 * BODY;
        break;
      }
      case 'figure': {
        const capH = block.caption ? height(block.caption, width, SMALL) + 1.5 : 0;
        room(block.height + capH);
        const [fx, fy, fh] = [MARGIN_X, y, block.height];
        page.items.push({ path: [], draw: (c) => block.draw(c, fx, fy, width, fh) });
        y += block.height + 1.5;
        if (block.caption) lines(block.caption, MARGIN_X, width, SMALL, MUTED);
        y += 0.8 * BODY;
        break;
      }
      case 'qr': {
        const size = 30;
        room(size);
        page.items.push(qrItem(block.url, MARGIN_X - 2, y, size));
        const save = y;
        y += 6;
        lines(block.caption, MARGIN_X + size + 2, width - size - 2, BODY);
        lines(block.url, MARGIN_X + size + 2, width - size - 2, SMALL, MUTED);
        y = Math.max(y, save + size) + 0.5 * BODY;
        break;
      }
    }
  });
  if (page.items.length > 0) pages.push(page);
  // Header and footer on every page.
  pages.forEach((p, k) => {
    const logos = doc.logos;
    if (logos?.left)
      p.items.push(
        ...logoItems(logos.left, [MARGIN_X, MARGIN_TOP - 4, MARGIN_X + 45, MARGIN_TOP + 8]),
      );
    if (logos?.right)
      p.items.push(
        ...logoItems(logos.right, [
          W - MARGIN_X - 45,
          MARGIN_TOP - 4,
          W - MARGIN_X,
          MARGIN_TOP + 8,
        ]),
      );
    if (!logos?.left && !logos?.right)
      p.items.push(textItem(doc.header, MARGIN_X, MARGIN_TOP + 2, SMALL, MUTED));
    const footY = H - MARGIN_BOTTOM + 2;
    p.items.push(textItem(doc.footer, MARGIN_X, footY, SMALL, MUTED));
    p.items.push(
      textItem(`Seite ${k + 1} von ${pages.length}`, W - MARGIN_X, footY, SMALL, MUTED, 'end'),
    );
  });
  return pages;
}

/** Draws page items on a PDF canvas. */
export function drawItems(c: PdfCanvas, items: readonly PageItem[]): void {
  for (const item of items) {
    if (item.draw) item.draw(c);
    if (item.path.length > 0) {
      if (item.fill) c.fill(item.path, item.fill);
      if (item.stroke) c.stroke(item.path, item.stroke.color, item.stroke.width, item.stroke.dash);
    }
    if (item.text) c.invisibleText(item.text.value, item.text.x, item.text.y, item.text.size);
  }
}

/** The document as a PDF. */
export function documentPdf(doc: PrintDocument): {
  readonly pdf: Uint8Array<ArrayBuffer>;
  readonly pages: Page[];
} {
  const pages = layoutDocument(doc);
  const pdf = new PdfDocument(doc.title);
  for (const p of pages) pdf.addPage(A4[0], A4[1], (c) => drawItems(c, p.items));
  return { pdf: pdf.toBytes(), pages };
}

/** Width of a text at a size (mm). */
export const textWidth = (value: string, size: number) => measureText(value, size).width;

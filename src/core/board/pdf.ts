// Minimal PDF writer for vector drawings in mm: pages, reusable drawings (form XObjects),
// paths, strokes, fills, clipping and Flate-compressed streams. Text arrives as outlines
// (text.ts), so no fonts are embedded; where text should be selectable, invisible text with the
// board font's advances lies over the outlines (as in scanned documents). Coordinates are mm
// with y pointing down, as on the board; every page and form starts with the matching
// transformation.

import { zlibSync } from 'fflate';
import type { Matrix, Path } from './shapes';
import { measureText } from './text';

const PT_PER_MM = 72 / 25.4;

/** Resource name of the invisible text's font. */
const TEXT_FONT = 'T1';

/** WinAnsiEncoding codes 0x80–0x9f (unused codes as NUL). */
const WIN_ANSI_HIGH = '€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ';

let winAnsi: Map<string, number> | null = null;

/** The WinAnsi code of a character, or of a stand-in (its base letter, '-' or '?'). */
function winAnsiCode(ch: string): number {
  if (!winAnsi) {
    winAnsi = new Map();
    for (let c = 0x20; c <= 0xff; c++) {
      if (c >= 0x7f && c < 0xa0) {
        const high = WIN_ANSI_HIGH[c - 0x80];
        if (high && high !== '\0') winAnsi.set(high, c);
      } else winAnsi.set(String.fromCharCode(c), c);
    }
  }
  return (
    winAnsi.get(ch) ??
    winAnsi.get(ch.normalize('NFD')[0] ?? '') ??
    (ch === '−' || ch === '‑' ? 0x2d : ch === ' ' ? 0x20 : 0x3f)
  );
}

/** A PDF string of WinAnsi codes, ASCII only (other bytes as octal escapes). */
function pdfString(text: string): string {
  let out = '(';
  for (const ch of text) {
    const code = winAnsiCode(ch);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 0x80) out += String.fromCharCode(code);
    else out += `\\${code.toString(8).padStart(3, '0')}`;
  }
  return `${out})`;
}

/** Advance widths (1/1000 em) of codes 32–255 in the board font, for the invisible text. */
function textFontWidths(): number[] {
  const chars = new Map<number, string>();
  for (let c = 0x20; c <= 0xff; c++) {
    const ch = c >= 0x80 && c < 0xa0 ? WIN_ANSI_HIGH[c - 0x80]! : String.fromCharCode(c);
    chars.set(c, ch === '\0' || c === 0x7f ? '?' : ch);
  }
  return [...chars.values()].map((ch) => Math.round(measureText(ch, 1).width * 1000));
}

export type Rgb = readonly [number, number, number];

/** Line ends and corners of a stroke (default: round, as for board and map lines). */
export interface StrokeStyle {
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'miter' | 'round' | 'bevel';
  readonly miterLimit?: number;
}

const CAPS = { butt: 0, round: 1, square: 2 } as const;
const JOINS = { miter: 0, round: 1, bevel: 2 } as const;

function num(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`PDF: invalid number ${v}`);
  const s = v.toFixed(3);
  const t = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  return t === '-0' ? '0' : t;
}

/** Records PDF content-stream operators; coordinates in mm, y down. */
export class PdfCanvas {
  private readonly ops: string[] = [];
  /** Forms used on this canvas (resource names). */
  readonly forms = new Set<string>();
  /** Whether the canvas has invisible text (needs the text font). */
  hasText = false;

  save(): this {
    this.ops.push('q');
    return this;
  }

  restore(): this {
    this.ops.push('Q');
    return this;
  }

  transform(m: Matrix): this {
    this.ops.push(`${m.map(num).join(' ')} cm`);
    return this;
  }

  private pathOps(path: Path): void {
    for (const cmd of path) {
      switch (cmd[0]) {
        case 'M':
          this.ops.push(`${num(cmd[1])} ${num(cmd[2])} m`);
          break;
        case 'L':
          this.ops.push(`${num(cmd[1])} ${num(cmd[2])} l`);
          break;
        case 'C':
          this.ops.push(
            `${cmd
              .slice(1)
              .map((v) => num(v as number))
              .join(' ')} c`,
          );
          break;
        case 'Z':
          this.ops.push('h');
          break;
      }
    }
  }

  stroke(
    path: Path,
    color: Rgb,
    widthMm: number,
    dash?: readonly number[],
    style: StrokeStyle = {},
  ): this {
    if (path.length === 0) return this;
    const cap = CAPS[style.cap ?? 'round'];
    const join = JOINS[style.join ?? 'round'];
    const miter = style.miterLimit !== undefined ? ` ${num(Math.max(1, style.miterLimit))} M` : '';
    this.ops.push(`${color.map(num).join(' ')} RG ${num(widthMm)} w ${cap} J ${join} j${miter}`);
    this.ops.push(dash ? `[${dash.map(num).join(' ')}] 0 d` : '[] 0 d');
    this.pathOps(path);
    this.ops.push('S');
    return this;
  }

  /** Fills the path, by the nonzero rule or the even-odd rule. */
  fill(path: Path, color: Rgb, evenOdd = false): this {
    if (path.length === 0) return this;
    this.ops.push(`${color.map(num).join(' ')} rg`);
    this.pathOps(path);
    this.ops.push(evenOdd ? 'f*' : 'f');
    return this;
  }

  /** Intersects the clipping region with the path (until restore). */
  clip(path: Path): this {
    this.pathOps(path);
    this.ops.push('W n');
    return this;
  }

  drawForm(name: string): this {
    this.forms.add(name);
    this.ops.push(`/${name} Do`);
    return this;
  }

  /**
   * Invisible text (render mode 3) with its baseline at (x, y) and the board font's advances,
   * over the same text drawn as outlines: it can then be selected, searched and copied.
   */
  invisibleText(text: string, x: number, y: number, sizeMm: number): this {
    if (text.trim() === '') return this;
    this.hasText = true;
    this.ops.push(
      `BT /${TEXT_FONT} ${num(sizeMm)} Tf 3 Tr 1 0 0 -1 ${num(x)} ${num(y)} Tm ${pdfString(text)} Tj ET`,
    );
    return this;
  }

  content(): string {
    return this.ops.join('\n');
  }
}

interface PdfObject {
  readonly id: number;
  dict: string;
  stream?: Uint8Array;
}

const ascii = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) throw new Error('PDF: non-ASCII character in structure');
    bytes[i] = c;
  }
  return bytes;
};

/** PDF text string (UTF-16BE with byte order mark), for metadata. */
function textString(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex.toUpperCase()}>`;
}

export class PdfDocument {
  private readonly objects: PdfObject[] = [];
  private readonly pageIds: number[] = [];
  private readonly formIds = new Map<string, number>();
  private fontId: number | null = null;
  private readonly pagesId: number;
  private readonly catalogId: number;

  constructor(private readonly title: string) {
    this.catalogId = this.reserve();
    this.pagesId = this.reserve();
  }

  private reserve(): number {
    const id = this.objects.length + 1;
    this.objects.push({ id, dict: '' });
    return id;
  }

  private streamObject(dict: string, content: string): number {
    const id = this.reserve();
    const data = zlibSync(ascii(content), { level: 6 });
    this.objects[id - 1] = {
      id,
      dict: `<< ${dict} /Filter /FlateDecode /Length ${data.length} >>`,
      stream: data,
    };
    return id;
  }

  /**
   * The invisible text's font: Helvetica in WinAnsiEncoding with the board font's widths, so
   * every character lies over its outline (it is never painted, so no font is embedded).
   */
  private textFontId(): number {
    if (this.fontId === null) {
      this.fontId = this.reserve();
      this.objects[this.fontId - 1]!.dict =
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding` +
        ` /FirstChar 32 /LastChar 255 /Widths [${textFontWidths().join(' ')}] >>`;
    }
    return this.fontId;
  }

  private resources(canvas: PdfCanvas): string {
    const forms = [...canvas.forms].map((name) => {
      const id = this.formIds.get(name);
      if (id === undefined) throw new Error(`PDF: unknown form ${name}`);
      return `/${name} ${id} 0 R`;
    });
    const parts: string[] = [];
    if (forms.length > 0) parts.push(`/XObject << ${forms.join(' ')} >>`);
    if (canvas.hasText) parts.push(`/Font << /${TEXT_FONT} ${this.textFontId()} 0 R >>`);
    return `<< ${parts.join(' ')}${parts.length > 0 ? ' ' : ''}>>`;
  }

  /** A reusable drawing of size w × h mm (y down), referenced by name on pages. */
  addForm(name: string, widthMm: number, heightMm: number, draw: (c: PdfCanvas) => void): void {
    const canvas = new PdfCanvas();
    draw(canvas);
    const id = this.streamObject(
      `/Type /XObject /Subtype /Form /BBox [0 0 ${num(widthMm)} ${num(heightMm)}] /Resources ${this.resources(canvas)}`,
      canvas.content(),
    );
    this.formIds.set(name, id);
  }

  /** A page of w × h mm; the canvas uses mm with the origin at the top left. */
  addPage(widthMm: number, heightMm: number, draw: (c: PdfCanvas) => void): void {
    const canvas = new PdfCanvas();
    canvas.transform([PT_PER_MM, 0, 0, -PT_PER_MM, 0, heightMm * PT_PER_MM]);
    draw(canvas);
    const contents = this.streamObject('', canvas.content());
    const id = this.reserve();
    this.objects[id - 1] = {
      id,
      dict:
        `<< /Type /Page /Parent ${this.pagesId} 0 R /MediaBox [0 0 ${num(widthMm * PT_PER_MM)} ${num(heightMm * PT_PER_MM)}]` +
        ` /Resources ${this.resources(canvas)} /Contents ${contents} 0 R >>`,
    };
    this.pageIds.push(id);
  }

  get pageCount(): number {
    return this.pageIds.length;
  }

  toBytes(): Uint8Array<ArrayBuffer> {
    this.objects[this.catalogId - 1]!.dict = `<< /Type /Catalog /Pages ${this.pagesId} 0 R >>`;
    this.objects[this.pagesId - 1]!.dict =
      `<< /Type /Pages /Kids [${this.pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pageIds.length} >>`;
    const infoId = this.reserve();
    this.objects[infoId - 1]!.dict =
      `<< /Title ${textString(this.title)} /Producer ${textString('TSP Boards')} >>`;

    const chunks: Uint8Array[] = [];
    let offset = 0;
    const push = (bytes: Uint8Array) => {
      chunks.push(bytes);
      offset += bytes.length;
    };
    // Header with a binary comment, so tools treat the file as binary.
    push(ascii('%PDF-1.4\n'));
    push(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const offsets: number[] = [];
    for (const o of this.objects) {
      offsets.push(offset);
      push(ascii(`${o.id} 0 obj\n${o.dict}\n`));
      if (o.stream) {
        push(ascii('stream\n'));
        push(o.stream);
        push(ascii('\nendstream\n'));
      }
      push(ascii('endobj\n'));
    }
    const xref = offset;
    let table = `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) table += `${String(o).padStart(10, '0')} 00000 n \n`;
    push(ascii(table));
    push(
      ascii(
        `trailer\n<< /Size ${this.objects.length + 1} /Root ${this.catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      ),
    );
    const out = new Uint8Array(offset);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

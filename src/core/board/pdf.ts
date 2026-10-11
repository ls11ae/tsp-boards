// Minimal PDF writer for vector drawings in mm: pages, reusable drawings (form XObjects),
// paths, strokes, fills, clipping and Flate-compressed streams. Text arrives as outlines
// (text.ts), so no fonts are embedded. Coordinates are mm with y pointing down, as on the
// board; every page and form starts with the matching transformation.

import { zlibSync } from 'fflate';
import type { Matrix, Path } from './shapes';

const PT_PER_MM = 72 / 25.4;

export type Rgb = readonly [number, number, number];

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

  stroke(path: Path, color: Rgb, widthMm: number, dash?: readonly number[]): this {
    if (path.length === 0) return this;
    this.ops.push(`${color.map(num).join(' ')} RG ${num(widthMm)} w 1 J 1 j`);
    this.ops.push(dash ? `[${dash.map(num).join(' ')}] 0 d` : '[] 0 d');
    this.pathOps(path);
    this.ops.push('S');
    return this;
  }

  fill(path: Path, color: Rgb): this {
    if (path.length === 0) return this;
    this.ops.push(`${color.map(num).join(' ')} rg`);
    this.pathOps(path);
    this.ops.push('f');
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

  private resources(canvas: PdfCanvas): string {
    const forms = [...canvas.forms].map((name) => {
      const id = this.formIds.get(name);
      if (id === undefined) throw new Error(`PDF: unknown form ${name}`);
      return `/${name} ${id} 0 R`;
    });
    return forms.length > 0 ? `<< /XObject << ${forms.join(' ')} >> >>` : '<< >>';
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

  toBytes(): Uint8Array {
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

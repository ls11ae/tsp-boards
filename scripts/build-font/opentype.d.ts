declare module 'opentype.js' {
  export interface PathCommand {
    readonly type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    readonly x?: number;
    readonly y?: number;
    readonly x1?: number;
    readonly y1?: number;
    readonly x2?: number;
    readonly y2?: number;
  }
  export interface Glyph {
    readonly index: number;
    readonly name: string | null;
    readonly advanceWidth: number;
    readonly path: { readonly commands: readonly PathCommand[] };
  }
  export interface Font {
    readonly unitsPerEm: number;
    readonly ascender: number;
    readonly descender: number;
    readonly names: {
      readonly windows?: Readonly<Record<string, { readonly en?: string } | undefined>>;
    };
    readonly tables: { readonly os2: { readonly sCapHeight: number; readonly sxHeight: number } };
    /** Glyph for a character; '.notdef' (index 0) if the font has none. */
    charToGlyph(char: string): Glyph;
  }
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}

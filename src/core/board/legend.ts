// Legend box at the bottom of a board (roadmap 9.1): lines with a symbol in front (a ring for
// marked places, a plain nail), notes, an optional large logo on the left, and the data
// attribution as the last line. Map lines stay out of the box, as for the title.

import type { LegendEntry } from '../puzzle-file';
import { fitLogo, logoHeight, type Logo } from './logo';
import { circlePath, ringPath, type PathCommand } from './shapes';
import { FONT_METRICS, measureText, textPath } from './text';

export interface LegendStyle {
  readonly textMm: number;
  readonly footerMm: number;
  readonly paddingMm: number;
  /** Width of the symbol column in front of the text, mm. */
  readonly symbolMm: number;
  /** Largest logo width and height, mm. */
  readonly logoMaxWidthMm: number;
  readonly logoMaxHeightMm: number;
}

export const DEFAULT_LEGEND_STYLE: LegendStyle = {
  textMm: 4.8,
  footerMm: 3,
  paddingMm: 5,
  symbolMm: 9,
  logoMaxWidthMm: 110,
  logoMaxHeightMm: 75,
};

/** Ring and nail of the board, drawn as symbols in the legend. */
export interface LegendSymbols {
  readonly ringOuterMm: number;
  readonly ringInnerMm: number;
  readonly nailRadiusMm: number;
}

export interface LegendLine {
  readonly symbol: 'ring' | 'nail' | 'dashed' | null;
  readonly text: string;
  /** Start of the baseline, relative to the box's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly sizeMm: number;
}

export interface LegendLayout {
  readonly width: number;
  readonly height: number;
  readonly lines: readonly LegendLine[];
  /** Logo area relative to the box's top-left corner (null: no logo). */
  readonly logo: {
    readonly logo: Logo;
    readonly box: readonly [number, number, number, number];
  } | null;
}

const LINE = 1.25;

/** Words of `text` in lines no wider than `width` at the given size. */
export function wrapText(text: string, sizeMm: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureText(next, sizeMm).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Lines and logo of the legend in a box of the given width; its height follows. */
export function layoutLegend(
  entries: readonly LegendEntry[],
  logo: Logo | null,
  footer: string | null,
  width: number,
  style: LegendStyle = DEFAULT_LEGEND_STYLE,
): LegendLayout {
  const pad = style.paddingMm;
  const inner = width - 2 * pad;
  let logoArea: LegendLayout['logo'] = null;
  let textX = pad;
  let textW = inner;
  if (logo) {
    const w = Math.min(style.logoMaxWidthMm, inner * 0.38);
    const h = Math.min(style.logoMaxHeightMm, logoHeight(logo, w));
    logoArea = { logo, box: [pad, pad, pad + w, pad + h] };
    textX = pad + w + 6;
    textW = width - pad - textX;
  }
  const lines: LegendLine[] = [];
  let y = pad;
  const asc = FONT_METRICS.ascender;
  for (const entry of entries) {
    const symbol = entry.symbol === 'none' ? null : entry.symbol;
    const indent = symbol ? style.symbolMm : 0;
    const wrapped = wrapText(entry.text, style.textMm, textW - indent);
    wrapped.forEach((text, i) => {
      lines.push({
        symbol: i === 0 ? symbol : null,
        text,
        x: textX + indent,
        y: y + asc * style.textMm,
        sizeMm: style.textMm,
      });
      y += LINE * style.textMm;
    });
    y += 0.4 * style.textMm;
  }
  const textBottom = y;
  const bodyBottom = Math.max(textBottom, logoArea ? logoArea.box[3] + 2 : 0);
  let height = bodyBottom + pad;
  if (footer) {
    const footY = bodyBottom + 2;
    lines.push({
      symbol: null,
      text: footer,
      // Centred under the whole box, like the footer of boards without a legend.
      x: (width - measureText(footer, style.footerMm).width) / 2,
      y: footY + asc * style.footerMm,
      sizeMm: style.footerMm,
    });
    height = footY + LINE * style.footerMm + pad;
  }
  // The shorter of logo and text sits in the middle of the other's height.
  if (logoArea && logoArea.box[3] > textBottom) {
    const shift = (logoArea.box[3] - textBottom) / 2;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.sizeMm === style.textMm) lines[i] = { ...lines[i]!, y: lines[i]!.y + shift };
    }
  }
  if (logoArea && textBottom > logoArea.box[3]) {
    const [x0, y0, x1, y1] = logoArea.box;
    const shift = (textBottom - pad - (y1 - y0)) / 2;
    logoArea = { logo: logoArea.logo, box: [x0, y0 + shift, x1, y1 + shift] };
  }
  return { width, height, lines, logo: logoArea };
}

/** Paths of the legend with its top-left corner at (x, y), engraved (no frame, as for the title). */
export function drawLegend(
  layout: LegendLayout,
  x: number,
  y: number,
  symbols: LegendSymbols,
): { readonly engrave: PathCommand[]; readonly score: PathCommand[] } {
  const engrave: PathCommand[] = [];
  const score: PathCommand[] = [];
  for (const line of layout.lines) {
    engrave.push(...textPath(line.text, x + line.x, y + line.y, line.sizeMm));
    if (!line.symbol) continue;
    // Symbol centred on the cap height of the line, in the middle of the symbol column.
    const cx = x + line.x - DEFAULT_LEGEND_STYLE.symbolMm / 2;
    const cy = y + line.y - (FONT_METRICS.capHeight * line.sizeMm) / 2;
    if (line.symbol === 'dashed') {
      // Three dashes across the symbol column, scored like the given leg (roadmap 9.17).
      for (const start of [-3.6, -0.9, 1.8])
        score.push(['M', cx + start, cy], ['L', cx + start + 1.8, cy]);
      continue;
    }
    engrave.push(...circlePath(cx, cy, symbols.nailRadiusMm));
    if (line.symbol === 'ring')
      engrave.push(...ringPath(cx, cy, symbols.ringOuterMm, symbols.ringInnerMm));
  }
  if (layout.logo) {
    const [x0, y0, x1, y1] = layout.logo.box;
    engrave.push(...fitLogo(layout.logo.logo, [x + x0, y + y0, x + x1, y + y1]));
  }
  return { engrave, score };
}

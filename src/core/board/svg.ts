// SVG for laser cutters: real-size document in mm, one group per operation in the usual colour
// convention (cut red, score blue, outline green, engrave black fill), text as outlines.
// Inkscape sees the groups as layers; LightBurn, Glowforge and xTool map colours to operations.

import type { BoardDrawing, DrawItem, Layer } from './drawing';
import { LAYERS } from './drawing';
import { svgPathData, type PathCommand } from './shapes';

export const LAYER_COLORS: Record<Layer, string> = {
  cut: '#ff0000',
  edge: '#ff8000',
  score: '#0000ff',
  outline: '#00a000',
  engrave: '#000000',
  pit: '#ff00ff',
};

export const LAYER_NAMES: Record<Layer, string> = {
  cut: 'cut (nail holes)',
  edge: 'cut (board outline)',
  score: 'score (thin lines)',
  outline: 'score (outline, more power)',
  engrave: 'engrave (fill)',
  pit: 'engrave deeper (nail pits for drilling)',
};

export interface SvgOptions {
  /** Stroke width of lines in mm (many laser drivers want a hairline, e.g. 0.025). */
  readonly strokeMm: number;
  /** Document title and description (metadata). */
  readonly title: string;
  readonly description?: string;
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function boardSvg(drawing: BoardDrawing, options: SvgOptions): string {
  const { width, height } = drawing;
  const groups = LAYERS.map((layer) => {
    const items = drawing.items.filter((i) => i.layer === layer);
    if (items.length === 0) return '';
    const merge = (list: readonly DrawItem[]) =>
      svgPathData(
        list.flatMap((i): PathCommand[] => [...i.path]),
        3,
      );
    const fills = items.filter((i) => i.fill);
    const strokes = items.filter((i) => !i.fill);
    const color = LAYER_COLORS[layer];
    const parts: string[] = [];
    if (strokes.length > 0)
      parts.push(
        `<path fill="none" stroke="${color}" stroke-width="${options.strokeMm}" stroke-linecap="round" stroke-linejoin="round" d="${merge(strokes)}"/>`,
      );
    if (fills.length > 0) parts.push(`<path fill="${color}" stroke="none" d="${merge(fills)}"/>`);
    return (
      `<g id="${layer}" inkscape:groupmode="layer" inkscape:label="${escape(LAYER_NAMES[layer])}">\n` +
      parts.join('\n') +
      '\n</g>'
    );
  }).filter(Boolean);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">`,
    `<title>${escape(options.title)}</title>`,
    options.description ? `<desc>${escape(options.description)}</desc>` : '',
    ...groups,
    '</svg>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// Downloads of the incremental puzzle (roadmap 7.6: loaded on demand): laser SVG, print
// template and solution sheet.

import { templatePdf } from '../core/board/print';
import { boardSvg } from '../core/board/svg';
import { drawIncremental } from '../core/incremental/drawing';
import { incrementalSolutionPdf, incrementalTemplateText } from '../core/incremental/print';
import { INCREMENTAL_TEXTS } from '../core/incremental/texts';
import { drawingOptions, incrementalLink } from './incremental';
import { useStore } from './store';

function save(data: BlobPart, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadIncremental(kind: 'svg' | 'template' | 'solution'): void {
  const { inc, exportOptions } = useStore.getState();
  const { puzzle, params } = inc;
  if (!puzzle) return;
  const n = puzzle.points.length;
  const texts = INCREMENTAL_TEXTS[params.labelLanguage];
  const name = `tsp-incremental-${n}-s${params.seed}`;
  if (kind === 'svg') {
    const { drawing } = drawIncremental(puzzle, drawingOptions(params, exportOptions.holes, n));
    save(
      boardSvg(drawing, { strokeMm: exportOptions.strokeMm, title: texts.templateTitle }),
      'image/svg+xml',
      `${name}.svg`,
    );
    return;
  }
  const { drawing } = drawIncremental(puzzle, drawingOptions(params, 'mark', n));
  if (kind === 'template') {
    save(
      templatePdf({
        drawing,
        ...incrementalTemplateText(texts, params.nailDiameterMm),
        paper: exportOptions.paper,
      }),
      'application/pdf',
      `${name}-template-${exportOptions.paper}.pdf`,
    );
    return;
  }
  const locale = params.labelLanguage === 'de' ? 'de-DE' : 'en-GB';
  save(
    incrementalSolutionPdf({
      puzzle,
      drawing,
      texts,
      link: incrementalLink(),
      formatNumber: (value, decimals) =>
        value.toLocaleString(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }),
    }),
    'application/pdf',
    `${name}-solution.pdf`,
  );
}

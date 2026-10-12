// The incremental puzzle in the app: generation and link checks in a worker, the board
// preview, links and downloads.

import type { Layer } from '../core/board/drawing';
import { templatePdf } from '../core/board/print';
import { svgPathData } from '../core/board/shapes';
import { boardSvg } from '../core/board/svg';
import { drawIncremental } from '../core/incremental/drawing';
import type { IncrementalPuzzle } from '../core/incremental/generate';
import {
  decodeIncrementalLink,
  encodeIncrementalLink,
  incrementalParams,
  type IncrementalUiParams,
} from '../core/incremental/params';
import { incrementalSolutionPdf, incrementalTemplateText } from '../core/incremental/print';
import { INCREMENTAL_TEXTS } from '../core/incremental/texts';
import type { Point } from '../core/geometry';
import type { IncrementalRequest, IncrementalResponse } from '../workers/protocol';
import { useStore } from './store';

let worker: Worker | null = null;
let requestId = 0;

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('../workers/incremental.worker.ts', import.meta.url), {
    type: 'module',
  });
  w.onmessage = (event: MessageEvent<IncrementalResponse>) => onMessage(event.data);
  w.onerror = (event) => {
    useStore.getState().setInc({ status: 'error', message: event.message });
    worker?.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

function onMessage(message: IncrementalResponse): void {
  if (message.id !== requestId) return;
  const { setInc } = useStore.getState();
  if (message.type === 'error') {
    setInc({ status: 'error', message: message.message });
  } else if (message.type === 'generated') {
    setInc({
      status: message.puzzle ? 'done' : 'failed',
      puzzle: message.puzzle,
      violations: [],
      marksFit: true,
      reached: message.reached,
      checks: message.checks,
      ms: message.ms,
      message: null,
      shownK: null,
    });
  } else {
    const { result } = message;
    setInc({
      status: result.puzzle ? 'done' : 'error',
      puzzle: result.puzzle,
      violations: result.violations,
      marksFit: result.marksFit,
      reached: result.puzzle?.points.length ?? 0,
      checks: result.puzzle?.steps.length ?? 0,
      ms: message.ms,
      message: null,
      shownK: null,
    });
  }
}

function post(request: IncrementalRequest): void {
  if (useStore.getState().inc.status === 'running') {
    // A new request replaces a running one.
    worker?.terminate();
    worker = null;
  }
  useStore.getState().setInc({ status: 'running', message: null });
  getWorker().postMessage(request);
}

export function generate(): void {
  const { params } = useStore.getState().inc;
  post({ type: 'generate', id: ++requestId, params: incrementalParams(params) });
}

/** Opens an incremental link: parameters, and the points if it has any (checked exactly). */
export function applyIncrementalLink(hash: string): boolean {
  const link = decodeIncrementalLink(hash);
  if (!link) return false;
  useStore.setState({ puzzleType: 'incremental' });
  useStore.getState().setIncParams(link.params);
  if (link.title !== null) useStore.getState().setDoc({ title: link.title });
  if (link.play) useStore.setState({ mode: 'play', page: 'app' });
  if (link.points) checkPoints(link.params, link.points);
  return true;
}

/** Opens an incremental puzzle with the given points (checked exactly). */
export function applyIncrementalPuzzle(
  params: IncrementalUiParams,
  points: readonly Point[],
): void {
  useStore.getState().setIncParams(params);
  if (points.length >= 3) checkPoints(params, points);
  else useStore.getState().setInc({ puzzle: null, status: 'idle' });
}

function checkPoints(params: IncrementalUiParams, points: readonly Point[]): void {
  post({ type: 'check', id: ++requestId, params: incrementalParams(params), points });
}

export function incrementalLink(): string {
  const { inc, doc } = useStore.getState();
  const { params, puzzle } = inc;
  const hash = encodeIncrementalLink(
    { ...params, n: puzzle?.points.length ?? params.n },
    puzzle?.points ?? null,
    __APP_VERSION__,
    doc.title,
  );
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

function drawingOptions(params: IncrementalUiParams, holes: 'cut' | 'mark', n: number) {
  const title = useStore.getState().doc.title;
  const line = INCREMENTAL_TEXTS[params.labelLanguage].boardLine(n);
  return {
    nailDiameterMm: params.nailDiameterMm,
    labelSizeMm: params.labelSizeMm > 0 ? params.labelSizeMm : 8,
    holes,
    cornerRadiusMm: 5,
    line: title ? `${title} · ${line}` : line,
  };
}

export interface IncrementalPreview {
  readonly score: string;
  readonly engrave: string;
  readonly cut: string;
}

const previewCache = new WeakMap<IncrementalPuzzle, { key: string; paths: IncrementalPreview }>();

export function incrementalPreview(
  puzzle: IncrementalPuzzle,
  params: IncrementalUiParams,
  holes: 'cut' | 'mark',
): IncrementalPreview {
  const key = [
    holes,
    params.nailDiameterMm,
    params.labelSizeMm,
    params.labelLanguage,
    useStore.getState().doc.title,
  ].join('|');
  const cached = previewCache.get(puzzle);
  if (cached?.key === key) return cached.paths;
  const { drawing } = drawIncremental(puzzle, drawingOptions(params, holes, puzzle.points.length));
  const layer = (name: Layer, fill: boolean) =>
    svgPathData(
      drawing.items.filter((i) => i.layer === name && i.fill === fill).flatMap((i) => [...i.path]),
      2,
    );
  const paths = {
    score: layer('score', false),
    engrave: layer('engrave', true),
    cut: layer('cut', false),
  };
  previewCache.set(puzzle, { key, paths });
  return paths;
}

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

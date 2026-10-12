// Parameters of the incremental puzzle as the user sets them, and its links:
//   #v=1&m=inc&app=…&b=400x400&nail=2&str=1&md=30&g=5&sp=10&s=1&lf=8&ll=de&pts=…
// `pts` holds the points in order as x_y in 0.1 mm (base 36); without `pts` the link only sets
// parameters. The link contains no solution (the app recomputes it).

import type { Point } from '../geometry';
import type { LabelLanguage } from '../data';
import { PERMALINK_VERSION, Query } from '../permalink';
import { DEFAULT_INCREMENTAL, type IncrementalParams } from './generate';

export interface IncrementalUiParams {
  readonly n: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly minDistanceMm: number;
  readonly targetGapMm: number;
  readonly spacingMm: number;
  readonly nailDiameterMm: number;
  readonly stringThicknessMm: number;
  readonly seed: number;
  readonly labelSizeMm: number;
  readonly labelLanguage: LabelLanguage;
}

export const DEFAULT_INCREMENTAL_UI: IncrementalUiParams = {
  n: 10,
  widthMm: 400,
  heightMm: 400,
  minDistanceMm: 30,
  targetGapMm: 5,
  spacingMm: 10,
  nailDiameterMm: 2,
  stringThicknessMm: 1,
  seed: 1,
  labelSizeMm: 8,
  labelLanguage: 'de',
};

export function incrementalParams(ui: IncrementalUiParams): IncrementalParams {
  return {
    ...DEFAULT_INCREMENTAL,
    n: ui.n,
    widthMm: ui.widthMm,
    heightMm: ui.heightMm,
    minDistanceMm: ui.minDistanceMm,
    targetGapMm: ui.targetGapMm,
    spacingMm: ui.spacingMm,
    rEffMm: ui.nailDiameterMm / 2 + ui.stringThicknessMm / 2,
    clearanceMm: Math.max(
      DEFAULT_INCREMENTAL.clearanceMm,
      ui.nailDiameterMm / 2 + ui.stringThicknessMm + 1.5,
    ),
    seed: ui.seed,
  };
}

const encodePoints = (points: readonly Point[]) =>
  points
    .map(([x, y]) => `${Math.round(x * 10).toString(36)}_${Math.round(y * 10).toString(36)}`)
    .join('.');

function decodePoints(text: string | null): Point[] | null {
  if (!text) return null;
  const points = text.split('.').map((pair) => {
    const [x, y] = pair.split('_').map((v) => parseInt(v, 36) / 10);
    return [x ?? NaN, y ?? NaN] as const;
  });
  return points.length >= 3 && points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    ? points
    : null;
}

export function encodeIncrementalLink(
  ui: IncrementalUiParams,
  points: readonly Point[] | null,
  appVersion = '',
  title = '',
): string {
  const q = new Query();
  q.set('v', String(PERMALINK_VERSION));
  q.set('m', 'inc');
  if (title) q.set('t', title);
  if (appVersion) q.set('app', appVersion);
  q.set('n', String(ui.n));
  q.set('b', `${ui.widthMm}x${ui.heightMm}`);
  q.set('nail', String(ui.nailDiameterMm));
  q.set('str', String(ui.stringThicknessMm));
  q.set('md', String(ui.minDistanceMm));
  q.set('g', String(ui.targetGapMm));
  q.set('sp', String(ui.spacingMm));
  q.set('s', String(ui.seed));
  q.set('lf', String(ui.labelSizeMm));
  q.set('ll', ui.labelLanguage);
  if (points && points.length > 0) q.set('pts', encodePoints(points));
  return `#${q.toString()}`;
}

function num(value: string | null, fallback: number, min: number, max: number): number {
  const x = value === null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(x) && x >= min && x <= max ? x : fallback;
}

export function decodeIncrementalLink(hash: string): {
  readonly params: IncrementalUiParams;
  readonly points: Point[] | null;
  readonly title: string | null;
} | null {
  const q = new Query(hash.startsWith('#') ? hash.slice(1) : hash);
  if (q.get('v') !== String(PERMALINK_VERSION) || q.get('m') !== 'inc') return null;
  const d = DEFAULT_INCREMENTAL_UI;
  const [bw, bh] = (q.get('b') ?? '').split('x');
  const points = decodePoints(q.get('pts'));
  const params: IncrementalUiParams = {
    n: points ? points.length : Math.round(num(q.get('n'), d.n, 4, 16)),
    widthMm: num(bw ?? null, d.widthMm, 150, 2000),
    heightMm: num(bh ?? null, d.heightMm, 150, 2000),
    minDistanceMm: num(q.get('md'), d.minDistanceMm, 5, 300),
    targetGapMm: num(q.get('g'), d.targetGapMm, 0, 200),
    spacingMm: num(q.get('sp'), d.spacingMm, 0, 200),
    nailDiameterMm: num(q.get('nail'), d.nailDiameterMm, 0, 20),
    stringThicknessMm: num(q.get('str'), d.stringThicknessMm, 0, 20),
    seed: Math.round(num(q.get('s'), d.seed, 0, 2 ** 32 - 1)),
    labelSizeMm: num(q.get('lf'), d.labelSizeMm, 0, 50),
    labelLanguage: q.get('ll') === 'en' ? 'en' : 'de',
  };
  return {
    params,
    points: points && points.length <= 16 ? points : null,
    title: q.get('t') ? q.get('t')!.slice(0, 200) : null,
  };
}

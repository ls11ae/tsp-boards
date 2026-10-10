// Permalinks in the URL hash (never sent to the server):
//   #v=1&d=de@1&app=0.0.0+abc1234&r=DE&n=40&b=600x800x30&nail=2&str=1&md=25&g=5&p=5000&s=1&it=1000&w=1,0.5,0.5&sel=…
// `sel` holds the GeoNames ids of the selected cities in base 36 and restores the puzzle
// exactly; parameters + seed reproduce the search only within the same JS engine.

import { DEFAULT_PARAMS, type UiParams } from './store';

export const PERMALINK_VERSION = 1;

export interface PermalinkData {
  readonly params: UiParams;
  /** GeoNames ids of pinned and excluded cities. */
  readonly pinned: readonly number[];
  readonly excluded: readonly number[];
  /** GeoNames ids of the selected cities, if the link contains a puzzle. */
  readonly selected: readonly number[] | null;
  /** 'de@1' style data version, if present. */
  readonly data: { readonly country: string; readonly version: number } | null;
}

const encodeIds = (ids: readonly number[]) =>
  [...ids]
    .sort((a, b) => a - b)
    .map((id) => id.toString(36))
    .join('.');

const decodeIds = (text: string | null): number[] =>
  text
    ? text
        .split('.')
        .map((s) => parseInt(s, 36))
        .filter((x) => Number.isInteger(x) && x > 0)
    : [];

export function encodePermalink(
  params: UiParams,
  dataVersion: { country: string; version: number },
  selectedIds: readonly number[] | null,
  marks: { readonly pinned: readonly number[]; readonly excluded: readonly number[] } = {
    pinned: [],
    excluded: [],
  },
): string {
  const q = new URLSearchParams();
  q.set('v', String(PERMALINK_VERSION));
  q.set('d', `${dataVersion.country.toLowerCase()}@${dataVersion.version}`);
  // Informational: the seed reproduces a search only with the same app version and engine.
  q.set('app', __APP_VERSION__);
  q.set('r', params.region);
  q.set('n', String(params.n));
  q.set('b', `${params.boardWidthMm}x${params.boardHeightMm}x${params.marginMm}`);
  q.set('nail', String(params.nailDiameterMm));
  q.set('str', String(params.stringThicknessMm));
  q.set('md', String(params.minDistanceMm));
  q.set('g', String(params.targetGapMm));
  q.set('p', String(params.minPopulation));
  q.set('s', String(params.seed));
  q.set('it', String(params.iterations));
  q.set('w', [params.weightGap, params.weightDifficulty, params.weightRecognizability].join(','));
  if (marks.pinned.length > 0) q.set('pin', encodeIds(marks.pinned));
  if (marks.excluded.length > 0) q.set('ex', encodeIds(marks.excluded));
  if (selectedIds && selectedIds.length > 0) q.set('sel', encodeIds(selectedIds));
  return `#${q.toString()}`;
}

function num(value: string | null, fallback: number, min = -Infinity, max = Infinity): number {
  // Empty means missing (Number('') would be 0).
  const x = value === null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(x) && x >= min && x <= max ? x : fallback;
}

export function decodePermalink(hash: string): PermalinkData | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!text) return null;
  const q = new URLSearchParams(text);
  if (q.get('v') !== String(PERMALINK_VERSION)) return null;
  const d = DEFAULT_PARAMS;
  const [bw, bh, bm] = (q.get('b') ?? '').split('x');
  const [wg, wd, wr] = (q.get('w') ?? '').split(',');
  const params: UiParams = {
    region: /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(q.get('r') ?? '') ? q.get('r')! : d.region,
    n: Math.round(num(q.get('n'), d.n, 5, 120)),
    boardWidthMm: num(bw ?? null, d.boardWidthMm, 50, 5000),
    boardHeightMm: num(bh ?? null, d.boardHeightMm, 50, 5000),
    marginMm: num(bm ?? null, d.marginMm, 0, 500),
    nailDiameterMm: num(q.get('nail'), d.nailDiameterMm, 0, 20),
    stringThicknessMm: num(q.get('str'), d.stringThicknessMm, 0, 20),
    minDistanceMm: num(q.get('md'), d.minDistanceMm, 0, 500),
    targetGapMm: num(q.get('g'), d.targetGapMm, 0, 500),
    minPopulation: Math.round(num(q.get('p'), d.minPopulation, 0, 1e8)),
    seed: Math.round(num(q.get('s'), d.seed, 0, 2 ** 32 - 1)),
    iterations: Math.round(num(q.get('it'), d.iterations, 1, 1e6)),
    weightGap: num(wg ?? null, d.weightGap, 0, 100),
    weightDifficulty: num(wd ?? null, d.weightDifficulty, 0, 100),
    weightRecognizability: num(wr ?? null, d.weightRecognizability, 0, 100),
  };
  const selected = q.get('sel') ? decodeIds(q.get('sel')) : null;
  const match = /^([a-z]{2})@(\d+)$/.exec(q.get('d') ?? '');
  const data = match ? { country: match[1]!.toUpperCase(), version: Number(match[2]) } : null;
  return {
    params,
    pinned: decodeIds(q.get('pin')),
    excluded: decodeIds(q.get('ex')),
    selected,
    data,
  };
}

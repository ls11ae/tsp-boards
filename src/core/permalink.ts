// Permalinks in the URL hash (never sent to the server):
//   #v=1&d=de@1&app=0.0.0+abc1234&r=DE&n=40&b=600x800x30&nail=2&str=1&md=25&g=5&p=5000&s=1&it=1000&w=1,0.5,0.5&lf=8&ll=de&sel=…
// `sel` holds the GeoNames ids of the selected cities in base 36 and restores the puzzle
// exactly; parameters + seed reproduce the search only within the same JS engine.

import { DEFAULT_PARAMS, type PuzzleParams } from './params';
import { decodePlaceList, encodePlaceList, type LinkPlace } from './places';
import type { GroupConstraint, Place } from './puzzle-file';
import { decodeGroups, encodeGroups } from './groups';
import { REGION_ID_PATTERN } from './region';

export const PERMALINK_VERSION = 1;

export interface PermalinkData {
  readonly params: PuzzleParams;
  /** GeoNames ids of pinned and excluded cities. */
  readonly pinned: readonly number[];
  readonly excluded: readonly number[];
  /** Minimum and maximum number of places per state. */
  readonly groups: readonly GroupConstraint[];
  /** GeoNames ids of the selected cities, if the link contains a puzzle. */
  readonly selected: readonly number[] | null;
  /** 'de@1' style data version, if present. */
  readonly data: { readonly country: string; readonly version: number } | null;
  /** 'play': open the puzzle for playing (no search settings, no solution). */
  readonly mode: 'design' | 'play';
  /** Puzzle title, if the link has one. */
  readonly title: string | null;
  /** Place list (instead of the region's towns), if the link has one. */
  readonly list: {
    readonly mode: 'fixed' | 'pool';
    readonly places: readonly LinkPlace[];
    /** Selected places as indices into the list (pool mode). */
    readonly selected: readonly number[] | null;
    /** Marked places as indices into the list. */
    readonly highlight: readonly number[];
  } | null;
}

/** A place list for a link: its places and, in pool mode, the selected indices. */
export interface LinkList {
  readonly mode: 'fixed' | 'pool';
  readonly places: readonly Place[];
  readonly selected: readonly number[] | null;
}

const encodeIndices = (indices: readonly number[]) =>
  [...indices]
    .sort((a, b) => a - b)
    .map((i) => i.toString(36))
    .join('.');

const decodeIndices = (text: string | null): number[] | null =>
  text
    ? text
        .split('.')
        .map((s) => parseInt(s, 36))
        .filter((x) => Number.isInteger(x) && x >= 0 && x < 5000)
    : null;

function setList(q: Query, list: LinkList): void {
  q.set('pl', encodePlaceList(list.mode, list.places));
  if (list.selected && list.selected.length > 0) q.set('sx', encodeIndices(list.selected));
}

/**
 * Minimal query string (the core has no URLSearchParams type): same encoding as
 * URLSearchParams for the characters used here, '+' decodes to a space.
 */
export class Query {
  private readonly entries = new Map<string, string>();

  constructor(text = '') {
    for (const part of text.split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const decode = (s: string) => {
        try {
          return decodeURIComponent(s.replaceAll('+', ' '));
        } catch {
          return '';
        }
      };
      const key = decode(eq < 0 ? part : part.slice(0, eq));
      if (!this.entries.has(key)) this.entries.set(key, decode(eq < 0 ? '' : part.slice(eq + 1)));
    }
  }

  get(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.entries.set(key, value);
  }

  toString(): string {
    return [...this.entries]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }
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
  params: PuzzleParams,
  dataVersion: { country: string; version: number },
  selectedIds: readonly number[] | null,
  marks: {
    readonly pinned: readonly number[];
    readonly excluded: readonly number[];
    readonly groups?: readonly GroupConstraint[];
  } = {
    pinned: [],
    excluded: [],
  },
  appVersion = '',
  title = '',
  list: LinkList | null = null,
): string {
  const q = new Query();
  q.set('v', String(PERMALINK_VERSION));
  if (title) q.set('t', title);
  q.set('d', `${dataVersion.country.toLowerCase()}@${dataVersion.version}`);
  // Informational: the seed reproduces a search only with the same app version and engine.
  if (appVersion) q.set('app', appVersion);
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
  const weights = [params.weightGap, params.weightDifficulty, params.weightRecognizability];
  // The thesis terms C and D only when used (links from before them have three weights).
  if (params.weightInterior !== 0 || params.weightNonNearest !== 0)
    weights.push(params.weightInterior, params.weightNonNearest);
  q.set('w', weights.join(','));
  q.set('lf', String(params.labelSizeMm));
  q.set('ll', params.labelLanguage);
  if (params.blankBoard) q.set('bl', '1');
  if (marks.pinned.length > 0) q.set('pin', encodeIds(marks.pinned));
  if (marks.excluded.length > 0) q.set('ex', encodeIds(marks.excluded));
  if (marks.groups && marks.groups.length > 0) q.set('gr', encodeGroups(marks.groups));
  if (list) setList(q, list);
  else if (selectedIds && selectedIds.length > 0) q.set('sel', encodeIds(selectedIds));
  return `#${q.toString()}`;
}

/**
 * Link for players: the cities and what shapes the board (region, board, nails, string,
 * labels), but no search settings; like every link, no tour.
 */
export function encodePlayLink(
  params: PuzzleParams,
  dataVersion: { country: string; version: number },
  selectedIds: readonly number[],
  appVersion = '',
  title = '',
  list: LinkList | null = null,
): string {
  const q = new Query();
  q.set('v', String(PERMALINK_VERSION));
  q.set('m', 'play');
  if (title) q.set('t', title);
  q.set('d', `${dataVersion.country.toLowerCase()}@${dataVersion.version}`);
  if (appVersion) q.set('app', appVersion);
  q.set('r', params.region);
  q.set('b', `${params.boardWidthMm}x${params.boardHeightMm}x${params.marginMm}`);
  q.set('nail', String(params.nailDiameterMm));
  q.set('str', String(params.stringThicknessMm));
  q.set('p', String(params.minPopulation));
  q.set('lf', String(params.labelSizeMm));
  q.set('ll', params.labelLanguage);
  if (params.blankBoard) q.set('bl', '1');
  if (list) setList(q, list);
  else q.set('sel', encodeIds(selectedIds));
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
  const q = new Query(text);
  if (q.get('v') !== String(PERMALINK_VERSION)) return null;
  const d = DEFAULT_PARAMS;
  const [bw, bh, bm] = (q.get('b') ?? '').split('x');
  const [wg, wd, wr, wi, wn] = (q.get('w') ?? '').split(',');
  let params: PuzzleParams = {
    region: REGION_ID_PATTERN.test(q.get('r') ?? '') ? q.get('r')! : d.region,
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
    weightInterior: num(wi ?? null, d.weightInterior, 0, 100),
    weightNonNearest: num(wn ?? null, d.weightNonNearest, 0, 100),
    // Links from before labels were a constraint have no 'lf': they keep the default.
    labelSizeMm: num(q.get('lf'), d.labelSizeMm, 0, 100),
    labelLanguage: q.get('ll') === 'en' ? 'en' : d.labelLanguage,
    blankBoard: q.get('bl') === '1',
  };
  const selected = q.get('sel') ? decodeIds(q.get('sel')) : null;
  const placeList = q.get('pl') ? decodePlaceList(q.get('pl')!) : null;
  const list = placeList ? { ...placeList, selected: decodeIndices(q.get('sx')) } : null;
  // Play links carry no 'n': the puzzle has as many cities as it selects.
  const count = selected?.length ?? list?.selected?.length ?? list?.places.length;
  if (count !== undefined && q.get('n') === null) params = { ...params, n: count };
  const match = /^([a-z]{2})@(\d+)$/.exec(q.get('d') ?? '');
  const data = match ? { country: match[1]!.toUpperCase(), version: Number(match[2]) } : null;
  return {
    params,
    pinned: decodeIds(q.get('pin')),
    excluded: decodeIds(q.get('ex')),
    groups: decodeGroups(q.get('gr')),
    selected,
    data,
    mode: q.get('m') === 'play' && (selected || list) ? 'play' : 'design',
    title: q.get('t') ? q.get('t')!.slice(0, 200) : null,
    list,
  };
}

/**
 * Short play link of a gallery puzzle (roadmap 9.10, the QR code on posters): `#p/<puzzle id>`
 * opens the puzzle in play mode. It keeps the QR code small; full permalinks keep working.
 */
const SHORT_LINK = /^#?p\/([a-z0-9][a-z0-9-]{0,80})$/;

/** The puzzle id of a short play link, or null. */
export function shortLinkId(hash: string): string | null {
  return SHORT_LINK.exec(hash)?.[1] ?? null;
}

/** The short play link of a puzzle on the site at `base` (e.g. https://…/tsp-boards/). */
export function shortLink(base: string, id: string): string {
  return `${base}#p/${id}`;
}

// Puzzle files: one self-contained JSON document per puzzle (map or incremental), for download,
// upload, the local library and the curated collection (public/puzzles/).
//
// Places carry name and coordinates even when they come from the country data (GeoNames id),
// so a file stays readable when the data version changes. Results (optimum, gaps) are
// informational: the app recomputes them when it opens a file.

import type { HoleMode } from './board/drawing';
import type { LabelLanguage } from './data';
import type { Point } from './geometry';
import { DEFAULT_INCREMENTAL_UI, type IncrementalUiParams } from './incremental/params';
import { DEFAULT_PARAMS, type PuzzleParams } from './params';

export const PUZZLE_SCHEMA = 1;

/** `board`: a physical board (string length, gap in mm); `digital`: played on screen only. */
export type Purpose = 'board' | 'digital';

/** A town or point that is part of a composite place. */
export interface Member {
  /** GeoNames id for a town of the country data; absent for custom points. */
  readonly id?: number;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

export interface Place {
  /** GeoNames id for a town of the country data; absent for custom and composite places. */
  readonly id?: number;
  readonly name: string;
  /** Position; for a composite place the mean of its members (the board uses the projected mean). */
  readonly lat: number;
  readonly lon: number;
  /** Board label, if not the town's default label. */
  readonly label?: string;
  /** Members of a composite place (e.g. an alliance of universities in two towns). */
  readonly members?: readonly Member[];
  /** Marked place: a ring around its nail and in the app (e.g. Universities of Excellence). */
  readonly highlight?: boolean;
}

/** A line of a board's legend; the symbol in front shows what the line explains. */
export interface LegendEntry {
  /** 'ring': a marked place, 'nail': a plain nail, 'none': text only. */
  readonly symbol: 'ring' | 'nail' | 'none';
  readonly text: string;
}

/** Extras of a board (roadmap 9.1). */
export interface BoardExtras {
  /** Legend in a box at the bottom of the board (empty: no legend box). */
  readonly legend: readonly LegendEntry[];
  /** Preferred start nail (index into places): used if its gap at the scale reaches the target. */
  readonly startPlace: number | null;
  /** Export defaults of this board (e.g. drill pits and no outline cut for thick plywood). */
  readonly export?: { readonly holes: HoleMode; readonly edge: boolean };
}

/** Minimum and maximum number of places per group (e.g. per federal state). */
export interface GroupConstraint {
  /** Group key, e.g. a state id 'DE-NW', or '*' for every state. */
  readonly group: string;
  readonly min: number;
  /** null: no maximum. */
  readonly max: number | null;
}

export interface MapResults {
  /** Optimal tour as indices into `places` (string length for boards, else Euclidean). */
  readonly tour: readonly number[];
  readonly lengthMm: number;
  /** Gap to the runner-up in mm (null if unknown). */
  readonly gapMm: number | null;
  readonly model: 'string' | 'euclidean';
  /** Gap at the board's scale and the start nail (index into places), if planned. */
  readonly scaleGapMm?: number | null;
  readonly startPlace?: number | null;
}

export interface MapPuzzle {
  readonly params: PuzzleParams;
  /** The puzzle's places in a fixed order (the instance). Empty: parameters only. */
  readonly places: readonly Place[];
  /**
   * A list of places instead of the region's towns: `fixed` = exactly these places (no
   * search), `pool` = the search chooses from them.
   */
  readonly list?: { readonly mode: 'fixed' | 'pool'; readonly places: readonly Place[] };
  readonly constraints: {
    /** GeoNames ids (or list indices for custom places, as negative numbers −1 − index). */
    readonly pinned: readonly number[];
    readonly excluded: readonly number[];
    readonly groups: readonly GroupConstraint[];
  };
  readonly board?: BoardExtras;
  readonly results?: MapResults;
}

export interface IncrementalPuzzleFile {
  readonly params: IncrementalUiParams;
  /** Board coordinates in mm, in order (point 1 first). */
  readonly points: readonly Point[];
  readonly results?: {
    readonly steps: readonly {
      readonly k: number;
      readonly tour: readonly number[];
      readonly stringMm: number;
      readonly gapMm: number | null;
      readonly trackGapMm: number | null;
    }[];
  };
}

export interface PuzzleDoc {
  readonly schema: typeof PUZZLE_SCHEMA;
  /** Stable id (library, highscores). */
  readonly id: string;
  readonly kind: 'map' | 'incremental';
  readonly title: string;
  readonly description: string;
  readonly purpose: Purpose;
  /** Language of the board texts. */
  readonly language: LabelLanguage;
  /** Country data version the places come from, e.g. { country: 'DE', version: 1 }. */
  readonly data: { readonly country: string; readonly version: number } | null;
  readonly app: string;
  /** ISO timestamp of the last change. */
  readonly updated: string;
  readonly map?: MapPuzzle;
  readonly incremental?: IncrementalPuzzleFile;
}

/** Random id (not cryptographic; library keys only). */
export function newPuzzleId(random: () => number): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += Math.floor(random() * 36).toString(36);
  return s;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

function parseMember(v: unknown): Member | null {
  if (!isObj(v) || !isNum(v.lat) || !isNum(v.lon)) return null;
  if (Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) return null;
  const name = str(v.name, 200);
  if (!name) return null;
  return {
    ...(Number.isInteger(v.id) && (v.id as number) > 0 ? { id: v.id as number } : {}),
    name,
    lat: v.lat,
    lon: v.lon,
  };
}

function parsePlace(v: unknown): Place | null {
  const base = parseMember(v);
  if (!base || !isObj(v)) return null;
  const label = typeof v.label === 'string' && v.label ? { label: str(v.label, 200) } : {};
  const highlight = v.highlight === true ? { highlight: true } : {};
  const members = Array.isArray(v.members)
    ? v.members
        .slice(0, 20)
        .map(parseMember)
        .filter((m): m is Member => m !== null)
    : [];
  // A composite place: at least two members; its position is their mean.
  if (members.length >= 2) {
    return { name: base.name, ...compositeCentre(members), ...label, members, ...highlight };
  }
  return { ...base, ...label, ...highlight };
}

function parseBoardExtras(v: unknown, places: number): BoardExtras | undefined {
  if (!isObj(v)) return undefined;
  const legend = Array.isArray(v.legend)
    ? v.legend
        .filter((e): e is Record<string, unknown> => isObj(e) && typeof e.text === 'string')
        .slice(0, 12)
        .map((e): LegendEntry => ({
          symbol: e.symbol === 'ring' || e.symbol === 'nail' ? e.symbol : 'none',
          text: str(e.text, 300),
        }))
    : [];
  const start =
    Number.isInteger(v.startPlace) &&
    (v.startPlace as number) >= 0 &&
    (v.startPlace as number) < places
      ? (v.startPlace as number)
      : null;
  const e = isObj(v.export) ? v.export : null;
  const holes: HoleMode | null =
    e?.holes === 'cut' || e?.holes === 'mark' || e?.holes === 'pit' ? e.holes : null;
  return {
    legend,
    startPlace: start,
    ...(e && holes ? { export: { holes, edge: e.edge !== false } } : {}),
  };
}

/** Mean latitude and longitude of the members (stored position of a composite place). */
export function compositeCentre(members: readonly Member[]): { lat: number; lon: number } {
  const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
  const lon = members.reduce((s, m) => s + m.lon, 0) / members.length;
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
}

function parsePlaces(v: unknown, max = 5000): Place[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, max)
    .map(parsePlace)
    .filter((p): p is Place => p !== null);
}

/** Numeric/string fields of `defaults` taken from `value` where they have the right type. */
function merge<T extends object>(defaults: T, value: unknown): T {
  if (!isObj(value)) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, d] of Object.entries(defaults)) {
    const v = value[key];
    if (typeof d === 'number' && isNum(v)) out[key] = v;
    else if (typeof d === 'string' && typeof v === 'string') out[key] = v.slice(0, 40);
    else if (typeof d === 'boolean' && typeof v === 'boolean') out[key] = v;
  }
  return out as T;
}

function listMode(v: unknown): 'fixed' | 'pool' | null {
  return v === 'fixed' || v === 'pool' ? v : null;
}

function ids(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)).slice(0, 5000) : [];
}

/** Validates a puzzle file; throws with a short reason if it is not one. */
export function parsePuzzleDoc(json: unknown): PuzzleDoc {
  if (!isObj(json)) throw new Error('not a puzzle file');
  if (json.schema !== PUZZLE_SCHEMA) throw new Error(`unsupported schema ${String(json.schema)}`);
  const kind = json.kind === 'incremental' ? 'incremental' : json.kind === 'map' ? 'map' : null;
  if (!kind) throw new Error('unknown puzzle kind');
  const data =
    isObj(json.data) && typeof json.data.country === 'string' && isNum(json.data.version)
      ? { country: json.data.country.slice(0, 2).toUpperCase(), version: json.data.version }
      : null;
  const base = {
    schema: PUZZLE_SCHEMA,
    id: str(json.id, 40).replace(/[^0-9A-Za-z_-]/g, '') || 'unnamed',
    kind,
    title: str(json.title, 200),
    description: str(json.description, 4000),
    purpose: json.purpose === 'digital' ? 'digital' : 'board',
    language: json.language === 'en' ? 'en' : 'de',
    data,
    app: str(json.app, 60),
    updated: str(json.updated, 40),
  } as const;
  if (kind === 'map') {
    const m = json.map;
    if (!isObj(m)) throw new Error('map puzzle without map section');
    const params = merge(DEFAULT_PARAMS, m.params);
    const mode = isObj(m.list) ? listMode(m.list.places === undefined ? null : m.list.mode) : null;
    const list = mode && isObj(m.list) ? { mode, places: parsePlaces(m.list.places) } : undefined;
    const c = isObj(m.constraints) ? m.constraints : {};
    const groups = Array.isArray(c.groups)
      ? c.groups
          .filter(
            (g): g is { group: string; min: number; max?: unknown } =>
              isObj(g) && typeof g.group === 'string' && isNum(g.min),
          )
          .map((g) => ({
            group: g.group.slice(0, 20),
            min: g.min,
            max: isNum(g.max) ? g.max : null,
          }))
      : [];
    const places = parsePlaces(m.places, 500);
    const board = parseBoardExtras(m.board, places.length);
    const r = m.results;
    const results =
      isObj(r) && Array.isArray(r.tour) && isNum(r.lengthMm)
        ? {
            tour: ids(r.tour).filter((i) => i >= 0 && i < places.length),
            lengthMm: r.lengthMm,
            gapMm: isNum(r.gapMm) ? r.gapMm : null,
            model: r.model === 'euclidean' ? ('euclidean' as const) : ('string' as const),
            scaleGapMm: isNum(r.scaleGapMm) ? r.scaleGapMm : null,
            startPlace: Number.isInteger(r.startPlace) ? (r.startPlace as number) : null,
          }
        : undefined;
    return {
      ...base,
      map: {
        params: { ...params, labelLanguage: params.labelLanguage === 'en' ? 'en' : 'de' },
        places,
        ...(list ? { list } : {}),
        constraints: { pinned: ids(c.pinned), excluded: ids(c.excluded), groups },
        ...(board ? { board } : {}),
        ...(results ? { results } : {}),
      },
    };
  }
  const inc = json.incremental;
  if (!isObj(inc)) throw new Error('incremental puzzle without incremental section');
  const params = merge(DEFAULT_INCREMENTAL_UI, inc.params);
  const points = Array.isArray(inc.points)
    ? inc.points
        .filter((p): p is [number, number] => Array.isArray(p) && isNum(p[0]) && isNum(p[1]))
        .slice(0, 16)
        .map(([x, y]) => [x, y] as const)
    : [];
  return {
    ...base,
    incremental: {
      params: {
        ...params,
        labelLanguage: params.labelLanguage === 'en' ? 'en' : 'de',
        n: points.length || params.n,
      },
      points,
    },
  };
}

/** Pretty JSON for download (results included). */
export function serializePuzzleDoc(doc: PuzzleDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** File name from the title: lower case, ASCII, dashes. */
export function puzzleFileName(doc: PuzzleDoc): string {
  const base = (doc.title || `${doc.kind}-${doc.id}`)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'puzzle'}.tsp.json`;
}

/** Entry of the curated collection's index (public/puzzles/index.json). */
export interface CollectionEntry {
  readonly file: string;
  readonly id: string;
  readonly kind: 'map' | 'incremental';
  readonly title: string;
  readonly description: string;
  readonly purpose: Purpose;
  readonly region: string;
  readonly n: number;
}

export interface CollectionIndex {
  readonly schema: typeof PUZZLE_SCHEMA;
  readonly puzzles: readonly CollectionEntry[];
}

export function collectionEntry(doc: PuzzleDoc, file: string): CollectionEntry {
  return {
    file,
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    purpose: doc.purpose,
    region: doc.map?.params.region ?? '',
    n: doc.map ? doc.map.places.length || doc.map.params.n : (doc.incremental?.points.length ?? 0),
  };
}

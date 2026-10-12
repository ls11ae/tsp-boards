// Place lists: puzzles from a list of places instead of the region's towns (roadmap 5.2).
// Lines are town names (matched fuzzily against the country data, with a choice when
// ambiguous) or CSV rows "name, latitude, longitude[, label]" for places that are not towns.
// Identical or very close places merge into one node whose label can name all of them.

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { City } from './data';
import { geodesicKm } from './projection';
import type { Place } from './puzzle-file';

export interface ParsedLine {
  /** 1-based line number in the input. */
  readonly line: number;
  readonly text: string;
  /** Name to look up, or the name of a custom place. */
  readonly name: string;
  /** Coordinates for a custom place (CSV row). */
  readonly lat?: number;
  readonly lon?: number;
  readonly label?: string;
}

/**
 * Splits the input into place lines; '#' starts a comment and a header row is skipped.
 * Columns are separated by semicolons or tabs (then a decimal comma is allowed) or commas.
 */
export function parsePlaceLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    const semicolon = /[;\t]/.test(line);
    const cells = line.split(semicolon ? /\s*[;\t]\s*/ : /\s*,\s*/);
    const [name = '', a, b, ...rest] = cells;
    if (/^(name|ort|place)$/i.test(name) && out.length === 0 && cells.length >= 3) return;
    const num = (v: string | undefined) =>
      v === undefined || v === '' ? NaN : Number(semicolon ? v.replace(',', '.') : v);
    const lat = num(a);
    const lon = num(b);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      const label = rest.join(', ').trim();
      out.push({ line: i + 1, text: raw, name, lat, lon, ...(label ? { label } : {}) });
    } else {
      out.push({ line: i + 1, text: raw, name: line });
    }
  });
  return out;
}

/** Lower case, no diacritics (ü -> u), ß -> ss, only letters and digits. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** German transliteration (ü -> ue), normalised: "Muenchen" finds "München". */
function transliterate(name: string): string {
  return normalizeName(name.replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue'));
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export type MatchKind = 'exact' | 'prefix' | 'fuzzy';

export interface Match {
  readonly status: 'matched' | 'ambiguous' | 'not-found';
  /** Candidates, best first (the first is the default choice). */
  readonly options: readonly City[];
  readonly kind: MatchKind | null;
}

/** Fuzzy lookup of town names in the country data. */
export class NameIndex {
  private readonly keys: { readonly city: City; readonly forms: readonly string[] }[];

  constructor(cities: readonly City[]) {
    this.keys = cities.map((city) => {
      const forms = new Set<string>();
      for (const n of [city.name, city.label, city.nameEn]) {
        forms.add(normalizeName(n));
        forms.add(transliterate(n));
      }
      return { city, forms: [...forms] };
    });
  }

  match(query: string): Match {
    const q = [...new Set([normalizeName(query), transliterate(query)])].filter(Boolean);
    if (q.length === 0) return { status: 'not-found', options: [], kind: null };
    const byPop = (a: City, b: City) => b.pop - a.pop;
    const exact = this.keys.filter((k) => k.forms.some((f) => q.includes(f))).map((k) => k.city);
    if (exact.length > 0) {
      exact.sort(byPop);
      return {
        status: exact.length === 1 ? 'matched' : 'ambiguous',
        options: exact.slice(0, 8),
        kind: 'exact',
      };
    }
    // "Frankfurt" -> "Frankfurt am Main", "Frankfurt (Oder)": word prefix.
    const prefix = this.keys
      .filter((k) => k.forms.some((f) => q.some((x) => f.startsWith(`${x} `))))
      .map((k) => k.city)
      .sort(byPop);
    if (prefix.length > 0) {
      return {
        status: prefix.length === 1 ? 'matched' : 'ambiguous',
        options: prefix.slice(0, 8),
        kind: 'prefix',
      };
    }
    const max = q[0]!.length >= 8 ? 2 : q[0]!.length >= 4 ? 1 : 0;
    if (max === 0) return { status: 'not-found', options: [], kind: null };
    const fuzzy = this.keys
      .map((k) => ({
        city: k.city,
        d: Math.min(...k.forms.flatMap((f) => q.map((x) => editDistance(x, f, max)))),
      }))
      .filter((x) => x.d <= max)
      .sort((a, b) => a.d - b.d || b.city.pop - a.city.pop)
      .map((x) => x.city);
    if (fuzzy.length === 0) return { status: 'not-found', options: [], kind: null };
    // A typo match is never certain: always offer the choice.
    return { status: 'ambiguous', options: fuzzy.slice(0, 8), kind: 'fuzzy' };
  }
}

/** A resolved list entry: a town of the data or a custom place. */
export interface ListPlace extends Place {
  /** Input line(s) this place came from. */
  readonly lines: readonly number[];
  /** Names of all merged places (one entry unless merged). */
  readonly names: readonly string[];
}

/**
 * Merges places that are the same town or lie within `radiusKm` of each other; the merged
 * place keeps the first place's position and id and gets a label naming all of them (unless
 * one of them has an explicit label).
 */
export function mergePlaces(places: readonly ListPlace[], radiusKm: number): ListPlace[] {
  const groups: ListPlace[][] = [];
  for (const p of places) {
    const group = groups.find((g) =>
      g.some(
        (q) =>
          (p.id !== undefined && p.id === q.id) ||
          geodesicKm([p.lon, p.lat], [q.lon, q.lat]) <= radiusKm,
      ),
    );
    if (group) group.push(p);
    else groups.push([p]);
  }
  return groups.map((g) => {
    const first = g[0]!;
    if (g.length === 1) return first;
    const names = [...new Set(g.flatMap((p) => p.names))];
    const explicit = g.find((p) => p.label !== undefined)?.label;
    // The same town several times keeps its name; different places are named together.
    const sameTown = g.every((p) => p.id !== undefined && p.id === first.id);
    const label = explicit ?? (sameTown ? undefined : names.join(' · '));
    return {
      ...first,
      ...(label ? { label } : {}),
      lines: g.flatMap((p) => p.lines),
      names,
    };
  });
}

/** Custom places get negative ids: −1 − index in the list. */
export const customId = (index: number) => -1 - index;

/** The list as City records for the board pool (custom places: population 1, no state). */
export function listCities(places: readonly Place[], towns: ReadonlyMap<number, City>): City[] {
  return places.map((p, i) => {
    const town = p.id !== undefined ? towns.get(p.id) : undefined;
    if (town) return p.label ? { ...town, label: p.label } : town;
    return {
      id: customId(i),
      name: p.name,
      label: p.label ?? p.name,
      nameEn: p.name,
      lat: p.lat,
      lon: p.lon,
      pop: 1,
      state: '',
      wikidata: null,
      flags: 0,
    };
  });
}

// --- links ---------------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url without padding (the core has no btoa). */
function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += ALPHABET[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

function fromBase64url(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? ALPHABET.indexOf(chunk[k]!) : 0;
      if (v < 0) throw new Error('invalid base64url');
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return Uint8Array.from(bytes);
}

/** A list row as decoded from a link: a town (id, optional label) or a custom place. */
export type LinkPlace = Place | { readonly id: number; readonly label?: string };

/**
 * Compact, compressed form of a place list for links: towns as ids (with a label if set),
 * custom places with name and coordinates (5 decimals, ~1 m).
 */
export function encodePlaceList(mode: 'fixed' | 'pool', places: readonly Place[]): string {
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  const rows = places.map((p) =>
    p.id !== undefined
      ? p.label
        ? [p.id, p.label]
        : p.id
      : [p.name, round(p.lat), round(p.lon), ...(p.label ? [p.label] : [])],
  );
  const json = JSON.stringify([mode === 'fixed' ? 0 : 1, rows]);
  return base64url(deflateSync(strToU8(json), { level: 9 }));
}

function decodeRow(row: unknown): LinkPlace | null {
  if (Number.isInteger(row) && (row as number) > 0) return { id: row as number };
  if (!Array.isArray(row)) return null;
  const [a, b, c, d] = row as unknown[];
  if (Number.isInteger(a) && (a as number) > 0 && typeof b === 'string')
    return { id: a as number, label: b.slice(0, 200) };
  if (typeof a !== 'string' || typeof b !== 'number' || typeof c !== 'number') return null;
  if (Math.abs(b) > 90 || Math.abs(c) > 180) return null;
  return {
    name: a.slice(0, 200),
    lat: b,
    lon: c,
    ...(typeof d === 'string' && d ? { label: d.slice(0, 200) } : {}),
  };
}

/** Inverse of encodePlaceList; null if the text is not a place list. */
export function decodePlaceList(
  text: string,
): { readonly mode: 'fixed' | 'pool'; readonly places: readonly LinkPlace[] } | null {
  try {
    const json = JSON.parse(strFromU8(inflateSync(fromBase64url(text)))) as unknown;
    if (!Array.isArray(json) || json.length !== 2 || !Array.isArray(json[1])) return null;
    const rows = json[1] as unknown[];
    const places = rows
      .slice(0, 2000)
      .map(decodeRow)
      .filter((p): p is LinkPlace => p !== null);
    return { mode: json[0] === 0 ? 'fixed' : 'pool', places };
  } catch {
    return null;
  }
}

// Place lists: puzzles from a list of places instead of the region's towns (roadmap 5.2).
// Lines are town names (matched fuzzily against the country data, with a choice when
// ambiguous) or CSV rows "name, latitude, longitude[, label]" for places that are not towns.
// Identical or very close places merge into one node whose label can name all of them.
// A composite place (roadmap 7.1) is one node for several towns or points:
// "Ruhr Innovation Lab = Bochum + Dortmund", members as town names or "name (lat, lon)".
// A leading '*' marks a place (roadmap 9.1: a ring on the board), e.g. "* Aachen". A town's
// own label follows a semicolon (roadmap 9.13), e.g. "* München; München ×2". A composite or
// custom place may give its English name after a bar (roadmap 9.16):
// "Rhein-Main-Universitäten | Rhine-Main Universities = Darmstadt + Frankfurt am Main + Mainz".

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import type { City } from './data';
import { geodesicKm } from './projection';
import { compositeCentre, type Member, type Place } from './puzzle-file';

/** A member of a composite line: a town name, or a point with coordinates. */
export interface ParsedMember {
  readonly name: string;
  readonly lat?: number;
  readonly lon?: number;
}

export interface ParsedLine {
  /** 1-based line number in the input. */
  readonly line: number;
  readonly text: string;
  /** Name to look up, or the name of a custom place. */
  readonly name: string;
  /** English name of a custom or composite place ("Name | English name"). */
  readonly nameEn?: string;
  /** Coordinates for a custom place (CSV row). */
  readonly lat?: number;
  readonly lon?: number;
  readonly label?: string;
  /** Members of a composite place ("name = A + B"). */
  readonly members?: readonly ParsedMember[];
  /** Marked place: the line starts with '*'. */
  readonly highlight?: boolean;
}

const COMPOSITE = /^([^=]+?)\s*=\s*(.+)$/;
const MEMBER_POINT = /^(.*?)\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*\)$/;

/** "Name | English name" as the name and its English version. */
function splitName(text: string): { name: string; nameEn?: string } {
  const [name = '', en = ''] = text.split(/\s*\|\s*/);
  return en ? { name: name.trim(), nameEn: en.trim() } : { name: text.trim() };
}

/** "Bochum" or "Campus Nord (51.49, 7.41)". */
function parseMember(token: string): ParsedMember | null {
  const point = MEMBER_POINT.exec(token);
  if (point) {
    const lat = Number(point[2]!.replace(',', '.'));
    const lon = Number(point[3]!.replace(',', '.'));
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && point[1])
      return { name: point[1], lat, lon };
  }
  return token ? { name: token } : null;
}

/** "Name = A + B[; label]" as a composite line (null if it is none). */
function parseComposite(line: string): Omit<ParsedLine, 'line' | 'text'> | null {
  // The label follows a semicolon outside parentheses (inside: decimal-comma coordinates).
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '(') depth++;
    else if (line[i] === ')') depth--;
    else if (line[i] === ';' && depth === 0) cut = i;
  }
  const head = cut >= 0 ? line.slice(0, cut).trim() : line;
  const label = cut >= 0 ? line.slice(cut + 1).trim() : '';
  const m = COMPOSITE.exec(head);
  if (!m) return null;
  const members = m[2]!
    .split(/\s*\+\s*/)
    .map((t) => parseMember(t.trim()))
    .filter((x): x is ParsedMember => x !== null);
  if (members.length < 2) return null;
  return { ...splitName(m[1]!), members, ...(label ? { label } : {}) };
}

/** A composite place from its members; its stored position is their mean. */
export function compositePlace(
  name: string,
  members: readonly Member[],
  label?: string,
  nameEn?: string,
): Place {
  return {
    name,
    ...compositeCentre(members),
    ...(label ? { label } : {}),
    ...(nameEn ? { nameEn } : {}),
    members,
  };
}

/**
 * Splits the input into place lines; '#' starts a comment and a header row is skipped.
 * Columns are separated by semicolons or tabs (then a decimal comma is allowed) or commas.
 */
export function parsePlaceLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let line = raw.replace(/#.*$/, '').trim();
    const star = /^\*\s*/.exec(line);
    if (star) line = line.slice(star[0].length);
    if (!line) return;
    const mark = star ? { highlight: true } : {};
    const composite = parseComposite(line);
    if (composite) {
      out.push({ line: i + 1, text: raw, ...composite, ...mark });
      return;
    }
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
      out.push({
        line: i + 1,
        text: raw,
        ...splitName(name),
        lat,
        lon,
        ...(label ? { label } : {}),
        ...mark,
      });
    } else if (semicolon && cells.length === 2 && a) {
      // "Town; label": the town with a label of its own.
      out.push({ line: i + 1, text: raw, name, label: a, ...mark });
    } else {
      out.push({ line: i + 1, text: raw, name: line, ...mark });
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
    // Composite places are nodes of their own; they never merge.
    const group = p.members
      ? undefined
      : groups.find((g) =>
          g.some(
            (q) =>
              !q.members &&
              ((p.id !== undefined && p.id === q.id) ||
                geodesicKm([p.lon, p.lat], [q.lon, q.lat]) <= radiusKm),
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
      ...(g.some((p) => p.highlight) ? { highlight: true } : {}),
      lines: g.flatMap((p) => p.lines),
      names,
    };
  });
}

/** Custom places get negative ids: −1 − index in the list. */
export const customId = (index: number) => -1 - index;

/** The list as City records for the board pool (custom places: population 1, no state). */
export function listCities(places: readonly Place[], towns: ReadonlyMap<number, City>): City[] {
  return places.map((p, i): City => {
    const city = listCity(p, i, towns);
    return p.highlight ? { ...city, highlight: true } : city;
  });
}

function listCity(p: Place, i: number, towns: ReadonlyMap<number, City>): City {
  if (p.members && p.members.length >= 2) {
    // Population and state from the member towns (custom points count 1).
    const memberTowns = p.members.map((m) => (m.id !== undefined ? towns.get(m.id) : undefined));
    const memberEn = p.members.map((m, k) => memberTowns[k]?.nameEn ?? m.name);
    // "Bonn/Köln" is "Bonn/Cologne" in English; other names need their own (roadmap 9.16).
    const joined = p.name === p.members.map((m) => m.name).join('/');
    return {
      id: customId(i),
      name: p.name,
      label: p.label ?? p.name,
      nameEn: p.nameEn ?? (joined ? memberEn.join('/') : p.name),
      lat: p.lat,
      lon: p.lon,
      pop: memberTowns.reduce((s, t) => s + (t?.pop ?? 1), 0),
      state: memberTowns.find((t) => t !== undefined)?.state ?? '',
      wikidata: null,
      flags: 0,
      members: p.members.map((m, k) => ({
        name: m.name,
        ...(memberEn[k] !== m.name ? { nameEn: memberEn[k] } : {}),
        lat: m.lat,
        lon: m.lon,
      })),
    };
  }
  const town = p.id !== undefined ? towns.get(p.id) : undefined;
  if (town) return p.label ? { ...town, label: p.label } : town;
  return {
    id: customId(i),
    name: p.name,
    label: p.label ?? p.name,
    nameEn: p.nameEn ?? p.name,
    lat: p.lat,
    lon: p.lon,
    pop: 1,
    state: '',
    wikidata: null,
    flags: 0,
  };
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

/** A member as decoded from a link: a town id, or a point with name and coordinates. */
export type LinkMember = Member | { readonly id: number };

/**
 * A list row as decoded from a link: a town (id, optional label), a custom place, or a
 * composite place whose members are towns (ids) or points.
 */
export type LinkPlace =
  | Place
  | { readonly id: number; readonly label?: string }
  | {
      readonly name: string;
      readonly label?: string;
      readonly nameEn?: string;
      readonly members: readonly LinkMember[];
    };

/**
 * Compact, compressed form of a place list for links: towns as ids (with a label if set),
 * custom places with name and coordinates (5 decimals, ~1 m), composite places as
 * [name, [members], label?] with members as ids or [name, lat, lon].
 */
export function encodePlaceList(mode: 'fixed' | 'pool', places: readonly Place[]): string {
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  // An English name rides in the name as "Name | English name" (roadmap 9.16).
  const name = (p: Place) => (p.nameEn ? `${p.name} | ${p.nameEn}` : p.name);
  const rows = places.map((p) =>
    p.members
      ? [
          name(p),
          p.members.map((m) => m.id ?? [m.name, round(m.lat), round(m.lon)]),
          ...(p.label ? [p.label] : []),
        ]
      : p.id !== undefined
        ? p.label
          ? [p.id, p.label]
          : p.id
        : [name(p), round(p.lat), round(p.lon), ...(p.label ? [p.label] : [])],
  );
  // Marked places as a third element (older links have two).
  const marked = places.flatMap((p, i) => (p.highlight ? [i] : []));
  const json = JSON.stringify([mode === 'fixed' ? 0 : 1, rows, ...(marked.length ? [marked] : [])]);
  return base64url(deflateSync(strToU8(json), { level: 9 }));
}

function decodeMember(m: unknown): LinkMember | null {
  if (Number.isInteger(m) && (m as number) > 0) return { id: m as number };
  if (!Array.isArray(m)) return null;
  const [name, lat, lon] = m as unknown[];
  if (typeof name !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: name.slice(0, 200), lat, lon };
}

function decodeRow(row: unknown): LinkPlace | null {
  if (Number.isInteger(row) && (row as number) > 0) return { id: row as number };
  if (!Array.isArray(row)) return null;
  const [a, b, c, d] = row as unknown[];
  if (typeof a === 'string' && Array.isArray(b)) {
    const members = b
      .slice(0, 20)
      .map(decodeMember)
      .filter((m): m is LinkMember => m !== null);
    if (members.length < 2) return null;
    return {
      ...splitName(a.slice(0, 200)),
      members,
      ...(typeof c === 'string' && c ? { label: c.slice(0, 200) } : {}),
    };
  }
  if (Number.isInteger(a) && (a as number) > 0 && typeof b === 'string')
    return { id: a as number, label: b.slice(0, 200) };
  if (typeof a !== 'string' || typeof b !== 'number' || typeof c !== 'number') return null;
  if (Math.abs(b) > 90 || Math.abs(c) > 180) return null;
  return {
    ...splitName(a.slice(0, 200)),
    lat: b,
    lon: c,
    ...(typeof d === 'string' && d ? { label: d.slice(0, 200) } : {}),
  };
}

/** Inverse of encodePlaceList; null if the text is not a place list. */
export function decodePlaceList(text: string): {
  readonly mode: 'fixed' | 'pool';
  readonly places: readonly LinkPlace[];
  /** Indices of marked places. */
  readonly highlight: readonly number[];
} | null {
  try {
    const json = JSON.parse(strFromU8(inflateSync(fromBase64url(text)))) as unknown;
    if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) return null;
    const rows = json[1] as unknown[];
    const decoded = rows.slice(0, 2000).map(decodeRow);
    // Marked indices refer to the rows; rows that fail to decode are dropped below.
    const kept = decoded.flatMap((p, i) => (p !== null ? [i] : []));
    const places = decoded.filter((p): p is LinkPlace => p !== null);
    const marked = new Set(
      Array.isArray(json[2]) ? (json[2] as unknown[]).filter((i) => Number.isInteger(i)) : [],
    );
    const highlight = kept.flatMap((row, i) => (marked.has(row) ? [i] : []));
    return { mode: json[0] === 0 ? 'fixed' : 'pool', places, highlight };
  } catch {
    return null;
  }
}

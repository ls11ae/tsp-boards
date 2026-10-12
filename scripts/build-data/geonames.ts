// GeoNames parsing and cleaning: one city per municipality, names in the local language.
//
// GeoNames codes many city districts as plain PPL (not PPLX), but districts share the
// municipality key with their city. So we group populated places by municipality key, take the
// municipality's administrative feature for name and population, and the most important
// populated place (seat of administration) for the coordinates. The key and the cleaning of
// official names depend on the country (MunicipalityScheme): Germany admin4 (AGS), Austria and
// Switzerland admin3 (Vienna as a whole: its admin3 units are districts), the Netherlands
// admin2.

import { CityFlag } from '../../src/core/data';

export interface GeoNameRow {
  readonly id: number;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly featureClass: string;
  readonly featureCode: string;
  readonly admin1: string;
  readonly admin2: string;
  readonly admin3: string;
  readonly admin4: string;
  readonly population: number;
}

export interface AltName {
  readonly lang: string;
  readonly name: string;
  readonly preferred: boolean;
  readonly short: boolean;
  readonly colloquial: boolean;
  readonly historic: boolean;
}

export type AltNames = ReadonlyMap<number, readonly AltName[]>;

/** Populated-place codes we keep, ranked by administrative importance (lower = seat of more). */
const PLACE_RANK: ReadonlyMap<string, number> = new Map([
  ['PPLC', 0],
  ['PPLG', 1],
  ['PPLA', 1],
  ['PPLA2', 2],
  ['PPLA3', 3],
  ['PPLA4', 4],
  ['PPL', 5],
]);
// Dropped on purpose: PPLX (section of a populated place), PPLH (historical), PPLQ (abandoned),
// PPLW (destroyed), PPLF (farm village), PPLL (locality), PPLR (religious), PPLS, PPLCH, PPLA5.

export function isKeptPlace(row: GeoNameRow): boolean {
  return row.featureClass === 'P' && PLACE_RANK.has(row.featureCode);
}

/** Parses the GeoNames table (19 tab-separated columns). Keeps populated places and ADM2–4. */
export function parseGeoNames(text: string): GeoNameRow[] {
  const rows: GeoNameRow[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 19) throw new Error(`GeoNames: expected 19 columns, got ${c.length}`);
    const featureClass = c[6]!;
    const featureCode = c[7]!;
    if (featureClass !== 'P' && !(featureClass === 'A' && /^ADM[234]$/.test(featureCode))) continue;
    rows.push({
      id: Number(c[0]),
      name: c[1]!,
      lat: Number(c[4]),
      lon: Number(c[5]),
      featureClass,
      featureCode,
      admin1: c[10]!,
      admin2: c[11]!,
      admin3: c[12]!,
      admin4: c[13]!,
      population: Number(c[14]) || 0,
    });
  }
  return rows;
}

/** Parses alternateNamesV2 (10 columns) for the given GeoNames ids. */
export function parseAlternateNames(
  text: string,
  ids: ReadonlySet<number>,
): Map<number, AltName[]> {
  const result = new Map<number, AltName[]>();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 8) throw new Error(`alternate names: expected 10 columns, got ${c.length}`);
    const id = Number(c[1]);
    if (!ids.has(id)) continue;
    let list = result.get(id);
    if (!list) result.set(id, (list = []));
    list.push({
      lang: c[2]!,
      name: c[3]!,
      preferred: c[4] === '1',
      short: c[5] === '1',
      colloquial: c[6] === '1',
      historic: c[7] === '1',
    });
  }
  return result;
}

export interface MunicipalityScheme {
  /** Municipality key of a row; null if the row has none (a place then stands alone). */
  readonly key: (row: GeoNameRow) => string | null;
  /** The administrative feature that names a municipality (and gives its population). */
  readonly isUnit: (row: GeoNameRow) => boolean;
  /** Cleans an official municipality name (`expansions`: place and alternate names). */
  readonly clean: (name: string, expansions: readonly string[]) => string;
  /** Language of alternate names used for short labels and expansions. */
  readonly language: string;
}

const isAdmin = (row: GeoNameRow, code: string) =>
  row.featureClass === 'A' && row.featureCode === code;

/** Vienna's admin1 code: the city is one municipality, its admin3 units are districts. */
const VIENNA = '09';

export const SCHEMES: Readonly<Record<string, MunicipalityScheme>> = {
  DE: {
    key: (r) => (r.admin4 ? `${r.admin1}/${r.admin4}` : null),
    isUnit: (r) => isAdmin(r, 'ADM4'),
    clean: cleanMunicipalityName,
    language: 'de',
  },
  AT: {
    key: (r) => (r.admin1 === VIENNA ? VIENNA : r.admin3 ? `${r.admin1}/${r.admin3}` : null),
    isUnit: (r) => isAdmin(r, r.admin1 === VIENNA ? 'ADM2' : 'ADM3'),
    // "Gemeinde Ramsau am Dachstein", "Wien Stadt".
    clean: (name) =>
      name
        .replace(/^(Markt|Stadt)?[Gg]emeinde /u, '')
        .replace(/ Stadt$/u, '')
        .trim(),
    language: 'de',
  },
  CH: {
    key: (r) => (r.admin3 ? `${r.admin1}/${r.admin3}` : null),
    isUnit: (r) => isAdmin(r, 'ADM3'),
    // Multilingual names: the first one ("Bern/Berne/Berna", "Biel/Bienne"); canton suffixes
    // such as "Aesch (BL)" stay, they tell equal names apart.
    clean: (name) => name.split('/')[0]!.trim(),
    language: 'de',
  },
  NL: {
    key: (r) => (r.admin2 ? `${r.admin1}/${r.admin2}` : null),
    isUnit: (r) => isAdmin(r, 'ADM2'),
    clean: (name) => name.replace(/^Gemeente /u, '').trim(),
    language: 'nl',
  },
};

export interface Municipality {
  /** The municipality's administrative feature, if GeoNames has one for this key. */
  readonly unit: GeoNameRow | null;
  /** Kept populated places (see isKeptPlace) in the municipality. */
  readonly places: readonly GeoNameRow[];
}

/** Groups kept places by municipality key; places without a key form their own group. */
export function groupMunicipalities(
  rows: readonly GeoNameRow[],
  scheme: MunicipalityScheme = SCHEMES.DE!,
): Municipality[] {
  const groups = new Map<string, { unit: GeoNameRow | null; places: GeoNameRow[] }>();
  const group = (key: string) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { unit: null, places: [] }));
    return g;
  };
  for (const row of rows) {
    const key = scheme.key(row);
    if (scheme.isUnit(row)) {
      if (key) group(key).unit = row;
    } else if (isKeptPlace(row)) {
      group(key ?? `id/${row.id}`).places.push(row);
    }
  }
  return [...groups.values()];
}

function usable(a: AltName): boolean {
  return !a.historic && !a.colloquial;
}

function findAlt(
  alts: AltNames,
  id: number | undefined,
  match: (a: AltName) => boolean,
): string | null {
  if (id === undefined) return null;
  return alts.get(id)?.find((a) => usable(a) && match(a))?.name ?? null;
}

/** Official abbreviations such as "Kahl a.Main", "Burgberg i.Allgäu", "Pausa/Vogtl.". */
export function isAbbreviated(name: string): boolean {
  return /\p{L}\.\p{L}/u.test(name) || /\/\p{L}+\.$/u.test(name) || /\s\p{Ll}{1,2}\.\s/u.test(name);
}

function firstWord(name: string): string {
  return name.split(/[\s/]/u)[0]!;
}

/** Letters that mark the Sorbian part of bilingual names such as "Bautzen/Budyšin". */
const SORBIAN = /[ěščřžćźńłóśŕ]/u;

/** Official names that really start with "Stadt " (elsewhere it is a designation). */
const STADT_IN_NAME = new Set(['Stadt Wehlen']);

/** Generic expansions of Bavarian-style abbreviations, longest first. */
const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/ a\. ?d\. ?(?=\p{Lu})/u, ' an der '],
  [/ i\. ?d\. ?(?=\p{Lu})/u, ' in der '],
  [/ b\. ?(?=\p{Lu})/u, ' bei '],
  [/ i\. ?(?=\p{Lu})/u, ' im '],
  [/ a\. ?(?=\p{Lu})/u, ' am '],
];

/**
 * Cleans an official municipality name. Drops designations after a comma ("Gelnhausen,
 * Barbarossastadt", "München, Landeshauptstadt"), an English " Municipality" suffix, the
 * designation "Stadt " ("Stadt Buttstädt", except in STADT_IN_NAME), the Sorbian part of
 * bilingual names ("Bautzen/Budyšin"), and expands official abbreviations from a place or
 * German alternate name with the same first word ("Kahl a.Main" -> "Kahl am Main").
 */
export function cleanMunicipalityName(name: string, expansions: readonly string[]): string {
  let result = name
    .replace(/,.*$/u, '')
    .replace(/ Municipality$/u, '')
    .replace(/\s*\/\s*/gu, '/')
    .trim();
  if (!STADT_IN_NAME.has(result)) result = result.replace(/^Stadt /u, '');
  const [german, other] = result.split('/');
  if (other && SORBIAN.test(other)) result = german!;
  if (isAbbreviated(result)) {
    const expansion = expansions.find(
      (e) => !isAbbreviated(e) && firstWord(e) === firstWord(result),
    );
    if (expansion) {
      result = expansion;
    } else {
      for (const [pattern, replacement] of ABBREVIATIONS)
        result = result.replace(pattern, replacement);
    }
  }
  return result;
}

/**
 * GeoNames' alternate names for municipalities are less reliable than the official names
 * (e.g. "Leinfelden" for Leinfelden-Echterdingen), so the official name is used and cleaned.
 */
export type NameSource = 'unit:name' | 'place:preferred' | 'place:name';

/** Display name of a municipality; populated-place names only if there is no unit feature. */
export function municipalityName(
  unit: GeoNameRow | null,
  places: readonly GeoNameRow[],
  alts: AltNames,
  scheme: MunicipalityScheme = SCHEMES.DE!,
): { name: string; source: NameSource } {
  const expansions = [
    ...places.map((p) => p.name),
    ...(alts.get(unit?.id ?? -1) ?? [])
      .filter((a) => a.lang === scheme.language && usable(a))
      .map((a) => a.name),
  ];
  if (unit) return { name: scheme.clean(unit.name, expansions), source: 'unit:name' };
  const place = places[0];
  if (!place) throw new Error('municipality without unit and place');
  const preferred = findAlt(alts, place.id, (x) => x.lang === scheme.language && x.preferred);
  return {
    name: scheme.clean(preferred ?? place.name, expansions),
    source: preferred ? 'place:preferred' : 'place:name',
  };
}

function fold(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä|ae/gu, 'a')
    .replace(/ö|oe/gu, 'o')
    .replace(/ü|ue/gu, 'u')
    .replace(/ß/gu, 'ss')
    .replace(/^(saint|sankt|st\.) /u, 'st ');
}

/** True for a genuine English exonym (Munich for München), not a variant of the German name. */
export function isExonym(english: string, german: string): boolean {
  const e = fold(english);
  const g = fold(german);
  return !english.includes(',') && !g.includes(e) && !e.includes(g);
}

/** Representative place: the one named like the municipality, else the highest seat. */
function placeOrder(municipalityName: string) {
  return (x: GeoNameRow, y: GeoNameRow): number =>
    Number(y.name === municipalityName) - Number(x.name === municipalityName) ||
    PLACE_RANK.get(x.featureCode)! - PLACE_RANK.get(y.featureCode)! ||
    y.population - x.population ||
    x.id - y.id;
}

export interface CityRecord {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly nameEn: string;
  readonly lat: number;
  readonly lon: number;
  readonly pop: number;
  readonly admin1: string;
  readonly wikidata: string | null;
  readonly flags: number;
  readonly nameSource: NameSource;
}

export interface CleaningOptions {
  readonly minPopulation: number;
  /** A city this close (km) to a city `nearLargerFactor` times larger is flagged. */
  readonly nearLargerKm: number;
  readonly nearLargerFactor: number;
}

export const DEFAULT_CLEANING: CleaningOptions = {
  minPopulation: 1000,
  nearLargerKm: 3,
  nearLargerFactor: 5,
};

/** One city per municipality with population >= minPopulation, sorted by population. */
export function buildCities(
  rows: readonly GeoNameRow[],
  alts: AltNames,
  options: CleaningOptions = DEFAULT_CLEANING,
  scheme: MunicipalityScheme = SCHEMES.DE!,
): CityRecord[] {
  const cities: CityRecord[] = [];
  for (const { unit, places } of groupMunicipalities(rows, scheme)) {
    const placePop = Math.max(0, ...places.map((p) => p.population));
    const pop = unit && unit.population > 0 ? unit.population : placePop;
    if (pop < options.minPopulation) continue;

    const byPopulation = [...places].sort((x, y) => y.population - x.population || x.id - y.id);
    const { name, source } = municipalityName(unit, byPopulation, alts, scheme);
    const place = [...places].sort(placeOrder(name))[0] ?? null;
    const point = place ?? unit!;
    // A short label must be a prefix of the name ("Freiburg" for "Freiburg im Breisgau", not
    // "Bergzabern" for "Bad Bergzabern") and must not cut a double name ("Zeulenroda" for
    // "Zeulenroda-Triebes").
    const shortLabel = findAlt(
      alts,
      place?.id,
      (x) =>
        x.lang === scheme.language &&
        x.short &&
        !isAbbreviated(x.name) &&
        name.startsWith(x.name) &&
        !name.startsWith(`${x.name}-`),
    );
    // Only genuine exonyms (Munich, Cologne): preferred English names, without the odd ones
    // ("Rothenburg upon Tauber"), comma disambiguations ("Burgdorf, Hanover") and truncations
    // of the German name ("Hagen" for "Hagen am Teutoburger Wald").
    const nameEn =
      [unit?.id, place?.id]
        .map((id) => findAlt(alts, id, (x) => x.lang === 'en' && x.preferred))
        .find((n) => n !== null && isExonym(n, name)) ?? name;
    const wikidata =
      findAlt(alts, unit?.id, (x) => x.lang === 'wkdt') ??
      findAlt(alts, place?.id, (x) => x.lang === 'wkdt');

    cities.push({
      id: point.id,
      name,
      label: shortLabel ?? name,
      nameEn,
      lat: point.lat,
      lon: point.lon,
      pop,
      admin1: point.admin1,
      wikidata,
      flags: place ? 0 : CityFlag.MunicipalityPoint,
      nameSource: source,
    });
  }
  cities.sort((x, y) => y.pop - x.pop || x.id - y.id);
  return flagNearLarger(resolveLabels(cities), options);
}

/** Ambiguous short labels fall back to the full name; duplicate names are flagged. */
function resolveLabels(cities: readonly CityRecord[]): CityRecord[] {
  const count = (key: (c: CityRecord) => string) => {
    const m = new Map<string, number>();
    for (const c of cities) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
    return m;
  };
  const labels = count((c) => c.label);
  const names = count((c) => c.name);
  return cities.map((c) => {
    let { label, flags } = c;
    if (labels.get(label)! > 1 && label !== c.name) {
      label = c.name;
      flags |= CityFlag.AmbiguousLabel;
    }
    if (names.get(c.name)! > 1) flags |= CityFlag.DuplicateName;
    return { ...c, label, flags };
  });
}

function approxKm(a: CityRecord, b: CityRecord): number {
  const kmPerDeg = 111.32;
  const dx = (a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)) * kmPerDeg;
  const dy = (a.lat - b.lat) * kmPerDeg;
  return Math.sqrt(dx * dx + dy * dy);
}

function flagNearLarger(cities: readonly CityRecord[], options: CleaningOptions): CityRecord[] {
  // Cities are sorted by population, so all sufficiently larger candidates come first.
  return cities.map((c, i) => {
    for (let j = 0; j < i; j++) {
      const big = cities[j]!;
      if (big.pop < options.nearLargerFactor * c.pop) break;
      if (approxKm(big, c) < options.nearLargerKm) {
        return { ...c, flags: c.flags | CityFlag.NearLarger };
      }
    }
    return c;
  });
}

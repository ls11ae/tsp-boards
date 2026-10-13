// Place lists in the app (roadmap 5.2): text input matched against the country data, choices
// for ambiguous names, labels, merging, and the fixed-instance analysis.

import { citiesFromColumns, type City, type CountryFile } from '../core/data';
import type { RemovalSuggestion } from '../core/fixed';
import { rEffMm } from '../core/params';
import {
  compositePlace,
  mergePlaces,
  NameIndex,
  parsePlaceLines,
  type ListPlace,
} from '../core/places';
import type { LinkList } from '../core/permalink';
import type { Member, Place } from '../core/puzzle-file';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';
import { getBoard, townsById } from './board';
import { openMembers } from './controller';
import { useStore, type ListEntry, type PlaceListState } from './store';

export const DEFAULT_MERGE_KM = 2;

let nameIndex: { country: CountryFile; index: NameIndex } | null = null;

function names(country: CountryFile): NameIndex {
  if (nameIndex?.country !== country) {
    nameIndex = {
      country,
      index: new NameIndex(citiesFromColumns(country.cities, country.states)),
    };
  }
  return nameIndex.index;
}

/** Resolves one name (or point) of a line or a composite member. */
function resolveName(
  index: NameIndex,
  base: Pick<ListEntry, 'line' | 'text' | 'query' | 'label'>,
  lat: number | undefined,
  lon: number | undefined,
): ListEntry {
  if (lat !== undefined && lon !== undefined) {
    return { ...base, status: 'custom', options: [], choice: 0, custom: { lat, lon } };
  }
  const m = index.match(base.query);
  return {
    ...base,
    status: m.status,
    options: m.options.map((c) => ({ id: c.id, name: c.name, state: c.state, pop: c.pop })),
    choice: m.status === 'not-found' ? -1 : 0,
  };
}

/** Resolves the text into entries (towns matched, CSV rows as custom places). */
export function resolveLines(country: CountryFile, text: string): ListEntry[] {
  const index = names(country);
  return parsePlaceLines(text).map((line): ListEntry => {
    const base = {
      line: line.line,
      text: line.text,
      query: line.name,
      ...(line.label ? { label: line.label } : {}),
    };
    if (line.members) {
      const members = line.members.map((m) =>
        resolveName(index, { line: line.line, text: m.name, query: m.name }, m.lat, m.lon),
      );
      return { ...base, status: 'composite', options: [], choice: 0, members };
    }
    return resolveName(index, base, line.lat, line.lon);
  });
}

/** The town or point an entry stands for (null if skipped or not found). */
function entryMember(entry: ListEntry, towns: ReadonlyMap<number, City>): Member | null {
  if (entry.choice < 0) return null;
  if (entry.custom) return { name: entry.query, lat: entry.custom.lat, lon: entry.custom.lon };
  const option = entry.options[entry.choice];
  const town = option ? towns.get(option.id) : undefined;
  return town ? { id: town.id, name: town.name, lat: town.lat, lon: town.lon } : null;
}

/** The places of the entries (chosen towns and custom places), merged. */
export function entryPlaces(
  country: CountryFile,
  entries: readonly ListEntry[],
  mergeKm: number,
): Place[] {
  const towns = townsById(country);
  const list: ListPlace[] = [];
  for (const e of entries) {
    const label = e.label ? { label: e.label } : {};
    if (e.members) {
      // A composite place needs at least two resolved members.
      const members = e.members
        .map((m) => entryMember(m, towns))
        .filter((m): m is Member => m !== null);
      if (e.choice < 0 || members.length < 2) continue;
      list.push({
        ...compositePlace(e.query, members, e.label),
        lines: [e.line],
        names: [e.label ?? e.query],
      });
      continue;
    }
    if (e.custom) {
      if (e.choice < 0) continue;
      list.push({
        name: e.query,
        lat: e.custom.lat,
        lon: e.custom.lon,
        ...label,
        lines: [e.line],
        names: [e.label ?? e.query],
      });
      continue;
    }
    const option = e.options[e.choice];
    const town = option ? towns.get(option.id) : undefined;
    if (!town) continue;
    list.push({
      id: town.id,
      name: town.name,
      lat: town.lat,
      lon: town.lon,
      ...label,
      lines: [e.line],
      names: [e.label ?? town.label],
    });
  }
  return mergePlaces(list, mergeKm).map((p) => {
    const place: Place = {
      ...(p.id !== undefined ? { id: p.id } : {}),
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      ...(p.label ? { label: p.label } : {}),
      ...(p.members ? { members: p.members } : {}),
    };
    return place;
  });
}

function update(list: PlaceListState): void {
  const { run } = useStore.getState();
  useStore.setState({
    list,
    loaded: null,
    shown: { kind: 'auto' },
    run: { ...run, status: 'idle', progress: null, trace: [], error: null },
  });
  if (list.mode === 'fixed') openAll();
}

/** Opens the whole list as the puzzle (fixed instance). */
export function openAll(): void {
  const { country, params, list } = useStore.getState();
  if (!country || !list) return;
  const board = getBoard(country, params, list.places);
  openMembers(board.pool.map((_, i) => i));
}

export function applyList(text: string, mode: 'fixed' | 'pool', mergeKm: number): void {
  const { country } = useStore.getState();
  if (!country) return;
  const entries = resolveLines(country, text);
  update({ mode, text, entries, mergeKm, places: entryPlaces(country, entries, mergeKm) });
}

/** Changes one entry (choice or label), or a member of a composite entry, and recomputes. */
export function changeEntry(
  line: number,
  change: Partial<Pick<ListEntry, 'choice' | 'label'>>,
  member: number | null = null,
): void {
  const { country, list } = useStore.getState();
  if (!country || !list) return;
  const entries = list.entries.map((e) => {
    if (e.line !== line) return e;
    if (member === null || !e.members) return { ...e, ...change };
    return { ...e, members: e.members.map((m, i) => (i === member ? { ...m, ...change } : m)) };
  });
  update({ ...list, entries, places: entryPlaces(country, entries, list.mergeKm) });
}

export function setListMode(mode: 'fixed' | 'pool'): void {
  const { list } = useStore.getState();
  if (list) update({ ...list, mode });
}

/** The place list for a link (null without a list): the selection only in pool mode. */
export function linkList(members: readonly number[] | null): LinkList | null {
  const { list } = useStore.getState();
  if (!list) return null;
  return { mode: list.mode, places: list.places, selected: list.mode === 'pool' ? members : null };
}

/** Back to the region's towns. */
export function clearList(): void {
  useStore.setState({ list: null, loaded: null, shown: { kind: 'auto' } });
}

/** An entry mirroring a town or point (from a file or a link). */
function mirrorEntry(line: number, p: Member): ListEntry {
  return {
    line,
    text: p.name,
    query: p.name,
    status: p.id !== undefined ? 'matched' : 'custom',
    options: p.id !== undefined ? [{ id: p.id, name: p.name, state: '', pop: 0 }] : [],
    choice: 0,
    ...(p.id === undefined ? { custom: { lat: p.lat, lon: p.lon } } : {}),
  };
}

/** A member in list syntax: a town name, or a point with coordinates. */
function memberText(m: Member): string {
  return m.id !== undefined ? m.name : `${m.name} (${m.lat}, ${m.lon})`;
}

/** Sets a list from places (a file or a link); entries mirror the places one to one. */
export function setListPlaces(mode: 'fixed' | 'pool', places: readonly Place[]): void {
  const entries: ListEntry[] = places.map((p, i) => {
    const label = p.label ? { label: p.label } : {};
    if (p.members) {
      return {
        line: i + 1,
        text: p.name,
        query: p.name,
        status: 'composite',
        options: [],
        choice: 0,
        members: p.members.map((m) => mirrorEntry(i + 1, m)),
        ...label,
      };
    }
    return { ...mirrorEntry(i + 1, p), ...label };
  });
  const text = places
    .map((p) =>
      p.members
        ? `${p.name} = ${p.members.map(memberText).join(' + ')}${p.label ? `; ${p.label}` : ''}`
        : p.id !== undefined
          ? p.name
          : [p.name, p.lat, p.lon, ...(p.label ? [p.label] : [])].join(', '),
    )
    .join('\n');
  useStore.setState({
    list: { mode, text, entries, mergeKm: DEFAULT_MERGE_KM, places },
    loaded: null,
    shown: { kind: 'auto' },
  });
}

/**
 * Opens a list puzzle (from a link or a file): the list, and the whole list (fixed) or the
 * selected list indices (pool) as the puzzle on display.
 */
export function openListPuzzle(
  mode: 'fixed' | 'pool',
  places: readonly Place[],
  selected: readonly number[] | null,
): void {
  setListPlaces(mode, places);
  if (mode === 'fixed') openAll();
  else if (selected) openMembers(selected.filter((i) => i < places.length));
}

/**
 * Adds a point placed by hand: a custom place named by the next free number, appended to the
 * list text (a new list is a fixed instance without merging).
 */
export function addHandPoint(lat: number, lon: number): void {
  const { country, list } = useStore.getState();
  if (!country) return;
  const numbers = (list?.places ?? []).map((p) => Number(p.name)).filter(Number.isInteger);
  const name = String(Math.max(0, ...numbers) + 1);
  const line = `${name}; ${lat.toFixed(5)}; ${lon.toFixed(5)}`;
  const text = list?.text.trim() ? `${list.text.trimEnd()}\n${line}` : line;
  applyList(text, list?.mode ?? 'fixed', list?.mergeKm ?? 0);
}

/** Removes a place by hand: a custom place loses its line, a town is skipped. */
export function removeHandPoint(index: number): void {
  const { list } = useStore.getState();
  const place = list?.places[index];
  if (!list || !place) return;
  const entry = list.entries.find(
    (e) => e.custom && e.custom.lat === place.lat && e.custom.lon === place.lon,
  );
  if (!entry) {
    removePlace(index);
    return;
  }
  const text = list.text
    .split(/\r?\n/)
    .filter((_, i) => i + 1 !== entry.line)
    .join('\n');
  applyList(text, list.mode, list.mergeKm);
}

// --- combining places into one (roadmap 7.1) ------------------------------------------------

export function startCombining(): void {
  useStore.setState({ combining: [], placing: false });
}

export function cancelCombining(): void {
  useStore.setState({ combining: null });
}

/** Adds or removes a pool index from the places to combine. */
export function toggleCombine(index: number): void {
  const { combining } = useStore.getState();
  if (!combining) return;
  useStore.setState({
    combining: combining.includes(index)
      ? combining.filter((i) => i !== index)
      : [...combining, index],
  });
}

/** Default name of a composite: the members' labels joined by "/". */
export function combinedName(cities: readonly City[]): string {
  return cities.map((c) => c.label).join('/');
}

/**
 * Combines the chosen places into one composite place. Without a list, the puzzle on display
 * (`members`, pool indices) becomes a fixed list first.
 */
export function combinePlaces(name: string, members: readonly number[] | null): void {
  const { country, params, list, combining } = useStore.getState();
  if (!country || !combining || combining.length < 2) return;
  const board = getBoard(country, params);
  const asPlace = (c: City): Place =>
    c.members
      ? { name: c.name, lat: c.lat, lon: c.lon, members: c.members }
      : { id: c.id, name: c.name, lat: c.lat, lon: c.lon };
  const indices = list ? board.pool.map((_, i) => i) : (members ?? []);
  const places = list ? list.places : indices.map((c) => asPlace(board.pool[c]!));
  const chosen = indices.flatMap((c, i) => (combining.includes(c) ? [i] : []));
  if (chosen.length < 2) return;
  // Members of a chosen composite join the new one directly.
  const memberList: Member[] = chosen.flatMap((i): Member[] => {
    const p = places[i]!;
    return p.members
      ? [...p.members]
      : [{ ...(p.id !== undefined ? { id: p.id } : {}), name: p.name, lat: p.lat, lon: p.lon }];
  });
  const combined = compositePlace(
    name.trim() || combinedName(chosen.map((i) => board.pool[indices[i]!]!)),
    memberList,
  );
  const rest = places.filter((_, i) => !chosen.includes(i));
  const mode = list?.mode ?? 'fixed';
  useStore.setState({ combining: null });
  setListPlaces(mode, [...rest, combined]);
  if (mode === 'fixed') openAll();
}

/** Removes the place at pool index `index` from the list (its entries are skipped). */
export function removePlace(index: number): void {
  const { list } = useStore.getState();
  const place = list?.places[index];
  if (!list || !place) return;
  const entries = list.entries.map((e) => {
    const option = e.options[e.choice];
    const hit = e.members
      ? place.members !== undefined && e.query === place.name
      : e.custom
        ? e.query === place.name && e.custom.lat === place.lat && e.custom.lon === place.lon
        : option !== undefined && option.id === place.id;
    return hit ? { ...e, choice: -1 } : e;
  });
  update({ ...list, entries, places: list.places.filter((_, i) => i !== index) });
}

// --- removal suggestions (worker) ------------------------------------------------------------

let worker: Worker | null = null;
let job = 0;

/** Which single removal raises the gap most (exact for the best three). */
export function suggestRemovals(): Promise<readonly RemovalSuggestion[]> {
  const { country, params, list, doc } = useStore.getState();
  if (!country || !list) return Promise.resolve([]);
  const board = getBoard(country, params, list.places);
  worker?.terminate();
  const w = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = w;
  const id = ++job;
  return new Promise((resolve, reject) => {
    w.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
      const m = event.data;
      if (m.type === 'removals' && m.jobId === id) resolve(m.suggestions);
      else if (m.type === 'error' && m.jobId === id) reject(new Error(m.message));
    };
    w.onerror = (event) => reject(new Error(event.message));
    const request: ExactWorkerRequest = {
      type: 'removals',
      jobId: id,
      points: board.points,
      rEffMm: rEffMm(params),
      model: doc.purpose === 'digital' ? 'euclidean' : 'string',
      top: 3,
    };
    w.postMessage(request);
  });
}

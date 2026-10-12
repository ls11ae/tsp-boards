// Place lists in the app (roadmap 5.2): text input matched against the country data, choices
// for ambiguous names, labels, merging, and the fixed-instance analysis.

import { citiesFromColumns, type CountryFile } from '../core/data';
import type { RemovalSuggestion } from '../core/fixed';
import { rEffMm } from '../core/params';
import { mergePlaces, NameIndex, parsePlaceLines, type ListPlace } from '../core/places';
import type { LinkList } from '../core/permalink';
import type { Place } from '../core/puzzle-file';
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
    if (line.lat !== undefined && line.lon !== undefined) {
      return {
        ...base,
        status: 'custom',
        options: [],
        choice: 0,
        custom: { lat: line.lat, lon: line.lon },
      };
    }
    const m = index.match(line.name);
    return {
      ...base,
      status: m.status,
      options: m.options.map((c) => ({ id: c.id, name: c.name, state: c.state, pop: c.pop })),
      choice: m.status === 'not-found' ? -1 : 0,
    };
  });
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

/** Changes one entry (choice or label) and recomputes the places. */
export function changeEntry(
  line: number,
  change: Partial<Pick<ListEntry, 'choice' | 'label'>>,
): void {
  const { country, list } = useStore.getState();
  if (!country || !list) return;
  const entries = list.entries.map((e) => (e.line === line ? { ...e, ...change } : e));
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

/** Sets a list from places (a file or a link); entries mirror the places one to one. */
export function setListPlaces(mode: 'fixed' | 'pool', places: readonly Place[]): void {
  const entries: ListEntry[] = places.map((p, i) => ({
    line: i + 1,
    text: p.name,
    query: p.name,
    status: p.id !== undefined ? 'matched' : 'custom',
    options: p.id !== undefined ? [{ id: p.id, name: p.name, state: '', pop: 0 }] : [],
    choice: 0,
    ...(p.id === undefined ? { custom: { lat: p.lat, lon: p.lon } } : {}),
    ...(p.label ? { label: p.label } : {}),
  }));
  const text = places
    .map((p) =>
      p.id !== undefined
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

/** Removes the place at pool index `index` from the list (its entries are skipped). */
export function removePlace(index: number): void {
  const { list } = useStore.getState();
  const place = list?.places[index];
  if (!list || !place) return;
  const entries = list.entries.map((e) => {
    const option = e.options[e.choice];
    const hit = e.custom
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

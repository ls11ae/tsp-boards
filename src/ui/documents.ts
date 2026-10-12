// Puzzle documents in the app: the open puzzle as a file, opening files, the local library
// ("My puzzles", localStorage with a fallback to memory) and the curated collection.

import { stepGapUm } from '../core/incremental/generate';
import {
  PUZZLE_SCHEMA,
  newPuzzleId,
  parsePuzzleDoc,
  puzzleFileName,
  serializePuzzleDoc,
  type CollectionIndex,
  type MapResults,
  type Place,
  type PuzzleDoc,
} from '../core/puzzle-file';
import { getBoard } from './board';
import { fetchCountry, openSelection } from './controller';
import { openListPuzzle } from './lists';
import { planKey } from './export';
import { applyIncrementalPuzzle } from './incremental';
import type { PuzzleView } from './puzzle';
import { NEW_DOC, NEW_GAME, useStore } from './store';

const random = () => Math.random();

/** The open map puzzle (the one on display) as a document; null without places. */
export function mapDocument(puzzle: PuzzleView | null): PuzzleDoc | null {
  const s = useStore.getState();
  const { country, params, doc } = s;
  if (!country) return null;
  const board = getBoard(country, params);
  const members = puzzle?.members ?? [];
  const list = s.list;
  // With a place list, pool index = list index, and the list's places keep their labels.
  const places = members.map((c): Place => {
    if (list) return list.places[c]!;
    const city = board.pool[c]!;
    return { id: city.id, name: city.name, lat: city.lat, lon: city.lon };
  });
  let results: MapResults | undefined;
  const v = puzzle?.verification;
  if (puzzle && v?.status === 'done' && v.verification.string) {
    const string = v.verification.string;
    const plan = s.boardPlans[planKey(puzzle.key, params)];
    const planned = plan?.status === 'done' ? plan.plan : null;
    results = {
      tour: string.optimal,
      lengthMm: string.optimalLength / 1000,
      gapMm: Number.isFinite(string.gap) ? string.gap / 1000 : null,
      model: 'string',
      scaleGapMm: planned ? planned.measured.gapUm / 1000 : null,
      startPlace: planned ? planned.scale.slot : null,
    };
  }
  return {
    schema: PUZZLE_SCHEMA,
    id: doc.id ?? newPuzzleId(random),
    kind: 'map',
    title: doc.title,
    description: doc.description,
    purpose: doc.purpose,
    language: params.labelLanguage,
    data: { country: country.country, version: country.dataVersion },
    app: __APP_VERSION__,
    updated: new Date().toISOString(),
    map: {
      params: { ...params, n: places.length || params.n },
      places,
      ...(list ? { list: { mode: list.mode, places: list.places } } : {}),
      constraints: { pinned: s.pinned, excluded: s.excluded, groups: s.groups },
      ...(results ? { results } : {}),
    },
  };
}

/** The open incremental puzzle as a document; null without points. */
export function incrementalDocument(): PuzzleDoc | null {
  const { inc, doc } = useStore.getState();
  const { puzzle, params } = inc;
  if (!puzzle) return null;
  return {
    schema: PUZZLE_SCHEMA,
    id: doc.id ?? newPuzzleId(random),
    kind: 'incremental',
    title: doc.title,
    description: doc.description,
    purpose: doc.purpose,
    language: params.labelLanguage,
    data: null,
    app: __APP_VERSION__,
    updated: new Date().toISOString(),
    incremental: {
      params: { ...params, n: puzzle.points.length },
      points: puzzle.points,
      results: {
        steps: puzzle.steps.map((st) => ({
          k: st.k,
          tour: st.tour,
          stringMm: st.stringUm / 1000,
          gapMm: Number.isFinite(st.stringGapUm) ? st.stringGapUm / 1000 : null,
          trackGapMm: Number.isFinite(st.otherUm) ? stepGapUm(st) / 1000 : null,
        })),
      },
    },
  };
}

/** Opens a document: parameters, title and places; results are recomputed. */
export function openDocument(doc: PuzzleDoc, mode: 'design' | 'play' = 'design'): void {
  const meta = {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    purpose: doc.purpose,
  };
  if (doc.kind === 'incremental' && doc.incremental) {
    useStore.setState({ puzzleType: 'incremental', mode, doc: meta, play: NEW_GAME, playId: null });
    applyIncrementalPuzzle(doc.incremental.params, doc.incremental.points);
    return;
  }
  const map = doc.map;
  if (!map) return;
  const code = (doc.data?.country ?? map.params.region.slice(0, 2)).toUpperCase();
  const current = useStore.getState().country;
  if (current?.country !== code) {
    // Another country: load its data and set it together with the parameters.
    fetchCountry(code)
      .then((country) => {
        useStore.setState({ country, params: map.params, list: null });
        openDocument(doc, mode);
      })
      .catch((error: unknown) =>
        useStore.setState({ loadError: error instanceof Error ? error.message : String(error) }),
      );
    return;
  }
  useStore.setState({
    puzzleType: 'map',
    mode,
    doc: meta,
    play: NEW_GAME,
    playId: null,
    params: map.params,
    pinned: map.constraints.pinned.filter((id) => id > 0),
    excluded: map.constraints.excluded.filter((id) => id > 0),
    groups: map.constraints.groups,
    linkWarnings: [],
  });
  const { country } = useStore.getState();
  const warnings: string[] = [];
  if (doc.data && country && doc.data.version !== country.dataVersion)
    warnings.push(`data:${doc.data.version}:${country.dataVersion}`);
  useStore.setState({ linkWarnings: warnings });
  if (map.list) {
    // The puzzle's places as indices into the list (same town, or same custom place).
    const same = (a: Place, b: Place) =>
      a.id !== undefined ? a.id === b.id : a.name === b.name && a.lat === b.lat && a.lon === b.lon;
    const selected = map.places
      .map((p) => map.list!.places.findIndex((q) => same(p, q)))
      .filter((i) => i >= 0);
    openListPuzzle(map.list.mode, map.list.places, selected);
    return;
  }
  useStore.setState({ list: null });
  const ids = map.places.map((p) => p.id).filter((id): id is number => id !== undefined);
  if (ids.length >= 3) openSelection(ids, warnings);
}

/** Starts a new, untitled puzzle (keeps the parameters). */
export function newDocument(): void {
  useStore.setState({ doc: NEW_DOC });
}

export function downloadDocument(doc: PuzzleDoc): void {
  const url = URL.createObjectURL(
    new Blob([serializePuzzleDoc(doc)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = puzzleFileName(doc);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readDocumentFile(file: File): Promise<PuzzleDoc> {
  if (file.size > 2_000_000) throw new Error('file too large');
  return parsePuzzleDoc(JSON.parse(await file.text()));
}

// --- library -------------------------------------------------------------------------------

const LIBRARY_KEY = 'tsp-boards.library.v1';
let memory: PuzzleDoc[] | null = null;

/** Whether the library survives a reload (false in private mode or with blocked storage). */
export function libraryPersistent(): boolean {
  try {
    localStorage.setItem(`${LIBRARY_KEY}.probe`, '1');
    localStorage.removeItem(`${LIBRARY_KEY}.probe`);
    return true;
  } catch {
    return false;
  }
}

export function loadLibrary(): PuzzleDoc[] {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    memory = list.flatMap((item) => {
      try {
        return [parsePuzzleDoc(item)];
      } catch {
        return [];
      }
    });
  } catch {
    memory = [];
  }
  return memory;
}

function storeLibrary(list: PuzzleDoc[]): void {
  memory = list;
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
  } catch {
    // Kept in memory for this page only.
  }
  useStore.setState((s) => ({ libraryVersion: s.libraryVersion + 1 }));
}

/** Saves (or replaces by id) a document in the library and makes it the open document. */
export function saveToLibrary(doc: PuzzleDoc): void {
  const list = loadLibrary().filter((d) => d.id !== doc.id);
  storeLibrary([doc, ...list]);
  useStore.getState().setDoc({ id: doc.id });
}

export function removeFromLibrary(id: string): void {
  storeLibrary(loadLibrary().filter((d) => d.id !== id));
}

// --- curated collection --------------------------------------------------------------------

let collection: Promise<CollectionIndex> | null = null;

const EMPTY_COLLECTION: CollectionIndex = { schema: PUZZLE_SCHEMA, puzzles: [] };

async function fetchCollection(): Promise<CollectionIndex> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}puzzles/index.json`);
    return response.ok ? ((await response.json()) as CollectionIndex) : EMPTY_COLLECTION;
  } catch {
    return EMPTY_COLLECTION;
  }
}

export function loadCollection(): Promise<CollectionIndex> {
  collection ??= fetchCollection();
  return collection;
}

export async function loadCollectionPuzzle(file: string): Promise<PuzzleDoc> {
  const response = await fetch(`${import.meta.env.BASE_URL}puzzles/${file}`);
  if (!response.ok) throw new Error(`cannot load ${file}`);
  return parsePuzzleDoc(await response.json());
}

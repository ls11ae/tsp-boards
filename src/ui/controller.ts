// Glue between the store and the workers: data loading, search runs (throttled UI updates)
// and the queue of exact verifications.

import { parseCountryFile, type CountryFile, type Manifest } from '../core/data';
import type { LinkPlace } from '../core/places';
import type { Place } from '../core/puzzle-file';
import { rEffMm, searchParams } from '../core/params';
import { decodePermalink } from '../core/permalink';
import {
  greedySelection,
  type Evaluation,
  type SearchPool,
  type TracePoint,
} from '../core/search/search';
import type {
  ExactWorkerRequest,
  ExactWorkerResponse,
  SearchRequest,
  SearchResponse,
} from '../workers/protocol';
import { getBoard, townsById } from './board';
import { openListPuzzle } from './lists';
import { applyIncrementalLink } from './incremental';
import { getLabels, poolLabels } from './labels';
import { useStore, type RunState } from './store';

const UI_INTERVAL_MS = 100;
/** Exact checks per run: the best candidates of the archive. */
const VERIFY_TOP = 3;
const VERIFY_TIME_LIMIT_SEC = 120;

// --- data ----------------------------------------------------------------------------------

export async function loadData(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  // Incremental puzzles need no city data; their links are handled right away.
  const incremental = applyIncrementalLink(window.location.hash);
  try {
    const manifest = (await (await fetch(`${base}data/manifest.json`)).json()) as Manifest;
    const entry = manifest.countries[0];
    if (!entry) throw new Error('empty manifest');
    const country = parseCountryFile(await (await fetch(`${base}data/${entry.file}`)).json());
    useStore.setState({ manifest, country });
    if (!incremental) applyPermalink(window.location.hash);
  } catch (error) {
    useStore.setState({ loadError: error instanceof Error ? error.message : String(error) });
  }
}

function applyPermalink(hash: string): void {
  const link = decodePermalink(hash);
  const { country } = useStore.getState();
  if (!link || !country) return;
  const warnings: string[] = [];
  if (link.data && link.data.version !== country.dataVersion) {
    warnings.push(`data:${link.data.version}:${country.dataVersion}`);
  }
  useStore.setState({
    params: link.params,
    pinned: link.pinned,
    excluded: link.excluded,
    linkWarnings: warnings,
    mode: link.mode,
  });
  if (link.title !== null) useStore.getState().setDoc({ title: link.title });
  if (link.list) {
    const places = linkPlaces(country, link.list.places, warnings);
    useStore.setState({ linkWarnings: warnings });
    openListPuzzle(link.list.mode, places, link.list.selected);
  } else if (link.selected) {
    openSelection(link.selected, warnings);
  }
}

/** Places of a link: towns come as ids and get their name and position from the data. */
function linkPlaces(country: CountryFile, rows: readonly LinkPlace[], warnings: string[]): Place[] {
  const towns = townsById(country);
  const missing: number[] = [];
  const places = rows.flatMap((row): Place[] => {
    if ('lat' in row) return [row];
    const town = towns.get(row.id);
    if (!town) {
      missing.push(row.id);
      return [];
    }
    return [
      {
        id: town.id,
        name: town.name,
        lat: town.lat,
        lon: town.lon,
        ...(row.label ? { label: row.label } : {}),
      },
    ];
  });
  if (missing.length > 0) warnings.push(`missing:${missing.join(',')}`);
  return places;
}

/**
 * Shows the puzzle made of the given GeoNames ids (from a link or a file) and checks it
 * exactly; ids missing from the current pool are reported as warnings.
 */
export function openSelection(ids: readonly number[], warnings: string[] = []): void {
  const { country, params } = useStore.getState();
  if (!country) return;
  const board = getBoard(country, params);
  const members = ids.map((id) => board.index.get(id)).filter((i) => i !== undefined);
  const missing = ids.filter((id) => !board.index.has(id));
  if (missing.length > 0) warnings.push(`missing:${missing.join(',')}`);
  useStore.setState({ linkWarnings: warnings });
  openMembers(members);
}

/** Shows the puzzle made of the given pool indices and checks it exactly. */
export function openMembers(indices: readonly number[]): void {
  if (indices.length < 3) return;
  const members = [...indices].sort((a, b) => a - b);
  const key = members.join(',');
  useStore.setState({ loaded: { key, members }, shown: { kind: 'key', key } });
  enqueueVerification(key, members, null);
}

// --- search --------------------------------------------------------------------------------

let searchWorker: Worker | null = null;
let pending: Extract<SearchResponse, { type: 'progress' | 'done' }> | null = null;
let pendingTrace: TracePoint[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlush = 0;

function getSearchWorker(): Worker {
  if (searchWorker) return searchWorker;
  const worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<SearchResponse>) => onSearchMessage(event.data);
  worker.onerror = (event) => {
    const { run } = useStore.getState();
    useStore.setState({
      run: { ...run, status: 'error', error: { kind: 'other', message: event.message } },
    });
  };
  searchWorker = worker;
  return worker;
}

function onSearchMessage(message: SearchResponse): void {
  const { run } = useStore.getState();
  if (message.runId !== run.runId) return;
  if (message.type === 'error') {
    useStore.setState({
      run: { ...run, status: 'error', error: { kind: 'other', message: message.message } },
    });
    return;
  }
  pending = message;
  pendingTrace.push(...message.trace);
  if (message.type === 'done') {
    flush();
    return;
  }
  const wait = Math.max(0, UI_INTERVAL_MS - (performance.now() - lastFlush));
  // A timer, not requestAnimationFrame: rAF pauses in hidden tabs, and React batches anyway.
  flushTimer ??= setTimeout(flush, wait);
}

function flush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const message = pending;
  if (!message) return;
  pending = null;
  lastFlush = performance.now();
  const { run } = useStore.getState();
  if (message.runId !== run.runId) return;
  const trace = [...run.trace, ...pendingTrace];
  pendingTrace = [];
  useStore.setState({
    run: {
      ...run,
      status: message.type === 'done' ? 'done' : run.status,
      progress: message,
      trace,
    },
  });
  syncVerifications(message.archive.slice(0, VERIFY_TOP));
}

/** Search pool of the current board with pins and exclusions as pool indices. */
function searchPool(): SearchPool | null {
  const { country, params, pinned, excluded } = useStore.getState();
  if (!country) return null;
  const board = getBoard(country, params);
  const indices = (ids: readonly number[]) =>
    ids.map((id) => board.index.get(id)).filter((i): i is number => i !== undefined);
  const labels = getLabels(board, params);
  return {
    points: board.points,
    population: board.pool.map((c) => c.pop),
    pinned: indices(pinned),
    excluded: indices(excluded),
    labels: labels ? poolLabels(board, labels) : undefined,
  };
}

export function startSearch(): void {
  const state = useStore.getState();
  const pool = searchPool();
  if (!state.country || !pool) return;
  const board = getBoard(state.country, state.params);
  const runId = state.run.runId + 1;
  const { selection, conflictingPins } = greedySelection(
    pool,
    state.params.n,
    state.params.minDistanceMm,
  );
  const fail = (error: NonNullable<RunState['error']>) =>
    useStore.setState({
      run: { status: 'error', runId, progress: null, trace: [], error },
    });
  if (conflictingPins.length > 0) {
    const names = conflictingPins
      .map(([a, b]) => `${board.pool[a]!.name} – ${board.pool[b]!.name}`)
      .join(', ');
    fail({ kind: 'pin-conflict', names });
    return;
  }
  if (selection.length < state.params.n) {
    fail({ kind: 'too-few', placed: selection.length, n: state.params.n });
    return;
  }
  resetVerifications();
  pending = null;
  pendingTrace = [];
  useStore.setState({
    run: { status: 'running', runId, progress: null, trace: [], error: null },
    shown: { kind: 'auto' },
    loaded: null,
    linkWarnings: [],
  });
  const message: SearchRequest = {
    type: 'start',
    runId,
    pool,
    params: searchParams(state.params),
  };
  getSearchWorker().postMessage(message);
}

export function stopSearch(): void {
  const { run } = useStore.getState();
  if (run.status !== 'running') return;
  getSearchWorker().postMessage({ type: 'stop', runId: run.runId } satisfies SearchRequest);
  useStore.setState({ run: { ...run, status: 'stopped' } });
}

// --- verification --------------------------------------------------------------------------

interface QueuedJob {
  readonly key: string;
  readonly members: readonly number[];
  readonly tour: readonly number[] | null;
}

let exactWorker: Worker | null = null;
let queue: QueuedJob[] = [];
let busy: { jobId: number; key: string } | null = null;
let jobCounter = 0;

function getExactWorker(): Worker {
  if (exactWorker) return exactWorker;
  const worker = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<ExactWorkerResponse>) => onExactMessage(event.data);
  worker.onerror = (event) => {
    if (busy) setVerification(busy.key, { status: 'error', message: event.message });
    busy = null;
    exactWorker?.terminate();
    exactWorker = null;
    pump();
  };
  exactWorker = worker;
  return worker;
}

function setVerification(
  key: string,
  value: ReturnType<typeof useStore.getState>['verifications'][string],
): void {
  useStore.setState((s) => ({ verifications: { ...s.verifications, [key]: value } }));
}

function onExactMessage(message: ExactWorkerResponse): void {
  if (message.type === 'verified' && busy?.jobId === message.jobId) {
    setVerification(message.key, {
      status: 'done',
      verification: message.verification,
      ms: message.ms,
    });
    busy = null;
    pump();
  } else if (message.type === 'error' && busy && message.jobId === busy.jobId) {
    setVerification(busy.key, { status: 'error', message: message.message });
    busy = null;
    pump();
  }
}

/**
 * Queues an exact check of a candidate (members: pool indices, tour: pool indices or null).
 * `first` puts it at the front (a candidate the user is looking at).
 */
export function enqueueVerification(
  key: string,
  members: readonly number[],
  evaluation: Evaluation | null,
  first = false,
): void {
  const { verifications } = useStore.getState();
  const queued = queue.findIndex((j) => j.key === key);
  if (queued >= 0) {
    if (first) queue.unshift(...queue.splice(queued, 1));
    return;
  }
  if (verifications[key]) return;
  const job = { key, members, tour: evaluation?.tour ?? null };
  if (first) queue.unshift(job);
  else queue.push(job);
  setVerification(key, { status: 'queued' });
  pump();
}

/**
 * Keeps the queue to the given candidates (in this order) plus the candidate on display:
 * candidates that dropped out of the archive's top stop waiting.
 */
function syncVerifications(top: readonly Evaluation[]): void {
  const { shown } = useStore.getState();
  const keep = new Set(top.map((e) => e.key));
  if (shown.kind === 'key') keep.add(shown.key);
  const dropped = queue.filter((j) => !keep.has(j.key));
  queue = queue.filter((j) => keep.has(j.key));
  if (dropped.length > 0) {
    useStore.setState((s) => {
      const verifications = { ...s.verifications };
      for (const j of dropped) delete verifications[j.key];
      return { verifications };
    });
  }
  for (const e of top) enqueueVerification(e.key, e.members, e);
  const rank = new Map(top.map((e, i) => [e.key, i]));
  queue.sort((a, b) => (rank.get(a.key) ?? -1) - (rank.get(b.key) ?? -1));
}

/** Shows a candidate and checks it exactly with priority. */
export function showCandidate(evaluation: Evaluation | null): void {
  if (!evaluation) {
    useStore.getState().setShown({ kind: 'auto' });
    return;
  }
  useStore.getState().setShown({ kind: 'key', key: evaluation.key });
  enqueueVerification(evaluation.key, evaluation.members, evaluation, true);
}

function pump(): void {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  const { country, params } = useStore.getState();
  if (!country) return;
  const board = getBoard(country, params);
  const slot = new Map(job.members.map((c, s) => [c, s]));
  const jobId = ++jobCounter;
  busy = { jobId, key: job.key };
  setVerification(job.key, { status: 'running' });
  const request: ExactWorkerRequest = {
    type: 'verify',
    jobId,
    key: job.key,
    points: job.members.map((c) => board.points[c]!),
    tour: job.tour ? job.tour.map((c) => slot.get(c)!) : [],
    rEffMm: rEffMm(params),
    timeLimitSec: VERIFY_TIME_LIMIT_SEC,
  };
  getExactWorker().postMessage(request);
}

/** Cancels running and queued checks (they belong to an old pool). */
function resetVerifications(): void {
  queue = [];
  if (busy) {
    exactWorker?.terminate();
    exactWorker = null;
    busy = null;
  }
  useStore.setState({ verifications: {} });
}

// --- pins and exclusions -------------------------------------------------------------------

/** Click cycle on a city: neutral → pinned → excluded → neutral. */
export function cycleCity(id: number): void {
  const { pinned, excluded } = useStore.getState();
  if (pinned.includes(id)) {
    useStore.setState({ pinned: pinned.filter((x) => x !== id), excluded: [...excluded, id] });
  } else if (excluded.includes(id)) {
    useStore.setState({ excluded: excluded.filter((x) => x !== id) });
  } else {
    useStore.setState({ pinned: [...pinned, id] });
  }
}

export function clearMarks(): void {
  useStore.setState({ pinned: [], excluded: [] });
}

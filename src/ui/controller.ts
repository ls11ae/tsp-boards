// Glue between the store and the workers: data loading, search runs (throttled UI updates)
// and the queue of exact verifications.

import { parseCountryFile, type City, type CountryFile, type Manifest } from '../core/data';
import { compositePlace, type LinkMember, type LinkPlace } from '../core/places';
import type { Member, Place } from '../core/puzzle-file';
import {
  DEFAULT_PARAMS,
  DIGITAL_WEIGHTS,
  WORLD_PARAMS,
  effectiveREffMm,
  searchParams,
} from '../core/params';
import type { Purpose } from '../core/puzzle-file';
import { decodePermalink } from '../core/permalink';
import {
  greedySelection,
  unplacedLabelCities,
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
import { getBoard, slotSphere, townsById } from './board';
import { openListPuzzle } from './lists';
import { applyIncrementalLink } from './incremental';
import { getLabels, poolLabels } from './labels';
import { useStore, type RunState, type UiParams } from './store';
import { stateGroups, type StateGroups } from '../core/groups';
import { regionStates } from '../core/region';
import { groupCounts, sizeRange } from '../core/search/groups';

const UI_INTERVAL_MS = 100;
/** Exact checks per run: the best candidates of the archive. */
const VERIFY_TOP = 3;
const VERIFY_TIME_LIMIT_SEC = 120;

// --- data ----------------------------------------------------------------------------------

/** The country shown first without a link (if the data has it). */
const DEFAULT_COUNTRY = 'DE';

const countryFiles = new Map<string, Promise<CountryFile>>();

/** Loads the data of a country (once). */
export function fetchCountry(code: string): Promise<CountryFile> {
  const { manifest } = useStore.getState();
  const entry = manifest?.countries.find((c) => c.country === code.toUpperCase());
  if (!entry) return Promise.reject(new Error(`no data for country ${code}`));
  let file = countryFiles.get(entry.country);
  if (!file) {
    const base = import.meta.env.BASE_URL;
    file = fetch(`${base}data/${entry.file}`)
      .then((r) => r.json())
      .then((json) => parseCountryFile(json));
    countryFiles.set(entry.country, file);
  }
  return file;
}

/** Country of a permalink: its data version, else its region. */
function linkCountry(hash: string): string | null {
  const link = decodePermalink(hash);
  return link ? (link.data?.country ?? link.params.region.slice(0, 2)) : null;
}

export async function loadData(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  // Incremental puzzles need no city data; their links are handled right away.
  const incremental = applyIncrementalLink(window.location.hash);
  try {
    const manifest = (await (await fetch(`${base}data/manifest.json`)).json()) as Manifest;
    if (manifest.countries.length === 0) throw new Error('empty manifest');
    useStore.setState({ manifest });
    const wanted = (!incremental && linkCountry(window.location.hash)) || DEFAULT_COUNTRY;
    const code = manifest.countries.some((c) => c.country === wanted)
      ? wanted
      : manifest.countries[0]!.country;
    const country = await fetchCountry(code);
    useStore.setState({
      country,
      params: { ...useStore.getState().params, region: country.country },
    });
    if (!incremental) applyPermalink(window.location.hash);
  } catch (error) {
    useStore.setState({ loadError: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Switches to another country: its data, the whole country as region, and no list, marks or
 * results of the old one (in one update, so region and data always match).
 */
export async function switchCountry(code: string): Promise<void> {
  const country = await fetchCountry(code);
  stopSearch();
  const { params, run } = useStore.getState();
  // The world map has its own shape and scale; back on a country, the board defaults return.
  const sphere = country.metric === 'sphere';
  const wasSphere = useStore.getState().country?.metric === 'sphere';
  const board = (Object.keys(WORLD_PARAMS) as (keyof typeof WORLD_PARAMS)[]).reduce<
    Partial<UiParams>
  >((p, key) => ({ ...p, [key]: (sphere ? WORLD_PARAMS : DEFAULT_PARAMS)[key] }), {});
  useStore.setState({
    country,
    params: { ...params, ...(sphere !== wasSphere ? board : {}), region: country.country },
    list: null,
    loaded: null,
    shown: { kind: 'auto' },
    run: { status: 'idle', runId: run.runId + 1, progress: null, trace: [], error: null },
    pinned: [],
    excluded: [],
    groups: [],
    linkWarnings: [],
  });
}

function applyPermalink(hash: string): void {
  const link = decodePermalink(hash);
  const { country } = useStore.getState();
  if (!link || !country) return;
  // A link of another country: its data first (region and data must match).
  if (!link.params.region.startsWith(country.country)) {
    const code = link.params.region.slice(0, 2);
    fetchCountry(code)
      .then((file) => {
        useStore.setState({ country: file, params: link.params });
        applyPermalink(hash);
      })
      .catch((error: unknown) =>
        useStore.setState({ loadError: error instanceof Error ? error.message : String(error) }),
      );
    return;
  }
  const warnings: string[] = [];
  if (link.data && link.data.version !== country.dataVersion) {
    warnings.push(`data:${link.data.version}:${country.dataVersion}`);
  }
  useStore.setState({
    params: link.params,
    pinned: link.pinned,
    excluded: link.excluded,
    groups: link.groups,
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
  const member = (m: LinkMember): Member | null => {
    if ('lat' in m) return m;
    const town = towns.get(m.id);
    if (!town) {
      missing.push(m.id);
      return null;
    }
    return { id: town.id, name: town.name, lat: town.lat, lon: town.lon };
  };
  const places = rows.flatMap((row): Place[] => {
    if ('members' in row) {
      const members = (row.members ?? []).map(member).filter((m): m is Member => m !== null);
      return members.length >= 2 ? [compositePlace(row.name, members, row.label)] : [];
    }
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

/** State groups of the current board for the group constraints (null without any). */
export function boardGroups(): StateGroups | null {
  const { country, params, groups } = useStore.getState();
  if (!country) return null;
  const board = getBoard(country, params);
  const states = regionStates(country, params.region) ?? country.states.map((s) => s.id);
  return stateGroups(board.pool, states, groups);
}

/** Search pool of the current board with pins and exclusions as pool indices. */
function searchPool(): SearchPool | null {
  const { country, params, pinned, excluded } = useStore.getState();
  if (!country) return null;
  const board = getBoard(country, params);
  const indices = (ids: readonly number[]) =>
    ids.map((id) => board.index.get(id)).filter((i): i is number => i !== undefined);
  const labels = getLabels(board, params);
  const groups = boardGroups();
  return {
    points: board.points,
    ...(board.sphere ? { sphere: board.sphere } : {}),
    population: board.pool.map((c) => c.pop),
    pinned: indices(pinned),
    excluded: indices(excluded),
    labels: labels ? poolLabels(board, labels) : undefined,
    ...(groups ? { groups: { of: groups.of, min: groups.min, max: groups.max } } : {}),
  };
}

export function startSearch(): void {
  const state = useStore.getState();
  const pool = searchPool();
  if (!state.country || !pool) return;
  const board = getBoard(state.country, state.params);
  const runId = state.run.runId + 1;
  const fail = (error: NonNullable<RunState['error']>) =>
    useStore.setState({
      run: { status: 'error', runId, progress: null, trace: [], error },
    });
  // Feasibility before the run: group sizes, pins, labels of the pins, then the greedy start.
  const groups = boardGroups();
  const stateName = (g: number) => {
    const id = groups!.states[g]!;
    const info = state.country?.states.find((s) => s.id === id);
    return info ? (state.lang === 'de' ? info.name : info.nameEn) : id;
  };
  if (pool.groups) {
    const g = pool.groups;
    const size = groupCounts(g, [...pool.points.keys()]);
    const small = g.min.flatMap((m, i) => (size[i]! < m ? [i] : []));
    if (small.length > 0) {
      fail({ kind: 'group-short', names: small.map(stateName).join(', ') });
      return;
    }
    const range = sizeRange(g);
    if (state.params.n < range.min || state.params.n > range.max) {
      fail({ kind: 'group-size', min: range.min, max: range.max });
      return;
    }
  }
  const { selection, conflictingPins, groupShortfall, pinsOverMax } = greedySelection(
    pool,
    state.params.n,
    state.params.minDistanceMm,
  );
  if (conflictingPins.length > 0) {
    const names = conflictingPins
      .map(([a, b]) => `${board.pool[a]!.name} – ${board.pool[b]!.name}`)
      .join(', ');
    fail({ kind: 'pin-conflict', names });
    return;
  }
  if (pinsOverMax.length > 0) {
    fail({ kind: 'group-pins', names: pinsOverMax.map(stateName).join(', ') });
    return;
  }
  const unlabelled = unplacedLabelCities(pool, pool.pinned);
  if (unlabelled.length > 0) {
    fail({ kind: 'pin-labels', names: unlabelled.map((c) => board.pool[c]!.name).join(', ') });
    return;
  }
  if (groupShortfall.length > 0) {
    fail({ kind: 'group-short', names: groupShortfall.map(stateName).join(', ') });
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
    params: searchParams(state.params, state.doc.purpose),
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
  checkPool();
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
  const { country, params, doc } = useStore.getState();
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
    sphere: slotSphere(board, job.members),
    tour: job.tour ? job.tour.map((c) => slot.get(c)!) : [],
    rEffMm: effectiveREffMm(params, doc.purpose),
    timeLimitSec: VERIFY_TIME_LIMIT_SEC,
    mode: doc.purpose === 'digital' ? 'euclid-exact-string-local' : 'string-exact',
  };
  getExactWorker().postMessage(request);
}

/**
 * The purpose changed (board <-> digital): results judged by the other measure are stale, so
 * the puzzle on display is checked again.
 */
export function setPurpose(purpose: Purpose): void {
  const { doc, params } = useStore.getState();
  if (doc.purpose === purpose) return;
  const weights = (w: {
    readonly weightGap: number;
    readonly weightDifficulty: number;
    readonly weightRecognizability: number;
  }) =>
    params.weightGap === w.weightGap &&
    params.weightDifficulty === w.weightDifficulty &&
    params.weightRecognizability === w.weightRecognizability;
  const boardWeights = {
    weightGap: DEFAULT_PARAMS.weightGap,
    weightDifficulty: DEFAULT_PARAMS.weightDifficulty,
    weightRecognizability: DEFAULT_PARAMS.weightRecognizability,
  };
  // Suggested weights follow the purpose unless the user changed them.
  if (purpose === 'digital' && weights(boardWeights))
    useStore.getState().setParams(DIGITAL_WEIGHTS);
  if (purpose === 'board' && weights(DIGITAL_WEIGHTS)) useStore.getState().setParams(boardWeights);
  useStore.getState().setDoc({ purpose });
  if (useStore.getState().puzzleType === 'map') purposeChanged();
}

// World files measure great-circle distances: their puzzles are digital (roadmap 8.2).
useStore.subscribe((s) => {
  if (s.country?.metric === 'sphere' && s.doc.purpose !== 'digital') setPurpose('digital');
});

function purposeChanged(): void {
  const { loaded, shown, run } = useStore.getState();
  resetVerifications();
  const key = shown.kind === 'key' ? shown.key : null;
  const members =
    loaded && loaded.key === key
      ? loaded.members
      : (run.progress?.archive.find((e) => e.key === key)?.members ?? run.progress?.best?.members);
  if (members) enqueueVerification(members.join(','), members, null, true);
}

const signatures = new WeakMap<readonly City[], string>();

/** FNV-1a over the pool's ids and coordinates (custom places of two lists share ids). */
function poolSignature(pool: readonly City[]): string {
  let s = signatures.get(pool);
  if (s === undefined) {
    let h = 0x811c9dc5;
    for (const c of pool) {
      for (const ch of `${c.id}:${c.lat}:${c.lon};`) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
    s = `${pool.length}:${h.toString(16)}`;
    signatures.set(pool, s);
  }
  return s;
}

let checkedPool = '';

/**
 * Keys are pool indices: results and queued checks of another pool (a different list, region
 * or population threshold) must not be reused for the same key.
 */
function checkPool(): void {
  const { country, params } = useStore.getState();
  if (!country) return;
  const signature = poolSignature(getBoard(country, params).pool);
  if (signature === checkedPool) return;
  checkedPool = signature;
  resetVerifications();
  // Plans, robustness checks and teaching frames are keyed by the puzzle key too.
  useStore.setState({ boardPlans: {}, robustness: null, teaching: null });
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

// --- parameters ----------------------------------------------------------------------------

/**
 * Changes parameters. If the city pool changes (region, population threshold), search results
 * and checks belong to the old pool: they are dropped, and the puzzle on display moves to the
 * new pool by its GeoNames ids if all its places are there.
 */
export function changeParams(update: Partial<UiParams>): void {
  const before = useStore.getState();
  const old = before.country ? getBoard(before.country, before.params) : null;
  before.setParams(update);
  const { country, params, loaded, run } = useStore.getState();
  if (!country || !old) return;
  const board = getBoard(country, params);
  const same =
    board.pool.length === old.pool.length && board.pool.every((c, i) => c.id === old.pool[i]!.id);
  if (same) return;
  const members =
    loaded?.members ?? run.progress?.best?.members ?? run.progress?.current.members ?? [];
  const ids = members.map((c) => old.pool[c]!.id);
  stopSearch();
  resetVerifications();
  useStore.setState({
    run: { status: 'idle', runId: run.runId + 1, progress: null, trace: [], error: null },
    loaded: null,
    shown: { kind: 'auto' },
  });
  if (ids.length > 0 && ids.every((id) => board.index.has(id))) openSelection(ids);
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

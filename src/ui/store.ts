// Application state (Zustand). Worker traffic is handled by controller.ts, which updates this
// store at most ~10 times per second.

import { create } from 'zustand';
import type { BoardPlan } from '../core/board/plan';
import type { HeuristicKind } from '../core/overlays';
import type { TeachingState } from './teaching';
import type { RobustnessState } from './robustness';
import type { GroupConstraint, LegendEntry, Place, Purpose } from '../core/puzzle-file';
import type { Logo } from '../core/board/logo';
import type { HoleMode } from '../core/board/drawing';
import type { Flight } from './components/Globe';
import type { Paper } from '../core/board/print';
import type { CountryFile, Manifest } from '../core/data';
import { EMPTY_PLAY, type PlayAttempt, type PlayState } from '../core/play';
import type { IncrementalPuzzle, SequenceCheck } from '../core/incremental/generate';
import { DEFAULT_INCREMENTAL_UI, type IncrementalUiParams } from '../core/incremental/params';
import { DEFAULT_PARAMS as DEFAULT_PARAMS_VALUE, type PuzzleParams } from '../core/params';
import type { TracePoint } from '../core/search/search';
import type { Verification } from '../core/verify';
import type { SearchProgress } from '../workers/protocol';

export type Language = 'en' | 'de';

/** Puzzle parameters (core); the UI edits them as they are. */
export type UiParams = PuzzleParams;

/** Tour drawn over the board for comparison: none, the runner-up or a simple strategy. */
/** 'flat-map': the shortest round trip on the flat map (world puzzles). */
export type OverlayChoice = 'none' | 'second' | 'flat-map' | HeuristicKind;

export type RunStatus = 'idle' | 'running' | 'done' | 'stopped' | 'error';

export type VerificationState =
  | { readonly status: 'queued' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly verification: Verification; readonly ms: number }
  | { readonly status: 'error'; readonly message: string };

/** What the board shows: the best candidate so far (auto), an archive entry, or a link. */
export type Shown = { readonly kind: 'auto' } | { readonly kind: 'key'; readonly key: string };

/** A puzzle opened from a permalink (pool indices, ascending). */
export interface LoadedPuzzle {
  readonly key: string;
  readonly members: readonly number[];
}

export type RunError =
  | { readonly kind: 'too-few'; readonly placed: number; readonly n: number }
  | { readonly kind: 'pin-conflict'; readonly names: string }
  | { readonly kind: 'pin-labels'; readonly names: string }
  | { readonly kind: 'group-size'; readonly min: number; readonly max: number }
  | { readonly kind: 'group-short'; readonly names: string }
  | { readonly kind: 'group-pins'; readonly names: string }
  | { readonly kind: 'other'; readonly message: string };

export interface RunState {
  readonly status: RunStatus;
  readonly runId: number;
  readonly progress: SearchProgress | null;
  readonly trace: readonly TracePoint[];
  readonly error: RunError | null;
}

export type BoardPlanState =
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly plan: BoardPlan | null; readonly ms: number }
  | { readonly status: 'error'; readonly message: string };

export interface ExportOptions {
  readonly paper: Paper;
  /** Cut the nail holes (laser), mark them for drilling, or engrave drill pits. */
  readonly holes: HoleMode;
  /** Cut the board outline (off for boards cut to size before). */
  readonly edge: boolean;
  /** Line width in the SVG, mm. */
  readonly strokeMm: number;
  /** Show the planned board (scale, title, final labels) instead of the map view. */
  readonly preview: boolean;
}

export type Mode = 'design' | 'play';

/** One input line of a place list and how it was resolved. */
export interface ListEntry {
  readonly line: number;
  readonly text: string;
  readonly query: string;
  readonly status: 'matched' | 'ambiguous' | 'not-found' | 'custom' | 'composite';
  /** Candidate towns (GeoNames ids), best first. */
  readonly options: readonly {
    readonly id: number;
    readonly name: string;
    readonly state: string;
    readonly pop: number;
  }[];
  /** Chosen option (index), or -1: skip the line. */
  readonly choice: number;
  /** Custom place (CSV row). */
  readonly custom?: { readonly lat: number; readonly lon: number };
  readonly label?: string;
  /** Members of a composite place, each resolved like a line of its own. */
  readonly members?: readonly ListEntry[];
  /** Marked place ("* name"): a ring on the board and in the app. */
  readonly highlight?: boolean;
}

/** A place list replacing the region's towns (roadmap 5.2). */
export interface PlaceListState {
  readonly mode: 'fixed' | 'pool';
  readonly text: string;
  readonly entries: readonly ListEntry[];
  /** Merge places closer than this (km). */
  readonly mergeKm: number;
  /** The resolved, merged places (the board pool). */
  readonly places: readonly Place[];
}

/** The open puzzle document: what a saved file or a link carries besides the places. */
export interface DocMeta {
  /** Library id once saved or opened from a file; null for a new puzzle. */
  readonly id: string | null;
  readonly title: string;
  readonly description: string;
  readonly purpose: Purpose;
  /** Board legend and preferred start nail (as the city id in the board's pool), roadmap 9.1. */
  readonly board?: {
    readonly legend: readonly LegendEntry[];
    readonly startCity: number | null;
  } | null;
}

/** A logo for the board export (from a local SVG file, kept in memory only). */
export interface BoardLogo {
  /** City id in the board's pool whose label it replaces; null: the legend's logo. */
  readonly city: number | null;
  readonly fileName: string;
  readonly logo: Logo;
}

export const NEW_DOC: DocMeta = { id: null, title: '', description: '', purpose: 'board' };
export type PuzzleType = 'map' | 'incremental';

export interface IncrementalUi {
  readonly params: IncrementalUiParams;
  readonly status: 'idle' | 'running' | 'done' | 'failed' | 'error';
  readonly puzzle: IncrementalPuzzle | null;
  /** Conditions a puzzle from a link violates (empty for generated puzzles). */
  readonly violations: SequenceCheck['violations'];
  readonly marksFit: boolean;
  readonly reached: number;
  readonly checks: number;
  readonly ms: number;
  readonly message: string | null;
  /** Instance shown on the board (null: the whole board). */
  readonly shownK: number | null;
  readonly showSolution: boolean;
}

/** A game in play mode; slots index the puzzle's members (ascending pool index). */
export interface PlayUi {
  readonly state: PlayState;
  /** Wall-clock time (Date.now()) of the first click; kept when a game is resumed later. */
  readonly startedAt: number | null;
  readonly attempts: readonly PlayAttempt[];
  /** Path (slots joined) of the last judged round trip, so each trip counts once. */
  readonly judged: string | null;
  readonly solvedMs: number | null;
  readonly revealed: boolean;
  /** Time when the solution was shown (the clock stops there). */
  readonly revealedMs: number | null;
  /** The record of this game was sent (with consent). */
  readonly sent: boolean;
  /** Best judged round trip so far (excess in the puzzle's measure, path in slots). */
  readonly best: { readonly excess: number; readonly path: readonly number[] } | null;
  /** A highscore entry was made for this game. */
  readonly scored: boolean;
  /** Incremental puzzle: the instance being played (k); null for map puzzles. */
  readonly stage: number | null;
}

export const NEW_GAME: PlayUi = {
  state: EMPTY_PLAY,
  startedAt: null,
  attempts: [],
  judged: null,
  solvedMs: null,
  revealed: false,
  revealedMs: null,
  sent: false,
  best: null,
  scored: false,
  stage: null,
};

export interface AppState {
  readonly lang: Language;
  readonly mode: Mode;
  readonly play: PlayUi;
  /** Id of the puzzle being played (games and highscores are kept per id). */
  readonly playId: string | null;
  /** Start page: the gallery of puzzles. */
  readonly page: 'gallery' | 'app';
  /** Name for highscore entries (kept in the browser). */
  readonly playerName: string;
  /** Event mode (#kiosk, roadmap 9.4): its screen; null outside the event mode. */
  readonly kiosk: 'start' | 'play' | 'scores' | null;
  /** Increases when highscores change. */
  readonly scoresVersion: number;
  readonly puzzleType: PuzzleType;
  readonly inc: IncrementalUi;
  readonly doc: DocMeta;
  readonly setDoc: (update: Partial<DocMeta>) => void;
  /** Place list instead of the region's towns; null: the region's towns. */
  readonly list: PlaceListState | null;
  /** Increases when the local library changes (re-render lists). */
  readonly libraryVersion: number;
  readonly setPuzzleType: (type: PuzzleType) => void;
  readonly setIncParams: (update: Partial<IncrementalUiParams>) => void;
  readonly setInc: (update: Partial<IncrementalUi>) => void;
  readonly manifest: Manifest | null;
  readonly country: CountryFile | null;
  readonly loadError: string | null;
  readonly params: UiParams;
  readonly run: RunState;
  readonly shown: Shown;
  readonly loaded: LoadedPuzzle | null;
  readonly verifications: Readonly<Record<string, VerificationState>>;
  readonly showTour: boolean;
  /** Tour drawn for comparison with the optimum (roadmap 5.5). */
  readonly overlay: OverlayChoice;
  /** World puzzles: on the rotatable globe or the Equal Earth map (roadmap 9.3). */
  readonly worldView: 'globe' | 'map';
  /** A flight along a round trip on the globe (null: none). */
  readonly flight: Flight | null;
  /** Clicks on the board place and remove points (free-form instance). */
  readonly placing: boolean;
  /** Pool indices chosen to be combined into one place (roadmap 7.1), or null. */
  readonly combining: readonly number[] | null;
  /** A strategy shown step by step (teaching mode), or null. */
  readonly teaching: TeachingState | null;
  /** Robustness check of a planned board (rows arrive one by one), or null. */
  readonly robustness: RobustnessState | null;
  /** GeoNames ids the next search must include. */
  readonly pinned: readonly number[];
  /** GeoNames ids the next search must not use. */
  readonly excluded: readonly number[];
  /** Minimum and maximum number of places per state for the next search. */
  readonly groups: readonly GroupConstraint[];
  /** Warnings from opening a permalink (data version, missing cities). */
  readonly linkWarnings: readonly string[];
  /** Board plans by plan key (puzzle key and the parameters the plan depends on). */
  readonly boardPlans: Readonly<Record<string, BoardPlanState>>;
  readonly exportOptions: ExportOptions;
  readonly setExportOptions: (update: Partial<ExportOptions>) => void;
  /** Logos for the board export (never saved). */
  readonly logos: readonly BoardLogo[];
  readonly setLang: (lang: Language) => void;
  readonly setParams: (update: Partial<UiParams>) => void;
  readonly setShown: (shown: Shown) => void;
  readonly setShowTour: (show: boolean) => void;
  readonly setOverlay: (overlay: OverlayChoice) => void;
}

const LANG_KEY = 'tsp-boards.lang';
const PLAYER_KEY = 'tsp-boards.player-name';

function readPlayerName(): string {
  try {
    return localStorage.getItem(PLAYER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_KEY, name);
  } catch {
    // This page only.
  }
  useStore.setState({ playerName: name });
}

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'de') return stored;
  } catch {
    // Storage unavailable (private mode, blocked): fall back to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';
}

export { DEFAULT_PARAMS } from '../core/params';

export const useStore = create<AppState>()((set) => ({
  lang: initialLanguage(),
  // Known before the data loads, so a play link never flashes the designer.
  mode:
    typeof window !== 'undefined' && /[#&]m=play(&|$)/.test(window.location.hash)
      ? 'play'
      : 'design',
  play: NEW_GAME,
  playId: null,
  page: typeof window !== 'undefined' && window.location.hash.length > 1 ? 'app' : 'gallery',
  playerName: readPlayerName(),
  kiosk: null,
  scoresVersion: 0,
  puzzleType:
    typeof window !== 'undefined' && /[#&]m=inc(&|$)/.test(window.location.hash)
      ? 'incremental'
      : 'map',
  inc: {
    params: DEFAULT_INCREMENTAL_UI,
    status: 'idle',
    puzzle: null,
    violations: [],
    marksFit: true,
    reached: 0,
    checks: 0,
    ms: 0,
    message: null,
    shownK: null,
    showSolution: false,
  },
  doc: NEW_DOC,
  list: null,
  libraryVersion: 0,
  setDoc: (update) => set((s) => ({ doc: { ...s.doc, ...update } })),
  setPuzzleType: (puzzleType) => set({ puzzleType, mode: 'design', doc: NEW_DOC }),
  setIncParams: (update) =>
    set((s) => ({ inc: { ...s.inc, params: { ...s.inc.params, ...update } } })),
  setInc: (update) => set((s) => ({ inc: { ...s.inc, ...update } })),
  manifest: null,
  country: null,
  loadError: null,
  params: DEFAULT_PARAMS_VALUE,
  run: { status: 'idle', runId: 0, progress: null, trace: [], error: null },
  shown: { kind: 'auto' },
  loaded: null,
  verifications: {},
  showTour: true,
  overlay: 'none',
  worldView: 'globe',
  flight: null,
  placing: false,
  combining: null,
  teaching: null,
  robustness: null,
  pinned: [],
  excluded: [],
  groups: [],
  linkWarnings: [],
  boardPlans: {},
  logos: [],
  exportOptions: { paper: 'A4', holes: 'cut', edge: true, strokeMm: 0.1, preview: true },
  setExportOptions: (update) => set((s) => ({ exportOptions: { ...s.exportOptions, ...update } })),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Not persisted; the choice still applies to this session.
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
  setParams: (update) => set((s) => ({ params: { ...s.params, ...update } })),
  setShown: (shown) => set({ shown }),
  setShowTour: (showTour) => set({ showTour }),
  setOverlay: (overlay) => set({ overlay }),
}));

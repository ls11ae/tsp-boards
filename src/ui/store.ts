// Application state (Zustand). Worker traffic is handled by controller.ts, which updates this
// store at most ~10 times per second.

import { create } from 'zustand';
import type { BoardPlan } from '../core/board/plan';
import type { Paper } from '../core/board/print';
import type { CountryFile, Manifest } from '../core/data';
import { EMPTY_PLAY, type PlayAttempt, type PlayState } from '../core/play';
import { DEFAULT_PARAMS as DEFAULT_PARAMS_VALUE, type PuzzleParams } from '../core/params';
import type { TracePoint } from '../core/search/search';
import type { Verification } from '../core/verify';
import type { SearchProgress } from '../workers/protocol';

export type Language = 'en' | 'de';

/** Puzzle parameters (core); the UI edits them as they are. */
export type UiParams = PuzzleParams;

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
  /** Cut the nail holes (laser) or mark them for drilling. */
  readonly holes: 'cut' | 'mark';
  /** Line width in the SVG, mm. */
  readonly strokeMm: number;
  /** Show the planned board (scale, title, final labels) instead of the map view. */
  readonly preview: boolean;
}

export type Mode = 'design' | 'play';

/** A game in play mode; slots index the puzzle's members (ascending pool index). */
export interface PlayUi {
  readonly state: PlayState;
  /** performance.now() of the first click. */
  readonly startedAt: number | null;
  readonly attempts: readonly PlayAttempt[];
  /** Path (slots joined) of the last judged round trip, so each trip counts once. */
  readonly judged: string | null;
  readonly solvedMs: number | null;
  readonly revealed: boolean;
  /** The record of this game was sent (with consent). */
  readonly sent: boolean;
}

export const NEW_GAME: PlayUi = {
  state: EMPTY_PLAY,
  startedAt: null,
  attempts: [],
  judged: null,
  solvedMs: null,
  revealed: false,
  sent: false,
};

export interface AppState {
  readonly lang: Language;
  readonly mode: Mode;
  readonly play: PlayUi;
  readonly manifest: Manifest | null;
  readonly country: CountryFile | null;
  readonly loadError: string | null;
  readonly params: UiParams;
  readonly run: RunState;
  readonly shown: Shown;
  readonly loaded: LoadedPuzzle | null;
  readonly verifications: Readonly<Record<string, VerificationState>>;
  readonly showTour: boolean;
  /** GeoNames ids the next search must include. */
  readonly pinned: readonly number[];
  /** GeoNames ids the next search must not use. */
  readonly excluded: readonly number[];
  /** Warnings from opening a permalink (data version, missing cities). */
  readonly linkWarnings: readonly string[];
  /** Board plans by plan key (puzzle key and the parameters the plan depends on). */
  readonly boardPlans: Readonly<Record<string, BoardPlanState>>;
  readonly exportOptions: ExportOptions;
  readonly setExportOptions: (update: Partial<ExportOptions>) => void;
  readonly setLang: (lang: Language) => void;
  readonly setParams: (update: Partial<UiParams>) => void;
  readonly setShown: (shown: Shown) => void;
  readonly setShowTour: (show: boolean) => void;
}

const LANG_KEY = 'tsp-boards.lang';

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
  manifest: null,
  country: null,
  loadError: null,
  params: DEFAULT_PARAMS_VALUE,
  run: { status: 'idle', runId: 0, progress: null, trace: [], error: null },
  shown: { kind: 'auto' },
  loaded: null,
  verifications: {},
  showTour: true,
  pinned: [],
  excluded: [],
  linkWarnings: [],
  boardPlans: {},
  exportOptions: { paper: 'A4', holes: 'cut', strokeMm: 0.1, preview: true },
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
}));

// Play mode: the player's round trip, judging it once the exact optimum is known, games kept per
// puzzle (switching keeps progress, also across reloads), local highscores, and the anonymous
// game record (sent only with consent and only if an endpoint is configured).

import { Instance } from '../core/instance';
import { effectiveREffMm } from '../core/params';
import { encodePlayLink } from '../core/permalink';
import { clickNail, judge, puzzleHash, undo, type PlayRecord } from '../core/play';
import {
  excessValue,
  parseScores,
  rankScores,
  type Measure,
  type ScoreEntry,
} from '../core/scores';
import { euclideanLength } from '../core/tsp/tour';
import { getBoard } from './board';
import { linkList } from './lists';
import type { PuzzleView } from './puzzle';
import { NEW_GAME, useStore, type PlayUi } from './store';

/** Where game records go; unset (the default) means nothing is ever sent. */
export const PLAY_DATA_URL: string | undefined =
  (import.meta.env.VITE_PLAY_DATA_URL as string | undefined) || undefined;

const CONSENT_KEY = 'tsp-boards.share-play-data';
const NICKNAME_KEY = 'tsp-boards.share-nickname';
const GAMES_KEY = 'tsp-boards.games.v1';
const SCORES_KEY = 'tsp-boards.scores.v1';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'yes';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? 'yes' : 'no');
  } catch {
    // Not stored: the choice applies to this page only.
  }
}

export const readConsent = () => readFlag(CONSENT_KEY);
export const writeConsent = (value: boolean) => writeFlag(CONSENT_KEY, value);
/** Whether the nickname may go with shared results (a separate consent). */
export const readNicknameConsent = () => readFlag(NICKNAME_KEY);
export const writeNicknameConsent = (value: boolean) => writeFlag(NICKNAME_KEY, value);

// --- games per puzzle ------------------------------------------------------------------------

let gamesMemory: Record<string, PlayUi> | null = null;

function loadGames(): Record<string, PlayUi> {
  if (gamesMemory) return gamesMemory;
  try {
    const raw = JSON.parse(localStorage.getItem(GAMES_KEY) ?? '{}') as unknown;
    gamesMemory = typeof raw === 'object' && raw !== null ? (raw as Record<string, PlayUi>) : {};
  } catch {
    gamesMemory = {};
  }
  return gamesMemory;
}

function saveGame(id: string, game: PlayUi): void {
  const games = { ...loadGames(), [id]: game };
  // Keep the 50 most recently started games.
  const ids = Object.keys(games)
    .sort((a, b) => (games[b]!.startedAt ?? 0) - (games[a]!.startedAt ?? 0))
    .slice(0, 50);
  gamesMemory = Object.fromEntries(ids.map((k) => [k, games[k]!]));
  try {
    localStorage.setItem(GAMES_KEY, JSON.stringify(gamesMemory));
  } catch {
    // Kept for this page only.
  }
}

/** Whether a stored game looks like one (stored data may be old or edited). */
function validGame(game: unknown): game is PlayUi {
  const g = game as Partial<PlayUi> | null;
  return (
    !!g &&
    typeof g === 'object' &&
    !!g.state &&
    Array.isArray(g.state.path) &&
    Array.isArray(g.attempts)
  );
}

/** Starts or resumes the game of puzzle `id`. */
export function startPlaying(id: string): void {
  const stored = loadGames()[id];
  useStore.setState({
    playId: id,
    play: validGame(stored) ? { ...NEW_GAME, ...stored } : NEW_GAME,
  });
}

/** The game of puzzle `id` as stored (for the gallery). */
export function storedGame(id: string): PlayUi | null {
  const g = loadGames()[id];
  return validGame(g) ? g : null;
}

/** Changes the game being played and keeps it per puzzle. */
export function updateGame(change: (play: PlayUi) => PlayUi): void {
  const { play, playId } = useStore.getState();
  const next = change(play);
  useStore.setState({ play: next });
  if (playId) saveGame(playId, next);
}

/** Board puzzles are judged by string length, digital ones by Euclidean length. */
export function currentMeasure(): Measure {
  return useStore.getState().doc.purpose === 'digital' ? 'euclidean' : 'string';
}

/** Play id of a map puzzle: the document id, or a hash of its places. */
export function mapPlayId(puzzle: PuzzleView): string | null {
  const { country, params, doc } = useStore.getState();
  if (doc.id) return doc.id;
  if (!country) return null;
  const board = getBoard(country, params);
  return `p-${puzzleHash(puzzle.members.map((c) => board.pool[c]!.id))}-${params.region}`;
}

// --- highscores ----------------------------------------------------------------------------

let scoresMemory: Record<string, ScoreEntry[]> | null = null;

export function loadScores(): Record<string, ScoreEntry[]> {
  if (scoresMemory) return scoresMemory;
  try {
    scoresMemory = parseScores(JSON.parse(localStorage.getItem(SCORES_KEY) ?? '{}'));
  } catch {
    scoresMemory = {};
  }
  return scoresMemory;
}

export function scoresFor(id: string | null): ScoreEntry[] {
  return id ? (loadScores()[id] ?? []) : [];
}

function addScore(id: string, entry: ScoreEntry): void {
  const all = loadScores();
  scoresMemory = { ...all, [id]: rankScores([...(all[id] ?? []), entry]) };
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scoresMemory));
  } catch {
    // Kept for this page only.
  }
  useStore.setState((s) => ({ scoresVersion: s.scoresVersion + 1 }));
}

/**
 * Records the game's result once: when the optimum is found, or when the solution is shown
 * (then with the best excess so far and the penalty flag).
 */
export function recordGameScore(measure: Measure): void {
  const { play, playId, playerName } = useStore.getState();
  if (!playId || play.scored || !play.best) return;
  const solved = play.solvedMs !== null;
  if (!solved && !play.revealed) return;
  addScore(playId, {
    name: playerName.trim() || '–',
    excess: solved ? 0 : play.best.excess,
    measure,
    ms: play.solvedMs ?? play.attempts.at(-1)?.ms ?? 0,
    revealed: play.revealed && !solved,
    date: new Date().toISOString().slice(0, 10),
    order: play.best.path,
  });
  updateGame((p) => ({ ...p, scored: true }));
}

// --- the map puzzle ---------------------------------------------------------------------------

let instanceCache: { key: string; rEff: number; inst: Instance } | null = null;

function puzzleInstance(puzzle: PuzzleView): Instance | null {
  const { country, params } = useStore.getState();
  if (!country) return null;
  const rEff = effectiveREffMm(params, useStore.getState().doc.purpose);
  if (instanceCache?.key === puzzle.key && instanceCache.rEff === rEff) return instanceCache.inst;
  const board = getBoard(country, params);
  const inst = new Instance(
    puzzle.members.map((c) => board.points[c]!),
    rEff,
  );
  instanceCache = { key: puzzle.key, rEff, inst };
  return inst;
}

export function playClick(puzzle: PuzzleView, slot: number): void {
  updateGame((p) => {
    if (p.revealed) return p;
    return {
      ...p,
      state: clickNail(p.state, slot, puzzle.members.length),
      startedAt: p.startedAt ?? Date.now(),
    };
  });
  judgePending(puzzle);
}

export function playUndo(): void {
  updateGame((p) => (p.revealed ? p : { ...p, state: undo(p.state) }));
}

/** Clears the board; the game (time, attempts, a solution found or shown) goes on. */
export function playRestart(): void {
  updateGame((p) => ({ ...p, state: NEW_GAME.state, judged: null }));
}

/** Starts the game of this puzzle from scratch (time and attempts too). */
export function playNewGame(): void {
  updateGame(() => NEW_GAME);
}

export function playReveal(puzzle: PuzzleView): void {
  updateGame((p) => ({ ...p, revealed: true }));
  recordGameScore(currentMeasure());
  sendRecord(puzzle);
}

/** Judges a closed round trip once the optimum is known (called again when it arrives). */
export function judgePending(puzzle: PuzzleView): void {
  const { play } = useStore.getState();
  const v = puzzle.verification;
  if (!play.state.closed || v?.status !== 'done' || !v.verification.string) return;
  const key = play.state.path.join(',');
  if (play.judged === key) return;
  const inst = puzzleInstance(puzzle);
  if (!inst) return;
  const string = v.verification.string;
  const result = judge(inst, play.state.path, {
    tour: string.optimal,
    lengthUm: string.optimalLength,
  });
  const ms = play.startedAt === null ? 0 : Date.now() - play.startedAt;
  const measure = currentMeasure();
  const excess = result.optimal ? 0 : excessValue(measure, result.lengthUm, string.optimalLength);
  updateGame((p) => ({
    ...p,
    judged: key,
    attempts: [...p.attempts, { ms, excessUm: result.excessUm }],
    solvedMs: p.solvedMs ?? (result.optimal ? ms : null),
    best: p.best && p.best.excess <= excess ? p.best : { excess, path: [...p.state.path] },
  }));
  if (result.optimal) {
    recordGameScore(measure);
    sendRecord(puzzle);
  }
}

function sendRecord(puzzle: PuzzleView): void {
  const { play, country, params, playerName } = useStore.getState();
  if (!PLAY_DATA_URL || !readConsent() || play.sent || !country) return;
  const board = getBoard(country, params);
  const points = puzzle.members.map((c) => {
    const [x, y] = board.points[c]!;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as const;
  });
  const nickname = readNicknameConsent() ? playerName.trim().slice(0, 30) || null : null;
  const record: PlayRecord = {
    schema: 2,
    app: __APP_VERSION__,
    data: `${country.country.toLowerCase()}@${country.dataVersion}`,
    puzzle: puzzleHash(puzzle.members.map((c) => board.pool[c]!.id)),
    region: params.region,
    n: puzzle.members.length,
    rEffMm: effectiveREffMm(params, useStore.getState().doc.purpose),
    attempts: play.attempts,
    solvedMs: play.solvedMs,
    gaveUp: play.revealed,
    difficulty: puzzle.evaluation?.difficulty.score ?? null,
    measure: currentMeasure(),
    points,
    order: play.best ? play.best.path : null,
    nickname,
  };
  updateGame((p) => ({ ...p, sent: true }));
  // Fire and forget: a failed upload must not disturb the game.
  void fetch(PLAY_DATA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
    keepalive: true,
  }).catch(() => undefined);
}

/** Link that opens the shown puzzle in play mode. */
export function playLink(puzzle: PuzzleView): string | null {
  const { country, params, doc } = useStore.getState();
  if (!country) return null;
  const board = getBoard(country, params);
  const hash = encodePlayLink(
    params,
    { country: country.country, version: country.dataVersion },
    puzzle.members.map((c) => board.pool[c]!.id),
    __APP_VERSION__,
    doc.title,
    linkList(puzzle.members),
  );
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/** Leaves play mode for the designer, keeping the puzzle on display (the game is kept). */
export function openInDesigner(): void {
  useStore.setState({ mode: 'design', playId: null, play: NEW_GAME });
}

/** Euclidean length of a path in the puzzle (for digital puzzles, 5.4). */
export function euclideanMm(puzzle: PuzzleView, path: readonly number[]): number {
  const inst = puzzleInstance(puzzle);
  return inst ? euclideanLength(inst, path) / 1000 : 0;
}

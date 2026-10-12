// Play mode: the player's round trip, judging it once the exact optimum is known, and the
// anonymous game record (sent only with consent and only if an endpoint is configured).

import { Instance } from '../core/instance';
import { rEffMm } from '../core/params';
import { encodePlayLink } from '../core/permalink';
import { clickNail, judge, puzzleHash, undo, type PlayRecord } from '../core/play';
import { getBoard } from './board';
import type { PuzzleView } from './puzzle';
import { NEW_GAME, useStore, type PlayUi } from './store';

/** Where game records go; unset (the default) means nothing is ever sent. */
export const PLAY_DATA_URL: string | undefined =
  (import.meta.env.VITE_PLAY_DATA_URL as string | undefined) || undefined;

const CONSENT_KEY = 'tsp-boards.share-play-data';

export function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function writeConsent(value: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, value ? 'yes' : 'no');
  } catch {
    // Not stored: the choice applies to this page only.
  }
}

function update(change: (play: PlayUi) => PlayUi): void {
  useStore.setState((s) => ({ play: change(s.play) }));
}

let instanceCache: { key: string; rEff: number; inst: Instance } | null = null;

function puzzleInstance(puzzle: PuzzleView): Instance | null {
  const { country, params } = useStore.getState();
  if (!country) return null;
  const rEff = rEffMm(params);
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
  update((p) => {
    if (p.revealed) return p;
    return {
      ...p,
      state: clickNail(p.state, slot, puzzle.members.length),
      startedAt: p.startedAt ?? performance.now(),
    };
  });
  judgePending(puzzle);
}

export function playUndo(): void {
  update((p) => (p.revealed ? p : { ...p, state: undo(p.state) }));
}

/** Clears the board; the game (time, attempts, a solution found or shown) goes on. */
export function playRestart(): void {
  update((p) => ({ ...p, state: NEW_GAME.state, judged: null }));
}

export function playReveal(puzzle: PuzzleView): void {
  update((p) => ({ ...p, revealed: true }));
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
  const ms = Math.round(performance.now() - (play.startedAt ?? performance.now()));
  update((p) => ({
    ...p,
    judged: key,
    attempts: [...p.attempts, { ms, excessUm: result.excessUm }],
    solvedMs: p.solvedMs ?? (result.optimal ? ms : null),
  }));
  if (result.optimal) sendRecord(puzzle);
}

function sendRecord(puzzle: PuzzleView): void {
  const { play, country, params } = useStore.getState();
  if (!PLAY_DATA_URL || !readConsent() || play.sent || !country) return;
  const board = getBoard(country, params);
  const record: PlayRecord = {
    schema: 1,
    app: __APP_VERSION__,
    data: `${country.country.toLowerCase()}@${country.dataVersion}`,
    puzzle: puzzleHash(puzzle.members.map((c) => board.pool[c]!.id)),
    region: params.region,
    n: puzzle.members.length,
    rEffMm: rEffMm(params),
    attempts: play.attempts,
    solvedMs: play.solvedMs,
    gaveUp: play.revealed,
    difficulty: puzzle.evaluation?.difficulty.score ?? null,
  };
  update((p) => ({ ...p, sent: true }));
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
  );
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/** Leaves play mode for the designer, keeping the puzzle on display. */
export function openInDesigner(): void {
  useStore.setState({ mode: 'design', play: NEW_GAME });
}

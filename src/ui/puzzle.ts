// The puzzle shown on the board: the best candidate so far (or the current state), an archive
// entry chosen by the user, or a puzzle opened from a link. Exact verification results, when
// available, override the heuristic tour and gap.

import type { Evaluation } from '../core/search/search';
import { useStore, type VerificationState } from './store';

export type PuzzleSource = 'current' | 'best' | 'candidate' | 'loaded';

export interface PuzzleView {
  readonly key: string;
  readonly source: PuzzleSource;
  /** 1-based rank in the archive, if the puzzle is an archive entry. */
  readonly rank: number | null;
  /** Pool indices, ascending. */
  readonly members: readonly number[];
  /** Best known tour (pool indices): exact if verified, else heuristic; null if unknown. */
  readonly tour: readonly number[] | null;
  readonly evaluation: Evaluation | null;
  readonly verification: VerificationState | undefined;
}

export function usePuzzle(): PuzzleView | null {
  const shown = useStore((s) => s.shown);
  const progress = useStore((s) => s.run.progress);
  const loaded = useStore((s) => s.loaded);
  const verifications = useStore((s) => s.verifications);

  let evaluation: Evaluation | null = null;
  let source: PuzzleSource = 'current';
  let members: readonly number[] | null = null;
  let key: string | null = null;
  if (shown.kind === 'key') {
    key = shown.key;
    if (loaded?.key === key) {
      source = 'loaded';
      members = loaded.members;
    }
    evaluation =
      progress?.archive.find((e) => e.key === key) ??
      (progress?.best?.key === key ? progress.best : null) ??
      (progress?.current.key === key ? progress.current : null);
    if (evaluation && source !== 'loaded') source = 'candidate';
  } else if (progress) {
    evaluation = progress.best ?? progress.current;
    source = progress.best ? 'best' : 'current';
  }
  if (evaluation) {
    key = evaluation.key;
    members = evaluation.members;
  }
  if (!key || !members) return null;

  const archive = progress?.archive ?? [];
  const rankIndex = archive.findIndex((e) => e.key === key);
  const verification = verifications[key];
  let tour: readonly number[] | null = evaluation?.tour ?? null;
  if (verification?.status === 'done' && verification.verification.string) {
    const slots = verification.verification.string.optimal;
    tour = slots.map((s) => members[s]!);
  }
  return {
    key,
    source,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    members,
    tour,
    evaluation,
    verification,
  };
}

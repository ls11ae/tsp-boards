// Formatting helpers shared by components (durations, score excess).

import type { ScoreEntry } from '../core/scores';
import { useFormat } from './i18n';

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Excess of a score in its measure: mm of string, or % of length. */
export function useExcessText(): (entry: Pick<ScoreEntry, 'excess' | 'measure'>) => string {
  const fmt = useFormat();
  return (e) =>
    e.excess === 0
      ? '0'
      : e.measure === 'string'
        ? `+${fmt.number(e.excess / 1000, 1)} mm`
        : `+${fmt.number(e.excess / 1e4, 2)} %`;
}

// Highscores per puzzle (kept locally in the browser; the record can later go to the optional
// play data endpoint). Ranking: entries without the solution shown first, then the excess over
// the optimum, then the time.

export type Measure = 'string' | 'euclidean';

export interface ScoreEntry {
  /** Nickname, as typed by the player (local list only unless shared with consent). */
  readonly name: string;
  /** Excess over the optimum: µm of string ('string') or parts per million of length. */
  readonly excess: number;
  readonly measure: Measure;
  /** Time from the first click, ms. */
  readonly ms: number;
  /** The solution was shown before this result. */
  readonly revealed: boolean;
  /** ISO date. */
  readonly date: string;
  /** The round trip as indices into the puzzle's places. */
  readonly order: readonly number[];
}

export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  return Number(a.revealed) - Number(b.revealed) || a.excess - b.excess || a.ms - b.ms;
}

/** Entries kept per puzzle (enough for a day at a booth, roadmap 9.4). */
export const KEPT_SCORES = 200;

/** Ranked entries, at most `limit`. */
export function rankScores(entries: readonly ScoreEntry[], limit = KEPT_SCORES): ScoreEntry[] {
  return [...entries].sort(compareScores).slice(0, limit);
}

/** Excess in the unit of the measure: µm of string, or ppm of the optimal length. */
export function excessValue(measure: Measure, length: number, optimum: number): number {
  const diff = Math.max(0, length - optimum);
  return measure === 'string' ? Math.round(diff) : Math.round((diff / optimum) * 1e6);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates stored entries (local storage may hold anything). */
export function parseScores(value: unknown): Record<string, ScoreEntry[]> {
  if (!isObj(value)) return {};
  const out: Record<string, ScoreEntry[]> = {};
  for (const [id, list] of Object.entries(value).slice(0, 2000)) {
    if (!Array.isArray(list)) continue;
    const entries = list.flatMap((e): ScoreEntry[] => {
      if (!isObj(e)) return [];
      const { name, excess, measure, ms, revealed, date, order } = e;
      if (typeof name !== 'string' || typeof excess !== 'number' || typeof ms !== 'number')
        return [];
      if (measure !== 'string' && measure !== 'euclidean') return [];
      return [
        {
          name: name.slice(0, 40),
          excess,
          measure,
          ms,
          revealed: revealed === true,
          date: typeof date === 'string' ? date.slice(0, 30) : '',
          order: Array.isArray(order) ? order.filter((x): x is number => Number.isInteger(x)) : [],
        },
      ];
    });
    if (entries.length > 0) out[id.slice(0, 80)] = rankScores(entries);
  }
  return out;
}

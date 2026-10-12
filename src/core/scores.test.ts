import { describe, expect, it } from 'vitest';
import { excessValue, parseScores, rankScores, type ScoreEntry } from './scores';

const entry = (name: string, excess: number, ms: number, revealed = false): ScoreEntry => ({
  name,
  excess,
  measure: 'string',
  ms,
  revealed,
  date: '2026-10-12',
  order: [0, 1, 2],
});

describe('highscores', () => {
  it('rank by shown solution, excess and time', () => {
    const ranked = rankScores([
      entry('slow optimum', 0, 90_000),
      entry('shown', 0, 10_000, true),
      entry('fast optimum', 0, 30_000),
      entry('close', 1200, 5_000),
    ]);
    expect(ranked.map((e) => e.name)).toEqual(['fast optimum', 'slow optimum', 'close', 'shown']);
    expect(
      rankScores(
        Array.from({ length: 30 }, (_, i) => entry(`p${i}`, i, i)),
        5,
      ),
    ).toHaveLength(5);
  });

  it('measure the excess in µm of string or ppm of length', () => {
    expect(excessValue('string', 2_738_300 + 12_345, 2_738_300)).toBe(12_345);
    expect(excessValue('euclidean', 1010, 1000)).toBe(10_000);
    expect(excessValue('euclidean', 990, 1000)).toBe(0);
  });

  it('clean stored data', () => {
    const parsed = parseScores({
      a: [entry('ok', 5, 1), { name: 1 }, 'junk', { ...entry('bad measure', 1, 1), measure: 'x' }],
      b: 'nope',
    });
    expect(Object.keys(parsed)).toEqual(['a']);
    expect(parsed.a!.map((e) => e.name)).toEqual(['ok']);
    expect(parseScores(null)).toEqual({});
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KIOSK_ANIMALS,
  KIOSK_LEVELS,
  kioskFreeNames,
  kioskName,
  kioskScreen,
  kioskTable,
} from './kiosk';

describe('event mode', () => {
  it('opens with #kiosk and its leaderboard with #kiosk/scores', () => {
    expect(kioskScreen('#kiosk')).toBe('start');
    expect(kioskScreen('#kiosk/scores')).toBe('scores');
    expect(kioskScreen('')).toBeNull();
    expect(kioskScreen('#r=DE&n=40')).toBeNull();
    expect(kioskScreen('#kioskx')).toBeNull();
  });

  it('allows free names only with ?names=free (roadmap 9.12)', () => {
    expect(kioskScreen('#kiosk?names=free')).toBe('start');
    expect(kioskScreen('#kiosk/scores?names=free')).toBe('scores');
    expect(kioskFreeNames('#kiosk?names=free')).toBe(true);
    expect(kioskFreeNames('#kiosk')).toBe(false);
    expect(kioskFreeNames('#kiosk?names=list')).toBe(false);
    expect(kioskFreeNames('#names=free')).toBe(false);
  });

  it('carries a table label, also with free names (roadmap 9.17)', () => {
    expect(kioskTable('#kiosk?table=1')).toBe('1');
    expect(kioskTable('#kiosk/scores?table=2')).toBe('2');
    expect(kioskScreen('#kiosk/scores?table=2')).toBe('scores');
    expect(kioskTable('#kiosk?names=free&table=A')).toBe('A');
    expect(kioskFreeNames('#kiosk?table=1&names=free')).toBe(true);
    expect(kioskTable('#kiosk')).toBeNull();
    expect(kioskTable('#kiosk?table=%3Cb%3E')).toBeNull();
    expect(kioskTable('#kiosk?table=' + 'x'.repeat(13))).toBeNull();
  });

  it('names players with an animal and a number, avoiding names already taken', () => {
    const seq = (values: number[]) => () => values.shift() ?? 0;
    expect(kioskName('de', new Set(), seq([0, 0.06]))).toBe('Fuchs 6');
    expect(kioskName('en', new Set(), seq([0, 0.06]))).toBe('Fox 6');
    // "Fuchs 6" is taken: the next draw.
    expect(kioskName('de', new Set(['Fuchs 6']), seq([0, 0.06, 0.04, 0.5]))).toBe('Biber 50');
    for (let i = 0; i < 200; i++)
      expect(kioskName('de')).toMatch(/^\p{Lu}\p{Ll}+ ([1-9]|[1-9]\d)$/u);
    // Short, distinct names in both languages.
    for (const lang of [0, 1]) {
      const names = KIOSK_ANIMALS.map((a) => a[lang]!);
      expect(new Set(names).size).toBe(names.length);
      for (const n of names) expect(n.length).toBeLessThanOrEqual(10);
    }
  });

  it('offers only puzzles of the collection, easy ones with fewer places', () => {
    const index = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../public/puzzles/index.json'), 'utf8'),
    ) as { puzzles: { id: string; n: number }[] };
    const n = new Map(index.puzzles.map((p) => [p.id, p.n]));
    for (const level of KIOSK_LEVELS) for (const id of level.ids) expect(n.has(id)).toBe(true);
    const max = (key: string) =>
      Math.max(...KIOSK_LEVELS.find((l) => l.key === key)!.ids.map((id) => n.get(id)!));
    const min = (key: string) =>
      Math.min(...KIOSK_LEVELS.find((l) => l.key === key)!.ids.map((id) => n.get(id)!));
    expect(max('easy')).toBeLessThan(min('medium'));
    expect(max('medium')).toBeLessThan(min('hard'));
  });
});

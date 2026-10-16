import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIOSK_LEVELS, kioskScreen } from './kiosk';

describe('event mode', () => {
  it('opens with #kiosk and its leaderboard with #kiosk/scores', () => {
    expect(kioskScreen('#kiosk')).toBe('start');
    expect(kioskScreen('#kiosk/scores')).toBe('scores');
    expect(kioskScreen('')).toBeNull();
    expect(kioskScreen('#r=DE&n=40')).toBeNull();
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

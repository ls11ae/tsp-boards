import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CollectionEntry, CollectionIndex } from '../../src/core/puzzle-file';
import { CATEGORIES, categoryOf, orderCollection } from './categories';

type Entry = Omit<CollectionEntry, 'category'>;
const entry = (id: string, n: number, over: Partial<Entry> = {}): Entry => ({
  file: `${id}.tsp.json`,
  id,
  kind: 'map',
  title: id,
  description: '',
  purpose: 'digital',
  region: 'DE',
  n,
  ...over,
});

describe('collection categories (roadmap 9.11)', () => {
  it('sorts the categories in order, small to large, a board next to its digital version', () => {
    const ordered = orderCollection([
      entry('exzellenzcluster-2026', 37),
      entry('exzellenzstrategie-2027-37', 37),
      entry('exzellenzstrategie-2027-brett', 25, { purpose: 'board' }),
      entry('exzellenzstrategie-2027', 34),
      entry('schritt-12', 12, { kind: 'incremental', region: '', purpose: 'board' }),
      entry('welt-30', 30, { region: 'WO' }),
      entry('europa-30', 30, { region: 'EU', purpose: 'board' }),
      entry('ruhrgebiet-11', 11, { region: 'DE-NW' }),
      entry('deutschland-40', 40, { purpose: 'board' }),
      entry('landeshauptstaedte', 16),
      entry('hansestaedte-25', 25, { purpose: 'board' }),
      entry('landeshauptstaedte-brett', 15, { purpose: 'board' }),
    ]);
    expect(ordered.map((e) => e.id)).toEqual([
      'landeshauptstaedte-brett',
      'landeshauptstaedte',
      'hansestaedte-25',
      'deutschland-40',
      'ruhrgebiet-11',
      'europa-30',
      'welt-30',
      'schritt-12',
      // The board first, then the puzzle of the posters' QR code, then small to large.
      'exzellenzstrategie-2027-brett',
      'exzellenzstrategie-2027-37',
      'exzellenzstrategie-2027',
      'exzellenzcluster-2026',
    ]);
    expect(categoryOf(entry('bayern-30', 30, { region: 'DE-BY' }))).toBe('regions');
  });

  it('is the order of the committed index, with names in German and English', () => {
    const index = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, '../../public/puzzles/index.json'), 'utf8'),
    ) as CollectionIndex;
    expect(index.categories).toEqual(CATEGORIES);
    for (const c of index.categories) expect(c.name.de && c.name.en).toBeTruthy();
    expect(index.puzzles.map((e) => e.id)).toEqual(orderCollection(index.puzzles).map((e) => e.id));
    expect(index.puzzles.every((e) => e.category === categoryOf(e))).toBe(true);
    // Interesting puzzles first: the Excellence Strategy puzzles close the collection.
    expect(index.puzzles[0]!.category).toBe('germany');
    expect(index.puzzles.at(-1)!.category).toBe('specials');
  });
});

// Categories and order of the curated collection (roadmap 9.11, 9.13): the gallery shows them
// with headings, the interesting puzzles first and the Excellence Strategy puzzles at the end.
// Within a category from small to large, a board next to its digital version.

import {
  localText,
  type CollectionCategory,
  type CollectionEntry,
} from '../../src/core/puzzle-file';

export const CATEGORIES: readonly CollectionCategory[] = [
  { id: 'germany', name: { de: 'Deutschland', en: 'Germany' } },
  { id: 'regions', name: { de: 'Städte und Regionen', en: 'Cities and regions' } },
  { id: 'world', name: { de: 'Europa und die Welt', en: 'Europe and the world' } },
  { id: 'incremental', name: { de: 'Schritt für Schritt', en: 'Step by step' } },
  { id: 'specials', name: { de: 'Specials', en: 'Specials' } },
];

type Entry = Omit<CollectionEntry, 'category'>;

/** The category of a puzzle, by its kind, id and region. */
export function categoryOf(e: Entry): string {
  if (e.kind === 'incremental') return 'incremental';
  if (e.id.startsWith('exzellenz')) return 'specials';
  if (/^(EU|WO)/.test(e.region)) return 'world';
  if (e.region === 'DE') return 'germany';
  return 'regions';
}

/** A board and its digital version share a key: the id without "-brett". */
const pairKey = (e: Entry) => e.id.replace(/-brett$/, '');

/** The entries with their categories, in gallery order. */
export function orderCollection(entries: readonly Entry[]): CollectionEntry[] {
  const withCategory = entries.map((e) => ({ ...e, category: categoryOf(e) }));
  const rank = (c: string) => CATEGORIES.findIndex((x) => x.id === c);
  // The smallest puzzle of a pair decides its place.
  const pairN = new Map<string, number>();
  for (const e of withCategory) {
    const key = pairKey(e);
    pairN.set(key, Math.min(pairN.get(key) ?? Infinity, e.n));
  }
  return withCategory.sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      pairN.get(pairKey(a))! - pairN.get(pairKey(b))! ||
      pairKey(a).localeCompare(pairKey(b)) ||
      // The board before its digital version.
      (a.purpose === 'board' ? 0 : 1) - (b.purpose === 'board' ? 0 : 1) ||
      localText(a.title, 'de').localeCompare(localText(b.title, 'de'), 'de'),
  );
}

// Group constraints of the search: each pool city belongs to at most one group (e.g. its
// federal state), and the selection must hold between min and max cities of each group.

export interface PoolGroups {
  /** Group index of each pool city; -1 for cities in no group. */
  readonly of: readonly number[];
  /** Bounds per group index (max may be Infinity). */
  readonly min: readonly number[];
  readonly max: readonly number[];
}

/** Number of selected cities per group. */
export function groupCounts(groups: PoolGroups, members: readonly number[]): number[] {
  const counts = new Array<number>(groups.min.length).fill(0);
  for (const c of members) {
    const g = groups.of[c]!;
    if (g >= 0) counts[g]!++;
  }
  return counts;
}

export function withinBounds(groups: PoolGroups, counts: readonly number[]): boolean {
  return counts.every((k, g) => k >= groups.min[g]! && k <= groups.max[g]!);
}

/**
 * Range of puzzle sizes the bounds allow: at least the sum of the minima, at most the sum of
 * the maxima (each capped by the group's pool size) plus the cities in no group.
 */
export function sizeRange(groups: PoolGroups): { readonly min: number; readonly max: number } {
  const size = new Array<number>(groups.min.length).fill(0);
  let free = 0;
  for (const g of groups.of) {
    if (g >= 0) size[g]!++;
    else free++;
  }
  let min = 0;
  let max = free;
  groups.min.forEach((m, g) => {
    min += m;
    max += Math.min(groups.max[g]!, size[g]!);
  });
  return { min, max };
}

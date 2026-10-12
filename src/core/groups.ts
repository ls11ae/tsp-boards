// Group constraints per federal state (roadmap 5.6): "visit every state", "exactly one per
// state", or any minimum and maximum per state. The search sees them as pool groups.

import type { GroupConstraint } from './puzzle-file';
import type { PoolGroups } from './search/groups';

/** Every state of the region (`'*'`). */
export const EVERY_STATE = '*';
const GROUP_PATTERN = /^(\*|[A-Z]{2}-[A-Z0-9]{1,3})$/;

export interface StateGroups extends PoolGroups {
  /** State id of each group index. */
  readonly states: readonly string[];
}

/**
 * Pool groups from constraints: '*' applies to every state of the region, a constraint on one
 * state overrides it. Null without constraints.
 */
export function stateGroups(
  cities: readonly { readonly state: string }[],
  regionStates: readonly string[],
  constraints: readonly GroupConstraint[],
): StateGroups | null {
  if (constraints.length === 0) return null;
  const every = constraints.find((c) => c.group === EVERY_STATE);
  const states: string[] = [];
  const min: number[] = [];
  const max: number[] = [];
  for (const s of regionStates) {
    const c = constraints.find((x) => x.group === s) ?? every;
    if (!c) continue;
    states.push(s);
    min.push(c.min);
    max.push(c.max ?? Infinity);
  }
  const index = new Map(states.map((s, i) => [s, i]));
  return { of: cities.map((c) => index.get(c.state) ?? -1), min, max, states };
}

/** Link form: `group:min:max` joined by ',' (max empty for no maximum), e.g. `*:1:1`. */
export function encodeGroups(groups: readonly GroupConstraint[]): string {
  return groups.map((g) => `${g.group}:${g.min}:${g.max ?? ''}`).join(',');
}

export function decodeGroups(text: string | null): GroupConstraint[] {
  if (!text) return [];
  return text.split(',').flatMap((part): GroupConstraint[] => {
    const [group = '', min = '', max = ''] = part.split(':');
    const lo = Number(min);
    const hi = max === '' ? null : Number(max);
    if (!GROUP_PATTERN.test(group) || !Number.isInteger(lo) || lo < 0 || lo > 500) return [];
    if (hi !== null && (!Number.isInteger(hi) || hi < lo || hi > 500)) return [];
    return [{ group, min: lo, max: hi }];
  });
}

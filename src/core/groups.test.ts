import { describe, expect, it } from 'vitest';
import { decodeGroups, encodeGroups, stateGroups } from './groups';

describe('state groups', () => {
  it('apply "*" to every state of the region, with overrides per state', () => {
    const cities = [{ state: 'DE-BB' }, { state: 'DE-BE' }, { state: 'DE-BB' }, { state: 'X' }];
    const g = stateGroups(
      cities,
      ['DE-BB', 'DE-BE'],
      [
        { group: '*', min: 1, max: null },
        { group: 'DE-BE', min: 0, max: 1 },
      ],
    )!;
    expect(g.states).toEqual(['DE-BB', 'DE-BE']);
    expect(g.of).toEqual([0, 1, 0, -1]);
    expect(g.min).toEqual([1, 0]);
    expect(g.max).toEqual([Infinity, 1]);
    expect(stateGroups(cities, ['DE-BB'], [])).toBeNull();
  });

  it('round-trip through links and drop invalid entries', () => {
    const groups = [
      { group: '*', min: 1, max: 1 },
      { group: 'DE-BY', min: 2, max: null },
    ];
    expect(encodeGroups(groups)).toBe('*:1:1,DE-BY:2:');
    expect(decodeGroups(encodeGroups(groups))).toEqual(groups);
    expect(decodeGroups('*:2:1,x:1:1,*:-1:,DE-NW:1.5:,*:0:3')).toEqual([
      { group: '*', min: 0, max: 3 },
    ]);
  });
});

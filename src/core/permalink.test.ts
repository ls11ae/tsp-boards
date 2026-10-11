import { describe, expect, it } from 'vitest';
import { decodePermalink, encodePermalink } from './permalink';
import { DEFAULT_PARAMS } from './params';

describe('permalinks', () => {
  it('round-trip parameters, marks, selection and data version', () => {
    const params = {
      ...DEFAULT_PARAMS,
      region: 'DE-NW',
      n: 30,
      seed: 42,
      weightDifficulty: 0.8,
      labelSizeMm: 10,
      labelLanguage: 'en' as const,
    };
    const hash = encodePermalink(
      params,
      { country: 'DE', version: 3 },
      [2935517, 2950159],
      {
        pinned: [2935517],
        excluded: [2867714],
      },
      '0.0.0+abc1234',
    );
    const link = decodePermalink(hash);
    expect(link).not.toBeNull();
    expect(link!.params).toEqual(params);
    expect(link!.selected).toEqual([2935517, 2950159]);
    expect(link!.pinned).toEqual([2935517]);
    expect(link!.excluded).toEqual([2867714]);
    expect(link!.data).toEqual({ country: 'DE', version: 3 });
    expect(hash).toContain('app=');
  });

  it('falls back to defaults for missing or invalid values', () => {
    const link = decodePermalink('#v=1&n=-5&r=../x&b=axbxc&sel=');
    expect(link!.params).toEqual(DEFAULT_PARAMS);
    expect(link!.selected).toBeNull();
    expect(decodePermalink('#v=99&n=40')).toBeNull();
    expect(decodePermalink('')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { decodePermalink, encodePermalink, encodePlayLink } from './permalink';
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
      'Ruhr & Rhein',
    );
    const link = decodePermalink(hash);
    expect(link).not.toBeNull();
    expect(link!.params).toEqual(params);
    expect(link!.selected).toEqual([2935517, 2950159]);
    expect(link!.pinned).toEqual([2935517]);
    expect(link!.excluded).toEqual([2867714]);
    expect(link!.data).toEqual({ country: 'DE', version: 3 });
    expect(hash).toContain('app=');
    expect(link!.title).toBe('Ruhr & Rhein');
  });

  it('writes play links without search settings', () => {
    const params = { ...DEFAULT_PARAMS, seed: 99, labelSizeMm: 9 };
    const hash = encodePlayLink(params, { country: 'DE', version: 1 }, [2935517, 2950159]);
    const link = decodePermalink(hash)!;
    expect(link.mode).toBe('play');
    expect(link.selected).toEqual([2935517, 2950159]);
    expect(link.params.labelSizeMm).toBe(9);
    expect(link.params.n).toBe(2);
    expect(hash).not.toContain('s=99');
    expect(decodePermalink('#v=1&m=play')!.mode).toBe('design');
  });

  it('carry place lists with custom places and the selection', () => {
    const places = [
      { id: 2935517, name: 'Dortmund', lat: 51.5, lon: 7.46 },
      { name: 'Campus Nord', lat: 51.49, lon: 7.41, label: 'TU' },
      { id: 2928810, name: 'Essen', lat: 51.45, lon: 7.01 },
    ];
    const hash = encodePermalink(
      DEFAULT_PARAMS,
      { country: 'DE', version: 1 },
      null,
      undefined,
      '',
      'Liste',
      { mode: 'pool', places, selected: [0, 2] },
    );
    const link = decodePermalink(hash)!;
    expect(link.selected).toBeNull();
    expect(link.list).toEqual({
      mode: 'pool',
      places: [
        { id: 2935517 },
        { name: 'Campus Nord', lat: 51.49, lon: 7.41, label: 'TU' },
        { id: 2928810 },
      ],
      selected: [0, 2],
      highlight: [],
    });
    const play = decodePermalink(
      encodePlayLink(DEFAULT_PARAMS, { country: 'DE', version: 1 }, [], '', '', {
        mode: 'fixed',
        places,
        selected: null,
      }),
    )!;
    expect(play.mode).toBe('play');
    expect(play.params.n).toBe(3);
    expect(play.list!.mode).toBe('fixed');
  });

  it('writes the thesis weights C and D only when they are used', () => {
    const data = { country: 'DE', version: 3 };
    const plain = encodePermalink(DEFAULT_PARAMS, data, [1], { pinned: [], excluded: [] });
    expect(plain).toContain('w=1%2C0.5%2C0.5&');
    const params = { ...DEFAULT_PARAMS, weightInterior: 0.4, weightNonNearest: 0.2 };
    const hash = encodePermalink(params, data, [1], { pinned: [], excluded: [] });
    expect(decodePermalink(hash)!.params).toEqual(params);
  });

  it('carry an open path and the flat world board (roadmap 9.15)', () => {
    const params = { ...DEFAULT_PARAMS, flatMap: true };
    const path = { start: 5368361, end: 2147714 };
    const hash = encodePermalink(
      params,
      { country: 'WO', version: 4 },
      [5368361, 2147714, 2643743],
      undefined,
      '',
      '',
      null,
      path,
    );
    expect(hash).toContain('fm=1');
    const link = decodePermalink(hash)!;
    expect(link.path).toEqual(path);
    expect(link.params.flatMap).toBe(true);
    const play = encodePlayLink(params, { country: 'WO', version: 4 }, [1, 2, 3], '', '', null, {
      start: 0,
      end: 2,
    });
    expect(decodePermalink(play)!.path).toEqual({ start: 0, end: 2 });
    expect(decodePermalink('#v=1')!.path).toBeNull();
    expect(decodePermalink('#v=1&pa=3.3')!.path).toBeNull();
  });

  it('carry the blank board option', () => {
    const params = { ...DEFAULT_PARAMS, blankBoard: true };
    const hash = encodePermalink(params, { country: 'DE', version: 3 }, null);
    expect(hash).toContain('bl=1');
    expect(decodePermalink(hash)!.params.blankBoard).toBe(true);
    expect(decodePermalink('#v=1')!.params.blankBoard).toBe(false);
  });

  it('carry group constraints per state', () => {
    const groups = [{ group: '*', min: 1, max: 1 }];
    const hash = encodePermalink(DEFAULT_PARAMS, { country: 'DE', version: 3 }, null, {
      pinned: [],
      excluded: [],
      groups,
    });
    expect(decodePermalink(hash)!.groups).toEqual(groups);
    expect(decodePermalink('#v=1')!.groups).toEqual([]);
  });

  it('falls back to defaults for missing or invalid values', () => {
    const link = decodePermalink('#v=1&n=-5&r=../x&b=axbxc&sel=');
    expect(link!.params).toEqual(DEFAULT_PARAMS);
    expect(link!.selected).toBeNull();
    expect(decodePermalink('#v=99&n=40')).toBeNull();
    expect(decodePermalink('')).toBeNull();
  });
});

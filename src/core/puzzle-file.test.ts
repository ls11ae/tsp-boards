import { describe, expect, it } from 'vitest';
import { DEFAULT_INCREMENTAL_UI } from './incremental/params';
import { DEFAULT_PARAMS } from './params';
import {
  collectionEntry,
  newPuzzleId,
  parsePuzzleDoc,
  puzzleFileName,
  serializePuzzleDoc,
  type PuzzleDoc,
} from './puzzle-file';
import { Rng } from './rng';

const mapDoc: PuzzleDoc = {
  schema: 1,
  id: 'abc123',
  kind: 'map',
  title: 'Ruhrgebiet & Umgebung',
  description: 'Ein Test',
  purpose: 'board',
  language: 'de',
  data: { country: 'DE', version: 1 },
  app: '0.0.0+abc',
  updated: '2026-10-12T10:00:00.000Z',
  map: {
    params: { ...DEFAULT_PARAMS, region: 'DE-NW', n: 3 },
    places: [
      { id: 2935517, name: 'Dortmund', lat: 51.5149, lon: 7.466 },
      { id: 2928810, name: 'Essen', lat: 51.4566, lon: 7.0123 },
      { name: 'TU Dortmund', lat: 51.4924, lon: 7.4127, label: 'TU' },
    ],
    constraints: { pinned: [2935517], excluded: [], groups: [{ group: '*', min: 1, max: 2 }] },
    results: { tour: [0, 2, 1], lengthMm: 123.4, gapMm: 5.6, model: 'string' },
  },
};

describe('puzzle files', () => {
  it('round-trip a map puzzle', () => {
    const back = parsePuzzleDoc(JSON.parse(serializePuzzleDoc(mapDoc)));
    expect(back).toEqual({
      ...mapDoc,
      map: {
        ...mapDoc.map!,
        results: { ...mapDoc.map!.results!, scaleGapMm: null, startPlace: null },
      },
    });
  });

  it('round-trip an incremental puzzle', () => {
    const doc: PuzzleDoc = {
      ...mapDoc,
      kind: 'incremental',
      map: undefined,
      incremental: {
        params: { ...DEFAULT_INCREMENTAL_UI, n: 4 },
        points: [
          [50, 60],
          [100, 200],
          [300, 100],
          [250, 300],
        ],
      },
    };
    const json = JSON.parse(serializePuzzleDoc(doc)) as unknown;
    const back = parsePuzzleDoc(json);
    expect(back.incremental).toEqual(doc.incremental);
    expect(back.map).toBeUndefined();
  });

  it('rejects other files and cleans bad values', () => {
    expect(() => parsePuzzleDoc([])).toThrow();
    expect(() => parsePuzzleDoc({ schema: 2, kind: 'map' })).toThrow(/schema/);
    expect(() => parsePuzzleDoc({ schema: 1, kind: 'x' })).toThrow(/kind/);
    const messy = parsePuzzleDoc({
      schema: 1,
      kind: 'map',
      id: '../../etc',
      purpose: 'other',
      map: {
        params: {
          n: 'many',
          region: 'DE-BY',
          boardWidthMm: 500,
          blankBoard: true,
          labelSizeMm: false,
        },
        places: [
          { name: 'Nowhere', lat: 123, lon: 0 },
          { name: '', lat: 1, lon: 1 },
          { name: 'Ok', lat: 50, lon: 8 },
        ],
        constraints: { pinned: [1.5, 7], groups: [{ group: 'DE-BY', min: 1 }] },
      },
    });
    expect(messy.id).toBe('etc');
    expect(messy.purpose).toBe('board');
    expect(messy.map!.params.n).toBe(DEFAULT_PARAMS.n);
    expect(messy.map!.params.region).toBe('DE-BY');
    expect(messy.map!.params.boardWidthMm).toBe(500);
    expect(messy.map!.params.blankBoard).toBe(true);
    expect(messy.map!.params.labelSizeMm).toBe(DEFAULT_PARAMS.labelSizeMm);
    expect(messy.map!.places).toEqual([{ name: 'Ok', lat: 50, lon: 8 }]);
    expect(messy.map!.constraints).toEqual({
      pinned: [7],
      excluded: [],
      groups: [{ group: 'DE-BY', min: 1, max: null }],
    });
  });

  it('name files and collection entries', () => {
    expect(puzzleFileName(mapDoc)).toBe('ruhrgebiet-umgebung.tsp.json');
    expect(puzzleFileName({ ...mapDoc, title: 'Größte Städte' })).toBe('grosste-stadte.tsp.json');
    expect(collectionEntry(mapDoc, 'x.tsp.json')).toMatchObject({ n: 3, region: 'DE-NW' });
    expect(newPuzzleId(new Rng(1).float.bind(new Rng(1)))).toMatch(/^[0-9a-z]{12}$/);
  });
});

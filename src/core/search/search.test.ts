import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { distance } from '../geometry';
import { randomPoints } from '../test-utils';
import type { MipBackend } from '../tsp/exact';
import { ConflictGraph, Selection } from './conflicts';
import {
  DEFAULT_SEARCH,
  Search,
  greedySelection,
  type SearchParams,
  type SearchPool,
} from './search';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

function pool(size: number, seed: number, pinned: number[] = []): SearchPool {
  const points = randomPoints(size, seed);
  return {
    points,
    population: points.map((_, i) => 1000 + ((i * 7919) % 100_000)),
    pinned,
  };
}

const params: SearchParams = {
  ...DEFAULT_SEARCH,
  n: 15,
  minDistanceMm: 40,
  targetGapMm: 2,
  iterations: 60,
  kicks: 5,
  seed: 7,
};

describe('conflicts', () => {
  it('tracks minimum-distance conflicts of the selection', () => {
    const graph = new ConflictGraph(
      [
        [0, 0],
        [10, 0],
        [100, 0],
      ],
      20,
    );
    expect(Array.from(graph.near[0]!)).toEqual([1]);
    const sel = new Selection(graph, 3);
    sel.add(0);
    expect(sel.eligible(1)).toBe(false);
    expect(sel.eligible(2)).toBe(true);
    sel.remove(0);
    expect(sel.eligible(1)).toBe(true);
  });
});

describe('Search', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const search = new Search(pool(120, 1), params, backend);
      search.step(params.iterations);
      return {
        current: search.current.key,
        best: search.best?.key ?? null,
        archive: search.archive.map((e) => e.key),
        trace: search.trace.map((t) => t.score),
      };
    };
    expect(run()).toEqual(run());
  }, 120_000);

  it('respects size, minimum distance and pinned cities', () => {
    const p = pool(120, 2, [5, 17]);
    const search = new Search(p, params, backend);
    search.step(params.iterations);
    for (const e of [search.current, ...search.archive]) {
      expect(e.members).toHaveLength(params.n);
      expect(e.members).toContain(5);
      expect(e.members).toContain(17);
      expect(new Set(e.tour).size).toBe(params.n);
      for (const a of e.members) {
        for (const b of e.members) {
          if (a < b) expect(distance(p.points[a]!, p.points[b]!)).toBeGreaterThanOrEqual(40);
        }
      }
    }
  }, 120_000);

  it('archives only feasible, refined candidates', () => {
    const search = new Search(pool(150, 3), { ...params, iterations: 80 }, backend);
    search.step(80);
    expect(search.archive.length).toBeGreaterThan(0);
    for (const e of search.archive) {
      expect(e.feasible).toBe(true);
      expect(e.level).toBe(2);
      expect(e.gapUm).toBeGreaterThanOrEqual(params.targetGapMm * 1000);
      expect(e.gapUm).toBeLessThanOrEqual(e.gapEstUm);
    }
  }, 120_000);

  it('reports when the region cannot hold n cities', () => {
    expect(() => new Search(pool(10, 4), { ...params, n: 15 })).toThrow(/only/);
  });

  it('never selects excluded cities', () => {
    const base = pool(120, 5);
    const excluded = [...base.points.keys()].filter((i) => i % 3 === 0);
    const search = new Search({ ...base, excluded }, params, backend);
    search.step(params.iterations);
    for (const e of [search.current, ...search.archive]) {
      for (const c of e.members) expect(c % 3).not.toBe(0);
    }
  }, 120_000);
});

describe('greedySelection', () => {
  it('places pinned cities first and reports pinned conflicts', () => {
    const p: SearchPool = {
      points: [
        [0, 0],
        [10, 0],
        [100, 0],
        [200, 0],
      ],
      population: [10, 20, 30, 40],
      pinned: [0, 1],
    };
    const result = greedySelection(p, 3, 50);
    expect(result.conflictingPins).toEqual([[0, 1]]);
    expect(result.selection).toEqual([0, 3, 2]);
    expect(greedySelection({ ...p, pinned: [] }, 4, 50).selection).toHaveLength(3);
  });
});

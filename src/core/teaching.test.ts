import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Instance } from './instance';
import {
  greedyEdgeFrames,
  insertionFrames,
  nearestNeighborFrames,
  subtourFrames,
  subtourRounds,
  twoOptFrames,
} from './teaching';
import { randomPoints } from './test-utils';
import { greedyEdge, hullInsertion, nearestNeighbor } from './tsp/construct';
import { optimalAndSecond, type MipBackend } from './tsp/exact';
import { edgeKey, euclideanLength } from './tsp/tour';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

const inst = new Instance(randomPoints(14, 21), 1.5);
const keys = (edges: readonly (readonly [number, number])[]) =>
  edges.map(([a, b]) => edgeKey(a, b, inst.n)).sort((x, y) => x - y);
const tourKeys = (tour: readonly number[]) =>
  keys(tour.map((v, i) => [v, tour[(i + 1) % tour.length]!] as const));

describe('teaching frames', () => {
  it('end in the tours of the strategies', () => {
    const nn = nearestNeighborFrames(inst, 3);
    expect(nn).toHaveLength(inst.n + 1);
    expect(keys(nn.at(-1)!.edges)).toEqual(tourKeys(nearestNeighbor(inst, 3)));
    expect(keys(insertionFrames(inst).at(-1)!.edges)).toEqual(tourKeys(hullInsertion(inst)));
    expect(keys(greedyEdgeFrames(inst).at(-1)!.edges)).toEqual(tourKeys(greedyEdge(inst)));
  });

  it('2-opt only shortens the round trip', () => {
    const frames = twoOptFrames(inst, nearestNeighbor(inst, 0));
    expect(frames[0]!.note.kind).toBe('two-opt-start');
    expect(frames.at(-1)!.note.kind).toBe('two-opt-done');
    for (let i = 1; i < frames.length; i++)
      expect(frames[i]!.lengthUm).toBeLessThanOrEqual(frames[i - 1]!.lengthUm + 1e-6);
  });

  it('shows the exact rounds until one round trip, the Euclidean optimum', () => {
    const rounds = subtourRounds(backend, inst);
    const frames = subtourFrames(inst, rounds);
    expect(frames.at(-1)!.note).toEqual({ kind: 'optimal', rounds: rounds.length });
    const exact = optimalAndSecond(backend, inst.euclidean(), 'euclidean').optimal;
    expect(frames.at(-1)!.lengthUm).toBeCloseTo(euclideanLength(inst, exact.tour!), 0);
    for (const f of frames.slice(0, -1)) expect(f.note.kind).toBe('round');
  });
});

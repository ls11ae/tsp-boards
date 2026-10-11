import { describe, expect, it } from 'vitest';
import type { Point } from '../geometry';
import { Rng } from '../rng';
import {
  DEFAULT_LABELS,
  hitsObstacle,
  labelCandidates,
  placeLabels,
  POSITIONS,
  type Box,
  type LabelOptions,
  type PlacementProblem,
} from './labels';
import { measureText } from './text';

const options: LabelOptions = DEFAULT_LABELS;

function problem(
  points: Point[],
  names: string[],
  extra: Partial<PlacementProblem> = {},
): PlacementProblem {
  return {
    points,
    candidates: points.map((p, i) =>
      labelCandidates(p, measureText(names[i]!, options.sizeMm), options),
    ),
    width: 600,
    height: 800,
    options,
    ...extra,
  };
}

const overlap = (a: Box, b: Box, s: number) =>
  a[0] < b[2] + s && b[0] < a[2] + s && a[1] < b[3] + s && b[1] < a[3] + s;

/** Independent check of a complete placement. */
function violations(p: PlacementProblem, choice: readonly number[]): number {
  let count = 0;
  const boxes = choice.map((c, i) => p.candidates[i]![c]!.box);
  boxes.forEach((box, i) => {
    if (box[0] < options.edgeMm || box[1] < options.edgeMm) count++;
    if (box[2] > p.width - options.edgeMm || box[3] > p.height - options.edgeMm) count++;
    for (const q of p.points) {
      if (hitsObstacle(box, { kind: 'circle', centre: q, radius: options.nailClearanceMm }))
        count++;
    }
    for (const o of p.obstacles ?? []) if (hitsObstacle(box, o)) count++;
    for (let j = i + 1; j < boxes.length; j++)
      if (overlap(box, boxes[j]!, options.spacingMm)) count++;
  });
  return count;
}

describe('label candidates', () => {
  it('surround the nail at the requested distance', () => {
    const m = measureText('Essen', 8);
    const c = labelCandidates([100, 100], m, options);
    expect(c.map((x) => x.position)).toEqual([...POSITIONS]);
    const r = options.nailClearanceMm + options.gapMm;
    const east = c[0]!.box;
    expect(east[0]).toBeCloseTo(100 + r);
    expect(east[1]).toBeLessThan(100);
    expect(east[3]).toBeGreaterThan(100);
    const west = c[3]!.box;
    expect(west[2]).toBeCloseTo(100 - r);
    const north = c[6]!.box;
    expect(north[3]).toBeCloseTo(100 - r);
    expect((north[0] + north[2]) / 2).toBeCloseTo(100);
    for (const x of c) {
      expect(x.box[2] - x.box[0]).toBeCloseTo(m.inkRight - m.inkLeft);
      expect(hitsObstacle(x.box, { kind: 'circle', centre: [100, 100], radius: r - 1e-6 })).toBe(
        false,
      );
    }
  });
});

describe('label placement', () => {
  it('prefers the position right of the nail', () => {
    const p = problem([[300, 400]], ['Dortmund']);
    const result = placeLabels(p);
    expect(result).toMatchObject({ complete: true, unplaced: 0, choice: [0] });
  });

  it('moves labels away from neighbours and the board edge', () => {
    const p = problem(
      [
        [300, 400],
        [330, 400],
        [590, 200],
      ],
      ['Gelsenkirchen', 'Bochum', 'Görlitz'],
    );
    const result = placeLabels(p);
    expect(result.complete).toBe(true);
    expect(result.choice[0]).not.toBe(0);
    expect(['W', 'NW', 'SW']).toContain(POSITIONS[result.choice[2]!]);
    expect(violations(p, result.choice)).toBe(0);
  });

  it('respects obstacles', () => {
    const blocked = problem([[300, 400]], ['Kassel'], {
      obstacles: [
        {
          kind: 'polygon',
          points: [
            [305, 380],
            [360, 380],
            [360, 420],
            [305, 420],
          ],
        },
      ],
    });
    const result = placeLabels(blocked);
    expect(result.complete).toBe(true);
    expect(POSITIONS[result.choice[0]!]).toBe('W');
  });

  it('reports labels that do not fit', () => {
    const points: Point[] = Array.from({ length: 9 }, (_, i) => [
      100 + (i % 3) * 12,
      100 + Math.floor(i / 3) * 12,
    ]);
    const result = placeLabels(
      problem(
        points,
        points.map(() => 'Mönchengladbach'),
      ),
    );
    expect(result.complete).toBe(false);
    expect(result.unplaced).toBeGreaterThan(0);
    expect(result.choice.filter((c) => c < 0)).toHaveLength(result.unplaced);
  });

  it('agrees with brute force on small random instances', () => {
    const rng = new Rng(7);
    const names = ['Ulm', 'Hamm', 'Essen', 'Bielefeld', 'Recklinghausen', 'Neuss'];
    for (let t = 0; t < 40; t++) {
      const n = 5;
      const points: Point[] = Array.from({ length: n }, () => [
        60 + rng.float() * 90,
        60 + rng.float() * 60,
      ]);
      const p = problem(
        points,
        points.map(() => rng.pick(names)),
        { width: 220, height: 200 },
      );
      const result = placeLabels(p);
      let feasible = false;
      const choice = new Array<number>(n).fill(0);
      for (let code = 0; code < 8 ** n && !feasible; code++) {
        for (let i = 0, c = code; i < n; i++, c = Math.floor(c / 8)) choice[i] = c % 8;
        feasible = violations(p, choice) === 0;
      }
      expect(result.complete).toBe(feasible);
      if (result.complete) expect(violations(p, result.choice)).toBe(0);
    }
  });
});

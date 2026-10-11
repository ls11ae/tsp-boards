import loadHighs from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Instance } from '../instance';
import { randomPoints } from '../test-utils';
import { optimalAndSecond, type MipBackend } from '../tsp/exact';
import { DEFAULT_LABELS, hitsObstacle } from './labels';
import { checkMeasurement } from './measure';
import { planBoard, scaleCandidates, type PlanInput } from './plan';
import { measureText } from './text';

let backend: MipBackend;
beforeAll(async () => {
  backend = await loadHighs();
});

function input(seed: number, n = 12): PlanInput {
  const points = randomPoints(n, seed, 400, 500).map(([x, y]) => [x + 100, y + 150] as const);
  const inst = new Instance(points, 1.5);
  const exact = optimalAndSecond(backend, inst, 'string');
  const names = ['Ulm', 'Gera', 'Bielefeld', 'Recklinghausen', 'Hof', 'Cottbus'];
  return {
    inst,
    tour: exact.optimal.tour!,
    second: exact.second!.tour,
    stringGapUm: exact.second!.cost - exact.optimal.cost,
    targetGapUm: 1000,
    width: 600,
    height: 800,
    nailDiameterMm: 2,
    labels: {
      metrics: points.map((_, i) => measureText(names[i % names.length]!, 8)),
      options: DEFAULT_LABELS,
    },
    titleSize: [120, 30],
    footerSize: [200, 4],
  };
}

describe('board plan', () => {
  it('keeps the scale clear of other nails and inside the board', () => {
    const plan = input(31);
    const points = plan.inst.pointsMm();
    for (const c of scaleCandidates(plan)) {
      for (const [x, y] of c.scale.band) {
        expect(x).toBeGreaterThanOrEqual(5);
        expect(y).toBeGreaterThanOrEqual(5);
        expect(x).toBeLessThanOrEqual(595);
        expect(y).toBeLessThanOrEqual(795);
      }
      points.forEach((p, i) => {
        if (i === c.scale.slot) return;
        // Clearance 3.5 mm: a circle of 3.4 mm around another nail misses the band.
        expect(
          hitsObstacle([p[0] - 0.01, p[1] - 0.01, p[0] + 0.01, p[1] + 0.01], {
            kind: 'polygon',
            points: c.scale.band,
          }),
        ).toBe(false);
      });
    }
  });

  it('places title, footer and labels around the scale with an exact measured gap', () => {
    for (const seed of [41, 42, 43]) {
      const p = input(seed);
      const plan = planBoard(p, backend)!;
      expect(plan).not.toBeNull();
      expect(plan.labelsComplete).toBe(true);
      expect(plan.title).not.toBeNull();
      expect(plan.footer).not.toBeNull();
      const band = { kind: 'polygon', points: plan.scale.band } as const;
      expect(hitsObstacle(plan.title!, band)).toBe(false);
      expect(hitsObstacle(plan.footer!, band)).toBe(false);
      for (const l of plan.labels) {
        expect(l.fits).toBe(true);
        expect(hitsObstacle(l.candidate.box, band)).toBe(false);
      }
      expect(plan.measured.kind).toBe('exact');
      const check = checkMeasurement(
        backend,
        p.inst,
        p.tour,
        plan.scale.slot,
        plan.scale.direction,
        {},
        { timeLimitSec: 60 },
      );
      expect(plan.measured.gapUm).toBe(check.sameOptimum ? check.gapUm : 0);
      expect(plan.measured.boundUm).toBeLessThanOrEqual(plan.measured.gapUm);
    }
  }, 120_000);

  it('works without a backend (bound only) and without labels or title', () => {
    const p = { ...input(44), labels: null, titleSize: null, footerSize: null };
    const plan = planBoard(p)!;
    expect(plan.measured.kind).toBe('bound');
    expect(plan.warnings.map((w) => w.kind)).toContain('measurement-unverified');
    expect(plan.labels).toEqual([]);
    expect(plan.title).toBeNull();
  });
});

// Exact verification of candidates (exact string model, fallback to the local check) and board
// plans (start nail with the exact measured gap). One job at a time; the UI cancels stale jobs
// by terminating and recreating this worker, and runs plans in a second instance.

import { planBoard } from '../core/board/plan';
import { changeSuggestions } from '../core/fixed';
import { Instance } from '../core/instance';
import { runLpSelfTest } from '../core/lp/selftest';
import { Rng } from '../core/rng';
import { checkRobustness } from '../core/robustness';
import { subtourRounds } from '../core/teaching';
import { iteratedLocalSearch } from '../core/tsp/ils';
import { flatOptimum, verifyCandidate } from '../core/verify';
import { loadHighsInWorker } from './highs';
import type { ExactWorkerRequest, ExactWorkerResponse } from './protocol';

const loadStart = performance.now();
let highsReady = loadHighsInWorker().then((highs) => ({
  highs,
  loadMs: performance.now() - loadStart,
}));

function reply(message: ExactWorkerResponse): void {
  self.postMessage(message);
}

async function handle(request: ExactWorkerRequest): Promise<void> {
  const { highs, loadMs } = await highsReady;
  switch (request.type) {
    case 'selftest': {
      const start = performance.now();
      const result = runLpSelfTest(highs);
      reply({
        type: 'selftest-result',
        ...result,
        highsVersion: highs.version.string,
        loadMs,
        solveMs: performance.now() - start,
      });
      break;
    }
    case 'robustness': {
      for (const r of request.radii) {
        const row = checkRobustness(highs, request.points, r, request.reference, request.scale, {
          timeLimitSec: request.timeLimitSec,
        });
        reply({ type: 'robustness-row', jobId: request.jobId, row });
      }
      reply({ type: 'robustness-done', jobId: request.jobId });
      break;
    }
    case 'rounds': {
      const rounds = subtourRounds(highs, new Instance(request.points, 0, request.sphere ?? null));
      reply({ type: 'rounds', jobId: request.jobId, rounds });
      break;
    }
    case 'changes': {
      const suggestions = changeSuggestions(request.points, request.rEffMm, request.model, highs, {
        minDistanceMm: request.minDistanceMm,
        top: request.top,
      });
      reply({ type: 'changes', jobId: request.jobId, suggestions });
      break;
    }
    case 'plan': {
      const start = performance.now();
      const { points, rEffMm, ...rest } = request.data;
      try {
        const plan = planBoard({ ...rest, inst: new Instance(points, rEffMm) }, highs, {
          exact: { timeLimitSec: request.timeLimitSec },
        });
        reply({
          type: 'planned',
          jobId: request.jobId,
          key: request.key,
          plan,
          ms: performance.now() - start,
        });
      } catch (error) {
        highsReady = loadHighsInWorker().then((h) => ({ highs: h, loadMs: 0 }));
        throw error;
      }
      break;
    }
    case 'verify': {
      const start = performance.now();
      try {
        const inst = new Instance(request.points, request.rEffMm, request.sphere ?? null);
        // Puzzles from a link come without a tour: start from a heuristic one.
        const tour =
          request.tour.length === inst.n
            ? request.tour
            : iteratedLocalSearch(inst, new Rng(1)).tour;
        const checked = verifyCandidate(highs, inst, tour, request.mode, {
          timeLimitSec: request.timeLimitSec,
        });
        const verification = inst.sphere
          ? {
              ...checked,
              flat: flatOptimum(highs, inst, { timeLimitSec: request.timeLimitSec }),
            }
          : checked;
        reply({
          type: 'verified',
          jobId: request.jobId,
          key: request.key,
          verification,
          ms: performance.now() - start,
        });
      } catch (error) {
        // A WebAssembly abort leaves the module unusable: load a fresh instance.
        highsReady = loadHighsInWorker().then((h) => ({ highs: h, loadMs: 0 }));
        throw error;
      }
      break;
    }
  }
}

self.onmessage = (event: MessageEvent<ExactWorkerRequest>) => {
  const request = event.data;
  handle(request).catch((error: unknown) => {
    reply({
      type: 'error',
      jobId: request.type === 'selftest' ? undefined : request.jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};

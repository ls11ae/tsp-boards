// Exact verification of candidates (exact string model, fallback to the local check).
// One job at a time; the UI cancels stale jobs by terminating and recreating this worker.

import { Instance } from '../core/instance';
import { runLpSelfTest } from '../core/lp/selftest';
import { verifyCandidate } from '../core/verify';
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
    case 'verify': {
      const start = performance.now();
      try {
        const inst = new Instance(request.points, request.rEffMm);
        const verification = verifyCandidate(highs, inst, request.tour, 'string-exact', {
          timeLimitSec: request.timeLimitSec,
        });
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
      jobId: request.type === 'verify' ? request.jobId : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};

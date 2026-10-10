import { runLpSelfTest } from '../core/lp/selftest';
import { loadHighsInWorker } from './highs';
import type { ExactWorkerRequest, ExactWorkerResponse } from './protocol';

const loadStart = performance.now();
const highsReady = loadHighsInWorker().then((highs) => ({
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
  }
}

self.onmessage = (event: MessageEvent<ExactWorkerRequest>) => {
  handle(event.data).catch((error: unknown) => {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  });
};

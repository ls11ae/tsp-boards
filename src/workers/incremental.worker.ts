// Generates incremental puzzles and checks given point sequences (exact solves with HiGHS).

import { checkSequence, generateIncremental } from '../core/incremental/generate';
import { loadHighsInWorker } from './highs';
import type { IncrementalRequest, IncrementalResponse } from './protocol';

let highsReady = loadHighsInWorker();

function reply(message: IncrementalResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<IncrementalRequest>) => {
  const request = event.data;
  highsReady
    .then((highs) => {
      const start = performance.now();
      try {
        if (request.type === 'generate') {
          const result = generateIncremental(request.params, highs);
          reply({ type: 'generated', id: request.id, ...result, ms: performance.now() - start });
        } else {
          const result = checkSequence(request.params, request.points, highs);
          reply({ type: 'checked', id: request.id, result, ms: performance.now() - start });
        }
      } catch (error) {
        // A WebAssembly abort leaves the module unusable: load a fresh instance.
        highsReady = loadHighsInWorker();
        throw error;
      }
    })
    .catch((error: unknown) => {
      reply({
        type: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
};

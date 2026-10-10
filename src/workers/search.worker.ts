// Runs the puzzle search in time slices and reports progress at most every 100 ms.
// The search itself is deterministic; only the reporting cadence depends on the clock.

import { Search } from '../core/search/search';
import type { TracePoint } from '../core/search/search';
import { loadHighsInWorker } from './highs';
import type { SearchRequest, SearchResponse } from './protocol';

const SLICE_MS = 50;
const REPORT_MS = 100;

const backendReady = loadHighsInWorker();

interface Run {
  readonly runId: number;
  readonly search: Search;
  traceSent: number;
  lastReport: number;
}

let run: Run | null = null;

function post(message: SearchResponse): void {
  self.postMessage(message);
}

function report(r: Run, type: 'progress' | 'done'): void {
  const { search } = r;
  const trace: TracePoint[] = search.trace.slice(r.traceSent);
  r.traceSent = search.trace.length;
  r.lastReport = performance.now();
  post({
    type,
    runId: r.runId,
    iteration: search.iteration,
    iterations: search.params.iterations,
    temperature: search.temperature,
    stats: { ...search.stats },
    current: search.current,
    best: search.best,
    archive: search.archive,
    trace,
  });
}

function loop(r: Run): void {
  if (run !== r) return;
  try {
    const start = performance.now();
    while (!r.search.done && performance.now() - start < SLICE_MS) r.search.step(1);
    if (r.search.done) {
      report(r, 'done');
      run = null;
      return;
    }
    if (performance.now() - r.lastReport >= REPORT_MS) report(r, 'progress');
    setTimeout(() => loop(r), 0);
  } catch (error) {
    post({
      type: 'error',
      runId: r.runId,
      message: error instanceof Error ? error.message : String(error),
    });
    run = null;
  }
}

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const message = event.data;
  if (message.type === 'stop') {
    if (run?.runId === message.runId) run = null;
    return;
  }
  run = null;
  backendReady
    .then((backend) => {
      const r: Run = {
        runId: message.runId,
        search: new Search(message.pool, message.params, backend),
        traceSent: 0,
        lastReport: 0,
      };
      run = r;
      report(r, 'progress');
      loop(r);
    })
    .catch((error: unknown) => {
      post({
        type: 'error',
        runId: message.runId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
};

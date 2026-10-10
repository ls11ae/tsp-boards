import { useEffect, useState } from 'react';
import type { ExactWorkerRequest, ExactWorkerResponse } from '../workers/protocol';

type SolverStatus =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly version: string; readonly loadMs: number }
  | { readonly kind: 'failed'; readonly message: string };

function useSolverSelfTest(): SolverStatus {
  const [status, setStatus] = useState<SolverStatus>({ kind: 'loading' });
  useEffect(() => {
    const worker = new Worker(new URL('../workers/exact.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<ExactWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'error') {
        setStatus({ kind: 'failed', message: message.message });
      } else if (message.ok) {
        setStatus({ kind: 'ready', version: message.highsVersion, loadMs: message.loadMs });
      } else {
        setStatus({
          kind: 'failed',
          message: `self-test returned ${message.status} with objective ${message.objective}`,
        });
      }
    };
    worker.onerror = (event) => setStatus({ kind: 'failed', message: event.message });
    worker.postMessage({ type: 'selftest' } satisfies ExactWorkerRequest);
    return () => worker.terminate();
  }, []);
  return status;
}

export function App() {
  const solver = useSolverSelfTest();
  return (
    <main>
      <h1>TSP Boards</h1>
      <p>
        Exact solver (HiGHS, WebAssembly): {solver.kind === 'loading' && <span>loading…</span>}
        {solver.kind === 'ready' && (
          <span className="ok">
            ready (HiGHS {solver.version}, loaded in {Math.round(solver.loadMs)} ms)
          </span>
        )}
        {solver.kind === 'failed' && <span className="error">failed: {solver.message}</span>}
      </p>
    </main>
  );
}

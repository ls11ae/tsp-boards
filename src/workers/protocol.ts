// Messages between the UI thread and the exact-solver worker.

export type ExactWorkerRequest = { readonly type: 'selftest' };

export type ExactWorkerResponse =
  | {
      readonly type: 'selftest-result';
      readonly ok: boolean;
      readonly status: string;
      readonly objective: number;
      readonly highsVersion: string;
      readonly loadMs: number;
      readonly solveMs: number;
    }
  | { readonly type: 'error'; readonly message: string };

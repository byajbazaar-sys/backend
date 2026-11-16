export const KAGGLE_WORKER_POOL = 'KAGGLE_WORKER_POOL';

/** One Kaggle account that can run render notebooks. */
export interface KaggleWorker {
  /** Kaggle username (used in kernel refs). */
  id: string;
  /** Parallel notebooks this account may run. */
  concurrency: number;
}

export interface KagglePushResult {
  ref: string;
  url: string;
  versionNumber?: number;
}

/** State of the latest session of a kernel. */
export type KaggleSessionState = 'queued' | 'running' | 'complete' | 'error' | 'cancelled' | 'unknown';

export interface IKaggleWorkerPool {
  /** Latest session state of `workerId/kernelName` (does not throw: API problems give "unknown"). */
  sessionStatus(workerId: string, kernelName: string): Promise<{ state: KaggleSessionState; failureMessage?: string }>;
  /** Accounts listed in KAGGLE_WORKERS. */
  workers(): KaggleWorker[];
  /**
   * Checks the account's API credentials (no notebook run) and returns its remaining weekly GPU hours.
   * Throws with the reason when the credentials don't work.
   */
  gpuQuota(workerId: string): Promise<{ hoursLeft: number | null }>;
  /** Pushes (and runs) a notebook on the worker account, as a private GPU T4 × 2 kernel named `kernel.name`. */
  pushNotebook(
    workerId: string,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
  ): Promise<KagglePushResult>;
}

import { KagglePushResult, KaggleSessionState, KaggleWorker } from '../domain';
export const KAGGLE_WORKER_POOL = 'KAGGLE_WORKER_POOL';

export interface IKaggleWorkerPool {
  /** Latest session state of `workerId/kernelName` (does not throw: API problems give "unknown"). */
  sessionStatus(workerId: string, kernelName: string): Promise<{ state: KaggleSessionState; failureMessage?: string }>;
  /** Enabled accounts in kaggle_credentials (with a readable key). */
  workers(): Promise<KaggleWorker[]>;
  /** Checks credentials that are not stored yet; returns the remaining weekly GPU hours or throws with the reason. */
  verifyCredentials(username: string, apiKey: string): Promise<{ hoursLeft: number | null }>;
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

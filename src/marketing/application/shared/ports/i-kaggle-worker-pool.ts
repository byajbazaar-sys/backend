import { KaggleCredential, KagglePushResult, KaggleSessionState, KaggleWorker, ModelCacheTarget } from '../domain';
export const KAGGLE_WORKER_POOL = 'KAGGLE_WORKER_POOL';

export interface IKaggleWorkerPool {
  /** Latest session state of `workerId/kernelName` (does not throw: API problems give "unknown"). */
  sessionStatus(workerId: string, kernelName: string): Promise<{ state: KaggleSessionState; failureMessage?: string }>;
  /** Enabled accounts in kaggle_credentials (with a readable key), Kaggle and Colab Enterprise. */
  workers(): Promise<KaggleWorker[]>;
  /**
   * Checks credentials that are not stored yet; returns the remaining weekly GPU hours (Kaggle; null = no limit, as
   * for Colab) or throws with the reason.
   */
  verifyCredentials(
    credential: Pick<KaggleCredential, 'username' | 'apiKey' | 'provider' | 'colab'>,
  ): Promise<{ hoursLeft: number | null }>;
  /**
   * Checks the account's API credentials (no notebook run) and returns its remaining weekly GPU hours.
   * Throws with the reason when the credentials don't work.
   */
  gpuQuota(workerId: string): Promise<{ hoursLeft: number | null }>;
  /**
   * Pushes (and runs) a notebook on the worker account, as a private GPU T4 × 2 kernel named `kernel.name`.
   * `datasets` ("user/slug") are mounted under /kaggle/input; a push Kaggle refuses because of them is retried without.
   */
  pushNotebook(
    workerId: string,
    kernel: { name: string; title: string },
    notebook: Record<string, unknown>,
    options?: { datasets?: string[] },
  ): Promise<KagglePushResult>;
  /** Where the setup notebook publishes the account's model cache (Kaggle dataset credentials / Colab gs:// prefix). */
  modelCacheTarget(workerId: string): Promise<ModelCacheTarget>;
}

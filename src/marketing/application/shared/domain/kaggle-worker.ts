/** One Kaggle account that can run render notebooks. */
export interface KaggleWorker {
  /** Kaggle username (used in kernel refs). */
  id: string;
  /** Parallel notebooks this account may run. */
  concurrency: number;
}

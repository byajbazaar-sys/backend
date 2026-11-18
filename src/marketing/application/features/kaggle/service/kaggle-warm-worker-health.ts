/** The warm worker session(s) of one account, for the admin screen. */
export interface KaggleWarmWorkerHealth {
  /** Live sessions on the account (each holds one slot). */
  sessions: number;
  /** The most recent one: starting, idle (waiting for work) or busy. */
  state: 'starting' | 'idle' | 'busy';
  /** Minutes idle (idle sessions). */
  idleMinutes: number | null;
  jobsRun: number;
  /** Mounted the private model dataset instead of downloading. */
  modelsCached: boolean | null;
  /** Kaggle session hours left at its last poll. */
  hoursLeft: number | null;
  pipeline: string | null;
  kernelRef: string | null;
  startedAt: Date | null;
}

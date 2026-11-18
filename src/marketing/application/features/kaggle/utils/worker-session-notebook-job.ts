/** What a warm worker session notebook receives. */
export interface WorkerSessionNotebookJob {
  /** The WORKER render job id (the session's identity). */
  jobId: string;
  token: string;
  apiBaseUrl: string;
  /** Seconds the session may run (Kaggle limit minus a margin). */
  sessionSeconds: number;
}

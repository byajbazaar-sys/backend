/** What a warm worker session notebook receives. */
export interface WorkerSessionNotebookJob {
  /** The WORKER render job id (the session's identity). */
  jobId: string;
  token: string;
  apiBaseUrl: string;
  /** WebSocket API: the idle session waits on it for `marketingWake` (falls back to plain polling). */
  wsUrl?: string;
  /** Seconds the session may run (Kaggle limit minus a margin). */
  sessionSeconds: number;
  /** Where it runs: Kaggle (models mounted from the account's dataset) or Colab Enterprise. */
  provider?: 'kaggle' | 'colab';
  /** Colab: the account's model cache (gs:// prefix), copied to the local disk at boot. */
  modelsGcs?: string;
  /** ByajBazaar AI's voice lane: the gateway URL and token (utils/assistant-voice.ts). Absent = no lane. */
  aiVoice?: { url: string; token: string };
}

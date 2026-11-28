/** State of a warm Kaggle worker session (payload of a WORKER render job). */
export interface WorkerSessionPayload {
  /** idle = polling for work; busy = running currentJobId. */
  state: 'starting' | 'idle' | 'busy';
  currentJobId?: string | null;
  /** When it last became idle (ISO), for the idle timeout. */
  idleSince?: string | null;
  /** Session seconds left, as reported by the notebook at its last poll. */
  remainingSeconds?: number | null;
  /** Pipeline currently loaded on the GPUs (image or video). */
  pipeline?: 'image' | 'video' | 'video-fast' | null;
  jobsRun?: number;
  /** The private model dataset was mounted (no downloads). */
  modelsCached?: boolean;
  /**
   * Job the session finished without an error, checked after a short grace: its final event may still be on its way
   * (WebSocket), so a job that is still busy then is treated as crashed.
   */
  settle?: { jobId: string; at: string } | null;
  /** WebSocket the idle session listens on: new work is pushed there instead of waiting for its next poll. */
  connectionId?: string | null;
  /** Until when (ISO) it is speaking for ByajBazaar AI: voice jobs only, and it is not stopped for being idle. */
  aiVoiceHotUntil?: string | null;
  /** When the notebook first reached the API (ISO). Until then Kaggle has not run it (queued) or it has no internet. */
  reportedAt?: string | null;
  /**
   * Started for ByajBazaar AI's Hindi voice: when the assistant first asked for a worker (ISO) and which try this is.
   * A try that does not boot (Kaggle queued it, the notebook failed) is replaced on another account.
   */
  forAssistant?: { since: string; attempt: number } | null;
}

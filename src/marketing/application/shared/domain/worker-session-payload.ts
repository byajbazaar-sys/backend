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
  pipeline?: 'image' | 'video' | null;
  jobsRun?: number;
  /** The private model dataset was mounted (no downloads). */
  modelsCached?: boolean;
  /**
   * Job the session finished without an error, checked after a short grace: its final event may still be on its way
   * (WebSocket), so a job that is still busy then is treated as crashed.
   */
  settle?: { jobId: string; at: string } | null;
}

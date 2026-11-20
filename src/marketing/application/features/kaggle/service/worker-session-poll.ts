/** A warm worker session asking for work (also its heartbeat). */
export interface WorkerSessionPoll {
  sessionId: string;
  token: string;
  /** Kaggle session seconds it has left. */
  remainingSeconds: number;
  /** Pipeline currently loaded on its GPUs. */
  pipeline?: 'image' | 'video' | 'video-fast' | null;
  /** The job it just ran, and the error it raised if it crashed. */
  finishedJobId?: string | null;
  jobError?: string | null;
}

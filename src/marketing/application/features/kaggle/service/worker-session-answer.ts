/** What a polling warm worker session is told: run this job, poll again later, or stop. */
export interface WorkerSessionAnswer {
  stop?: boolean;
  reason?: string;
  pollSeconds?: number;
  /** The backend knows the session's WebSocket (it pushes `marketingWake` when work arrives); false: register again. */
  listening?: boolean;
  job?: {
    id: string;
    kind: string;
    /** cpu = no GPU model needed (the CPU-animated logo clip); the worker keeps its loaded models. */
    pipeline: 'image' | 'video' | 'video-fast' | 'cpu' | 'voice';
    /** The job notebook's code cells, run in order inside the session. */
    cells: string[];
  };
}

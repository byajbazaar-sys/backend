/** What a polling warm worker session is told: run this job, poll again later, or stop. */
export interface WorkerSessionAnswer {
  stop?: boolean;
  reason?: string;
  pollSeconds?: number;
  job?: {
    id: string;
    kind: string;
    /** cpu = merge-only (ffmpeg); the worker keeps its loaded models. */
    pipeline: 'image' | 'video' | 'cpu';
    /** The job notebook's code cells, run in order inside the session. */
    cells: string[];
  };
}

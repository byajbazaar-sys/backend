/** What a polling warm worker session is told: run this job, poll again later, or stop. */
export interface WorkerSessionAnswer {
  stop?: boolean;
  reason?: string;
  pollSeconds?: number;
  job?: {
    id: string;
    kind: string;
    pipeline: 'image' | 'video';
    /** The job notebook's code cells, run in order inside the session. */
    cells: string[];
  };
}

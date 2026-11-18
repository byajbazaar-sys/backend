export interface KaggleNotebookHealth {
  jobId: string | null;
  status: string;
  kernelRef: string | null;
  progress: number | null;
  stageMessage: string | null;
  failureMessage: string | null;
  target: string | null;
  attempts: number | null;
  startedAt: Date | null;
  updatedAt: Date | null;
}

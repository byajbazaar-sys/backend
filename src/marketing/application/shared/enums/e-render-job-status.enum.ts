export enum ERenderJobStatus {
  Waiting = 'WAITING',
  Starting = 'STARTING',
  Running = 'RUNNING',
  Done = 'DONE',
  Failed = 'FAILED',
}

export const BUSY_RENDER_STATUSES = [ERenderJobStatus.Starting, ERenderJobStatus.Running];

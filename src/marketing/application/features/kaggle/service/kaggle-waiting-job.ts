export interface KaggleWaitingJob {
  id: string;
  kind: string;
  notebook: string;
  target: string;
  campaignId: string | null;
  attempts: number;
  waitingMinutes: number;
  stageMessage: string | null;
}

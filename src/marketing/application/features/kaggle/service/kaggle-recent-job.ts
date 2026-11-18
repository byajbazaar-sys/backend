import { KaggleWorkNotebook } from '../utils';

export interface KaggleRecentJob {
  id: string;
  kind: string;
  notebook: KaggleWorkNotebook;
  target: string;
  status: string;
  account: string | null;
  attempts: number;
  durationMinutes: number | null;
  error: string | null;
  finishedAt: Date | null;
}

import { EKaggleAccountStatus } from '../enums';

export interface KaggleAccount {
  username: string;
  status: EKaggleAccountStatus;
  concurrency: number;
  lastError?: string | null;
  setupAttemptAt?: Date | null;
  readyAt?: Date | null;
  gpuInfo?: string | null;
  /** Weekly GPU hours left at the last quota check (cached; refreshed every few minutes while in use). */
  gpuHoursLeft?: number | null;
  quotaCheckedAt?: Date | null;
  /** Not given new jobs until then (it failed to start a notebook). */
  cooldownUntil?: Date | null;
  /** When it was last given a job (equally free accounts take turns). */
  lastAssignedAt?: Date | null;
  /** "user/slug" of the private Kaggle dataset holding every model, once the setup notebook built it. */
  modelsDataset?: string | null;
  /** Last time a model cache build was started for this account. */
  modelsAttemptAt?: Date | null;
  jobsCompleted?: number;
  jobsFailed?: number;
  updatedAt?: Date;
}

import { ERenderJobKind, ERenderJobStatus } from '../enums';
import { RenderJobPayload } from './render-job-payload';

/** Unit of work for one Kaggle notebook session. */
export interface RenderJob {
  id: string;
  kind: ERenderJobKind;
  userId?: string | null;
  campaignId?: string | null;
  /** Fixed account for SETUP jobs; the claiming account for others. */
  workerId?: string | null;
  slot?: number | null;
  status: ERenderJobStatus;
  payload: RenderJobPayload;
  progress: number;
  stageMessage?: string | null;
  kernelRef?: string | null;
  /** Automatic restarts so far (Kaggle session expired / crashed / hung). */
  attempts: number;
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

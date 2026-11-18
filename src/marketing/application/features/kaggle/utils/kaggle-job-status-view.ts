import { KaggleNotebook } from './kaggle-notebook';

/** What the owner (and admins) see about one Kaggle notebook run. Account names and kernel refs stay admin-only. */
export interface KaggleJobStatusView {
  id: string;
  notebook: KaggleNotebook;
  /** WAITING (for a free GPU) / STARTING / RUNNING / DONE / FAILED. */
  status: string;
  progress: number;
  stageMessage: string | null;
  error: string | null;
  /** Automatic continuations so far (expired / crashed Kaggle sessions). */
  attempts: number;
  queuedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date | null;
}

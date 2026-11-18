import { KaggleNotebookHealth } from './kaggle-notebook-health';
import { KaggleWarmWorkerHealth } from './kaggle-warm-worker-health';

export interface KaggleAccountNotebookHealth {
  account: string;
  accountStatus: string;
  video: KaggleNotebookHealth;
  image: KaggleNotebookHealth;
  /** Warm worker session on the account, if any. */
  worker: KaggleWarmWorkerHealth | null;
}

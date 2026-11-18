import { NotebookClip } from './notebook-clip';
import { NotebookMerge } from './notebook-merge';
import { NotebookModelCache } from './notebook-model-cache';

export interface WorkerNotebookJob {
  jobId: string;
  token: string;
  wsUrl: string;
  apiBaseUrl?: string;
  kind: 'setup' | 'render';
  preset?: 'reel_fast' | 'reel_hq';
  clips?: NotebookClip[];
  merge?: NotebookMerge | null;
  /** Seconds this session may run before handing over to a new session (Kaggle limit minus a margin). */
  sessionBudgetSeconds?: number;
  /** Setup: build the private model dataset with the account's own credentials. */
  modelCache?: NotebookModelCache;
  /** Setup: Hugging Face token for the gated FLUX.2 [klein] 9B (checks and model cache). */
  hfToken?: string;
}

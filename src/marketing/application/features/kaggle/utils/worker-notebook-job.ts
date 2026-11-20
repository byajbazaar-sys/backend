import { NotebookClip } from './notebook-clip';
import { NotebookModelCache } from './notebook-model-cache';

export interface WorkerNotebookJob {
  jobId: string;
  token: string;
  wsUrl: string;
  apiBaseUrl?: string;
  kind: 'setup' | 'render';
  /** Setup: where the account runs (the checks and the model cache differ). */
  provider?: 'kaggle' | 'colab';
  preset?: 'reel_fast' | 'reel_hq';
  clips?: NotebookClip[];
  /** Seconds this session may run before handing over to a new session (Kaggle limit minus a margin). */
  sessionBudgetSeconds?: number;
  /** Setup: build the model cache (Kaggle: private dataset with the account's own credentials; Colab: its bucket). */
  modelCache?: NotebookModelCache;
  /** Setup: Hugging Face token for the gated FLUX.2 [klein] 9B (checks and model cache). */
  hfToken?: string;
}

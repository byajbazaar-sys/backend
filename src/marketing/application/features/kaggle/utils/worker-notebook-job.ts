import { NotebookClip } from './notebook-clip';
import { NotebookMerge } from './notebook-merge';

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
}

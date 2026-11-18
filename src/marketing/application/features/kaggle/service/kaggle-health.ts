import { KaggleAccountNotebookHealth } from './kaggle-account-notebook-health';
import { KaggleHealthIssue } from './kaggle-health-issue';
import { KaggleHealthStatus } from './kaggle-health-status';
import { KagglePipelineHealth } from './kaggle-pipeline-health';
import { KaggleRecentJob } from './kaggle-recent-job';
import { KaggleWaitingJob } from './kaggle-waiting-job';

export interface KaggleHealth {
  status: KaggleHealthStatus;
  checkedAt: Date;
  autoRecover: boolean;
  /** Accounts that can take a render right now. */
  usableAccounts: number;
  waiting: number;
  oldestWaitingMinutes: number | null;
  notebooks: KaggleAccountNotebookHealth[];
  issues: KaggleHealthIssue[];
  waitingJobs: KaggleWaitingJob[];
  pipelines: KagglePipelineHealth[];
  recentJobs: KaggleRecentJob[];
}

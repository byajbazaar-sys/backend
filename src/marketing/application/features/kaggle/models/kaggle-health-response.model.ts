import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { KaggleAccountNotebookHealthModel } from './kaggle-account-notebook-health.model';
import { KaggleHealthIssueModel } from './kaggle-health-issue.model';
import { KagglePipelineModel } from './kaggle-pipeline.model';
import { KaggleRecentJobModel } from './kaggle-recent-job.model';
import { KaggleWaitingJobModel } from './kaggle-waiting-job.model';

/** Is rendering working, and if not, why. */
export class KaggleHealthResponseModel {
  @ApiProperty({ enum: ['healthy', 'degraded', 'down'] }) @Expose() status: 'healthy' | 'degraded' | 'down';
  @ApiProperty() @Expose() checkedAt: Date;
  @ApiProperty() @Expose() autoRecover: boolean;
  @ApiProperty({ description: 'Accounts that can take a render right now' }) @Expose() usableAccounts: number;
  @ApiProperty() @Expose() waiting: number;
  @ApiPropertyOptional() @Expose() oldestWaitingMinutes: number | null;
  @ApiProperty({ type: [KaggleAccountNotebookHealthModel] })
  @Expose()
  @Type(() => KaggleAccountNotebookHealthModel)
  notebooks: KaggleAccountNotebookHealthModel[];
  @ApiProperty({ type: [KaggleHealthIssueModel] })
  @Expose()
  @Type(() => KaggleHealthIssueModel)
  issues: KaggleHealthIssueModel[];
  @ApiProperty({ type: [KaggleWaitingJobModel] })
  @Expose()
  @Type(() => KaggleWaitingJobModel)
  waitingJobs: KaggleWaitingJobModel[];
  @ApiProperty({ type: [KagglePipelineModel], description: 'Image notebook and video notebook status' })
  @Expose()
  @Type(() => KagglePipelineModel)
  pipelines: KagglePipelineModel[];
  @ApiProperty({ type: [KaggleRecentJobModel] })
  @Expose()
  @Type(() => KaggleRecentJobModel)
  recentJobs: KaggleRecentJobModel[];
}

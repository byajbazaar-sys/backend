import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { KaggleRecoveryJobModel } from './kaggle-recovery-job.model';

export class KaggleRecoveryResponseModel {
  @ApiProperty({ type: [String] }) @Expose() setupsRestarted: string[];
  @ApiProperty({ type: [String] }) @Expose() cooldownsCleared: string[];
  @ApiProperty({ type: [KaggleRecoveryJobModel] })
  @Expose()
  @Type(() => KaggleRecoveryJobModel)
  jobsRestarted: KaggleRecoveryJobModel[];
}

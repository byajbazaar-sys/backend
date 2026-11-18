import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { KaggleRunningJobModel } from './kaggle-running-job.model';

/** Queue + capacity at a glance for the admin screen. */
export class KaggleOverviewResponseModel {
  @ApiProperty() @Expose() accounts: number;
  @ApiProperty({ description: 'Ready and not cooling down' }) @Expose() ready: number;
  @ApiProperty() @Expose() settingUp: number;
  @ApiProperty({ description: 'Parallel notebooks the ready accounts can run' }) @Expose() slots: number;
  @ApiProperty() @Expose() busy: number;
  @ApiProperty({ description: 'Render jobs waiting for a free GPU' }) @Expose() waiting: number;
  @ApiProperty({ type: [KaggleRunningJobModel] })
  @Expose()
  @Type(() => KaggleRunningJobModel)
  running: KaggleRunningJobModel[];
}

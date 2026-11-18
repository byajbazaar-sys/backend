import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { KaggleNotebookHealthModel } from './kaggle-notebook-health.model';
import { KaggleWarmWorkerHealthModel } from './kaggle-warm-worker-health.model';

export class KaggleAccountNotebookHealthModel {
  @ApiProperty() @Expose() account: string;
  @ApiProperty() @Expose() accountStatus: string;
  @ApiProperty({ type: KaggleNotebookHealthModel })
  @Expose()
  @Type(() => KaggleNotebookHealthModel)
  video: KaggleNotebookHealthModel;
  @ApiProperty({ type: KaggleNotebookHealthModel })
  @Expose()
  @Type(() => KaggleNotebookHealthModel)
  image: KaggleNotebookHealthModel;
  @ApiPropertyOptional({ type: KaggleWarmWorkerHealthModel, nullable: true })
  @Expose()
  @Type(() => KaggleWarmWorkerHealthModel)
  worker: KaggleWarmWorkerHealthModel | null;
}

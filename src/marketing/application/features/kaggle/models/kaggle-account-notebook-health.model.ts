import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { KaggleNotebookHealthModel } from './kaggle-notebook-health.model';

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
}

import { ApiProperty } from '@nestjs/swagger';
import { Paged } from '@shared-libs';
import { Expose, Type } from 'class-transformer';

import { DueResponseModel } from './dues-response.model';

export class DuesPagedResponseModel extends Paged<DueResponseModel> {
  @Expose()
  @Type(() => DueResponseModel)
  @ApiProperty({ type: [DueResponseModel], description: 'List of dues' })
  items: DueResponseModel[];
}

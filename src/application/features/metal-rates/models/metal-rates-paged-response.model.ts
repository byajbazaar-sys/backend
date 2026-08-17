import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { MetalRateEntryResponseModel } from './metal-rate-entry-response.model';

export class MetalRatesPagedResponseModel {
  @ApiProperty({ type: [MetalRateEntryResponseModel] })
  @Expose()
  @Type(() => MetalRateEntryResponseModel)
  items: MetalRateEntryResponseModel[];

  @ApiProperty()
  @Expose()
  totalCount: number;

  @ApiProperty()
  @Expose()
  page: number;

  @ApiProperty()
  @Expose()
  pageSize: number;
}

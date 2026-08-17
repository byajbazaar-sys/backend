import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { JewelleryEventResponseModel } from './jewellery-event-response.model';

export class JewelleryEventsPagedResponseModel {
  @Expose()
  @ApiProperty({ type: [JewelleryEventResponseModel] })
  @Type(() => JewelleryEventResponseModel)
  items!: JewelleryEventResponseModel[];

  @Expose()
  @ApiProperty()
  page!: number;

  @Expose()
  @ApiProperty()
  perPage!: number;

  @Expose()
  @ApiProperty()
  totalCount!: number;
}

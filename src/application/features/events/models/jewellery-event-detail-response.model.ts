import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

import { JewelleryEventResponseModel } from './jewellery-event-response.model';

export class JewelleryEventDetailResponseModel extends JewelleryEventResponseModel {
  @Expose()
  @ApiPropertyOptional({ type: [JewelleryEventResponseModel] })
  @Type(() => JewelleryEventResponseModel)
  relatedEvents?: JewelleryEventResponseModel[];
}

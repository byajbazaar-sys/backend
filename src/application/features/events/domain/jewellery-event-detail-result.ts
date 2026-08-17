import { Expose, Type } from 'class-transformer';

import { JewelleryEvent } from './jewellery-event';

export class JewelleryEventDetailResult {
  @Expose()
  @Type(() => JewelleryEvent)
  event: JewelleryEvent;

  @Expose()
  @Type(() => JewelleryEvent)
  related: JewelleryEvent[];
}

import { Expose, Type } from 'class-transformer';

import { PaymentEvent } from './payment-event';

export class PaymentEventInsertResult {
  @Expose()
  @Type(() => PaymentEvent)
  event: PaymentEvent;

  @Expose()
  created: boolean;
}

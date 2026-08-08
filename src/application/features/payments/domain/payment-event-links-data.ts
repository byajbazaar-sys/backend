import { Expose } from 'class-transformer';

export class PaymentEventLinksData {
  @Expose()
  userId?: string;

  @Expose()
  paymentId?: string;

  @Expose()
  paymentOrderId?: string;
}

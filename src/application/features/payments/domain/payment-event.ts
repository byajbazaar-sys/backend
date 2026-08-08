import { Expose, Type } from 'class-transformer';

export class PaymentEvent {
  @Expose()
  id?: string;

  @Expose()
  provider: string;

  @Expose()
  eventId: string;

  @Expose()
  eventName: string;

  @Expose()
  processed: boolean;

  @Expose()
  signature?: string;

  @Expose()
  payload: Record<string, unknown>;

  @Expose()
  userId?: string;

  @Expose()
  paymentId?: string;

  @Expose()
  paymentOrderId?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

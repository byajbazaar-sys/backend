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
  signature?: string | null;

  @Expose()
  payload: Record<string, unknown>;

  @Expose()
  userId?: string | null;

  @Expose()
  paymentId?: string | null;

  @Expose()
  paymentOrderId?: string | null;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

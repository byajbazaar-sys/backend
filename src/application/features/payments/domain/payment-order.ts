import { Expose, Type } from 'class-transformer';

export class PaymentOrder {
  @Expose()
  id?: string;

  @Expose()
  userId: string;

  @Expose()
  subscriptionId?: string;

  @Expose()
  providerOrderId?: string;

  @Expose()
  receipt?: string;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  status: string;

  @Expose()
  notes?: Record<string, unknown>;

  @Expose()
  rawJson: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

import { Expose, Type } from 'class-transformer';

export class PaymentOrder {
  @Expose()
  id?: string;

  @Expose()
  userId: string;

  @Expose()
  subscriptionId?: string | null;

  @Expose()
  providerOrderId?: string | null;

  @Expose()
  receipt?: string | null;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  status: string;

  @Expose()
  notes?: Record<string, unknown> | null;

  @Expose()
  rawJson: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

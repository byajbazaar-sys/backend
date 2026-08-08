import { Expose, Type } from 'class-transformer';

export class Refund {
  @Expose()
  id?: string;

  @Expose()
  paymentId: string;

  @Expose()
  providerRefundId: string;

  @Expose()
  amount: number;

  @Expose()
  status: string;

  @Expose()
  reason?: string;

  @Expose()
  rawJson: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

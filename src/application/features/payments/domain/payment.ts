import { Expose, Type } from 'class-transformer';

export class Payment {
  @Expose()
  id?: string;

  @Expose()
  userId: string;

  @Expose()
  subscriptionId?: string;

  @Expose()
  providerPaymentId: string;

  @Expose()
  providerOrderId?: string;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  status: string;

  @Expose()
  method?: string;

  @Expose()
  bank?: string;

  @Expose()
  wallet?: string;

  @Expose()
  upi?: string;

  @Expose()
  fee?: number;

  @Expose()
  tax?: number;

  @Expose()
  @Type(() => Date)
  capturedAt?: Date;

  @Expose()
  invoiceId?: string;

  @Expose()
  rawJson: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

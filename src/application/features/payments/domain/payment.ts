import { Expose, Type } from 'class-transformer';

export class Payment {
  @Expose()
  id?: string;

  @Expose()
  userId: string;

  @Expose()
  subscriptionId?: string | null;

  @Expose()
  providerPaymentId: string;

  @Expose()
  providerOrderId?: string | null;

  @Expose()
  amount: number;

  @Expose()
  currency: string;

  @Expose()
  status: string;

  @Expose()
  method?: string | null;

  @Expose()
  bank?: string | null;

  @Expose()
  wallet?: string | null;

  @Expose()
  upi?: string | null;

  @Expose()
  fee?: number | null;

  @Expose()
  tax?: number | null;

  @Expose()
  @Type(() => Date)
  capturedAt?: Date | null;

  @Expose()
  invoiceId?: string | null;

  @Expose()
  rawJson: Record<string, unknown>;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;
}

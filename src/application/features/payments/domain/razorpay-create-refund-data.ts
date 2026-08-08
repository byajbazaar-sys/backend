import { Expose, Type } from 'class-transformer';

export class RazorpayCreateRefundData {
  @Expose()
  providerPaymentId: string;

  @Expose()
  @Type(() => Number)
  amountPaise?: number;

  @Expose()
  notes?: Record<string, string>;
}

import { Expose, Type } from 'class-transformer';

export class RefundDepositData {
  @Expose()
  @Type(() => Number)
  amount: number;

  @Expose()
  paymentMode: string;

  @Expose()
  transactionReference?: string;

  @Expose()
  remarks?: string;
}

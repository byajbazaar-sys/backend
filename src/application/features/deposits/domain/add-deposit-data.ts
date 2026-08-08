import { Expose, Type } from 'class-transformer';

export class AddDepositData {
  @Expose()
  @Type(() => Number)
  amount: number;

  @Expose()
  paymentMode: string;

  @Expose()
  transactionReference?: string;

  @Expose()
  depositDate?: string;

  @Expose()
  remarks?: string;
}

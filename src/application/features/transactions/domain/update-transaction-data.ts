import { Expose, Type } from 'class-transformer';

import { ETransactionPaidIn } from '../enums';

export class UpdateTransactionData {
  @Expose()
  paidIn?: ETransactionPaidIn;

  @Expose()
  @Type(() => Number)
  amount?: number;

  @Expose()
  paidAt?: string;

  @Expose()
  @Type(() => Number)
  expectedLoanVersion?: number;
}

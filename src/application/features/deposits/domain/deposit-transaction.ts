import { Expose, Type } from 'class-transformer';

import { EDepositTransactionType } from '../enums';

export class DepositTransaction {
  @Expose()
  id?: string;

  @Expose()
  depositAccountId?: string;

  @Expose()
  customerId?: string;

  @Expose()
  createdBy?: string;

  @Expose()
  type?: EDepositTransactionType;

  @Expose()
  @Type(() => Number)
  amount?: number;

  @Expose()
  @Type(() => Number)
  balanceAfter?: number;

  @Expose()
  paymentMode?: string;

  @Expose()
  transactionReference?: string;

  @Expose()
  salesBillId?: string;

  @Expose()
  @Type(() => Date)
  transactionDate?: Date;

  @Expose()
  notes?: string;

  @Expose()
  @Type(() => Date)
  createdAt?: Date;

  @Expose()
  receiptNumber?: string;

  @Expose()
  staffName?: string;
}

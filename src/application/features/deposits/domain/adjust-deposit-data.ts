import { Expose, Type } from 'class-transformer';

export class AdjustDepositData {
  @Expose()
  @Type(() => Number)
  amount: number;

  @Expose()
  salesBillId?: string;

  @Expose()
  remarks?: string;
}

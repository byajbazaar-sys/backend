import { Expose, Type } from 'class-transformer';

export class LoanBaselineData {
  @Expose()
  @Type(() => Number)
  amountRemaining: number;

  @Expose()
  @Type(() => Number)
  amountPaid: number;

  @Expose()
  @Type(() => Number)
  interestRemaining: number;

  @Expose()
  @Type(() => Number)
  interestPaid: number;

  @Expose()
  @Type(() => Number)
  seq: number;
}

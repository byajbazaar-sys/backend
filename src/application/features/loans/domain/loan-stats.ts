import { Expose, Type } from 'class-transformer';

export class LoanStats {
  @Expose()
  @Type(() => Number)
  public total: number;

  @Expose()
  @Type(() => Number)
  public closed: number;

  @Expose()
  @Type(() => Number)
  public open: number;

  @Expose()
  @Type(() => Number)
  public interestRemaining: number;

  @Expose()
  @Type(() => Number)
  public interestPaid: number;

  @Expose()
  @Type(() => Number)
  public amountRemaining: number;

  @Expose()
  @Type(() => Number)
  public amountPaid: number;

  @Expose()
  @Type(() => Number)
  public customersCount: number;

  @Expose()
  @Type(() => Number)
  public totalItems: number;

  @Expose()
  @Type(() => Number)
  public totalNetWeight: number;

  @Expose()
  @Type(() => Number)
  public totalGrossWeight: number;
}

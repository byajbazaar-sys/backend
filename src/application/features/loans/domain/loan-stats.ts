import { Expose } from 'class-transformer';

export class LoanStats {
  @Expose()
  public total: number;

  @Expose()
  public closed: number;

  @Expose()
  public open: number;

  @Expose()
  public interestRemaining: number;

  @Expose()
  public interestPaid: number;

  @Expose()
  public amountRemaining: number;

  @Expose()
  public amountPaid: number;

  @Expose()
  public customersCount: number;

  @Expose()
  public totalItems: number;

  @Expose()
  public totalNetWeight: number;

  @Expose()
  public totalGrossWeight: number;
}

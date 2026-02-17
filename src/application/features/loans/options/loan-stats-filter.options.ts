import { Expose } from 'class-transformer';

export class LoanStatsFilterOptions {
  @Expose()
  public startDate: Date;

  @Expose()
  public endDate: Date;

  @Expose()
  public itemId?: string;
}

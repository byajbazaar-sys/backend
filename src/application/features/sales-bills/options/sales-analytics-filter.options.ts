import { Expose } from 'class-transformer';

export class SalesAnalyticsFilterOptions {
  @Expose()
  createdBy: string;

  @Expose()
  dateFrom?: Date;

  @Expose()
  dateTo?: Date;
}

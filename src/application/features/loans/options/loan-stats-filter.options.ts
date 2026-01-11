import { Expose } from 'class-transformer';
import { ELoanItemType } from '../enums';

export class LoanStatsFilterOptions {
  @Expose()
  startDate: Date;

  @Expose()
  endDate: Date;

  @Expose()
  itemType: ELoanItemType;
}

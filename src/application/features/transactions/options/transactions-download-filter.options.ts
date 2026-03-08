import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

/** Filter options for transaction list download (no pagination) */
export class TransactionsDownloadFilterOptions {
  @Expose()
  public createdBy: string;

  @Expose()
  public loanId: string;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;

  @Expose()
  public startDate?: Date;

  @Expose()
  public endDate?: Date;
}

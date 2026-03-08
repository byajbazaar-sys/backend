import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';
import { ELoanStatus } from '../enums';

/** Filter options for loan list download (no pagination) */
export class LoansDownloadFilterOptions {
  @Expose()
  public createdBy: string;

  @Expose()
  public customerId: string;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;

  @Expose()
  public status?: ELoanStatus;

  @Expose()
  public startDate?: Date;

  @Expose()
  public endDate?: Date;
}

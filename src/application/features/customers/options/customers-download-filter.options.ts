import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

/** Filter options for customer list download (no pagination) */
export class CustomersDownloadFilterOptions {
  @Expose()
  public createdBy: string;

  @Expose()
  public name: string;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;

  @Expose()
  public startDate?: Date;

  @Expose()
  public endDate?: Date;
}

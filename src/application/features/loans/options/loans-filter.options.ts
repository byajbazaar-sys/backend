import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

export class LoansFilterOptions {
  @Expose()
  public createdBy: string;

  @Expose()
  public customerId: string;

  @Expose()
  public pageNumber: number;

  @Expose()
  public pageSize: number;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;
}


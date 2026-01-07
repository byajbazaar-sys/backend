import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

export class TransactionsFilterOptions {
  @Expose()
  public createdBy: string;

  @Expose()
  public loanId: string;

  @Expose()
  public pageNumber: number;

  @Expose()
  public pageSize: number;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;
}


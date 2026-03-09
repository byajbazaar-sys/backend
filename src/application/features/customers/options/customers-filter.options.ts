import { Expose, Type } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

export class CustomersFilterOptions {
  @Expose()
  public createdBy: string;

  @Expose()
  public name: string;

  @Expose()
  @Type(() => Number)
  public pageNumber: number;

  @Expose()
  @Type(() => Number)
  public pageSize: number;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;
}

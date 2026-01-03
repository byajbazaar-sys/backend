import { Expose, Type } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

export class CustomersFilterOptions {
  
  @Expose()
  public userId: string;

  @Expose()
  public name: string;

  @Expose()
  public pageNumber: number;

  @Expose()
  public pageSize: number;

  @Expose()
  public sortOrder: ESortOrder;

  @Expose()
  public sortField: string;
  
}

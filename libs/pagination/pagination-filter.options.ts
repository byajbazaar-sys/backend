import { Expose } from 'class-transformer';
import { ESortOrder } from '@shared-libs';

export class PaginationFilterOptions {
  @Expose()
  pageNumber?: number;

  @Expose()
  pageSize?: number;

  @Expose()
  sortOrder?: ESortOrder;

  @Expose()
  sortField?: string;
}

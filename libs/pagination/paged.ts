import { Expose, Type } from 'class-transformer';

import { IPageable } from './i-pageable';

export class Paged<T> implements IPageable<T> {
  @Expose()
  items: T[];

  @Expose()
  @Type(() => Number)
  page: number;

  @Expose()
  @Type(() => Number)
  perPage: number;

  @Expose()
  totalPages: number;

  @Expose()
  totalCount: number;

  @Expose()
  hasNextPage: boolean;

  @Expose()
  hasPreviousPage: boolean;
}

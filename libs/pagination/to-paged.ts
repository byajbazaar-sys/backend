import { plainToInstance } from 'class-transformer';

import { IPageable } from './i-pageable';
import { Paged } from './paged';

export function toPaged<T>(
  type: new (...args: any[]) => T,
  data: { items: any[]; page: number; perPage: number; totalCount: number },
): IPageable<T> {
  const totalPages = Math.ceil(data.totalCount / data.perPage);
  const paged = new Paged<T>();
  paged.items = plainToInstance(type, data.items, { excludeExtraneousValues: true });
  paged.page = data.page;
  paged.perPage = data.perPage;
  paged.totalPages = totalPages;
  paged.totalCount = data.totalCount;
  paged.hasNextPage = data.page < totalPages;
  paged.hasPreviousPage = data.page > 1;
  return paged;
}

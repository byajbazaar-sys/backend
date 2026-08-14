import { Expose, Type } from 'class-transformer';

import { EInventoryItemStatus, EInventoryItemSortOrder } from '../enums';

export class InventoryItemsFilterOptions {
  @Expose()
  createdBy: string;

  @Expose()
  search?: string;

  @Expose()
  categoryId?: string;

  @Expose()
  status?: EInventoryItemStatus;

  @Expose()
  metalType?: string;

  @Expose()
  sortOrder?: EInventoryItemSortOrder;

  @Expose()
  @Type(() => Number)
  pageNumber?: number;

  @Expose()
  @Type(() => Number)
  pageSize?: number;
}

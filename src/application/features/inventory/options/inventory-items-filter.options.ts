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
  isCatalogVisible?: boolean;

  @Expose()
  sortOrder?: EInventoryItemSortOrder;

  @Expose()
  sortBy?: 'createdAt' | 'netWeight' | 'sellingPrice' | 'itemName';

  @Expose()
  purity?: string;

  @Expose()
  minWeight?: number;

  @Expose()
  maxWeight?: number;

  @Expose()
  minPrice?: number;

  @Expose()
  maxPrice?: number;

  /** YYYY-MM-DD, India time. */
  @Expose()
  addedFrom?: string;

  @Expose()
  addedTo?: string;

  @Expose()
  hallmarked?: boolean;

  @Expose()
  hasPhoto?: boolean;

  @Expose()
  @Type(() => Number)
  pageNumber?: number;

  @Expose()
  @Type(() => Number)
  pageSize?: number;
}

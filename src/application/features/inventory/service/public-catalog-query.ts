import { InventoryItemsFilterOptions } from '../options';

/** Public catalog list query (filters the shop hides are dropped before this point). */
export interface PublicCatalogQuery
  extends Pick<InventoryItemsFilterOptions, 'search' | 'categoryId' | 'metalType' | 'pageNumber' | 'pageSize'> {
  purity?: string;
  minWeight?: number;
  maxWeight?: number;
  minPrice?: number;
  maxPrice?: number;
  hallmarked?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'weight_asc' | 'weight_desc' | 'name';
}

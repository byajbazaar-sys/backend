import { Paged } from '@shared-libs';

import { InventoryItem, InventoryCategoryBreakdown } from '../domain';
import { InventoryItemUpdatePatch } from '../models';
import { InventoryItemsFilterOptions } from '../options';

export const INVENTORY_ITEMS_REPOSITORY = 'INVENTORY_ITEMS_REPOSITORY';

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

export interface PublicCatalogFacets {
  categories: { id: string; name: string; count: number }[];
  metals: string[];
  purities: string[];
  minWeight?: number;
  maxWeight?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface IInventoryItemsRepository {
  create(data: InventoryItem): Promise<InventoryItem>;
  findById(id: string, createdBy: string): Promise<InventoryItem>;
  findBySku(sku: string, createdBy: string): Promise<InventoryItem>;
  findByBarcode(barcode: string, createdBy: string): Promise<InventoryItem>;
  findByScanCode(code: string, createdBy: string): Promise<InventoryItem>;
  findAll(params: InventoryItemsFilterOptions): Promise<Paged<InventoryItem>>;
  findAllForReport(
    params: Pick<InventoryItemsFilterOptions, 'createdBy' | 'search' | 'categoryId' | 'status' | 'metalType'>,
  ): Promise<InventoryItem[]>;
  getNextSkuSequence(skuPrefix: string, createdBy: string): Promise<number>;
  update(id: string, data: InventoryItemUpdatePatch, createdBy: string): Promise<InventoryItem>;
  delete(id: string, createdBy: string): Promise<void>;
  countByCategory(createdBy: string): Promise<InventoryCategoryBreakdown[]>;
  countLowStock(createdBy: string, threshold: number): Promise<InventoryItem[]>;
  countCatalogVisible(createdBy: string): Promise<number>;
  findPublicCatalog(createdBy: string, params: PublicCatalogQuery): Promise<Paged<InventoryItem>>;
  /** Filter options across everything a shop has published. */
  findPublicCatalogFacets(createdBy: string): Promise<PublicCatalogFacets>;
  bulkUpdateCatalogVisibility(ids: string[], createdBy: string, isCatalogVisible: boolean): Promise<number>;
}

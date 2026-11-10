import { Paged } from '@shared-libs';

import { InventoryItem, InventoryCategoryBreakdown } from '../domain';
import { InventoryItemUpdatePatch } from '../models';
import { InventoryItemsFilterOptions } from '../options';

export const INVENTORY_ITEMS_REPOSITORY = 'INVENTORY_ITEMS_REPOSITORY';

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
  findPublicCatalog(
    createdBy: string,
    params: Pick<InventoryItemsFilterOptions, 'search' | 'categoryId' | 'metalType' | 'pageNumber' | 'pageSize'>,
  ): Promise<Paged<InventoryItem>>;
  bulkUpdateCatalogVisibility(ids: string[], createdBy: string, isCatalogVisible: boolean): Promise<number>;
}

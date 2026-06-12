import { Paged } from '@shared-libs';
import { InventoryItem } from '../domain';
import { InventoryItemsFilterOptions } from '../options';

export const INVENTORY_ITEMS_REPOSITORY = 'INVENTORY_ITEMS_REPOSITORY';

export interface IInventoryItemsRepository {
  create(data: InventoryItem): Promise<InventoryItem>;
  findById(id: string): Promise<InventoryItem | null>;
  findBySku(sku: string): Promise<InventoryItem | null>;
  findByBarcode(barcode: string): Promise<InventoryItem | null>;
  findByScanCode(code: string): Promise<InventoryItem | null>;
  findAll(params: InventoryItemsFilterOptions): Promise<Paged<InventoryItem>>;
  findAllForReport(params: Pick<InventoryItemsFilterOptions, 'createdBy' | 'search' | 'categoryId' | 'status' | 'metalType'>): Promise<InventoryItem[]>;
  getNextSkuSequence(skuPrefix: string, createdBy: string): Promise<number>;
  update(id: string, data: Partial<InventoryItem>): Promise<InventoryItem>;
  delete(id: string): Promise<void>;
  countByCategory(createdBy: string): Promise<{ categoryId: string; categoryName: string; count: number; totalValue: number }[]>;
  countLowStock(createdBy: string, threshold: number): Promise<InventoryItem[]>;
}

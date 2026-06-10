import { InventoryItem } from '../../features/inventory/domain';
import { EInventoryItemStatus } from '../../features/inventory/enums';
import { Paged } from '@shared-libs';

export interface InventoryPaginationParams {
  pageNumber?: number;
  pageSize?: number;
}

export const INVENTORY_ITEMS_REPOSITORY = 'INVENTORY_ITEMS_REPOSITORY';

export interface InventoryItemFilter {
  createdBy: string;
  search?: string;
  categoryId?: string;
  status?: EInventoryItemStatus;
  metalType?: string;
}

export interface IInventoryItemsRepository {
  create(data: InventoryItem): Promise<InventoryItem>;
  findById(id: string): Promise<InventoryItem | null>;
  findBySku(sku: string): Promise<InventoryItem | null>;
  findByBarcode(barcode: string): Promise<InventoryItem | null>;
  findByScanCode(code: string): Promise<InventoryItem | null>;
  findAll(filter: InventoryItemFilter, pagination: InventoryPaginationParams): Promise<Paged<InventoryItem>>;
  findAllForReport(filter: InventoryItemFilter): Promise<InventoryItem[]>;
  getNextSkuSequence(yearSuffix: string): Promise<number>;
  update(id: string, data: Partial<InventoryItem>): Promise<InventoryItem>;
  delete(id: string): Promise<void>;
  countByCategory(createdBy: string): Promise<{ categoryId: string; categoryName: string; count: number; totalValue: number }[]>;
  countLowStock(createdBy: string, threshold: number): Promise<InventoryItem[]>;
}

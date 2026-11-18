import { InventoryItemSale } from '../domain';

export const INVENTORY_ITEM_SALES_REPOSITORY = 'INVENTORY_ITEM_SALES_REPOSITORY';

/** Where an inventory item was sold (implemented over the sales bills). */
export interface IInventoryItemSalesRepository {
  findSalesByInventoryItemId(inventoryItemId: string, createdBy: string): Promise<InventoryItemSale[]>;
}

export interface InventoryDeadStockItem {
  id: string;
  itemName: string;
  sku: string;
  daysInStock: number;
  sellingPrice: number;
  netWeight?: number;
  categoryName?: string;
}

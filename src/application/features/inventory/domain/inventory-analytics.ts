import { InventoryDashboardStats } from './inventory-dashboard-stats';

export interface InventoryMetalBreakdown {
  metalType: string;
  count: number;
  availableCount: number;
  totalValue: number;
  netWeight: number;
}

export interface InventoryStatusBreakdown {
  status: string;
  count: number;
}

export interface InventoryAgingBucket {
  bucket: string;
  label: string;
  count: number;
  value: number;
}

export interface InventoryDeadStockItem {
  id: string;
  itemName: string;
  sku: string;
  daysInStock: number;
  sellingPrice: number;
  netWeight?: number;
  categoryName?: string;
}

export interface InventoryLowStockItem {
  id: string;
  itemName: string;
  sku: string;
  netWeight: number;
  sellingPrice: number;
}

export interface InventoryReorderSuggestion {
  categoryId: string;
  categoryName: string;
  availableCount: number;
  soldCount: number;
  message: string;
}

export interface InventoryAnalytics extends InventoryDashboardStats {
  reservedItems: number;
  damagedItems: number;
  inRepairItems: number;
  availableValuation: number;
  sellThroughRate: number;
  inventoryTurnover: number;
  goldNetWeight: number;
  goldAvailableValue: number;
  totalNetWeight: number;
  metalBreakdown: InventoryMetalBreakdown[];
  statusBreakdown: InventoryStatusBreakdown[];
  agingBuckets: InventoryAgingBucket[];
  deadStock: InventoryDeadStockItem[];
  lowStockItems: InventoryLowStockItem[];
  reorderSuggestions: InventoryReorderSuggestion[];
}

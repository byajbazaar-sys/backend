import { InventoryAgingBucket } from './inventory-aging-bucket';
import { InventoryDashboardStats } from './inventory-dashboard-stats';
import { InventoryDeadStockItem } from './inventory-dead-stock-item';
import { InventoryLowStockItem } from './inventory-low-stock-item';
import { InventoryMetalBreakdown } from './inventory-metal-breakdown';
import { InventoryReorderSuggestion } from './inventory-reorder-suggestion';
import { InventoryStatusBreakdown } from './inventory-status-breakdown';

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

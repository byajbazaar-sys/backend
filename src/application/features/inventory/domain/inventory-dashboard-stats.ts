import { InventoryCategoryBreakdown } from './inventory-category-breakdown';

export interface InventoryDashboardStats {
  totalItems: number;
  availableItems: number;
  soldItems: number;
  totalValuation: number;
  categoryBreakdown: InventoryCategoryBreakdown[];
}

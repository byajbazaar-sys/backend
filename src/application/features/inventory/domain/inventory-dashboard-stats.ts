export interface InventoryCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  count: number;
  totalValue: number;
}

export interface InventoryDashboardStats {
  totalItems: number;
  availableItems: number;
  soldItems: number;
  totalValuation: number;
  categoryBreakdown: InventoryCategoryBreakdown[];
}

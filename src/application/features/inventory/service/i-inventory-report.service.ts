import { InventoryItem } from '../domain';

export const INVENTORY_REPORT_SERVICE = 'INVENTORY_REPORT_SERVICE';

export interface InventoryDashboardStats {
  totalItems: number;
  availableItems: number;
  soldItems: number;
  totalValuation: number;
  categoryBreakdown: { categoryId: string; categoryName: string; count: number; totalValue: number }[];
}

export interface IInventoryReportService {
  getDashboardStats(userId: string): Promise<InventoryDashboardStats>;
  getCurrentInventory(userId: string): Promise<InventoryItem[]>;
  getValuationReport(userId: string): Promise<InventoryItem[]>;
  getCategoryWiseReport(userId: string): Promise<{ categoryId: string; categoryName: string; count: number; totalValue: number }[]>;
  getLowStockReport(userId: string, threshold?: number): Promise<InventoryItem[]>;
  getBarcodeReport(userId: string): Promise<InventoryItem[]>;
}

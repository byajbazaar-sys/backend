import { InventoryAnalytics, InventoryDashboardStats, InventoryCategoryBreakdown } from '../domain';
import { InventoryItem } from '../domain';

export const INVENTORY_REPORT_SERVICE = 'INVENTORY_REPORT_SERVICE';

export interface IInventoryReportService {
  getDashboardStats(userId: string): Promise<InventoryDashboardStats>;
  getAnalytics(userId: string): Promise<InventoryAnalytics>;
  getCurrentInventory(userId: string): Promise<InventoryItem[]>;
  getValuationReport(userId: string): Promise<InventoryItem[]>;
  getCategoryWiseReport(userId: string): Promise<InventoryCategoryBreakdown[]>;
  getLowStockReport(userId: string, threshold?: number): Promise<InventoryItem[]>;
  getBarcodeReport(userId: string): Promise<InventoryItem[]>;
}

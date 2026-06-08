import { Inject, Injectable } from '@nestjs/common';
import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from '../../../shared';
import { InventoryItem } from '../domain';
import { EInventoryItemStatus } from '../enums';
import {
  IInventoryReportService,
  InventoryDashboardStats,
} from './i-inventory-report.service';

@Injectable()
export class InventoryReportService implements IInventoryReportService {
  constructor(
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
  ) {}

  async getDashboardStats(userId: string): Promise<InventoryDashboardStats> {
    const all = await this.itemsRepo.findAllForReport({ createdBy: userId });
    const available = all.filter((i) => i.status === EInventoryItemStatus.Available);
    const sold = all.filter((i) => i.status === EInventoryItemStatus.Sold);
    const categoryBreakdown = await this.itemsRepo.countByCategory(userId);
    const totalValuation = all.reduce((sum, i) => sum + (Number(i.sellingPrice) || 0), 0);

    return {
      totalItems: all.length,
      availableItems: available.length,
      soldItems: sold.length,
      totalValuation,
      categoryBreakdown,
    };
  }

  async getCurrentInventory(userId: string): Promise<InventoryItem[]> {
    return this.itemsRepo.findAllForReport({
      createdBy: userId,
      status: EInventoryItemStatus.Available,
    });
  }

  async getValuationReport(userId: string): Promise<InventoryItem[]> {
    return this.itemsRepo.findAllForReport({ createdBy: userId });
  }

  async getCategoryWiseReport(userId: string) {
    return this.itemsRepo.countByCategory(userId);
  }

  async getLowStockReport(userId: string, threshold = 1): Promise<InventoryItem[]> {
    return this.itemsRepo.countLowStock(userId, threshold);
  }

  async getBarcodeReport(userId: string): Promise<InventoryItem[]> {
    return this.itemsRepo.findAllForReport({ createdBy: userId });
  }
}

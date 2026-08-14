import { Inject, Injectable } from '@nestjs/common';

import { InventoryAnalytics, InventoryDashboardStats, InventoryItem } from '../domain';
import { EInventoryItemStatus, EMetalType } from '../enums';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from './i-inventory-items.repository';
import { IInventoryReportService } from './i-inventory-report.service';

@Injectable()
export class InventoryReportService implements IInventoryReportService {
  constructor(@Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository) {}

  async getDashboardStats(userId: string): Promise<InventoryDashboardStats> {
    const analytics = await this.getAnalytics(userId);
    return {
      totalItems: analytics.totalItems,
      availableItems: analytics.availableItems,
      soldItems: analytics.soldItems,
      totalValuation: analytics.totalValuation,
      categoryBreakdown: analytics.categoryBreakdown,
    };
  }

  async getAnalytics(userId: string): Promise<InventoryAnalytics> {
    const all = await this.itemsRepo.findAllForReport({ createdBy: userId });
    const categoryBreakdown = await this.itemsRepo.countByCategory(userId);
    const lowStockRaw = await this.itemsRepo.countLowStock(userId, 1);
    const now = Date.now();
    const MS_DAY = 86_400_000;

    const countByStatus = (status: EInventoryItemStatus) => all.filter((i) => i.status === status).length;

    const available = all.filter((i) => i.status === EInventoryItemStatus.Available);
    const sold = all.filter((i) => i.status === EInventoryItemStatus.Sold);
    const totalValuation = all.reduce((sum, i) => sum + (Number(i.sellingPrice) || 0), 0);
    const availableValuation = available.reduce((sum, i) => sum + (Number(i.sellingPrice) || 0), 0);
    const totalNetWeight = all.reduce((sum, i) => sum + (Number(i.netWeight) || 0), 0);

    const goldAvailable = available.filter((i) => i.metalType === EMetalType.Gold);
    const goldNetWeight = goldAvailable.reduce((sum, i) => sum + (Number(i.netWeight) || 0), 0);
    const goldAvailableValue = goldAvailable.reduce((sum, i) => sum + (Number(i.sellingPrice) || 0), 0);

    const sellThroughRate = all.length > 0 ? Math.round((sold.length / all.length) * 1000) / 10 : 0;
    const inventoryTurnover = available.length > 0 ? Math.round((sold.length / available.length) * 100) / 100 : 0;

    const metalMap = new Map<
      string,
      { count: number; availableCount: number; totalValue: number; netWeight: number }
    >();
    for (const item of all) {
      const key = item.metalType ?? 'OTHER';
      const row = metalMap.get(key) ?? { count: 0, availableCount: 0, totalValue: 0, netWeight: 0 };
      row.count += 1;
      row.totalValue += Number(item.sellingPrice) || 0;
      row.netWeight += Number(item.netWeight) || 0;
      if (item.status === EInventoryItemStatus.Available) row.availableCount += 1;
      metalMap.set(key, row);
    }
    const metalBreakdown = [...metalMap.entries()]
      .map(([metalType, v]) => ({ metalType, ...v }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const statusBreakdown = Object.values(EInventoryItemStatus)
      .map((status) => ({ status, count: countByStatus(status) }))
      .filter((s) => s.count > 0);

    const agingDefs = [
      { bucket: '0-30', label: '0–30 days', min: 0, max: 30 },
      { bucket: '31-60', label: '31–60 days', min: 31, max: 60 },
      { bucket: '61-90', label: '61–90 days', min: 61, max: 90 },
      { bucket: '90+', label: '90+ days', min: 91, max: Infinity },
    ];
    const agingBuckets = agingDefs.map(({ bucket, label, min, max }) => {
      const items = available.filter((i) => {
        const days = Math.floor((now - new Date(i.createdAt ?? now).getTime()) / MS_DAY);
        return days >= min && days <= max;
      });
      return {
        bucket,
        label,
        count: items.length,
        value: items.reduce((sum, i) => sum + (Number(i.sellingPrice) || 0), 0),
      };
    });

    const deadStock = available
      .map((i) => ({
        id: i.id,
        itemName: i.itemName,
        sku: i.sku ?? '',
        daysInStock: Math.floor((now - new Date(i.createdAt ?? now).getTime()) / MS_DAY),
        sellingPrice: Number(i.sellingPrice) || 0,
        netWeight: i.netWeight != null ? Number(i.netWeight) : undefined,
        categoryName: i.categoryName,
      }))
      .filter((i) => i.daysInStock >= 90)
      .sort((a, b) => b.daysInStock - a.daysInStock)
      .slice(0, 15);

    const lowStockItems = lowStockRaw.slice(0, 15).map((i) => ({
      id: i.id,
      itemName: i.itemName,
      sku: i.sku ?? '',
      netWeight: Number(i.netWeight) || 0,
      sellingPrice: Number(i.sellingPrice) || 0,
    }));

    const soldByCategory = new Map<string, number>();
    for (const item of sold) {
      if (!item.categoryId) continue;
      soldByCategory.set(item.categoryId, (soldByCategory.get(item.categoryId) ?? 0) + 1);
    }
    const availableByCategory = new Map<string, number>();
    for (const item of available) {
      if (!item.categoryId) continue;
      availableByCategory.set(item.categoryId, (availableByCategory.get(item.categoryId) ?? 0) + 1);
    }
    const reorderSuggestions = categoryBreakdown
      .map((cat) => {
        const avail = availableByCategory.get(cat.categoryId) ?? 0;
        const soldCount = soldByCategory.get(cat.categoryId) ?? 0;
        let message = '';
        if (avail === 0 && soldCount > 0) message = 'Out of stock — restock urgently';
        else if (avail <= 2 && soldCount >= 3) message = 'Low stock with strong sales';
        else if (avail <= 1) message = 'Very low availability';
        else return null;
        return {
          categoryId: cat.categoryId,
          categoryName: cat.categoryName,
          availableCount: avail,
          soldCount,
          message,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 8);

    return {
      totalItems: all.length,
      availableItems: available.length,
      soldItems: sold.length,
      reservedItems: countByStatus(EInventoryItemStatus.Reserved),
      damagedItems: countByStatus(EInventoryItemStatus.Damaged),
      inRepairItems: countByStatus(EInventoryItemStatus.InRepair),
      totalValuation,
      availableValuation,
      sellThroughRate,
      inventoryTurnover,
      goldNetWeight: Math.round(goldNetWeight * 1000) / 1000,
      goldAvailableValue,
      totalNetWeight: Math.round(totalNetWeight * 1000) / 1000,
      categoryBreakdown,
      metalBreakdown,
      statusBreakdown,
      agingBuckets,
      deadStock,
      lowStockItems,
      reorderSuggestions,
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

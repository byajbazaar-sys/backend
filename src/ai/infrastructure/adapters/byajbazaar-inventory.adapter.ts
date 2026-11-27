import { HttpException, Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { assertValid, businessCall, num } from './byajbazaar-calls';
import {
  CreateInventoryItemRequestModel,
  IInventoryCategoryService,
  IInventoryItemService,
  IInventoryReportService,
  INVENTORY_CATEGORY_SERVICE,
  INVENTORY_ITEM_SERVICE,
  INVENTORY_REPORT_SERVICE,
  InventoryItem,
  ListInventoryItemsQueryModel,
  UpdateInventoryItemRequestModel,
} from '../../../application';
import {
  AiInventoryItem,
  AiInventorySearch,
  AiInventorySummary,
  AiInventoryWriteInput,
  IAiInventoryGateway,
} from '../../application';

/**
 * The assistant's inventory gateway: ByajBazaar's own inventory services, with the inventory API's own request
 * models and validation rules — so an item created by the assistant is exactly what the inventory screen would save.
 */
@Injectable()
export class ByajBazaarInventoryAdapter implements IAiInventoryGateway {
  constructor(
    @Inject(INVENTORY_ITEM_SERVICE) private readonly items: IInventoryItemService,
    @Inject(INVENTORY_CATEGORY_SERVICE) private readonly categories: IInventoryCategoryService,
    @Inject(INVENTORY_REPORT_SERVICE) private readonly reports: IInventoryReportService,
  ) {}

  async listCategories(shopId: string): Promise<{ id: string; name: string }[]> {
    return (await this.categories.getAll(shopId)).map((c) => ({ id: c.id, name: c.name }));
  }

  async create(shopId: string, input: AiInventoryWriteInput): Promise<AiInventoryItem> {
    const dto = plainToInstance(CreateInventoryItemRequestModel, input);
    await assertValid(dto);
    return toItem(await businessCall(() => this.items.create(dto, shopId)));
  }

  async update(shopId: string, id: string, patch: AiInventoryWriteInput): Promise<AiInventoryItem> {
    const dto = plainToInstance(UpdateInventoryItemRequestModel, patch);
    await assertValid(dto);
    return toItem(await businessCall(() => this.items.update(id, dto, shopId)));
  }

  async get(shopId: string, id: string): Promise<AiInventoryItem | null> {
    try {
      return toItem(await this.items.getById(id, shopId));
    } catch (err) {
      if (err instanceof HttpException && [403, 404].includes(err.getStatus())) return null;
      throw err;
    }
  }

  async search(shopId: string, query: AiInventorySearch): Promise<{ total: number; items: AiInventoryItem[] }> {
    const listQuery = plainToInstance(ListInventoryItemsQueryModel, {
      search: query.search,
      metalType: query.metalType,
      status: query.status,
      purity: query.purity,
      minWeight: query.minWeight,
      maxWeight: query.maxWeight,
      categoryId: query.categoryId,
      pageSize: Math.min(Math.max(query.limit, 1), 50),
    });
    const paged = await this.items.getAll(shopId, listQuery);
    return { total: paged.totalCount ?? paged.items.length, items: paged.items.map(toItem) };
  }

  async summary(shopId: string): Promise<AiInventorySummary> {
    const stats = await this.reports.getDashboardStats(shopId);
    return {
      totalItems: Number(stats.totalItems ?? 0),
      availableItems: Number(stats.availableItems ?? 0),
      soldItems: Number(stats.soldItems ?? 0),
      totalValuation: Number(stats.totalValuation ?? 0),
      categories: (stats.categoryBreakdown ?? []).map((c) => ({
        name: c.categoryName || 'Uncategorised',
        count: Number(c.count ?? 0),
        value: Number(c.totalValue ?? 0),
      })),
    };
  }
}

function toItem(item: InventoryItem): AiInventoryItem {
  return {
    id: item.id,
    sku: item.sku,
    itemName: item.itemName,
    metalType: item.metalType,
    purity: item.purity ?? null,
    grossWeight: num(item.grossWeight),
    netWeight: num(item.netWeight),
    stockQuantity: num(item.stockQuantity),
    sellingPrice: num(item.sellingPrice),
    status: item.status ?? null,
    categoryId: item.categoryId ?? null,
    categoryName: item.categoryName ?? null,
    huid: item.huid ?? null,
    size: item.size ?? null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';
import { Paged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { IUsersFileStorage, USERS_FILE_STORAGE } from '../../../shared';
import {
  IInventoryCategoriesRepository,
  INVENTORY_CATEGORIES_REPOSITORY,
} from './i-inventory-categories.repository';
import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from './i-inventory-items.repository';
import { InventoryItemsFilterOptions } from '../options';
import { InventoryItem, InventoryItemSale } from '../domain';
import { CreateInventoryItemRequestModel, ListInventoryItemsQueryModel, UpdateInventoryItemRequestModel } from '../models';
import { IInventoryItemService } from './i-inventory-item.service';
import { BARCODE_SERVICE, IBarcodeService } from './i-barcode.service';
import { EInventoryItemStatus } from '../enums';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { deriveBusinessSkuPrefix } from '../utils/business-sku-prefix';
import { ISalesBillsRepository, SALES_BILLS_REPOSITORY } from '../../sales-bills/service/i-sales-bills.repository';

@Injectable()
export class InventoryItemService implements IInventoryItemService {
  constructor(
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY) private readonly categoriesRepo: IInventoryCategoriesRepository,
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(SALES_BILLS_REPOSITORY) private readonly salesBillsRepo: ISalesBillsRepository,
    @InjectPinoLogger(InventoryItemService.name) private readonly logger: PinoLogger,
  ) {}

  private isStorageKey(value: string): boolean {
    return !!value && !value.startsWith('http');
  }

  private async resolveImageUrls(keys: string[] | undefined): Promise<string[]> {
    if (!keys?.length) return [];
    return Promise.all(
      keys.map(async (key) => {
        if (!key || !this.isStorageKey(key)) return key;
        const url = await this.fileStorage.getUrlAsync(key);
        return url ?? key;
      }),
    );
  }

  private async enrichItem(item: InventoryItem): Promise<InventoryItem> {
    return {
      ...item,
      imageUrls: await this.resolveImageUrls(item.imageUrls),
    };
  }

  async generateSku(userId: string): Promise<string> {
    const user = await this.usersRepo.findById(userId);
    const businessPrefix = deriveBusinessSkuPrefix(user?.businessName);
    const yearSuffix = String(new Date().getFullYear()).slice(-2);
    const skuPrefix = `${businessPrefix}${yearSuffix}`;
    const seq = await this.itemsRepo.getNextSkuSequence(skuPrefix, userId);
    return `${skuPrefix}${String(seq).padStart(4, '0')}`;
  }

  private isSkuCollision(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const message = String(err.message);
    return (
      message.includes('UQ_inventory_items_sku') || message.includes('UQ_inventory_items_barcode')
    );
  }

  async create(data: CreateInventoryItemRequestModel, userId: string): Promise<InventoryItem> {
    const category = await this.categoriesRepo.findById(data.categoryId);
    if (!category) throw new NotFoundException('Category not found');

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const sku = await this.generateSku(userId);
      const item: InventoryItem = {
        ...data,
        sku,
        barcode: sku,
        status: data.status ?? EInventoryItemStatus.Available,
        stockQuantity: data.stockQuantity ?? 1,
        imageUrls: [],
        createdBy: userId,
      };

      try {
        const created = await this.itemsRepo.create(item);
        if (created.id) {
          const qrValue = this.barcodeService.buildInventoryQrPayload(created.id, created.sku!);
          const withQr = await this.itemsRepo.update(created.id, { qrValue });
          this.logger.info({ itemId: withQr.id, sku }, 'Inventory item created');
          return this.enrichItem(withQr);
        }
        this.logger.info({ itemId: created.id, sku }, 'Inventory item created');
        return this.enrichItem(created);
      } catch (err) {
        if (this.isSkuCollision(err) && attempt < maxAttempts - 1) {
          this.logger.warn({ attempt, sku }, 'SKU collision, retrying with next sequence');
          continue;
        }
        if (this.isSkuCollision(err)) {
          throw new ConflictException('Unable to generate a unique SKU. Please try again.');
        }
        throw err;
      }
    }

    throw new ConflictException('Unable to generate a unique SKU. Please try again.');
  }

  private mapListQuery(userId: string, query: ListInventoryItemsQueryModel): InventoryItemsFilterOptions {
    return {
      createdBy: userId,
      search: query.search,
      categoryId: query.categoryId,
      status: query.status,
      metalType: query.metalType,
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      sortOrder: query.sortOrder,
    };
  }

  async getAll(userId: string, query: ListInventoryItemsQueryModel): Promise<Paged<InventoryItem>> {
    const paged = await this.itemsRepo.findAll(this.mapListQuery(userId, query));
    const items = await Promise.all(paged.items.map((item) => this.enrichItem(item)));
    return { ...paged, items };
  }

  async getById(id: string, userId: string): Promise<InventoryItem> {
    const item = await this.itemsRepo.findById(id);
    if (!item) throw new NotFoundException('Inventory item not found');
    if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
    return this.enrichItem(item);
  }

  async getSalesHistory(id: string, userId: string): Promise<InventoryItemSale[]> {
    await this.getById(id, userId);
    return this.salesBillsRepo.findSalesByInventoryItemId(id, userId);
  }

  async getByBarcode(barcode: string, userId: string): Promise<InventoryItem> {
    const raw = decodeURIComponent(barcode).trim();
    const qrPayload = this.barcodeService.parseInventoryQrPayload(raw);

    if (qrPayload?.inventoryId) {
      const byId = await this.itemsRepo.findById(qrPayload.inventoryId);
      if (byId) {
        if (byId.createdBy !== userId) throw new ForbiddenException('Access denied');
        return this.enrichItem(byId);
      }
    }

    const lookupCode = qrPayload?.sku?.trim() || raw;
    const item = await this.itemsRepo.findByScanCode(lookupCode);
    if (!item) throw new NotFoundException('Inventory item not found for barcode');
    if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
    return this.enrichItem(item);
  }

  async update(
    id: string,
    data: UpdateInventoryItemRequestModel,
    userId: string,
  ): Promise<InventoryItem> {
    await this.getById(id, userId);
    if (data.categoryId) {
      const category = await this.categoriesRepo.findById(data.categoryId);
      if (!category) throw new NotFoundException('Category not found');
    }
    const { imageUrls: _ignored, ...rest } = data;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    ) as Partial<InventoryItem>;
    if (patch.stockQuantity != null && patch.stockQuantity > 0) {
      patch.status = EInventoryItemStatus.Available;
    }
    if (patch.stockQuantity === 0) {
      patch.status = EInventoryItemStatus.Sold;
    }
    const updated = await this.itemsRepo.update(id, patch);
    return this.enrichItem(updated);
  }

  async uploadImage(
    id: string,
    userId: string,
    file?: Express.Multer.File,
    removeImage?: boolean,
  ): Promise<InventoryItem> {
    const existing = await this.itemsRepo.findById(id);
    if (!existing) throw new NotFoundException('Inventory item not found');
    if (existing.createdBy !== userId) throw new ForbiddenException('Access denied');

    const currentKey = existing.imageUrls?.[0];

    if (removeImage) {
      if (currentKey && this.isStorageKey(currentKey)) {
        try {
          await this.fileStorage.removeAsync(currentKey);
        } catch (err) {
          this.logger.warn({ err, key: currentKey }, 'Failed to delete inventory image');
        }
      }
      const updated = await this.itemsRepo.update(id, { imageUrls: [] });
      return this.enrichItem(updated);
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }

    const normalized = await normalizeImageBufferForStorageOrThrow(
      file.buffer,
      file.mimetype,
      file.originalname,
    );
    const storageKey = `inventory/${userId}/${id}/image.${normalized.fileExtension}`;

    if (currentKey && this.isStorageKey(currentKey)) {
      try {
        await this.fileStorage.removeAsync(currentKey);
      } catch (err) {
        this.logger.warn({ err, key: currentKey }, 'Failed to delete old inventory image');
      }
    }

    await this.fileStorage.writeAsync(storageKey, normalized.buffer, normalized.mimetype);
    const updated = await this.itemsRepo.update(id, { imageUrls: [storageKey] });
    this.logger.info({ itemId: id, storageKey }, 'Inventory image uploaded');
    return this.enrichItem(updated);
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.itemsRepo.findById(id);
    if (!existing) throw new NotFoundException('Inventory item not found');
    if (existing.createdBy !== userId) throw new ForbiddenException('Access denied');
    const key = existing.imageUrls?.[0];
    if (key && this.isStorageKey(key)) {
      try {
        await this.fileStorage.removeAsync(key);
      } catch (err) {
        this.logger.warn({ err, key }, 'Failed to delete inventory image on item delete');
      }
    }
    await this.itemsRepo.delete(id);
  }

  async bulkDelete(ids: string[], userId: string): Promise<{ deletedCount: number }> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      throw new BadRequestException('No item ids provided');
    }

    for (const id of uniqueIds) {
      await this.delete(id, userId);
    }

    this.logger.info({ count: uniqueIds.length, userId }, 'Inventory items bulk deleted');
    return { deletedCount: uniqueIds.length };
  }
}

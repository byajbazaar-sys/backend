import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Paged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IInventoryCategoriesRepository, INVENTORY_CATEGORIES_REPOSITORY } from './i-inventory-categories.repository';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from './i-inventory-items.repository';
import {
  IUsersFileStorage,
  USERS_FILE_STORAGE,
  IProductImageAiService,
  PRODUCT_IMAGE_AI_SERVICE,
} from '../../../shared';
import { ISalesBillsRepository, SALES_BILLS_REPOSITORY } from '../../sales-bills/service/i-sales-bills.repository';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { InventoryItem, InventoryItemSale } from '../domain';
import {
  CreateInventoryItemRequestModel,
  InventoryImageAiPreviewResponseModel,
  ListInventoryItemsQueryModel,
  UpdateInventoryItemRequestModel,
  InventoryItemUpdatePatch,
} from '../models';
import { InventoryItemsFilterOptions } from '../options';
import { BARCODE_SERVICE, IBarcodeService } from './i-barcode.service';
import { IInventoryItemService } from './i-inventory-item.service';
import { EInventoryItemStatus } from '../enums';
import { deriveBusinessSkuPrefix } from '../utils/business-sku-prefix';

@Injectable()
export class InventoryItemService implements IInventoryItemService {
  constructor(
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY) private readonly categoriesRepo: IInventoryCategoriesRepository,
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(SALES_BILLS_REPOSITORY) private readonly salesBillsRepo: ISalesBillsRepository,
    @Inject(PRODUCT_IMAGE_AI_SERVICE) private readonly productImageAi: IProductImageAiService,
    @InjectPinoLogger(InventoryItemService.name) private readonly logger: PinoLogger,
  ) {}

  private isStorageKey(value: string): boolean {
    return !!value && !value.startsWith('http');
  }

  /** S3 write may store `.jpg` while DB has `.jpeg` (or vice versa). */
  private alternateJpegKey(key: string): string {
    if (key.endsWith('.jpeg')) return `${key.slice(0, -5)}.jpg`;
    if (key.endsWith('.jpg')) return `${key.slice(0, -4)}.jpeg`;
    return null;
  }

  private async resolveImageUrls(keys: string[]): Promise<string[]> {
    if (!keys?.length) return [];
    return Promise.all(
      keys.map(async (key) => {
        if (!key || !this.isStorageKey(key)) return key;
        let url = await this.fileStorage.getUrlAsync(key);
        if (!url) {
          const alt = this.alternateJpegKey(key);
          if (alt) url = await this.fileStorage.getUrlAsync(alt);
        }
        // Prefer a real URL; fall back to stored key (previous behavior) if both miss.
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

  async create(data: CreateInventoryItemRequestModel, userId: string): Promise<InventoryItem> {
    const category = await this.categoriesRepo.findById(data.categoryId);
    if (!category) throw new NotFoundException('Category not found');

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

    const created = await this.itemsRepo.create(item);
    if (created.id) {
      const qrValue = this.barcodeService.buildInventoryQrPayload(created.id, created.sku);
      const withQr = await this.itemsRepo.update(created.id, { qrValue });
      this.logger.info({ itemId: withQr.id, sku }, 'Inventory item created');
      return this.enrichItem(withQr);
    }
    this.logger.info({ itemId: created.id, sku }, 'Inventory item created');
    return this.enrichItem(created);
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
    const item = await this.itemsRepo.findByScanCode(lookupCode, userId);
    if (!item) throw new NotFoundException('Inventory item not found for barcode');
    if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
    return this.enrichItem(item);
  }

  async update(id: string, data: UpdateInventoryItemRequestModel, userId: string): Promise<InventoryItem> {
    await this.getById(id, userId);
    if (data.categoryId) {
      const category = await this.categoriesRepo.findById(data.categoryId);
      if (!category) throw new NotFoundException('Category not found');
    }
    const { imageUrls: _ignored, ...rest } = data;
    const patch = instanceToPlain(plainToInstance(InventoryItemUpdatePatch, rest), {
      exposeUnsetFields: false,
    }) as InventoryItemUpdatePatch;
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

    const normalized = await normalizeImageBufferForStorageOrThrow(file.buffer, file.mimetype, file.originalname);

    let bufferToStore = normalized.buffer;
    let mimetype = normalized.mimetype;
    let fileExtension = normalized.fileExtension;

    try {
      const aiGenerated = await this.productImageAi.removeProductBackground({
        base64: normalized.buffer.toString('base64'),
        mimeType: normalized.mimetype,
      });
      const polished = await this.productImageAi.polishTransparentPng({
        base64: aiGenerated.base64,
        mimeType: aiGenerated.mimeType,
      });
      bufferToStore = Buffer.from(polished.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      mimetype = 'image/png';
      fileExtension = 'png';
      this.logger.info({ itemId: id }, 'Inventory image background removed for try-on');
    } catch (err) {
      this.logger.warn({ err, itemId: id }, 'Inventory AI background removal failed; storing original image');
    }

    const proposedKey = `inventory/${userId}/${id}/image.${fileExtension}`;

    if (currentKey && this.isStorageKey(currentKey)) {
      try {
        await this.fileStorage.removeAsync(currentKey);
      } catch (err) {
        this.logger.warn({ err, key: currentKey }, 'Failed to delete old inventory image');
      }
    }

    // Persist the key S3 actually wrote (extension may differ from proposed).
    const storageKey = await this.fileStorage.writeAsync(proposedKey, bufferToStore, mimetype);
    const updated = await this.itemsRepo.update(id, { imageUrls: [storageKey] });
    this.logger.info({ itemId: id, storageKey }, 'Inventory image uploaded');
    return this.enrichItem(updated);
  }

  async previewAiImage(file: Express.Multer.File): Promise<InventoryImageAiPreviewResponseModel> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }

    const mimeType = file.mimetype || 'image/jpeg';
    const originalBase64 = file.buffer.toString('base64');
    return this.buildAiPreview(originalBase64, mimeType);
  }

  async previewAiImageForItem(id: string, userId: string): Promise<InventoryImageAiPreviewResponseModel> {
    const existing = await this.itemsRepo.findById(id);
    if (!existing) throw new NotFoundException('Inventory item not found');
    if (existing.createdBy !== userId) throw new ForbiddenException('Access denied');

    const key = existing.imageUrls?.[0];
    if (!key || !this.isStorageKey(key)) {
      throw new BadRequestException('Inventory item has no stored image to regenerate');
    }

    let buffer = await this.fileStorage.readAsync(key);
    let resolvedKey = key;
    if (!buffer?.length) {
      const alt = this.alternateJpegKey(key);
      if (alt) {
        buffer = await this.fileStorage.readAsync(alt);
        if (buffer?.length) resolvedKey = alt;
      }
    }
    if (!buffer?.length) {
      throw new NotFoundException('Stored inventory image not found');
    }

    const mimeType = this.mimeFromKey(resolvedKey);
    return this.buildAiPreview(buffer.toString('base64'), mimeType);
  }

  private mimeFromKey(key: string): string {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  private async buildAiPreview(
    originalBase64: string,
    mimeType: string,
  ): Promise<InventoryImageAiPreviewResponseModel> {
    try {
      const aiGenerated = await this.productImageAi.removeProductBackground({
        base64: originalBase64,
        mimeType,
      });
      const polished = await this.productImageAi.polishTransparentPng({
        base64: aiGenerated.base64,
        mimeType: aiGenerated.mimeType,
      });
      const compressed = await this.productImageAi.compressPngForPreview({
        base64: polished.base64,
        mimeType: polished.mimeType,
      });
      this.logger.info(
        {
          mimeType,
          aiMimeType: polished.mimeType,
          previewBytes: Buffer.from(compressed.base64.replace(/^data:[^;]+;base64,/, ''), 'base64').length,
        },
        'Inventory AI image preview generated',
      );
      return {
        aiGenerated: {
          base64: compressed.base64.replace(/^data:[^;]+;base64,/, ''),
          mimeType: compressed.mimeType,
        },
      };
    } catch (err) {
      this.logger.error({ err }, 'Inventory AI image preview failed');
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'AI image generation is currently unavailable',
      );
    }
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

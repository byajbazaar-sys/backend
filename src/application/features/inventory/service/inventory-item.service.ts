import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Paged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { createHash, randomUUID } from 'crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IInventoryCategoriesRepository, INVENTORY_CATEGORIES_REPOSITORY } from './i-inventory-categories.repository';
import { IInventoryItemSalesRepository, INVENTORY_ITEM_SALES_REPOSITORY } from './i-inventory-item-sales.repository';
import { IInventoryItemService } from './i-inventory-item.service';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from './i-inventory-items.repository';
import {
  IUsersFileStorage,
  USERS_FILE_STORAGE,
  IProductImageAiService,
  PRODUCT_IMAGE_AI_SERVICE,
  BulkDeleteResult,
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  ICacheService,
} from '../../../shared';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { InventoryItem, InventoryItemSale } from '../domain';
import { EInventoryItemStatus } from '../enums';
import {
  CreateInventoryItemRequestModel,
  InventoryImageAiPreviewResponseModel,
  ListInventoryItemsQueryModel,
  UpdateInventoryItemRequestModel,
  InventoryItemUpdatePatch,
} from '../models';
import { InventoryItemsFilterOptions } from '../options';
import { BARCODE_SERVICE, IBarcodeService } from './i-barcode.service';
import { deriveBusinessSkuPrefix } from '../utils';

/** Photos per inventory item (the first is the cover: catalog tile, labels, try-on). */
export const MAX_ITEM_IMAGES = 8;

@Injectable()
export class InventoryItemService implements IInventoryItemService {
  constructor(
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY) private readonly categoriesRepo: IInventoryCategoriesRepository,
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(USERS_FILE_STORAGE) private readonly fileStorage: IUsersFileStorage,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @Inject(INVENTORY_ITEM_SALES_REPOSITORY) private readonly salesBillsRepo: IInventoryItemSalesRepository,
    @Inject(PRODUCT_IMAGE_AI_SERVICE) private readonly productImageAi: IProductImageAiService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @InjectPinoLogger(InventoryItemService.name) private readonly logger: PinoLogger,
  ) {}

  private isStorageKey(value: string): boolean {
    return !!value && !value.startsWith('http');
  }

  /**
   * Stable, non-secret id for one of an item's photos: the file name of its storage key (unique inside the item's
   * folder), or a short hash for photos stored as external URLs.
   */
  private imageIdOf(ref: string): string {
    if (this.isStorageKey(ref)) return ref.slice(ref.lastIndexOf('/') + 1);
    return `u-${createHash('sha1').update(ref).digest('hex').slice(0, 12)}`;
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
    const refs = (item.imageUrls ?? []).filter(Boolean);
    return {
      ...item,
      imageUrls: await this.resolveImageUrls(refs),
      imageIds: refs.map((ref) => this.imageIdOf(ref)),
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
    if (data.categoryId) {
      const category = await this.categoriesRepo.findById(data.categoryId);
      if (!category) throw new NotFoundException('Category not found');
    }

    const sku = data.sku?.trim() || (await this.generateSku(userId));
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
      const withQr = await this.itemsRepo.update(created.id, { qrValue }, userId);
      this.logger.info({ itemId: withQr.id, sku }, 'Inventory item created');
      await this.invalidateInventoryReportsCache(userId);
      return this.enrichItem(withQr);
    }
    this.logger.info({ itemId: created.id, sku }, 'Inventory item created');
    await this.invalidateInventoryReportsCache(userId);
    return this.enrichItem(created);
  }

  private mapListQuery(userId: string, query: ListInventoryItemsQueryModel): InventoryItemsFilterOptions {
    return {
      createdBy: userId,
      search: query.search,
      categoryId: query.categoryId,
      status: query.status,
      metalType: query.metalType,
      isCatalogVisible: query.isCatalogVisible,
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      sortOrder: query.sortOrder,
      sortBy: query.sortBy,
      purity: query.purity,
      minWeight: query.minWeight,
      maxWeight: query.maxWeight,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      addedFrom: query.addedFrom,
      addedTo: query.addedTo,
      hallmarked: query.hallmarked,
      hasPhoto: query.hasPhoto,
    };
  }

  async getAll(userId: string, query: ListInventoryItemsQueryModel): Promise<Paged<InventoryItem>> {
    const paged = await this.itemsRepo.findAll(this.mapListQuery(userId, query));
    const items = await Promise.all(paged.items.map((item) => this.enrichItem(item)));
    return { ...paged, items };
  }

  async getLiveCatalogItems(
    userId: string,
    query: Pick<ListInventoryItemsQueryModel, 'pageNumber' | 'pageSize' | 'search'> = {},
  ): Promise<Paged<InventoryItem>> {
    const paged = await this.itemsRepo.findPublicCatalog(userId, {
      pageNumber: query.pageNumber ?? 0,
      pageSize: query.pageSize ?? 100,
      search: query.search,
    });
    const items = await Promise.all(paged.items.map((item) => this.enrichItem(item)));
    return { ...paged, items };
  }

  async getById(id: string, userId: string): Promise<InventoryItem> {
    const item = await this.itemsRepo.findById(id, userId);
    if (!item) throw new NotFoundException('Inventory item not found');
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
      const byId = await this.itemsRepo.findById(qrPayload.inventoryId, userId);
      if (byId) {
        return this.enrichItem(byId);
      }
    }

    const lookupCode = qrPayload?.sku?.trim() || raw;
    const item = await this.itemsRepo.findByScanCode(lookupCode, userId);
    if (!item) throw new NotFoundException('Inventory item not found for barcode');
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
    if (patch.status === EInventoryItemStatus.Sold || patch.stockQuantity === 0) {
      patch.isCatalogVisible = false;
    }
    const updated = await this.itemsRepo.update(id, patch, userId);
    await this.invalidateInventoryReportsCache(userId);
    return this.enrichItem(updated);
  }

  /**
   * Single-photo upload (older clients, the mobile app): replaces — or with `removeImage`, removes — the cover photo
   * (the first one). Other photos stay.
   */
  async uploadImage(
    id: string,
    userId: string,
    file?: Express.Multer.File,
    removeImage?: boolean,
    storeAsUploaded?: boolean,
  ): Promise<InventoryItem> {
    const existing = await this.itemsRepo.findById(id, userId);
    if (!existing) throw new NotFoundException('Inventory item not found');
    const refs = (existing.imageUrls ?? []).filter(Boolean);
    const [cover, ...rest] = refs;

    if (removeImage) {
      if (cover) await this.removeStoredImage(cover);
      return this.saveImages(id, userId, rest);
    }

    const storageKey = await this.storeImage(id, userId, file, storeAsUploaded);
    if (cover) await this.removeStoredImage(cover);
    this.logger.info({ itemId: id, storageKey }, 'Inventory cover image uploaded');
    return this.saveImages(id, userId, [storageKey, ...rest]);
  }

  /** Adds one photo after the others (or first, as the cover). */
  async addImage(
    id: string,
    userId: string,
    file: Express.Multer.File | undefined,
    options: { storeAsUploaded?: boolean; asCover?: boolean },
  ): Promise<InventoryItem> {
    const existing = await this.itemsRepo.findById(id, userId);
    if (!existing) throw new NotFoundException('Inventory item not found');
    const refs = (existing.imageUrls ?? []).filter(Boolean);
    if (refs.length >= MAX_ITEM_IMAGES) {
      throw new BadRequestException(`An item can have at most ${MAX_ITEM_IMAGES} photos.`);
    }
    const storageKey = await this.storeImage(id, userId, file, options.storeAsUploaded);
    // Re-read: another photo may have been added while this one was processed.
    const latest = ((await this.itemsRepo.findById(id, userId))?.imageUrls ?? refs).filter(Boolean);
    const next = options.asCover ? [storageKey, ...latest] : [...latest, storageKey];
    this.logger.info({ itemId: id, storageKey, count: next.length }, 'Inventory image added');
    return this.saveImages(id, userId, next.slice(0, MAX_ITEM_IMAGES));
  }

  /** Removes one photo by its id. */
  async removeImageById(id: string, userId: string, imageId: string): Promise<InventoryItem> {
    const existing = await this.itemsRepo.findById(id, userId);
    if (!existing) throw new NotFoundException('Inventory item not found');
    const refs = (existing.imageUrls ?? []).filter(Boolean);
    const target = refs.find((ref) => this.imageIdOf(ref) === imageId);
    if (!target) throw new NotFoundException('Photo not found');
    await this.removeStoredImage(target);
    return this.saveImages(
      id,
      userId,
      refs.filter((ref) => ref !== target),
    );
  }

  /** New photo order (all of the item's photo ids); the first becomes the cover. */
  async reorderImages(id: string, userId: string, imageIds: string[]): Promise<InventoryItem> {
    const existing = await this.itemsRepo.findById(id, userId);
    if (!existing) throw new NotFoundException('Inventory item not found');
    const refs = (existing.imageUrls ?? []).filter(Boolean);
    const byId = new Map(refs.map((ref) => [this.imageIdOf(ref), ref]));
    const ordered = [...new Set(imageIds)].map((imageId) => byId.get(imageId)).filter((ref): ref is string => !!ref);
    if (ordered.length !== refs.length) {
      throw new BadRequestException('The photo list changed — reload the item and try again.');
    }
    return this.saveImages(id, userId, ordered);
  }

  private async saveImages(id: string, userId: string, refs: string[]): Promise<InventoryItem> {
    const updated = await this.itemsRepo.update(id, { imageUrls: refs }, userId);
    await this.invalidateInventoryReportsCache(userId);
    return this.enrichItem(updated);
  }

  /**
   * Normalizes and stores one photo under its own key. Without `storeAsUploaded` the AI makes the transparent try-on
   * cutout first (the clear-background version's white preview backdrop becomes transparent).
   */
  private async storeImage(
    id: string,
    userId: string,
    file: Express.Multer.File | undefined,
    storeAsUploaded?: boolean,
  ): Promise<string> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    const normalized = await normalizeImageBufferForStorageOrThrow(file.buffer, file.mimetype, file.originalname);

    let bufferToStore = normalized.buffer;
    let mimetype = normalized.mimetype;
    let fileExtension = normalized.fileExtension;

    if (!storeAsUploaded) {
      try {
        const stored = await this.productImageAi.prepareTryOnStorageImage({
          base64: normalized.buffer.toString('base64'),
          mimeType: normalized.mimetype,
        });
        bufferToStore = Buffer.from(stored.base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
        mimetype = 'image/png';
        fileExtension = 'png';
        this.logger.info({ itemId: id }, 'Inventory image AI transparent cutout stored for try-on');
      } catch (err) {
        this.logger.warn({ err, itemId: id }, 'Inventory AI background removal failed; storing original image');
      }
    }

    const proposedKey = `inventory/${userId}/${id}/photo-${randomUUID()}.${fileExtension}`;
    // Persist the key S3 actually wrote (extension may differ from proposed).
    return this.fileStorage.writeAsync(proposedKey, bufferToStore, mimetype);
  }

  private async removeStoredImage(ref: string): Promise<void> {
    if (!this.isStorageKey(ref)) return;
    try {
      await this.fileStorage.removeAsync(ref);
    } catch (err) {
      this.logger.warn({ err, key: ref }, 'Failed to delete inventory image');
    }
  }

  async previewAiImage(file: Express.Multer.File): Promise<InventoryImageAiPreviewResponseModel> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }

    const mimeType = file.mimetype || 'image/jpeg';
    const originalBase64 = file.buffer.toString('base64');
    return this.buildAiPreview(originalBase64, mimeType);
  }

  /** AI clear-background version of a stored photo (`imageId`, else the cover), without saving it. */
  async previewAiImageForItem(
    id: string,
    userId: string,
    imageId?: string,
  ): Promise<InventoryImageAiPreviewResponseModel> {
    const existing = await this.itemsRepo.findById(id, userId);
    if (!existing) throw new NotFoundException('Inventory item not found');

    const refs = (existing.imageUrls ?? []).filter(Boolean);
    const key = imageId ? refs.find((ref) => this.imageIdOf(ref) === imageId) : refs[0];
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
      const compressed = await this.productImageAi.compressPngForPreview({
        base64: aiGenerated.base64,
        mimeType: aiGenerated.mimeType,
      });
      this.logger.info(
        {
          mimeType,
          aiMimeType: aiGenerated.mimeType,
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
    const existing = await this.itemsRepo.findById(id, userId);
    if (!existing) throw new NotFoundException('Inventory item not found');
    for (const ref of (existing.imageUrls ?? []).filter(Boolean)) await this.removeStoredImage(ref);
    await this.itemsRepo.delete(id, userId);
    await this.invalidateInventoryReportsCache(userId);
  }

  async bulkDelete(ids: string[], userId: string): Promise<BulkDeleteResult> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      throw new BadRequestException('No item ids provided');
    }

    for (const id of uniqueIds) {
      await this.delete(id, userId);
    }

    this.logger.info({ count: uniqueIds.length, userId }, 'Inventory items bulk deleted');
    return plainToInstance(BulkDeleteResult, { deletedCount: uniqueIds.length }, { excludeExtraneousValues: true });
  }

  private async invalidateInventoryReportsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.INVENTORY_REPORTS, userId);
  }
}

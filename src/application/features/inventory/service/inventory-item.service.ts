import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { QueryFailedError } from 'typeorm';
import { Paged } from '@shared-libs';
import {
  IInventoryCategoriesRepository,
  INVENTORY_CATEGORIES_REPOSITORY,
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from '../../../shared';
import { InventoryItem } from '../domain';
import { CreateInventoryItemRequestModel, ListInventoryItemsQueryModel } from '../models';
import { IInventoryItemService } from './i-inventory-item.service';
import { EInventoryItemStatus } from '../enums';

@Injectable()
export class InventoryItemService implements IInventoryItemService {
  constructor(
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY) private readonly categoriesRepo: IInventoryCategoriesRepository,
    @InjectPinoLogger(InventoryItemService.name) private readonly logger: PinoLogger,
  ) {}

  async generateSku(): Promise<string> {
    const yearSuffix = String(new Date().getFullYear()).slice(-2);
    const seq = await this.itemsRepo.getNextSkuSequence(yearSuffix);
    return `RK${yearSuffix}${String(seq).padStart(4, '0')}`;
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
      const sku = await this.generateSku();
      const item: InventoryItem = {
        ...data,
        sku,
        barcode: sku,
        status: data.status ?? EInventoryItemStatus.Available,
        imageUrls: data.imageUrls ?? [],
        createdBy: userId,
      };

      try {
        const created = await this.itemsRepo.create(item);
        this.logger.info({ itemId: created.id, sku }, 'Inventory item created');
        return created;
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

  async getAll(userId: string, query: ListInventoryItemsQueryModel): Promise<Paged<InventoryItem>> {
    return this.itemsRepo.findAll(
      {
        createdBy: userId,
        search: query.search,
        categoryId: query.categoryId,
        status: query.status,
        metalType: query.metalType,
      },
      { pageNumber: query.pageNumber, pageSize: query.pageSize },
    );
  }

  async getById(id: string, userId: string): Promise<InventoryItem> {
    const item = await this.itemsRepo.findById(id);
    if (!item) throw new NotFoundException('Inventory item not found');
    if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
    return item;
  }

  async getByBarcode(barcode: string, userId: string): Promise<InventoryItem> {
    const item = await this.itemsRepo.findByBarcode(barcode);
    if (!item) throw new NotFoundException('Inventory item not found for barcode');
    if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
    return item;
  }

  async update(
    id: string,
    data: Partial<CreateInventoryItemRequestModel>,
    userId: string,
  ): Promise<InventoryItem> {
    await this.getById(id, userId);
    if (data.categoryId) {
      const category = await this.categoriesRepo.findById(data.categoryId);
      if (!category) throw new NotFoundException('Category not found');
    }
    return this.itemsRepo.update(id, data);
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.getById(id, userId);
    await this.itemsRepo.delete(id);
  }
}

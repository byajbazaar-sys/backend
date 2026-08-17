import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SYSTEM_USER_ID } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { IInventoryCategoriesRepository, INVENTORY_CATEGORIES_REPOSITORY } from './i-inventory-categories.repository';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from './i-inventory-items.repository';
import { InventoryCategory } from '../domain';
import { CreateInventoryCategoryRequestModel, UpdateInventoryCategoryRequestModel } from '../models';
import { IInventoryCategoryService } from './i-inventory-category.service';
import { CACHE_NAMESPACE, CACHE_SERVICE, ICacheService } from '../../../shared';

@Injectable()
export class InventoryCategoryService implements IInventoryCategoryService {
  constructor(
    @Inject(INVENTORY_CATEGORIES_REPOSITORY)
    private readonly categoriesRepo: IInventoryCategoriesRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY)
    private readonly itemsRepo: IInventoryItemsRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @InjectPinoLogger(InventoryCategoryService.name) private readonly logger: PinoLogger,
  ) {}

  async create(data: CreateInventoryCategoryRequestModel, userId: string): Promise<InventoryCategory> {
    const existing = await this.categoriesRepo.findByName(data.name, userId);
    if (existing) {
      throw new ConflictException(`Category with name ${data.name} already exists`);
    }
    const created = await this.categoriesRepo.create({ ...data, createdBy: userId });
    await this.invalidateInventoryReportsCache(userId);
    return created;
  }

  async getAll(userId: string): Promise<InventoryCategory[]> {
    return this.categoriesRepo.findAll(userId);
  }

  async getById(id: string, userId: string): Promise<InventoryCategory> {
    const category = await this.categoriesRepo.findById(id);
    if (!category) throw new NotFoundException('Category not found');
    if (category.createdBy !== userId && category.createdBy !== SYSTEM_USER_ID) {
      throw new ForbiddenException('Access denied');
    }
    return category;
  }

  async update(id: string, data: UpdateInventoryCategoryRequestModel, userId: string): Promise<InventoryCategory> {
    const category = await this.getById(id, userId);
    if (category.isSystem || category.createdBy === SYSTEM_USER_ID) {
      throw new ForbiddenException('Cannot update system categories');
    }
    if (data.name && data.name !== category.name) {
      const existing = await this.categoriesRepo.findByName(data.name, userId);
      if (existing) throw new ConflictException(`Category with name ${data.name} already exists`);
    }
    const updated = await this.categoriesRepo.update(id, data);
    await this.invalidateInventoryReportsCache(userId);
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const category = await this.getById(id, userId);
    if (category.isSystem || category.createdBy === SYSTEM_USER_ID) {
      throw new ForbiddenException('Cannot delete system categories');
    }
    const items = await this.itemsRepo.findAll({
      createdBy: userId,
      categoryId: id,
      pageNumber: 0,
      pageSize: 1,
    });
    if (items.totalCount > 0) {
      throw new BadRequestException('Cannot delete category with associated inventory items');
    }
    await this.categoriesRepo.delete(id);
    await this.invalidateInventoryReportsCache(userId);
  }

  private async invalidateInventoryReportsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.INVENTORY_REPORTS, userId);
  }
}

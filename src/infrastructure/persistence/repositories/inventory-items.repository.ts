import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  IInventoryItemsRepository,
  InventoryItem,
  InventoryItemsFilterOptions,
  InventoryItemUpdatePatch,
} from '../../../application';
import { InventoryItemEntity } from '../entities/inventory-item.entity';

@Injectable()
export class InventoryItemsRepository implements IInventoryItemsRepository {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly repo: Repository<InventoryItemEntity>,
  ) {}

  private buildQuery(
    filter: Pick<InventoryItemsFilterOptions, 'createdBy' | 'search' | 'categoryId' | 'status' | 'metalType'>,
  ) {
    const qb = this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.created_by = :createdBy', { createdBy: filter.createdBy });

    if (filter.search?.trim()) {
      qb.andWhere(
        '(item.item_name ILIKE :search OR item.sku ILIKE :search OR item.barcode ILIKE :search OR item.item_code ILIKE :search)',
        { search: `%${filter.search.trim()}%` },
      );
    }
    if (filter.categoryId) {
      qb.andWhere('item.category_id = :categoryId', { categoryId: filter.categoryId });
    }
    if (filter.status) {
      qb.andWhere('item.status = :status', { status: filter.status });
    }
    if (filter.metalType) {
      qb.andWhere('item.metal_type = :metalType', { metalType: filter.metalType });
    }
    return qb;
  }

  private mapEntity(entity: InventoryItemEntity): InventoryItem {
    const item = plainToInstance(InventoryItem, entity, { excludeExtraneousValues: true });
    if (entity.category) {
      item.categoryName = entity.category.name;
    }
    return item;
  }

  async create(data: InventoryItem): Promise<InventoryItem> {
    const entity = this.repo.create(data);
    const created = await this.repo.save(entity);
    const withCategory = await this.repo.findOne({
      where: { id: created.id },
      relations: ['category'],
    });
    return this.mapEntity(withCategory);
  }

  async findById(id: string): Promise<InventoryItem> {
    const entity = await this.repo.findOne({ where: { id }, relations: ['category'] });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findBySku(sku: string, createdBy: string): Promise<InventoryItem> {
    const entity = await this.repo.findOne({
      where: { sku, createdBy },
      relations: ['category'],
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByBarcode(barcode: string, createdBy: string): Promise<InventoryItem> {
    const entity = await this.repo.findOne({
      where: { barcode, createdBy },
      relations: ['category'],
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByScanCode(code: string, createdBy: string): Promise<InventoryItem> {
    const trimmed = code.trim();
    if (!trimmed) return null;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const qb = this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.created_by = :createdBy', { createdBy })
      .andWhere(
        "UPPER(item.barcode) = UPPER(:code) OR UPPER(item.sku) = UPPER(:code) OR UPPER(COALESCE(item.itemCode, '')) = UPPER(:code)",
        { code: trimmed },
      );

    if (uuidRe.test(trimmed)) {
      qb.orWhere('item.id = :id', { id: trimmed });
    }

    const entity = await qb.getOne();
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findAll(params: InventoryItemsFilterOptions): Promise<Paged<InventoryItem>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const filter = params;
    const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const qb = this.buildQuery(filter).orderBy('item.createdAt', sortOrder).skip(skip).take(pageSize);
    const [items, totalCount] = await qb.getManyAndCount();
    return toPaged(InventoryItem, {
      items: items.map((e) => this.mapEntity(e)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findAllForReport(
    filter: Pick<
      InventoryItemsFilterOptions,
      'createdBy' | 'search' | 'categoryId' | 'status' | 'metalType' | 'sortOrder'
    >,
  ): Promise<InventoryItem[]> {
    const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const entities = await this.buildQuery(filter).orderBy('item.createdAt', sortOrder).getMany();
    return entities.map((e) => this.mapEntity(e));
  }

  async getNextSkuSequence(skuPrefix: string, createdBy: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('item')
      .select('item.sku', 'sku')
      .where('item.created_by = :createdBy', { createdBy })
      .andWhere('item.sku LIKE :prefix', { prefix: `${skuPrefix}%` })
      .orderBy('item.sku', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result?.sku) return 1;
    const seq = parseInt(String(result.sku).slice(skuPrefix.length), 10);
    return isNaN(seq) ? 1 : seq + 1;
  }

  async update(id: string, data: InventoryItemUpdatePatch): Promise<InventoryItem> {
    const { categoryName: _categoryName, ...rest } = data as InventoryItemUpdatePatch & {
      categoryName?: string;
    };
    await this.repo.update(id, rest as Partial<InventoryItemEntity>);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async countByCategory(
    createdBy: string,
  ): Promise<{ categoryId: string; categoryName: string; count: number; totalValue: number }[]> {
    const rows = await this.repo
      .createQueryBuilder('item')
      .leftJoin('item.category', 'category')
      .select('item.category_id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(item.id)', 'count')
      .addSelect('COALESCE(SUM(item.selling_price), 0)', 'totalValue')
      .where('item.created_by = :createdBy', { createdBy })
      .groupBy('item.category_id')
      .addGroupBy('category.name')
      .getRawMany();

    return rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      count: parseInt(r.count, 10),
      totalValue: parseFloat(r.totalValue),
    }));
  }

  async countLowStock(createdBy: string, threshold: number): Promise<InventoryItem[]> {
    const stockThreshold = Math.max(0, Math.floor(threshold));
    const entities = await this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.created_by = :createdBy', { createdBy })
      .andWhere('item.status = :status', { status: 'AVAILABLE' })
      .andWhere('item.stock_quantity <= :stockThreshold', { stockThreshold })
      .orderBy('item.stockQuantity', 'ASC')
      .addOrderBy('item.itemName', 'ASC')
      .getMany();
    return entities.map((e) => this.mapEntity(e));
  }

  async countCatalogVisible(createdBy: string): Promise<number> {
    return this.repo.count({
      where: { createdBy, isCatalogVisible: true },
    });
  }

  async findPublicCatalog(
    createdBy: string,
    params: Pick<InventoryItemsFilterOptions, 'search' | 'categoryId' | 'metalType' | 'pageNumber' | 'pageSize'>,
  ): Promise<Paged<InventoryItem>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const qb = this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.created_by = :createdBy', { createdBy })
      .andWhere('item.is_catalog_visible = true')
      .andWhere('item.status = :status', { status: 'AVAILABLE' });

    if (params.search?.trim()) {
      qb.andWhere('(item.item_name ILIKE :search OR item.description ILIKE :search)', {
        search: `%${params.search.trim()}%`,
      });
    }
    if (params.categoryId) {
      qb.andWhere('item.category_id = :categoryId', { categoryId: params.categoryId });
    }
    if (params.metalType) {
      qb.andWhere('item.metal_type = :metalType', { metalType: params.metalType });
    }

    qb.orderBy('item.createdAt', 'DESC').skip(skip).take(pageSize);
    const [items, totalCount] = await qb.getManyAndCount();
    return toPaged(InventoryItem, {
      items: items.map((e) => this.mapEntity(e)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async bulkUpdateCatalogVisibility(
    ids: string[],
    createdBy: string,
    isCatalogVisible: boolean,
  ): Promise<number> {
    if (!ids.length) return 0;
    const result = await this.repo
      .createQueryBuilder()
      .update(InventoryItemEntity)
      .set({ isCatalogVisible })
      .where('id IN (:...ids)', { ids })
      .andWhere('created_by = :createdBy', { createdBy })
      .execute();
    return result.affected ?? 0;
  }
}

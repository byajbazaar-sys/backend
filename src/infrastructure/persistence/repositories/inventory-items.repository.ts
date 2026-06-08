import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { InventoryItemEntity } from '../entities/inventory-item.entity';
import {
  IInventoryItemsRepository,
  InventoryItem,
  InventoryItemFilter,
  InventoryPaginationParams,
} from '../../../application';

@Injectable()
export class InventoryItemsRepository implements IInventoryItemsRepository {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly repo: Repository<InventoryItemEntity>,
  ) {}

  private buildQuery(filter: InventoryItemFilter) {
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

  async findById(id: string): Promise<InventoryItem | null> {
    const entity = await this.repo.findOne({ where: { id }, relations: ['category'] });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findBySku(sku: string): Promise<InventoryItem | null> {
    const entity = await this.repo.findOne({ where: { sku }, relations: ['category'] });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByBarcode(barcode: string): Promise<InventoryItem | null> {
    const entity = await this.repo.findOne({ where: { barcode }, relations: ['category'] });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findAll(filter: InventoryItemFilter, pagination: InventoryPaginationParams): Promise<Paged<InventoryItem>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(pagination);
    const qb = this.buildQuery(filter).orderBy('item.createdAt', 'DESC').skip(skip).take(pageSize);
    const [items, totalCount] = await qb.getManyAndCount();
    return toPaged(InventoryItem, {
      items: items.map((e) => this.mapEntity(e)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findAllForReport(filter: InventoryItemFilter): Promise<InventoryItem[]> {
    const entities = await this.buildQuery(filter).orderBy('item.createdAt', 'DESC').getMany();
    return entities.map((e) => this.mapEntity(e));
  }

  async getNextSkuSequence(yearSuffix: string): Promise<number> {
    const prefix = `RK${yearSuffix}`;
    const result = await this.repo
      .createQueryBuilder('item')
      .select('item.sku', 'sku')
      .where('item.sku LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('item.sku', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result?.sku) return 1;
    const seq = parseInt(String(result.sku).replace(prefix, ''), 10);
    return isNaN(seq) ? 1 : seq + 1;
  }

  async update(id: string, data: Partial<InventoryItem>): Promise<InventoryItem> {
    const { categoryName, ...rest } = data;
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
    const entities = await this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.created_by = :createdBy', { createdBy })
      .andWhere('item.status = :status', { status: 'AVAILABLE' })
      .andWhere('item.net_weight <= :threshold', { threshold })
      .orderBy('item.netWeight', 'ASC')
      .getMany();
    return entities.map((e) => this.mapEntity(e));
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  EInventoryItemStatus,
  IInventoryItemsRepository,
  PublicCatalogFacets,
  PublicCatalogQuery,
  InventoryItem,
  InventoryItemsFilterOptions,
  InventoryItemUpdatePatch,
  InventoryCategoryBreakdown,
  InventoryItemEntityUpdateInput,
} from '../../../application';
import { InventoryItemEntity } from '../entities';

@Injectable()
export class InventoryItemsRepository implements IInventoryItemsRepository {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly repo: Repository<InventoryItemEntity>,
  ) {}

  private buildQuery(
    filter: Pick<
      InventoryItemsFilterOptions,
      'createdBy' | 'search' | 'categoryId' | 'status' | 'metalType' | 'isCatalogVisible'
    > &
      Partial<
        Pick<
          InventoryItemsFilterOptions,
          | 'purity'
          | 'minWeight'
          | 'maxWeight'
          | 'minPrice'
          | 'maxPrice'
          | 'addedFrom'
          | 'addedTo'
          | 'hallmarked'
          | 'hasPhoto'
        >
      >,
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
    if (filter.isCatalogVisible !== undefined) {
      qb.andWhere('item.is_catalog_visible = :isCatalogVisible', {
        isCatalogVisible: filter.isCatalogVisible,
      });
    }
    if (filter.purity?.trim()) {
      qb.andWhere('UPPER(item.purity) = UPPER(:purity)', { purity: filter.purity.trim() });
    }
    // Weight = net weight, or gross when net isn't recorded.
    const weightExpr = InventoryItemsRepository.WEIGHT_EXPR;
    if (filter.minWeight != null) {
      qb.andWhere(`${weightExpr} >= :minWeight`, { minWeight: filter.minWeight });
    }
    if (filter.maxWeight != null) {
      qb.andWhere(`${weightExpr} <= :maxWeight`, { maxWeight: filter.maxWeight });
    }
    if (filter.minPrice != null) {
      qb.andWhere('item.selling_price >= :minPrice', { minPrice: filter.minPrice });
    }
    if (filter.maxPrice != null) {
      qb.andWhere('item.selling_price <= :maxPrice', { maxPrice: filter.maxPrice });
    }
    // Dates are the shop's calendar days (India time), inclusive at both ends.
    const addedDay = "(item.created_at AT TIME ZONE 'Asia/Kolkata')::date";
    if (filter.addedFrom) {
      qb.andWhere(`${addedDay} >= CAST(:addedFrom AS date)`, { addedFrom: filter.addedFrom.slice(0, 10) });
    }
    if (filter.addedTo) {
      qb.andWhere(`${addedDay} <= CAST(:addedTo AS date)`, { addedTo: filter.addedTo.slice(0, 10) });
    }
    if (filter.hallmarked !== undefined) {
      qb.andWhere('item.hallmarked = :hallmarked', { hallmarked: filter.hallmarked });
    }
    if (filter.hasPhoto !== undefined) {
      qb.andWhere(
        filter.hasPhoto
          ? "jsonb_array_length(COALESCE(item.image_urls, '[]'::jsonb)) > 0"
          : "jsonb_array_length(COALESCE(item.image_urls, '[]'::jsonb)) = 0",
      );
    }
    return qb;
  }

  /** Net weight, or gross weight when net isn't recorded — used by the weight filter and sort. */
  private static readonly WEIGHT_EXPR = 'COALESCE(NULLIF(item.net_weight, 0), item.gross_weight)';

  private static readonly SORT_COLUMNS: Record<string, string> = {
    createdAt: 'item.created_at',
    netWeight: InventoryItemsRepository.WEIGHT_EXPR,
    sellingPrice: 'item.selling_price',
    itemName: 'LOWER(item.item_name)',
  };

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
      where: { id: created.id, createdBy: created.createdBy },
      relations: ['category'],
    });
    return this.mapEntity(withCategory);
  }

  async findById(id: string, createdBy: string): Promise<InventoryItem> {
    const entity = await this.repo.findOne({ where: { id, createdBy }, relations: ['category'] });
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
    const sortColumn = InventoryItemsRepository.SORT_COLUMNS[filter.sortBy ?? 'createdAt'] ?? 'item.created_at';
    const qb = this.buildQuery(filter).orderBy(sortColumn, sortOrder, 'NULLS LAST');
    // Stable paging when many items share a weight / price / name.
    if (sortColumn !== 'item.created_at') qb.addOrderBy('item.created_at', 'DESC');
    // offset/limit (not skip/take): the only join is many-to-one, so rows aren't multiplied, and
    // skip/take can't order by SQL expressions such as the weight fallback.
    qb.offset(skip).limit(pageSize);
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

  async update(id: string, data: InventoryItemUpdatePatch, createdBy: string): Promise<InventoryItem> {
    const { categoryName: _categoryName, ...rest } = data as InventoryItemUpdatePatch & {
      categoryName?: string;
    };
    const entityUpdate: InventoryItemEntityUpdateInput = rest;
    await this.repo.update({ id, createdBy }, entityUpdate);
    return this.findById(id, createdBy);
  }

  async delete(id: string, createdBy: string): Promise<void> {
    await this.repo.delete({ id, createdBy });
  }

  async countByCategory(createdBy: string): Promise<InventoryCategoryBreakdown[]> {
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

    return rows.map((r) =>
      plainToInstance(
        InventoryCategoryBreakdown,
        {
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          count: parseInt(r.count, 10),
          totalValue: parseFloat(r.totalValue),
        },
        { excludeExtraneousValues: true },
      ),
    );
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
      where: { createdBy, isCatalogVisible: true, status: EInventoryItemStatus.Available },
    });
  }

  private publicCatalogBase(createdBy: string) {
    return this.repo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.created_by = :createdBy', { createdBy })
      .andWhere('item.is_catalog_visible = true')
      .andWhere('item.status = :status', { status: 'AVAILABLE' });
  }

  async findPublicCatalog(createdBy: string, params: PublicCatalogQuery): Promise<Paged<InventoryItem>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const qb = this.publicCatalogBase(createdBy);
    const weightExpr = InventoryItemsRepository.WEIGHT_EXPR;

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
    if (params.purity?.trim()) {
      qb.andWhere('UPPER(item.purity) = UPPER(:purity)', { purity: params.purity.trim() });
    }
    if (params.minWeight != null) qb.andWhere(`${weightExpr} >= :minWeight`, { minWeight: params.minWeight });
    if (params.maxWeight != null) qb.andWhere(`${weightExpr} <= :maxWeight`, { maxWeight: params.maxWeight });
    if (params.minPrice != null) qb.andWhere('item.selling_price >= :minPrice', { minPrice: params.minPrice });
    if (params.maxPrice != null) qb.andWhere('item.selling_price <= :maxPrice', { maxPrice: params.maxPrice });
    if (params.hallmarked !== undefined)
      qb.andWhere('item.hallmarked = :hallmarked', { hallmarked: params.hallmarked });
    if (params.size?.trim()) {
      qb.andWhere('UPPER(TRIM(item.size)) = UPPER(:size)', { size: params.size.trim() });
    }
    if (params.withImages) qb.andWhere("jsonb_array_length(COALESCE(item.image_urls, '[]'::jsonb)) > 0");
    if (params.pricedOnly) qb.andWhere('item.selling_price > 0');

    const sorts: Record<string, [string, 'ASC' | 'DESC']> = {
      newest: ['item.created_at', 'DESC'],
      price_asc: ['item.selling_price', 'ASC'],
      price_desc: ['item.selling_price', 'DESC'],
      weight_asc: [weightExpr, 'ASC'],
      weight_desc: [weightExpr, 'DESC'],
      name: ['LOWER(item.item_name)', 'ASC'],
    };
    const [column, direction] = sorts[params.sort ?? 'newest'] ?? sorts.newest;
    qb.orderBy(column, direction, 'NULLS LAST');
    if (column !== 'item.created_at') qb.addOrderBy('item.created_at', 'DESC');
    // offset/limit: many-to-one join only, and skip/take can't order by expressions.
    qb.offset(skip).limit(pageSize);

    const [items, totalCount] = await qb.getManyAndCount();
    return toPaged(InventoryItem, {
      items: items.map((e) => this.mapEntity(e)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findPublicCatalogFacets(createdBy: string): Promise<PublicCatalogFacets> {
    const weightExpr = InventoryItemsRepository.WEIGHT_EXPR;
    const base = () =>
      this.repo
        .createQueryBuilder('item')
        .where('item.created_by = :createdBy', { createdBy })
        .andWhere('item.is_catalog_visible = true')
        .andWhere('item.status = :status', { status: 'AVAILABLE' });

    const [categories, metals, purities, ranges, sizes, hallmarked] = await Promise.all([
      base()
        .innerJoin('item.category', 'category')
        .select('category.id', 'id')
        .addSelect('category.name', 'name')
        .addSelect('COUNT(item.id)', 'count')
        .groupBy('category.id')
        .addGroupBy('category.name')
        .orderBy('category.name', 'ASC')
        .getRawMany<{ id: string; name: string; count: string }>(),
      base().select('DISTINCT item.metal_type', 'metal').getRawMany<{ metal: string }>(),
      base()
        .select('DISTINCT UPPER(TRIM(item.purity))', 'purity')
        .andWhere("COALESCE(TRIM(item.purity), '') <> ''")
        .getRawMany<{ purity: string }>(),
      base()
        .select(`MIN(NULLIF(${weightExpr}, 0))`, 'minWeight')
        .addSelect(`MAX(${weightExpr})`, 'maxWeight')
        .addSelect('MIN(NULLIF(item.selling_price, 0))', 'minPrice')
        .addSelect('MAX(item.selling_price)', 'maxPrice')
        .getRawOne<{
          minWeight: string | null;
          maxWeight: string | null;
          minPrice: string | null;
          maxPrice: string | null;
        }>(),
      base()
        .select('DISTINCT UPPER(TRIM(item.size))', 'size')
        .andWhere("COALESCE(TRIM(item.size), '') <> ''")
        .limit(60)
        .getRawMany<{ size: string }>(),
      base().andWhere('item.hallmarked = true').getCount(),
    ]);
    const num = (v?: string | null) => (v == null ? undefined : Number(v));
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, count: Number(c.count) })),
      metals: metals.map((m) => m.metal).filter(Boolean),
      purities: purities
        .map((p) => p.purity)
        .filter(Boolean)
        .sort(),
      // Numeric sizes (ring 12, 14…) in number order, then the rest alphabetically.
      sizes: sizes
        .map((s) => s.size)
        .filter(Boolean)
        .sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          if (Number.isFinite(na)) return -1;
          if (Number.isFinite(nb)) return 1;
          return a.localeCompare(b);
        }),
      hallmarkedCount: hallmarked,
      minWeight: num(ranges?.minWeight),
      maxWeight: num(ranges?.maxWeight),
      minPrice: num(ranges?.minPrice),
      maxPrice: num(ranges?.maxPrice),
    };
  }

  async bulkUpdateCatalogVisibility(ids: string[], createdBy: string, isCatalogVisible: boolean): Promise<number> {
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

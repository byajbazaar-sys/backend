import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { SalesBillEntity } from '../entities/sales-bill.entity';
import { SalesBillItemEntity } from '../entities/sales-bill-item.entity';
import { InventoryItemEntity } from '../entities/inventory-item.entity';
import {
  ISalesBillsRepository,
  SalesBill,
  SalesAnalytics,
  SalesBillsFilterOptions,
  SalesAnalyticsFilterOptions,
  ESalesBillSortField,
  EInventoryItemStatus,
} from '../../../application';

@Injectable()
export class SalesBillsRepository implements ISalesBillsRepository {
  constructor(
    @InjectRepository(SalesBillEntity)
    private readonly billsRepo: Repository<SalesBillEntity>,
    @InjectRepository(SalesBillItemEntity)
    private readonly itemsRepo: Repository<SalesBillItemEntity>,
  ) {}

  private mapBill(entity: SalesBillEntity): SalesBill {
    return plainToInstance(SalesBill, entity, { excludeExtraneousValues: true });
  }

  private buildQuery(filter: Omit<SalesBillsFilterOptions, 'pageNumber' | 'pageSize'>) {
    const qb = this.billsRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.items', 'items')
      .where('bill.createdBy = :createdBy', { createdBy: filter.createdBy });

    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      qb.andWhere(
        '(bill.billNumber ILIKE :term OR bill.customerName ILIKE :term OR bill.customerMobile ILIKE :term)',
        { term },
      );
    }
    if (filter.dateFrom) {
      qb.andWhere('bill.issuedAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }
    if (filter.dateTo) {
      qb.andWhere('bill.issuedAt <= :dateTo', { dateTo: filter.dateTo });
    }
    if (filter.paymentMode) {
      qb.andWhere('bill.paymentMode = :paymentMode', { paymentMode: filter.paymentMode });
    }
    if (filter.status) {
      qb.andWhere('bill.status = :status', { status: filter.status });
    }
    if (filter.customerId) {
      qb.andWhere('bill.customerId = :customerId', { customerId: filter.customerId });
    }

    const sortColumn =
      filter.sortField === ESalesBillSortField.GrandTotal ? 'bill.grandTotal' : 'bill.createdAt';
    const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    qb.orderBy(sortColumn, sortOrder as 'ASC' | 'DESC');

    return qb;
  }

  async create(data: SalesBill, markSoldInventoryIds: string[] = []): Promise<SalesBill> {
    const { items, ...billData } = data;

    return this.billsRepo.manager.transaction(async (manager) => {
      const billsRepo = manager.getRepository(SalesBillEntity);
      const itemsRepo = manager.getRepository(SalesBillItemEntity);
      const inventoryRepo = manager.getRepository(InventoryItemEntity);

      const entity = billsRepo.create(billData as Partial<SalesBillEntity>);
      const saved = await billsRepo.save(entity);

      if (items?.length) {
        const lineEntities = items.map((item) =>
          itemsRepo.create({ ...item, billId: saved.id } as Partial<SalesBillItemEntity>),
        );
        await itemsRepo.save(lineEntities);
      }

      if (markSoldInventoryIds.length) {
        await inventoryRepo.update(
          { id: In(markSoldInventoryIds) },
          { status: EInventoryItemStatus.Sold },
        );
      }

      const withItems = await billsRepo.findOne({
        where: { id: saved.id },
        relations: ['items'],
      });
      return this.mapBill(withItems!);
    });
  }

  async findById(id: string): Promise<SalesBill | null> {
    const entity = await this.billsRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!entity) return null;
    return this.mapBill(entity);
  }

  async findAll(params: SalesBillsFilterOptions): Promise<Paged<SalesBill>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const qb = this.buildQuery(params).skip(skip).take(pageSize);
    const [rows, totalCount] = await qb.getManyAndCount();
    return toPaged(SalesBill, {
      items: rows.map((e) => this.mapBill(e)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findByCustomerId(
    customerId: string,
    params: SalesBillsFilterOptions,
  ): Promise<Paged<SalesBill>> {
    return this.findAll({ ...params, customerId });
  }

  async getNextBillSequence(createdBy: string, year: number): Promise<number> {
    const prefix = `INV-${year}-`;
    const result = await this.billsRepo
      .createQueryBuilder('bill')
      .select('bill.billNumber', 'billNumber')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.billNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('bill.billNumber', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result?.billNumber) return 1;
    const seq = parseInt(String(result.billNumber).replace(prefix, ''), 10);
    return isNaN(seq) ? 1 : seq + 1;
  }

  async getAnalytics(params: SalesAnalyticsFilterOptions): Promise<SalesAnalytics> {
    const { createdBy, dateFrom, dateTo } = params;
    const billQb = this.billsRepo
      .createQueryBuilder('bill')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.status = :status', { status: 'COMPLETED' });

    if (dateFrom) billQb.andWhere('bill.issuedAt >= :dateFrom', { dateFrom });
    if (dateTo) billQb.andWhere('bill.issuedAt <= :dateTo', { dateTo });

    const summary = await billQb
      .clone()
      .select('COUNT(bill.id)', 'billCount')
      .addSelect('COALESCE(SUM(bill.grandTotal), 0)', 'revenue')
      .getRawOne();

    const billCount = parseInt(summary?.billCount ?? '0', 10);
    const revenue = parseFloat(summary?.revenue ?? '0');
    const avgBillValue = billCount > 0 ? Math.round((revenue / billCount) * 100) / 100 : 0;

    const dailyRows = await billQb
      .clone()
      .select("TO_CHAR(bill.issuedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(bill.id)', 'billCount')
      .addSelect('COALESCE(SUM(bill.grandTotal), 0)', 'revenue')
      .groupBy("TO_CHAR(bill.issuedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    const paymentRows = await billQb
      .clone()
      .select('bill.paymentMode', 'paymentMode')
      .addSelect('COUNT(bill.id)', 'count')
      .addSelect('COALESCE(SUM(bill.grandTotal), 0)', 'revenue')
      .groupBy('bill.paymentMode')
      .getRawMany();

    const itemQb = this.itemsRepo
      .createQueryBuilder('item')
      .innerJoin('item.bill', 'bill')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.status = :status', { status: 'COMPLETED' });

    if (dateFrom) itemQb.andWhere('bill.issuedAt >= :dateFrom', { dateFrom });
    if (dateTo) itemQb.andWhere('bill.issuedAt <= :dateTo', { dateTo });

    const topRows = await itemQb
      .clone()
      .select('item.sku', 'sku')
      .addSelect('item.itemName', 'itemName')
      .addSelect('item.metalType', 'metalType')
      .addSelect('SUM(item.quantity)', 'quantity')
      .addSelect('COALESCE(SUM(item.lineTotal), 0)', 'revenue')
      .groupBy('item.sku')
      .addGroupBy('item.itemName')
      .addGroupBy('item.metalType')
      .orderBy('revenue', 'DESC')
      .limit(10)
      .getRawMany();

    const metalRows = await itemQb
      .clone()
      .select("COALESCE(item.metalType, 'OTHER')", 'metalType')
      .addSelect('SUM(item.quantity)', 'quantity')
      .addSelect('COALESCE(SUM(item.lineTotal), 0)', 'revenue')
      .addSelect('COALESCE(SUM(item.netWeight), 0)', 'netWeight')
      .groupBy('item.metalType')
      .orderBy('revenue', 'DESC')
      .getRawMany();

    return {
      billCount,
      revenue,
      avgBillValue,
      dailySeries: dailyRows.map((r) => ({
        date: r.date,
        billCount: parseInt(r.billCount, 10),
        revenue: parseFloat(r.revenue),
      })),
      topItems: topRows.map((r) => ({
        sku: r.sku,
        itemName: r.itemName,
        metalType: r.metalType ?? undefined,
        quantity: parseInt(r.quantity, 10),
        revenue: parseFloat(r.revenue),
      })),
      byMetalType: metalRows.map((r) => ({
        metalType: r.metalType,
        quantity: parseInt(r.quantity, 10),
        revenue: parseFloat(r.revenue),
        netWeight: parseFloat(r.netWeight),
      })),
      byPaymentMode: paymentRows.map((r) => ({
        paymentMode: r.paymentMode,
        count: parseInt(r.count, 10),
        revenue: parseFloat(r.revenue),
      })),
    };
  }
}

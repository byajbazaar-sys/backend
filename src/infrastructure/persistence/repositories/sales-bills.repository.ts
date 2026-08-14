import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';

import {
  ISalesBillsRepository,
  SalesBill,
  SalesAnalytics,
  SalesBillsFilterOptions,
  SalesAnalyticsFilterOptions,
  ESalesBillSortField,
  EInventoryItemStatus,
  InventoryStockDeduction,
  BillLineUpdate,
  InventoryItemSale,
  UpdateSalesBillPatch,
} from '../../../application';
import { InventoryItemEntity } from '../entities/inventory-item.entity';
import { SalesBillItemEntity } from '../entities/sales-bill-item.entity';
import { SalesBillEntity } from '../entities/sales-bill.entity';

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
      qb.andWhere('(bill.billNumber ILIKE :term OR bill.customerName ILIKE :term OR bill.customerMobile ILIKE :term)', {
        term,
      });
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
    if (filter.documentType) {
      qb.andWhere('bill.documentType = :documentType', { documentType: filter.documentType });
    }
    if (filter.customerId) {
      qb.andWhere('bill.customerId = :customerId', { customerId: filter.customerId });
    }

    const sortColumn = filter.sortField === ESalesBillSortField.GrandTotal ? 'bill.grandTotal' : 'bill.createdAt';
    const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    qb.orderBy(sortColumn, sortOrder);

    return qb;
  }

  async create(data: SalesBill, stockDeductions: InventoryStockDeduction[] = []): Promise<SalesBill> {
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

      for (const deduction of stockDeductions) {
        const inv = await inventoryRepo.findOne({ where: { id: deduction.inventoryItemId } });
        if (!inv) continue;
        const currentStock = Number(inv.stockQuantity ?? 0);
        const nextStock = Math.max(0, currentStock - deduction.quantity);
        await inventoryRepo.update(deduction.inventoryItemId, {
          stockQuantity: nextStock,
          status: nextStock <= 0 ? EInventoryItemStatus.Sold : EInventoryItemStatus.Available,
        });
      }

      const withItems = await billsRepo.findOne({
        where: { id: saved.id },
        relations: ['items'],
      });
      return this.mapBill(withItems);
    });
  }

  async findById(id: string): Promise<SalesBill> {
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

  async findAllForExport(filter: Omit<SalesBillsFilterOptions, 'pageNumber' | 'pageSize'>): Promise<SalesBill[]> {
    const rows = await this.buildQuery(filter).getMany();
    return rows.map((e) => this.mapBill(e));
  }

  async findByCustomerId(customerId: string, params: SalesBillsFilterOptions): Promise<Paged<SalesBill>> {
    return this.findAll({ ...params, customerId });
  }

  async getNextBillSequence(createdBy: string, year: number, month: number, prefix: string): Promise<number> {
    const monthStr = String(month).padStart(2, '0');
    const billPrefix = `${prefix}-${year}-${monthStr}-`;
    const result = await this.billsRepo
      .createQueryBuilder('bill')
      .select('bill.billNumber', 'billNumber')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.billNumber LIKE :prefix', { prefix: `${billPrefix}%` })
      .orderBy('bill.billNumber', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result?.billNumber) return 1;
    const billNumber = String(result.billNumber);
    const seqPart = billNumber.slice(billPrefix.length);
    const seq = parseInt(seqPart, 10);
    return Number.isNaN(seq) ? 1 : seq + 1;
  }

  async updateBill(id: string, patch: UpdateSalesBillPatch, lineUpdates: BillLineUpdate[] = []): Promise<SalesBill> {
    return this.billsRepo.manager.transaction(async (manager) => {
      const billsRepo = manager.getRepository(SalesBillEntity);
      const itemsRepo = manager.getRepository(SalesBillItemEntity);

      const bill = await billsRepo.findOne({ where: { id }, relations: ['items'] });
      if (!bill) throw new Error('Bill not found');

      if (lineUpdates.length > 0) {
        const lineMap = new Map(bill.items.map((l) => [l.id, l]));
        for (const update of lineUpdates) {
          const line = lineMap.get(update.id);
          if (!line) throw new Error(`Line item ${update.id} not found on bill`);

          if (update.itemName != null) line.itemName = update.itemName;
          if (update.sellingPrice != null) line.sellingPrice = update.sellingPrice;
          if (update.makingCharges != null) line.makingCharges = update.makingCharges;
          if (update.quantity != null) line.quantity = update.quantity;

          const qty = Number(line.quantity) || 1;
          const price = Number(line.sellingPrice) || 0;
          line.lineTotal = update.lineTotal ?? Math.round(price * qty * 100) / 100;
          if (update.purchaseCost != null) line.purchaseCost = update.purchaseCost;
          if (update.profitAmount != null) line.profitAmount = update.profitAmount;
          await itemsRepo.save(line);
        }
      }

      await billsRepo.update(id, patch as Partial<SalesBillEntity>);

      const updated = await billsRepo.findOne({ where: { id }, relations: ['items'] });
      if (!updated) throw new Error('Bill not found after update');
      return this.mapBill(updated);
    });
  }

  async deleteBill(id: string, restoreStock: boolean): Promise<void> {
    await this.billsRepo.manager.transaction(async (manager) => {
      const billsRepo = manager.getRepository(SalesBillEntity);
      const inventoryRepo = manager.getRepository(InventoryItemEntity);

      const bill = await billsRepo.findOne({ where: { id }, relations: ['items'] });
      if (!bill) throw new Error('Bill not found');

      if (restoreStock) {
        for (const line of bill.items ?? []) {
          if (!line.inventoryItemId) continue;
          const qty = Number(line.quantity) || 0;
          if (qty <= 0) continue;

          const inv = await inventoryRepo.findOne({ where: { id: line.inventoryItemId } });
          if (!inv) continue;

          const nextStock = Number(inv.stockQuantity ?? 0) + qty;
          await inventoryRepo.update(line.inventoryItemId, {
            stockQuantity: nextStock,
            status: EInventoryItemStatus.Available,
          });
        }
      }

      await billsRepo.delete(id);
    });
  }

  async getAnalytics(params: SalesAnalyticsFilterOptions): Promise<SalesAnalytics> {
    const { createdBy, dateFrom, dateTo } = params;
    const billQb = this.billsRepo
      .createQueryBuilder('bill')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.status = :status', { status: 'COMPLETED' });

    if (dateFrom) billQb.andWhere('bill.issuedAt >= :dateFrom', { dateFrom });
    if (dateTo) billQb.andWhere('bill.issuedAt <= :dateTo', { dateTo });
    if (params.documentType) {
      billQb.andWhere('bill.documentType = :documentType', { documentType: params.documentType });
    }

    const summary = await billQb
      .clone()
      .select('COUNT(bill.id)', 'billCount')
      .addSelect('COALESCE(SUM(bill.grandTotal), 0)', 'revenue')
      .addSelect('COALESCE(SUM(bill.totalPurchaseCost), 0)', 'totalPurchaseCost')
      .addSelect('COALESCE(SUM(bill.totalProfit), 0)', 'totalProfit')
      .getRawOne();

    const billCount = parseInt(summary?.billCount ?? '0', 10);
    const revenue = parseFloat(summary?.revenue ?? '0');
    const totalPurchaseCost = parseFloat(summary?.totalPurchaseCost ?? '0');
    const totalProfit = parseFloat(summary?.totalProfit ?? '0');
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

    const documentTypeRows = await billQb
      .clone()
      .select('bill.documentType', 'documentType')
      .addSelect('COUNT(bill.id)', 'count')
      .addSelect('COALESCE(SUM(bill.grandTotal), 0)', 'revenue')
      .groupBy('bill.documentType')
      .getRawMany();

    const itemQb = this.itemsRepo
      .createQueryBuilder('item')
      .innerJoin('item.bill', 'bill')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.status = :status', { status: 'COMPLETED' });

    if (dateFrom) itemQb.andWhere('bill.issuedAt >= :dateFrom', { dateFrom });
    if (dateTo) itemQb.andWhere('bill.issuedAt <= :dateTo', { dateTo });
    if (params.documentType) {
      itemQb.andWhere('bill.documentType = :documentType', { documentType: params.documentType });
    }

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
      totalPurchaseCost,
      totalProfit,
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
      byDocumentType: documentTypeRows.map((r) => ({
        documentType: r.documentType,
        count: parseInt(r.count, 10),
        revenue: parseFloat(r.revenue),
      })),
    };
  }

  async findSalesByInventoryItemId(inventoryItemId: string, createdBy: string): Promise<InventoryItemSale[]> {
    const rows = await this.itemsRepo
      .createQueryBuilder('item')
      .innerJoinAndSelect('item.bill', 'bill')
      .where('item.inventoryItemId = :inventoryItemId', { inventoryItemId })
      .andWhere('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.status = :status', { status: 'COMPLETED' })
      .orderBy('bill.issuedAt', 'DESC')
      .getMany();

    return rows.map((item) =>
      plainToInstance(
        InventoryItemSale,
        {
          lineItemId: item.id,
          billId: item.billId,
          billNumber: item.bill.billNumber,
          issuedAt: item.bill.issuedAt,
          quantity: item.quantity,
          sellingPrice: Number(item.sellingPrice),
          lineTotal: Number(item.lineTotal),
          purchaseCost: Number(item.purchaseCost),
          profitAmount: Number(item.profitAmount),
        },
        { excludeExtraneousValues: true },
      ),
    );
  }
}

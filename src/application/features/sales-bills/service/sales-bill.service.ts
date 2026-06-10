import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Paged } from '@shared-libs';
import { EInventoryItemStatus } from '../../inventory/enums';
import { IInventoryItemsRepository, INVENTORY_ITEMS_REPOSITORY } from '../../inventory/service';
import { SalesBill, SalesBillLineItem, SalesAnalytics } from '../domain';
import { EBillStatus, EPaymentMode, ESalesBillSortField, ESalesBillSortOrder } from '../enums';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel } from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';
import { ISalesBillService } from './i-sales-bill.service';
import { ISalesBillsRepository, SALES_BILLS_REPOSITORY } from './i-sales-bills.repository';

@Injectable()
export class SalesBillService implements ISalesBillService {
  constructor(
    @Inject(SALES_BILLS_REPOSITORY) private readonly billsRepo: ISalesBillsRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly inventoryItemsRepo: IInventoryItemsRepository,
    @InjectPinoLogger(SalesBillService.name) private readonly logger: PinoLogger,
  ) {}

  private async generateBillNumber(createdBy: string): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.billsRepo.getNextBillSequence(createdBy, year);
    return `INV-${year}-${String(seq).padStart(5, '0')}`;
  }

  private mapListQuery(userId: string, query: ListSalesBillsQueryModel): SalesBillsFilterOptions {
    return {
      createdBy: userId,
      search: query.search,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      paymentMode: query.paymentMode,
      status: query.status,
      customerId: query.customerId,
      sortField: (query.sortField as ESalesBillSortField) ?? ESalesBillSortField.CreatedAt,
      sortOrder: (query.sortOrder as ESalesBillSortOrder) ?? ESalesBillSortOrder.Desc,
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
    };
  }

  private async resolveInventoryItemsForSale(
    lineItems: SalesBillLineItem[],
    userId: string,
    billStatus: EBillStatus,
  ): Promise<string[]> {
    if (billStatus !== EBillStatus.Completed) return [];

    const linkedIds = lineItems
      .map((line) => line.inventoryItemId)
      .filter((id): id is string => !!id);

    const uniqueIds = [...new Set(linkedIds)];
    if (uniqueIds.length !== linkedIds.length) {
      throw new BadRequestException('Each inventory item can only appear once per bill');
    }

    for (const line of lineItems) {
      if (line.inventoryItemId && line.quantity !== 1) {
        throw new BadRequestException('Linked inventory items must have quantity 1');
      }
    }

    for (const id of uniqueIds) {
      const item = await this.inventoryItemsRepo.findById(id);
      if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
      if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
      if (item.status !== EInventoryItemStatus.Available) {
        throw new ConflictException(`Item ${item.sku} is not available for sale`);
      }
    }

    return uniqueIds;
  }

  async create(data: CreateSalesBillRequestModel, userId: string): Promise<SalesBill> {
    const lineItems: SalesBillLineItem[] = data.items.map((item) => {
      const lineTotal = Number(item.sellingPrice) * item.quantity;
      return {
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName,
        sku: item.sku,
        barcode: item.barcode,
        metalType: item.metalType,
        purity: item.purity,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        makingCharges: item.makingCharges ?? 0,
        sellingPrice: item.sellingPrice,
        quantity: item.quantity,
        lineTotal,
      };
    });

    const subtotal = lineItems.reduce((sum, l) => sum + Number(l.lineTotal), 0);
    const discount = Number(data.discount ?? 0);
    const taxAmount = Number(data.taxAmount ?? 0);
    const grandTotal = Math.max(0, subtotal - discount + taxAmount);
    const status = data.status ?? EBillStatus.Completed;

    const markSoldIds = await this.resolveInventoryItemsForSale(lineItems, userId, status);

    const bill: SalesBill = {
      billNumber: await this.generateBillNumber(userId),
      customerName: data.customerName?.trim() || 'Walk-in',
      customerMobile: data.customerMobile?.trim() || undefined,
      customerId: data.customerId,
      subtotal,
      discount,
      taxAmount,
      grandTotal,
      paymentMode: data.paymentMode ?? EPaymentMode.Cash,
      status,
      issuedAt: new Date(),
      createdBy: userId,
      items: lineItems,
    };

    const created = await this.billsRepo.create(bill, markSoldIds);
    this.logger.info(
      { billId: created.id, billNumber: created.billNumber, soldItems: markSoldIds.length },
      'Sales bill created',
    );
    return created;
  }

  async getById(id: string, userId: string): Promise<SalesBill> {
    const bill = await this.billsRepo.findById(id);
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.createdBy !== userId) throw new ForbiddenException('Access denied');
    return bill;
  }

  async list(userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>> {
    return this.billsRepo.findAll(this.mapListQuery(userId, query));
  }

  async listByCustomer(
    customerId: string,
    userId: string,
    query: ListSalesBillsQueryModel,
  ): Promise<Paged<SalesBill>> {
    return this.billsRepo.findByCustomerId(customerId, {
      ...this.mapListQuery(userId, query),
      customerId,
    });
  }

  async getAnalytics(userId: string, dateFrom?: string, dateTo?: string): Promise<SalesAnalytics> {
    const params: SalesAnalyticsFilterOptions = { createdBy: userId };

    if (!dateFrom && !dateTo) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      params.dateFrom = start;
      params.dateTo = end;
    } else {
      if (dateFrom) params.dateFrom = new Date(dateFrom);
      if (dateTo) params.dateTo = new Date(dateTo);
    }

    return this.billsRepo.getAnalytics(params);
  }
}

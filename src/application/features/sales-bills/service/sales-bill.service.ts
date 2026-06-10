import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Paged } from '@shared-libs';
import { SalesBill, SalesBillLineItem, SalesAnalytics } from '../domain';
import { EBillStatus, EPaymentMode, ESalesBillSortField, ESalesBillSortOrder } from '../enums';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel } from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';
import { ISalesBillService } from './i-sales-bill.service';
import { ISalesBillsRepository, SALES_BILLS_REPOSITORY } from './i-sales-bills.repository';

const INVENTORY_ITEM_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class SalesBillService implements ISalesBillService {
  constructor(
    @Inject(SALES_BILLS_REPOSITORY) private readonly billsRepo: ISalesBillsRepository,
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

  async create(data: CreateSalesBillRequestModel, userId: string): Promise<SalesBill> {
    const lineItems: SalesBillLineItem[] = data.items.map((item) => {
      const lineTotal = Number(item.sellingPrice) * item.quantity;
      const inventoryItemId =
        item.inventoryItemId && INVENTORY_ITEM_UUID_RE.test(item.inventoryItemId)
          ? item.inventoryItemId
          : undefined;
      return {
        inventoryItemId,
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
      status: data.status ?? EBillStatus.Completed,
      issuedAt: new Date(),
      createdBy: userId,
      items: lineItems,
    };

    const created = await this.billsRepo.create(bill);
    this.logger.info({ billId: created.id, billNumber: created.billNumber }, 'Sales bill created');
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

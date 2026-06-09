import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Paged } from '@shared-libs';
import { SALES_BILLS_REPOSITORY, ISalesBillsRepository } from '../../../shared/repository/i-sales-bills.repository';
import { SalesBill, SalesBillLineItem } from '../domain';
import { EBillStatus, EPaymentMode } from '../enums';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel } from '../models';
import { ISalesBillService } from './i-sales-bill.service';

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

  private mapQuery(userId: string, query: ListSalesBillsQueryModel) {
    return {
      createdBy: userId,
      search: query.search,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      paymentMode: query.paymentMode,
      status: query.status,
      customerId: query.customerId,
      sortField: query.sortField ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };
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

    let customerId = data.customerId;
    let customerName = data.customerName?.trim() || 'Walk-in';
    const customerMobile = data.customerMobile?.trim() || undefined;

    const bill: SalesBill = {
      billNumber: await this.generateBillNumber(userId),
      customerName,
      customerMobile,
      customerId,
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
    return this.billsRepo.findAll(this.mapQuery(userId, query), {
      pageNumber: query.pageNumber ?? 0,
      pageSize: query.pageSize ?? 20,
    });
  }

  async listByCustomer(
    customerId: string,
    userId: string,
    query: ListSalesBillsQueryModel,
  ): Promise<Paged<SalesBill>> {
    return this.billsRepo.findByCustomerId(userId, customerId, {
      pageNumber: query.pageNumber ?? 0,
      pageSize: query.pageSize ?? 20,
    });
  }
}

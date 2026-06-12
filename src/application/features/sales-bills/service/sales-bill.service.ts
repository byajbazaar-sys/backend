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
import {
  IInventoryCategoriesRepository,
  INVENTORY_CATEGORIES_REPOSITORY,
} from '../../inventory/service/i-inventory-categories.repository';
import { SalesBill, SalesBillLineItem, SalesAnalytics } from '../domain';
import { EBillStatus, EPaymentMode, ESalesBillSortField, ESalesBillSortOrder } from '../enums';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel } from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';
import { ISalesBillService } from './i-sales-bill.service';
import {
  ISalesBillsRepository,
  InventoryStockDeduction,
  SALES_BILLS_REPOSITORY,
} from './i-sales-bills.repository';

const DEFAULT_CGST_RATE = 1.5;
const DEFAULT_SGST_RATE = 1.5;

@Injectable()
export class SalesBillService implements ISalesBillService {
  constructor(
    @Inject(SALES_BILLS_REPOSITORY) private readonly billsRepo: ISalesBillsRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly inventoryItemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY)
    private readonly categoriesRepo: IInventoryCategoriesRepository,
    @InjectPinoLogger(SalesBillService.name) private readonly logger: PinoLogger,
  ) {}

  private async generateBillNumber(createdBy: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const seq = await this.billsRepo.getNextBillSequence(createdBy, year, month);
    return `INV-${year}-${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
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

  private async resolveInventoryStockDeductions(
    lineItems: SalesBillLineItem[],
    userId: string,
    billStatus: EBillStatus,
  ): Promise<InventoryStockDeduction[]> {
    if (billStatus !== EBillStatus.Completed) return [];

    const linkedLines = lineItems.filter((line) => line.inventoryItemId);
    const linkedIds = linkedLines.map((line) => line.inventoryItemId!);

    const uniqueIds = [...new Set(linkedIds)];
    if (uniqueIds.length !== linkedIds.length) {
      throw new BadRequestException('Each inventory item can only appear once per bill');
    }

    const deductions: InventoryStockDeduction[] = [];

    for (const line of linkedLines) {
      const id = line.inventoryItemId!;
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        throw new BadRequestException('Linked inventory items must have quantity of at least 1');
      }

      const item = await this.inventoryItemsRepo.findById(id);
      if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
      if (item.createdBy !== userId) throw new ForbiddenException('Access denied');
      if (item.status !== EInventoryItemStatus.Available) {
        throw new ConflictException(`Item ${item.sku} is not available for sale`);
      }

      const availableStock = Number(item.stockQuantity ?? 0);
      if (availableStock < qty) {
        throw new ConflictException(
          `Insufficient stock for ${item.sku}. Available: ${availableStock}, requested: ${qty}`,
        );
      }

      deductions.push({ inventoryItemId: id, quantity: qty });
    }

    return deductions;
  }

  private computeGstTotals(subtotal: number, discount: number) {
    const taxable = Math.max(0, subtotal - discount);
    const cgstRate = DEFAULT_CGST_RATE;
    const sgstRate = DEFAULT_SGST_RATE;
    const cgstAmount = Math.round(taxable * (cgstRate / 100) * 100) / 100;
    const sgstAmount = Math.round(taxable * (sgstRate / 100) * 100) / 100;
    const totalWithTax = taxable + cgstAmount + sgstAmount;
    const grandTotal = Math.round(totalWithTax);
    const roundOff = Math.round((grandTotal - totalWithTax) * 100) / 100;
    return {
      cgstRate,
      sgstRate,
      cgstAmount,
      sgstAmount,
      taxAmount: cgstAmount + sgstAmount,
      roundOff,
      grandTotal,
    };
  }

  private async resolveLineItemExtras(
    item: CreateSalesBillRequestModel['items'][number],
  ): Promise<Pick<SalesBillLineItem, 'hsnCode' | 'huid' | 'lessWeight'>> {
    let hsnCode: string | undefined;
    let huid: string | undefined;

    if (item.inventoryItemId) {
      const inv = await this.inventoryItemsRepo.findById(item.inventoryItemId);
      if (inv) {
        if (inv.categoryId) {
          const category = await this.categoriesRepo.findById(inv.categoryId);
          const code = category?.hsnCode?.trim();
          if (code) hsnCode = code;
        }
        const invHuid = inv.huid?.trim();
        if (invHuid) huid = invHuid;
      }
    }

    const gross = item.grossWeight != null ? Number(item.grossWeight) : undefined;
    const net = item.netWeight != null ? Number(item.netWeight) : undefined;
    const lessWeight =
      gross != null && net != null && gross >= net ? Math.round((gross - net) * 1000) / 1000 : undefined;

    return { hsnCode, huid, lessWeight };
  }

  async create(data: CreateSalesBillRequestModel, userId: string): Promise<SalesBill> {
    const lineItems: SalesBillLineItem[] = [];
    for (const item of data.items) {
      const extras = await this.resolveLineItemExtras(item);
      const lineTotal = Number(item.sellingPrice) * item.quantity;
      lineItems.push({
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName,
        sku: item.sku,
        barcode: item.barcode,
        metalType: item.metalType,
        purity: item.purity,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        lessWeight: extras.lessWeight,
        hsnCode: extras.hsnCode,
        huid: extras.huid,
        makingCharges: item.makingCharges ?? 0,
        sellingPrice: item.sellingPrice,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const subtotal = lineItems.reduce((sum, l) => sum + Number(l.lineTotal), 0);
    const discount = Number(data.discount ?? 0);
    const gst = this.computeGstTotals(subtotal, discount);
    const status = data.status ?? EBillStatus.Completed;

    const stockDeductions = await this.resolveInventoryStockDeductions(lineItems, userId, status);

    const bill: SalesBill = {
      billNumber: await this.generateBillNumber(userId),
      customerName: data.customerName?.trim() || 'Walk-in',
      customerMobile: data.customerMobile?.trim() || undefined,
      customerId: data.customerId,
      customerAddress: data.customerAddress?.trim() || undefined,
      customerState: data.customerState?.trim() || undefined,
      customerStateCode: data.customerStateCode?.trim() || undefined,
      customerGstin: data.customerGstin?.trim() || undefined,
      customerPan: data.customerPan?.trim() || undefined,
      customerPropName: data.customerPropName?.trim() || undefined,
      subtotal,
      discount,
      taxAmount: gst.taxAmount,
      cgstRate: gst.cgstRate,
      sgstRate: gst.sgstRate,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      roundOff: gst.roundOff,
      goldRate24k: data.goldRate24k,
      metalRates: data.metalRates,
      grandTotal: gst.grandTotal,
      paymentMode: data.paymentMode ?? EPaymentMode.Cash,
      status,
      issuedAt: new Date(),
      createdBy: userId,
      items: lineItems,
    };

    const created = await this.billsRepo.create(bill, stockDeductions);
    this.logger.info(
      {
        billId: created.id,
        billNumber: created.billNumber,
        stockLines: stockDeductions.length,
      },
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

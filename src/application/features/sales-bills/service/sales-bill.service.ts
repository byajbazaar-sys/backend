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
import { EBillStatus, EPaymentMode, ESalesBillSortField, ESalesBillSortOrder, EDocumentType, BILL_NUMBER_PREFIX } from '../enums';
import { CreateSalesBillRequestModel, ListSalesBillsQueryModel, UpdateSalesBillRequestModel } from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';
import { ISalesBillService } from './i-sales-bill.service';
import {
  ISalesBillsRepository,
  InventoryStockDeduction,
  BillLineUpdate,
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

  private async generateBillNumber(createdBy: string, documentType: EDocumentType): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prefix = BILL_NUMBER_PREFIX[documentType];
    const seq = await this.billsRepo.getNextBillSequence(createdBy, year, month, prefix);
    return `${prefix}-${year}-${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
  }

  private computeInformalTotals(subtotal: number, discount: number) {
    const taxable = Math.max(0, subtotal - discount);
    const grandTotal = Math.round(taxable);
    return {
      cgstRate: 0,
      sgstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      taxAmount: 0,
      roundOff: Math.round((grandTotal - taxable) * 100) / 100,
      grandTotal,
    };
  }

  private mapListQuery(userId: string, query: ListSalesBillsQueryModel): SalesBillsFilterOptions {
    return {
      createdBy: userId,
      search: query.search,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      paymentMode: query.paymentMode,
      status: query.status,
      documentType: query.documentType as EDocumentType | undefined,
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
    const documentType = data.documentType ?? EDocumentType.NormalBill;
    const totals =
      documentType === EDocumentType.InformalBill
        ? this.computeInformalTotals(subtotal, discount)
        : this.computeGstTotals(subtotal, discount);
    const status = data.status ?? EBillStatus.Completed;

    const stockDeductions = await this.resolveInventoryStockDeductions(lineItems, userId, status);

    const customerName =
      data.customerName?.trim() ||
      (documentType === EDocumentType.InformalBill ? '' : 'Walk-in');

    const bill: SalesBill = {
      billNumber: await this.generateBillNumber(userId, documentType),
      documentType,
      customerName,
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
      taxAmount: totals.taxAmount,
      cgstRate: totals.cgstRate,
      sgstRate: totals.sgstRate,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      roundOff: totals.roundOff,
      goldRate24k: data.goldRate24k,
      metalRates: data.metalRates,
      grandTotal: totals.grandTotal,
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
        documentType: created.documentType,
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

  async getAnalytics(
    userId: string,
    dateFrom?: string,
    dateTo?: string,
    documentType?: string,
  ): Promise<SalesAnalytics> {
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

    if (documentType && Object.values(EDocumentType).includes(documentType as EDocumentType)) {
      params.documentType = documentType as EDocumentType;
    }

    return this.billsRepo.getAnalytics(params);
  }

  async convertToNormalBill(id: string, userId: string): Promise<SalesBill> {
    const bill = await this.getById(id, userId);
    if (bill.documentType !== EDocumentType.InformalBill) {
      throw new BadRequestException('Only informal bills can be converted to a normal bill');
    }
    if (bill.status !== EBillStatus.Completed) {
      throw new BadRequestException('Only completed bills can be converted');
    }

    const gst = this.computeGstTotals(Number(bill.subtotal), Number(bill.discount ?? 0));
    const billNumber = await this.generateBillNumber(userId, EDocumentType.NormalBill);

    const updated = await this.billsRepo.updateBill(id, {
      documentType: EDocumentType.NormalBill,
      billNumber,
      taxAmount: gst.taxAmount,
      cgstRate: gst.cgstRate,
      sgstRate: gst.sgstRate,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      roundOff: gst.roundOff,
      grandTotal: gst.grandTotal,
    });

    this.logger.info(
      { billId: id, oldNumber: bill.billNumber, newNumber: billNumber },
      'Informal bill converted to normal bill',
    );

    return updated;
  }

  async update(id: string, data: UpdateSalesBillRequestModel, userId: string): Promise<SalesBill> {
    const bill = await this.getById(id, userId);

    const lineUpdates: BillLineUpdate[] =
      data.items?.map((item) => ({
        id: item.id,
        itemName: item.itemName,
        sellingPrice: item.sellingPrice,
        makingCharges: item.makingCharges,
        quantity: item.quantity,
      })) ?? [];

    const billLineIds = new Set((bill.items ?? []).map((l) => l.id));
    for (const update of lineUpdates) {
      if (!billLineIds.has(update.id)) {
        throw new BadRequestException(`Line item ${update.id} not found on this bill`);
      }
    }

    const subtotal = (bill.items ?? []).reduce((sum, line) => {
      const patch = lineUpdates.find((u) => u.id === line.id);
      const qty = patch?.quantity ?? Number(line.quantity);
      const price = patch?.sellingPrice ?? Number(line.sellingPrice);
      return sum + Math.round(price * qty * 100) / 100;
    }, 0);

    const discount = data.discount != null ? Number(data.discount) : Number(bill.discount ?? 0);
    if (discount > subtotal) {
      throw new BadRequestException('Discount cannot exceed subtotal');
    }

    const totals =
      bill.documentType === EDocumentType.InformalBill
        ? this.computeInformalTotals(subtotal, discount)
        : this.computeGstTotals(subtotal, discount);

    const patch: Partial<SalesBill> = {
      subtotal,
      discount,
      taxAmount: totals.taxAmount,
      cgstRate: totals.cgstRate,
      sgstRate: totals.sgstRate,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
    };

    if (data.customerName !== undefined) {
      patch.customerName =
        data.customerName.trim() ||
        (bill.documentType === EDocumentType.InformalBill ? '' : 'Walk-in');
    }
    if (data.customerMobile !== undefined) {
      patch.customerMobile = data.customerMobile.trim() || undefined;
    }
    if (data.customerAddress !== undefined) {
      patch.customerAddress = data.customerAddress.trim() || undefined;
    }
    if (data.customerState !== undefined) {
      patch.customerState = data.customerState.trim() || undefined;
    }
    if (data.customerStateCode !== undefined) {
      patch.customerStateCode = data.customerStateCode.trim() || undefined;
    }
    if (data.customerGstin !== undefined) {
      patch.customerGstin = data.customerGstin.trim() || undefined;
    }
    if (data.customerPan !== undefined) {
      patch.customerPan = data.customerPan.trim() || undefined;
    }
    if (data.customerPropName !== undefined) {
      patch.customerPropName = data.customerPropName.trim() || undefined;
    }
    if (data.paymentMode !== undefined) patch.paymentMode = data.paymentMode;
    if (data.status !== undefined) patch.status = data.status;

    const updated = await this.billsRepo.updateBill(id, patch, lineUpdates);

    this.logger.info({ billId: id, billNumber: updated.billNumber }, 'Sales bill updated');
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const bill = await this.getById(id, userId);
    const restoreStock = bill.status === EBillStatus.Completed;
    await this.billsRepo.deleteBill(id, restoreStock);
    this.logger.info(
      { billId: id, billNumber: bill.billNumber, restoreStock },
      'Sales bill deleted',
    );
  }
}

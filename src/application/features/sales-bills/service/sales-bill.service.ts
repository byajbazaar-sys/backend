import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Paged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { BulkDeleteResult, CACHE_NAMESPACE, CACHE_SERVICE, ICacheService } from '../../../shared';

import { EInventoryItemStatus } from '../../inventory/enums';
import {
  IInventoryCategoriesRepository,
  INVENTORY_CATEGORIES_REPOSITORY,
} from '../../inventory/service/i-inventory-categories.repository';
import {
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from '../../inventory/service/i-inventory-items.repository';
import { SalesBill, SalesBillLineItem, SalesAnalytics, GstCsvExportResult } from '../domain';
import {
  EBillStatus,
  EPaymentMode,
  ESalesBillSortField,
  ESalesBillSortOrder,
  EDocumentType,
  BILL_NUMBER_PREFIX,
} from '../enums';
import {
  CreateSalesBillRequestModel,
  ListSalesBillsQueryModel,
  UpdateSalesBillRequestModel,
  UpdateSalesBillPatch,
} from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';
import { BillLineUpdate } from './bill-line-update';
import { ISalesBillService } from './i-sales-bill.service';
import { ISalesBillsRepository, SALES_BILLS_REPOSITORY } from './i-sales-bills.repository';
import { InventoryStockDeduction } from './inventory-stock-deduction';
import { toGstExportCsv } from '../utils/gst-export.util';
import {
  computeUnitPurchaseCost,
  computeLineProfit,
  recalcLineProfitFromExisting,
} from '../utils/purchase-profit.util';

const DEFAULT_CGST_RATE = 1.5;
const DEFAULT_SGST_RATE = 1.5;

@Injectable()
export class SalesBillService implements ISalesBillService {
  constructor(
    @Inject(SALES_BILLS_REPOSITORY) private readonly billsRepo: ISalesBillsRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly inventoryItemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY)
    private readonly categoriesRepo: IInventoryCategoriesRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
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
      documentType: query.documentType,
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
    const linkedIds = linkedLines.map((line) => line.inventoryItemId);

    const uniqueIds = [...new Set(linkedIds)];
    if (uniqueIds.length !== linkedIds.length) {
      throw new BadRequestException('Each inventory item can only appear once per bill');
    }

    const deductions: InventoryStockDeduction[] = [];

    for (const line of linkedLines) {
      const id = line.inventoryItemId;
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

  private async resolveLineHsnHuid(
    item: CreateSalesBillRequestModel['items'][number],
  ): Promise<Pick<SalesBillLineItem, 'hsnCode' | 'huid'>> {
    let hsnCode = item.hsnCode?.trim() || undefined;
    let huid: string;

    if (item.inventoryItemId) {
      const inv = await this.inventoryItemsRepo.findById(item.inventoryItemId);
      if (inv) {
        if (!hsnCode && inv.categoryId) {
          const category = await this.categoriesRepo.findById(inv.categoryId);
          const code = category?.hsnCode?.trim();
          if (code) hsnCode = code;
        }
        const invHuid = inv.huid?.trim();
        if (invHuid) huid = invHuid;
      }
    }

    return { hsnCode, huid };
  }

  private resolveBillLineWeights(
    item: CreateSalesBillRequestModel['items'][number],
  ): Pick<SalesBillLineItem, 'grossWeight' | 'netWeight' | 'lessWeight'> {
    const gross = item.grossWeight != null ? Number(item.grossWeight) : undefined;
    const net = item.netWeight != null ? Number(item.netWeight) : undefined;
    let less = item.lessWeight != null ? Number(item.lessWeight) : undefined;

    if (less == null && gross != null && net != null && gross >= net) {
      less = Math.round((gross - net) * 1000) / 1000;
    }

    return { grossWeight: gross, netWeight: net, lessWeight: less };
  }

  private async resolveLinePurchaseSnapshot(
    item: CreateSalesBillRequestModel['items'][number],
    lineTotal: number,
  ): Promise<Pick<SalesBillLineItem, 'purchaseRatePerGram' | 'purchaseCost' | 'profitAmount'>> {
    let purchaseRatePerGram: number;
    const netWeight = item.netWeight != null ? Number(item.netWeight) : undefined;
    const makingCharges = item.makingCharges != null ? Number(item.makingCharges) : 0;
    let purchasePrice: number;

    if (item.inventoryItemId) {
      const inv = await this.inventoryItemsRepo.findById(item.inventoryItemId);
      if (inv) {
        const rate = Number(inv.purchaseRatePerGram);
        if (rate > 0) purchaseRatePerGram = rate;
        const price = Number(inv.purchasePrice);
        if (price > 0) purchasePrice = price;
      }
    }

    const unitCost = computeUnitPurchaseCost({
      purchaseRatePerGram,
      netWeight,
      makingCharges,
      purchasePrice,
    });
    const { purchaseCost, profitAmount } = computeLineProfit(lineTotal, unitCost, item.quantity);

    return {
      purchaseRatePerGram: purchaseRatePerGram && purchaseRatePerGram > 0 ? purchaseRatePerGram : undefined,
      purchaseCost,
      profitAmount,
    };
  }

  async create(data: CreateSalesBillRequestModel, userId: string): Promise<SalesBill> {
    const lineItems: SalesBillLineItem[] = [];
    for (const item of data.items) {
      const hsnHuid = await this.resolveLineHsnHuid(item);
      const weights = this.resolveBillLineWeights(item);
      const lineTotal = Math.round(Number(item.sellingPrice) * item.quantity * 100) / 100;
      const purchase = await this.resolveLinePurchaseSnapshot(item, lineTotal);
      lineItems.push({
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName,
        sku: item.sku,
        barcode: item.barcode,
        metalType: item.metalType,
        purity: item.purity,
        grossWeight: weights.grossWeight,
        netWeight: weights.netWeight,
        lessWeight: weights.lessWeight,
        hsnCode: hsnHuid.hsnCode,
        huid: hsnHuid.huid,
        makingCharges: item.makingCharges ?? 0,
        sellingPrice: item.sellingPrice,
        quantity: item.quantity,
        lineTotal,
        purchaseRatePerGram: purchase.purchaseRatePerGram,
        purchaseCost: purchase.purchaseCost,
        profitAmount: purchase.profitAmount,
      });
    }

    const totalPurchaseCost = lineItems.reduce((sum, l) => sum + Number(l.purchaseCost ?? 0), 0);
    const totalProfit = lineItems.reduce((sum, l) => sum + Number(l.profitAmount ?? 0), 0);

    const subtotal = lineItems.reduce((sum, l) => sum + Number(l.lineTotal), 0);
    const discount = Number(data.discount ?? 0);
    const documentType = data.documentType ?? EDocumentType.NormalBill;
    const totals =
      documentType === EDocumentType.InformalBill
        ? this.computeInformalTotals(subtotal, discount)
        : this.computeGstTotals(subtotal, discount);
    const status = data.status ?? EBillStatus.Completed;

    const stockDeductions = await this.resolveInventoryStockDeductions(lineItems, userId, status);

    const customerName = data.customerName?.trim() || (documentType === EDocumentType.InformalBill ? '' : 'Walk-in');

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
      amountReceived:
        data.amountReceived != null && Number(data.amountReceived) >= 0
          ? Math.round(Number(data.amountReceived) * 100) / 100
          : undefined,
      depositApplied:
        data.depositApplied != null && Number(data.depositApplied) > 0
          ? Math.round(Number(data.depositApplied) * 100) / 100
          : 0,
      totalPurchaseCost: Math.round(totalPurchaseCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
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
    if (stockDeductions.length > 0) {
      await this.invalidateInventoryReportsCache(userId);
    }
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

  async exportGstCsv(userId: string, query: ListSalesBillsQueryModel): Promise<GstCsvExportResult> {
    const filter = this.mapListQuery(userId, query);
    const { pageNumber: _pageNumber, pageSize: _pageSize, ...exportFilter } = filter;
    const bills = await this.billsRepo.findAllForExport(exportFilter);
    const csv = toGstExportCsv(bills);
    const filename = `GST_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    return plainToInstance(
      GstCsvExportResult,
      { buffer: Buffer.from(csv, 'utf-8'), filename },
      { excludeExtraneousValues: true },
    );
  }

  async listByCustomer(customerId: string, userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>> {
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

    const lineUpdates: BillLineUpdate[] = [];
    let totalPurchaseCost = Number(bill.totalPurchaseCost ?? 0);
    let totalProfit = Number(bill.totalProfit ?? 0);

    if (data.items?.length) {
      totalPurchaseCost = 0;
      totalProfit = 0;
      const billLineIds = new Set((bill.items ?? []).map((l) => l.id));
      for (const patch of data.items) {
        if (!billLineIds.has(patch.id)) {
          throw new BadRequestException(`Line item ${patch.id} not found on this bill`);
        }
        const line = (bill.items ?? []).find((l) => l.id === patch.id);
        const qty = patch.quantity ?? Number(line.quantity);
        const price = patch.sellingPrice ?? Number(line.sellingPrice);
        const lineTotal = Math.round(price * qty * 100) / 100;
        const profitCalc = recalcLineProfitFromExisting(
          lineTotal,
          Number(line.purchaseCost ?? 0),
          Number(line.quantity),
          qty,
        );
        totalPurchaseCost += profitCalc.purchaseCost;
        totalProfit += profitCalc.profitAmount;
        lineUpdates.push({
          id: patch.id,
          itemName: patch.itemName,
          sellingPrice: patch.sellingPrice,
          makingCharges: patch.makingCharges,
          quantity: patch.quantity,
          lineTotal,
          purchaseCost: profitCalc.purchaseCost,
          profitAmount: profitCalc.profitAmount,
        });
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

    const patch: UpdateSalesBillPatch = {
      subtotal,
      discount,
      taxAmount: totals.taxAmount,
      cgstRate: totals.cgstRate,
      sgstRate: totals.sgstRate,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      roundOff: totals.roundOff,
      grandTotal: totals.grandTotal,
      totalPurchaseCost: Math.round(totalPurchaseCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
    };

    if (data.customerName !== undefined) {
      patch.customerName =
        data.customerName.trim() || (bill.documentType === EDocumentType.InformalBill ? '' : 'Walk-in');
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
    await this.invalidateInventoryReportsCache(userId);
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const bill = await this.getById(id, userId);
    const restoreStock = bill.status === EBillStatus.Completed;
    await this.billsRepo.deleteBill(id, restoreStock);
    this.logger.info({ billId: id, billNumber: bill.billNumber, restoreStock }, 'Sales bill deleted');
    if (restoreStock) {
      await this.invalidateInventoryReportsCache(userId);
    }
  }

  async bulkDelete(ids: string[], userId: string): Promise<BulkDeleteResult> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      throw new BadRequestException('No bill ids provided');
    }

    for (const id of uniqueIds) {
      await this.delete(id, userId);
    }

    this.logger.info({ count: uniqueIds.length, userId }, 'Sales bills bulk deleted');
    return plainToInstance(BulkDeleteResult, { deletedCount: uniqueIds.length }, { excludeExtraneousValues: true });
  }

  private async invalidateInventoryReportsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.INVENTORY_REPORTS, userId);
  }
}

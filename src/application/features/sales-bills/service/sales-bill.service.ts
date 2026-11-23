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

import { BillActionContext } from './bill-action-context';
import { BillLineUpdate } from './bill-line-update';
import { BillLogsQuery } from './bill-logs-query';
import { BILL_LOGS_REPOSITORY, IBillLogsRepository } from './i-bill-logs.repository';
import { ISalesBillService } from './i-sales-bill.service';
import { ISalesBillsRepository, SALES_BILLS_REPOSITORY } from './i-sales-bills.repository';
import { InventoryStockDeduction } from './inventory-stock-deduction';
import {
  BulkDeleteResult,
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  DASHBOARD_CACHE_TTL_SECONDS,
  ICacheService,
  queryCacheParts,
  salesAnalyticsCacheParts,
} from '../../../shared';
import {
  Customer,
  CUSTOMER_SERVICE,
  CUSTOMERS_REPOSITORY,
  ICustomerService,
  ICustomersRepository,
} from '../../customers';
import {
  EInventoryItemStatus,
  IInventoryCategoriesRepository,
  INVENTORY_CATEGORIES_REPOSITORY,
  IInventoryItemsRepository,
  INVENTORY_ITEMS_REPOSITORY,
} from '../../inventory';
import { BillLog, SalesBill, SalesBillLineItem, SalesAnalytics, GstCsvExportResult } from '../domain';
import {
  EBillStatus,
  EPaymentMode,
  ESalesBillSortField,
  ESalesBillSortOrder,
  EDocumentType,
  BILL_NUMBER_PREFIX,
  EBillLogAction,
} from '../enums';
import {
  CreateSalesBillRequestModel,
  ListSalesBillsQueryModel,
  UpdateSalesBillRequestModel,
  UpdateSalesBillPatch,
} from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsExportFilterOptions, SalesBillsFilterOptions } from '../options';
import {
  computeBillLineTotal,
  BillCustomerDetails,
  billMobileDigits,
  isRealCustomerName,
  missingCustomerDetails,
  newCustomerFromBill,
  billSnapshot,
  diffBills,
  toGstExportCsv,
  computeUnitPurchaseCost,
  computeLineProfit,
  recalcLineProfitFromExisting,
} from '../utils';

const DEFAULT_CGST_RATE = 1.5;
const DEFAULT_SGST_RATE = 1.5;

interface BillTotals {
  cgstRate: number;
  sgstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  taxAmount: number;
  roundOff: number;
  grandTotal: number;
}

@Injectable()
export class SalesBillService implements ISalesBillService {
  constructor(
    @Inject(SALES_BILLS_REPOSITORY) private readonly billsRepo: ISalesBillsRepository,
    @Inject(INVENTORY_ITEMS_REPOSITORY) private readonly inventoryItemsRepo: IInventoryItemsRepository,
    @Inject(INVENTORY_CATEGORIES_REPOSITORY)
    private readonly categoriesRepo: IInventoryCategoriesRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @Inject(BILL_LOGS_REPOSITORY) private readonly billLogsRepo: IBillLogsRepository,
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @Inject(CUSTOMER_SERVICE) private readonly customerService: ICustomerService,
    @InjectPinoLogger(SalesBillService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Links a bill to a customer from its mobile number:
   * - a picked customer, or one already saved with this mobile, is used (missing GSTIN, PAN,
   *   state, address… are filled in from the bill, nothing saved is overwritten);
   * - otherwise a new customer is created from the bill's name, mobile and details.
   * Never fails the bill: on any error the bill is saved without a customer link.
   */
  private async resolveBillCustomer(
    data: BillCustomerDetails & { customerId?: string },
    userId: string,
  ): Promise<string | undefined> {
    try {
      let customer: Customer | null = null;
      if (data.customerId) {
        customer = await this.customersRepo.findById(data.customerId, userId);
        if (!customer) return undefined;
      } else {
        const mobile = billMobileDigits(data.customerMobile);
        if (!mobile) return undefined;
        customer = await this.customersRepo.findByMobile(mobile, userId);
        if (!customer) {
          if (!isRealCustomerName(data.customerName)) return undefined;
          const created = await this.customerService.create(newCustomerFromBill(data, mobile, userId));
          this.logger.info({ customerId: created.id }, 'Customer created from bill');
          return created.id;
        }
      }

      const patch = missingCustomerDetails(customer, data);
      if (Object.keys(patch).length > 0) {
        await this.customerService.update(customer.id, { ...patch, createdBy: userId } as Customer);
      }
      return customer.id;
    } catch (err) {
      this.logger.warn({ err, userId }, 'Could not link bill to a customer');
      return data.customerId;
    }
  }

  /**
   * Writes one history row. Never fails the bill operation itself: a logging error is reported
   * to the server log instead.
   */
  private async recordLog(
    bill: Pick<SalesBill, 'id' | 'billNumber' | 'createdBy'>,
    action: EBillLogAction,
    context: BillActionContext | undefined,
    extra: Partial<Pick<BillLog, 'changes' | 'snapshot'>> = {},
  ): Promise<void> {
    try {
      await this.billLogsRepo.create({
        billId: bill.id ?? null,
        billNumber: bill.billNumber,
        userId: bill.createdBy,
        action,
        changes: extra.changes ?? [],
        snapshot: extra.snapshot ?? null,
        channel: context?.channel ?? null,
        performedBy: context?.performedBy ?? bill.createdBy ?? null,
      });
    } catch (err) {
      this.logger.error({ err, billId: bill.id, action }, 'Failed to write bill log');
    }
  }

  /** History of one bill (also works after the bill is deleted). */
  async getLogs(billId: string, userId: string, pageNumber?: number, pageSize?: number): Promise<Paged<BillLog>> {
    return this.billLogsRepo.find({ userId, billId, pageNumber, pageSize });
  }

  /** All bill activity for the shop, newest first (includes deleted bills). */
  async getActivity(query: Omit<BillLogsQuery, 'billId'>): Promise<Paged<BillLog>> {
    return this.billLogsRepo.find(query);
  }

  /** Print / share events reported by the apps. */
  async recordClientEvent(
    billId: string,
    action: EBillLogAction,
    userId: string,
    context?: BillActionContext,
  ): Promise<void> {
    const bill = await this.getById(billId, userId);
    await this.recordLog(bill, action, context);
  }

  private async generateBillNumber(createdBy: string, documentType: EDocumentType): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prefix = BILL_NUMBER_PREFIX[documentType];
    const seq = await this.billsRepo.getNextBillSequence(createdBy, year, month, prefix);
    return `${prefix}-${year}-${String(month).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
  }

  private computeInformalTotals(subtotal: number, discount: number): BillTotals {
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

  private salesBillListCacheParts(query: ListSalesBillsQueryModel, customerId?: string): string[] {
    return queryCacheParts(customerId ? 'list-by-customer' : 'list', {
      customerId,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      paymentMode: query.paymentMode,
      status: query.status,
      documentType: query.documentType,
      sortField: query.sortField ?? ESalesBillSortField.CreatedAt,
      sortOrder: query.sortOrder ?? ESalesBillSortOrder.Desc,
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
    });
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

      const item = await this.inventoryItemsRepo.findById(id, userId);
      if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
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

  private computeGstTotals(subtotal: number, discount: number): BillTotals {
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
    userId: string,
  ): Promise<Pick<SalesBillLineItem, 'hsnCode' | 'huid'>> {
    let hsnCode = item.hsnCode?.trim() || undefined;
    let huid: string;

    if (item.inventoryItemId) {
      const inv = await this.inventoryItemsRepo.findById(item.inventoryItemId, userId);
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
    const gross = item.grossWeight !== undefined && item.grossWeight !== null ? Number(item.grossWeight) : undefined;
    const net = item.netWeight !== undefined && item.netWeight !== null ? Number(item.netWeight) : undefined;
    let less = item.lessWeight !== undefined && item.lessWeight !== null ? Number(item.lessWeight) : undefined;

    if (
      (less === undefined || less === null) &&
      gross !== undefined &&
      gross !== null &&
      net !== undefined &&
      net !== null &&
      gross >= net
    ) {
      less = Math.round((gross - net) * 1000) / 1000;
    }

    return { grossWeight: gross, netWeight: net, lessWeight: less };
  }

  private async resolveLinePurchaseSnapshot(
    item: CreateSalesBillRequestModel['items'][number],
    lineTotal: number,
    userId: string,
  ): Promise<Pick<SalesBillLineItem, 'purchaseRatePerGram' | 'purchaseCost' | 'profitAmount'>> {
    let purchaseRatePerGram: number;
    const netWeight = item.netWeight !== undefined && item.netWeight !== null ? Number(item.netWeight) : undefined;
    const makingCharges =
      item.makingCharges !== undefined && item.makingCharges !== null ? Number(item.makingCharges) : 0;
    let purchasePrice: number;

    if (item.inventoryItemId) {
      const inv = await this.inventoryItemsRepo.findById(item.inventoryItemId, userId);
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

  async create(data: CreateSalesBillRequestModel, userId: string, context?: BillActionContext): Promise<SalesBill> {
    const lineItems: SalesBillLineItem[] = [];
    for (const item of data.items) {
      const hsnHuid = await this.resolveLineHsnHuid(item, userId);
      const weights = this.resolveBillLineWeights(item);
      const lineTotal = computeBillLineTotal(item.sellingPrice, item.quantity, item.quantityPricingMode);
      const purchase = await this.resolveLinePurchaseSnapshot(item, lineTotal, userId);
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
        quantityPricingMode: item.quantityPricingMode,
        ratePerGram: item.ratePerGram,
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
    const customerId = await this.resolveBillCustomer(data, userId);

    const bill: SalesBill = {
      billNumber: await this.generateBillNumber(userId, documentType),
      documentType,
      customerName,
      customerMobile: data.customerMobile?.trim() || undefined,
      customerId,
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
        data.amountReceived !== undefined && data.amountReceived !== null && Number(data.amountReceived) >= 0
          ? Math.round(Number(data.amountReceived) * 100) / 100
          : undefined,
      depositApplied:
        data.depositApplied !== undefined && data.depositApplied !== null && Number(data.depositApplied) > 0
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
    await this.invalidateSalesBillsCache(userId);
    await this.recordLog(created, EBillLogAction.Created, context, { snapshot: billSnapshot(created) });
    return created;
  }

  async getById(id: string, userId: string): Promise<SalesBill> {
    const bill = await this.billsRepo.findById(id);
    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.createdBy !== userId) throw new ForbiddenException('Access denied');
    return bill;
  }

  async list(userId: string, query: ListSalesBillsQueryModel): Promise<Paged<SalesBill>> {
    return this.cache.getOrLoadVersioned(
      CACHE_NAMESPACE.SALES_BILLS,
      userId,
      this.salesBillListCacheParts(query),
      DASHBOARD_CACHE_TTL_SECONDS,
      () => this.billsRepo.findAll(this.mapListQuery(userId, query)),
    );
  }

  async exportGstCsv(userId: string, query: ListSalesBillsQueryModel): Promise<GstCsvExportResult> {
    const filter = this.mapListQuery(userId, query);
    const exportFilter = plainToInstance(SalesBillsExportFilterOptions, filter, { excludeExtraneousValues: true });
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
    return this.cache.getOrLoadVersioned(
      CACHE_NAMESPACE.SALES_BILLS,
      userId,
      this.salesBillListCacheParts(query, customerId),
      DASHBOARD_CACHE_TTL_SECONDS,
      () =>
        this.billsRepo.findByCustomerId(customerId, {
          ...this.mapListQuery(userId, query),
          customerId,
        }),
    );
  }

  async getAnalytics(
    userId: string,
    dateFrom?: string,
    dateTo?: string,
    documentType?: string,
  ): Promise<SalesAnalytics> {
    const params: SalesAnalyticsFilterOptions = { createdBy: userId };
    let cacheFrom: string;
    let cacheTo: string;

    if (!dateFrom && !dateTo) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      params.dateFrom = start;
      params.dateTo = end;
      cacheFrom = start.toISOString().slice(0, 10);
      cacheTo = end.toISOString().slice(0, 10);
    } else {
      if (dateFrom) {
        params.dateFrom = new Date(dateFrom);
        cacheFrom = dateFrom;
      } else {
        cacheFrom = 'open';
      }
      if (dateTo) {
        params.dateTo = new Date(dateTo);
        cacheTo = dateTo;
      } else {
        cacheTo = 'open';
      }
    }

    if (documentType && Object.values(EDocumentType).includes(documentType as EDocumentType)) {
      params.documentType = documentType as EDocumentType;
    }

    return this.cache.getOrLoadVersioned(
      CACHE_NAMESPACE.SALES_BILLS,
      userId,
      salesAnalyticsCacheParts(cacheFrom, cacheTo, documentType),
      DASHBOARD_CACHE_TTL_SECONDS,
      () => this.billsRepo.getAnalytics(params),
    );
  }

  async convertToNormalBill(id: string, userId: string, context?: BillActionContext): Promise<SalesBill> {
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

    await this.invalidateSalesBillsCache(userId);
    await this.recordLog(updated, EBillLogAction.ConvertedToNormal, context, { changes: diffBills(bill, updated) });
    return updated;
  }

  async update(
    id: string,
    data: UpdateSalesBillRequestModel,
    userId: string,
    context?: BillActionContext,
  ): Promise<SalesBill> {
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
        const qtyMode = patch.quantityPricingMode ?? line.quantityPricingMode;
        const lineTotal = computeBillLineTotal(price, qty, qtyMode);
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
          quantityPricingMode: patch.quantityPricingMode,
          sku: patch.sku,
          hsnCode: patch.hsnCode,
          huid: patch.huid,
          purity: patch.purity,
          grossWeight: patch.grossWeight,
          netWeight: patch.netWeight,
          lessWeight: patch.lessWeight,
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
      const qtyMode = patch?.quantityPricingMode ?? line.quantityPricingMode;
      return sum + computeBillLineTotal(price, qty, qtyMode);
    }, 0);

    const discount =
      data.discount !== undefined && data.discount !== null ? Number(data.discount) : Number(bill.discount ?? 0);
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
    if (data.amountReceived !== undefined) {
      patch.amountReceived = Math.round(Number(data.amountReceived) * 100) / 100;
    }
    if (data.paymentMode !== undefined) patch.paymentMode = data.paymentMode;
    if (data.status !== undefined) patch.status = data.status;
    if (data.issuedAt !== undefined) {
      const issuedAt = new Date(data.issuedAt);
      if (Number.isNaN(issuedAt.getTime())) {
        throw new BadRequestException('Invalid issue date');
      }
      patch.issuedAt = issuedAt;
    }

    const updated = await this.billsRepo.updateBill(id, patch, lineUpdates);

    this.logger.info({ billId: id, billNumber: updated.billNumber }, 'Sales bill updated');
    await this.invalidateInventoryReportsCache(userId);
    await this.invalidateSalesBillsCache(userId);
    const changes = diffBills(bill, updated);
    if (changes.length > 0) {
      await this.recordLog(updated, EBillLogAction.Updated, context, { changes });
    }
    return updated;
  }

  async delete(id: string, userId: string, context?: BillActionContext): Promise<void> {
    const bill = await this.getById(id, userId);
    const restoreStock = bill.status === EBillStatus.Completed;
    await this.billsRepo.deleteBill(id, restoreStock);
    this.logger.info({ billId: id, billNumber: bill.billNumber, restoreStock }, 'Sales bill deleted');
    // Full copy of the deleted bill, so the record is never lost.
    await this.recordLog(bill, EBillLogAction.Deleted, context, {
      snapshot: { ...billSnapshot(bill), stockRestored: restoreStock },
    });
    if (restoreStock) {
      await this.invalidateInventoryReportsCache(userId);
    }
    await this.invalidateSalesBillsCache(userId);
  }

  async bulkDelete(ids: string[], userId: string, context?: BillActionContext): Promise<BulkDeleteResult> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) {
      throw new BadRequestException('No bill ids provided');
    }

    for (const id of uniqueIds) {
      await this.delete(id, userId, context);
    }

    this.logger.info({ count: uniqueIds.length, userId }, 'Sales bills bulk deleted');
    return plainToInstance(BulkDeleteResult, { deletedCount: uniqueIds.length }, { excludeExtraneousValues: true });
  }

  private async invalidateInventoryReportsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.INVENTORY_REPORTS, userId);
  }

  private async invalidateSalesBillsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.SALES_BILLS, userId);
  }
}

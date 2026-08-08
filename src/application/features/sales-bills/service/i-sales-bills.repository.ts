import { Paged } from '@shared-libs';
import { InventoryItemSale } from '../../inventory/domain';
import { SalesBill, SalesAnalytics } from '../domain';
import { UpdateSalesBillPatch } from '../models';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';
import { InventoryStockDeduction } from './inventory-stock-deduction';
import { BillLineUpdate } from './bill-line-update';

export const SALES_BILLS_REPOSITORY = 'SALES_BILLS_REPOSITORY';

export interface ISalesBillsRepository {
  create(bill: SalesBill, stockDeductions?: InventoryStockDeduction[]): Promise<SalesBill>;
  findById(id: string): Promise<SalesBill>;
  findAll(params: SalesBillsFilterOptions): Promise<Paged<SalesBill>>;
  findAllForExport(
    filter: Omit<SalesBillsFilterOptions, 'pageNumber' | 'pageSize'>,
  ): Promise<SalesBill[]>;
  findByCustomerId(customerId: string, params: SalesBillsFilterOptions): Promise<Paged<SalesBill>>;
  getNextBillSequence(createdBy: string, year: number, month: number, prefix: string): Promise<number>;
  updateBill(id: string, patch: UpdateSalesBillPatch, lineUpdates?: BillLineUpdate[]): Promise<SalesBill>;
  deleteBill(id: string, restoreStock: boolean): Promise<void>;
  getAnalytics(params: SalesAnalyticsFilterOptions): Promise<SalesAnalytics>;
  findSalesByInventoryItemId(inventoryItemId: string, createdBy: string): Promise<InventoryItemSale[]>;
}

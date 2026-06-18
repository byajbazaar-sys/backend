import { Paged } from '@shared-libs';
import { SalesBill, SalesAnalytics } from '../domain';
import { SalesAnalyticsFilterOptions, SalesBillsFilterOptions } from '../options';

export const SALES_BILLS_REPOSITORY = 'SALES_BILLS_REPOSITORY';

export interface InventoryStockDeduction {
  inventoryItemId: string;
  quantity: number;
}

export interface BillLineUpdate {
  id: string;
  itemName?: string;
  sellingPrice?: number;
  makingCharges?: number;
  quantity?: number;
}

export interface ISalesBillsRepository {
  create(bill: SalesBill, stockDeductions?: InventoryStockDeduction[]): Promise<SalesBill>;
  findById(id: string): Promise<SalesBill | null>;
  findAll(params: SalesBillsFilterOptions): Promise<Paged<SalesBill>>;
  findByCustomerId(customerId: string, params: SalesBillsFilterOptions): Promise<Paged<SalesBill>>;
  getNextBillSequence(createdBy: string, year: number, month: number, prefix: string): Promise<number>;
  updateBill(id: string, patch: Partial<SalesBill>, lineUpdates?: BillLineUpdate[]): Promise<SalesBill>;
  deleteBill(id: string, restoreStock: boolean): Promise<void>;
  getAnalytics(params: SalesAnalyticsFilterOptions): Promise<SalesAnalytics>;
}
